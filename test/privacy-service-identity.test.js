import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { authenticateRequest, requireInternalServiceScope, validateAuthConfiguration } from "../src/auth.js";
import { ApprovedUseRegistry, PrivacyRuleRegistry } from "../src/privacy-policy.js";
import { PrivacyTextInspectionService } from "../src/privacy-service.js";

const token = () => randomBytes(32).toString("base64url");
const configuration = () => ({ AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_INTERNAL_SERVICE_TOKEN: token(), HIPASS_PRIVACY_SERVICE_TOKEN: token() });
const request = (value, extra = {}) => ({ headers: { "x-hipass-service-token": value, ...extra } });
const code = (expected) => (error) => error.code === expected;

test("dedicated Privacy token ignores caller identity and has only inspection scope", () => {
  const env = configuration();
  const principal = authenticateRequest(request(env.HIPASS_PRIVACY_SERVICE_TOKEN, {
    "x-hipass-user-id": "internal-service", "x-hipass-scopes": "audit:write gateway:introspect", "x-hipass-role": "PLATFORM_ADMIN",
  }), env);
  assert.equal(principal.userId, "privacy-service");
  assert.deepEqual(principal.scopes, ["privacy:inspect"]);
  requireInternalServiceScope(principal, "privacy:inspect");
  for (const scope of ["audit:write", "gateway:introspect"]) {
    assert.throws(() => requireInternalServiceScope(principal, scope), code("SERVICE_SCOPE_REQUIRED"));
  }
  const shared = authenticateRequest(request(env.HIPASS_INTERNAL_SERVICE_TOKEN), env);
  assert.deepEqual(shared.scopes, ["audit:write", "gateway:introspect"]);
  assert.throws(() => requireInternalServiceScope(shared, "privacy:inspect"), code("SERVICE_SCOPE_REQUIRED"));
  delete env.HIPASS_PRIVACY_SERVICE_TOKEN;
  requireInternalServiceScope(authenticateRequest(request(env.HIPASS_INTERNAL_SERVICE_TOKEN), env), "privacy:inspect");
});

test("service token configuration rejects blank weak duplicate values without echoing secrets", () => {
  for (const value of ["", "short", " ".repeat(64), "a".repeat(64), "replace-with-" + "abc123XYZ_".repeat(5)]) {
    assert.throws(() => validateAuthConfiguration({ ...configuration(), HIPASS_PRIVACY_SERVICE_TOKEN: value }),
      code("PRIVACY_SERVICE_TOKEN_INVALID_CONFIGURATION"));
  }
  const same = token();
  assert.throws(() => validateAuthConfiguration({ AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_INTERNAL_SERVICE_TOKEN: same, HIPASS_PRIVACY_SERVICE_TOKEN: same }),
    (error) => error.code === "SERVICE_TOKEN_COLLISION" && !error.message.includes(same));
});

test("invalid or ambiguous service credentials cannot fall back to caller supplied mock identity", () => {
  const env = configuration();
  for (const value of [token(), "", [env.HIPASS_PRIVACY_SERVICE_TOKEN, env.HIPASS_INTERNAL_SERVICE_TOKEN]]) {
    assert.throws(() => authenticateRequest(request(value, { "x-hipass-role": "PLATFORM_ADMIN" }), env),
      code("INTERNAL_SERVICE_TOKEN_INVALID"));
  }
});

test("Privacy requester binding requires explicitly registered dedicated identity before model call", async () => {
  const records = JSON.parse(await readFile(new URL("../config/privacy/approved-uses.synthetic.json", import.meta.url), "utf8")).records;
  const input = { mediaType: "text/plain", content: "SYNTHETIC-ONLY", approvedUseRef: records[0].approvedUseRef,
    purpose: records[0].purpose, recipientRef: records[0].recipientRef, sourceOrganizationId: records[0].sourceOrganizationId,
    sourceArtifactRef: records[0].sourceArtifactRef, sourceArtifactVersion: records[0].sourceArtifactVersion };
  const env = configuration();
  const principal = authenticateRequest(request(env.HIPASS_PRIVACY_SERVICE_TOKEN), env);
  let calls = 0;
  const adapter = { countTokens: async () => { calls++; return 1; }, detect: async () => ({ findings: [] }) };
  const make = (rows) => new PrivacyTextInspectionService({ adapter,
    approvedUses: new ApprovedUseRegistry(rows, { clock: () => new Date("2026-10-08T00:00:00Z") }), rules: PrivacyRuleRegistry.fromFile() });
  await assert.rejects(make(records).inspect(input, principal), code("POLICY_DENIED"));
  assert.equal(calls, 0);
  const dedicated = records.map((record) => ({ ...record, requesterRef: "privacy-service" }));
  assert.equal((await make(dedicated).inspect(input, principal)).releaseEligible, false);
  assert.equal(calls, 1);
});

test("actual isolated HTTP denies Privacy credential at audit and Gateway before parsing body", { timeout: 20000 }, async (t) => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const dir = await mkdtemp(path.join(tmpdir(), "hp-privacy-identity-"));
  const env = configuration();
  const childEnv = { ...process.env, ...env, NODE_ENV: "development", HIPASS_STORE: "json",
    HIPASS_DB_PATH: path.join(dir, "db.json"), PORT: String(port), DICOM_TOKEN_SECRET: token(), HIPASS_PRIVACY_REQUEST_TIMEOUT_MS: "250" };
  delete childEnv.HIPASS_PRIVACY_MODEL_PATH;
  delete childEnv.HIPASS_INGRESS_SECRET;
  const child = spawn(process.execPath, ["src/server.js"], { windowsHide: true, stdio: "ignore", env: childEnv });
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([stopped, new Promise((_, reject) => setTimeout(() => reject(new Error("FIXTURE_STOP_TIMEOUT")), 3000).unref())]);
    }
    assert.equal(path.dirname(dir), tmpdir());
    assert.ok(path.basename(dir).startsWith("hp-privacy-identity-"));
    await rm(dir, { recursive: true, force: true });
  });
  const call = async (url, value, body) => {
    const result = await fetch(`http://127.0.0.1:${port}${url}`, { method: body === undefined ? "GET" : "POST",
      headers: { ...(value !== undefined ? { "x-hipass-service-token": value } : {}), "content-type": "application/json" },
      body, signal: AbortSignal.timeout(1500) });
    return { status: result.status, body: await result.json() };
  };
  const deadline = Date.now() + 8000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try { if ((await call("/api/health")).status === 200) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(ready, "FIXTURE_NOT_READY");
  for (const url of ["/api/audit-logs", "/gateway/audit", "/gateway/token/introspect"]) {
    const denied = await call(url, env.HIPASS_PRIVACY_SERVICE_TOKEN, "not-json");
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, "SERVICE_SCOPE_REQUIRED");
  }
  assert.equal((await call("/internal/privacy/health/ready", env.HIPASS_PRIVACY_SERVICE_TOKEN)).status, 503);
  assert.equal((await call("/internal/privacy/health/ready", env.HIPASS_INTERNAL_SERVICE_TOKEN)).status, 403);
  assert.equal((await call("/internal/privacy/health/ready", token())).status, 401);
  assert.equal((await call("/gateway/token/introspect", env.HIPASS_INTERNAL_SERVICE_TOKEN, "{}")).status, 400);
  const accepted = await call("/gateway/audit", env.HIPASS_INTERNAL_SERVICE_TOKEN,
    JSON.stringify({ actorType: "GATEWAY", actorId: "SYNTH-GATEWAY", action: "SYNTHETIC_FIXTURE", result: "ALLOWED" }));
  assert.equal(accepted.status, 201);
  const slowResult = await new Promise((resolve, reject) => {
    const slow = httpRequest({ hostname: "127.0.0.1", port, path: "/internal/privacy/text-inspections", method: "POST",
      headers: { "x-hipass-service-token": env.HIPASS_PRIVACY_SERVICE_TOKEN, "content-type": "application/json", "content-length": "100" } }, (response) => {
      let data = "";
      response.on("data", (chunk) => { data += chunk; });
      response.once("end", () => { slow.destroy(); resolve({ status: response.statusCode, body: JSON.parse(data) }); });
    });
    slow.once("error", reject);
    slow.setTimeout(2000, () => slow.destroy(new Error("FIXTURE_HTTP_TIMEOUT")));
    slow.write("{"); // Deliberately never finish the body.
  });
  assert.equal(slowResult.status, 504);
  assert.equal(slowResult.body.error, "MODEL_TIMEOUT");
  await new Promise((resolve) => {
    const cancelled = httpRequest({ hostname: "127.0.0.1", port, path: "/internal/privacy/text-inspections", method: "POST",
      headers: { "x-hipass-service-token": env.HIPASS_PRIVACY_SERVICE_TOKEN, "content-type": "application/json", "content-length": "100" } });
    cancelled.on("error", () => {});
    cancelled.once("close", resolve);
    cancelled.setTimeout(1000, () => cancelled.destroy());
    cancelled.write("{");
    setTimeout(() => cancelled.destroy(), 30);
  });
  assert.equal((await call("/api/health")).status, 200);
});
