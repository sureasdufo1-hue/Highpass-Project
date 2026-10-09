import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getEventListeners } from "node:events";
import { OpfLocalAdapter } from "../../src/privacy-adapter.js";
import { PrivacyTextInspectionService } from "../../src/privacy-service.js";
import { ApprovedUseRegistry, PrivacyRuleRegistry } from "../../src/privacy-policy.js";
import { createPrivacyHttpHandler } from "../../src/privacy-http-handler.js";
import { PrivacyRequestBudget } from "../../src/privacy-request-budget.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const PRIVACY_HTTP_REQUIRED_CASES = Object.freeze([
  "ready", "normal-masking-review-only", "no-auth", "wrong-token", "shared-token-no-scope",
  "organization-mismatch", "artifact-mismatch", "version-mismatch", "recipient-mismatch", "purpose-mismatch",
  "unknown-use", "requester-mismatch", "invalid-json", "invalid-utf8", "unsupported-content", "extra-body-field",
  "body-too-large", "text-too-large", "bad-json", "model-unavailable", "output-overflow", "token-limit-before-detect",
  "queue-full-and-total-timeout", "late-result-not-success-and-health", "actual-child-client-abort", "actual-slow-body-deadline",
  "spawn-error-typed-and-closed", "stdin-error-typed-and-closed", "cancelled-queue-never-spawns-child",
  "abort-listeners-cleaned", "shared-handler-source-binding",
]);
export function privacyHttpFixturePassed(result) {
  const entries = result.assertions ?? [];
  return entries.length === PRIVACY_HTTP_REQUIRED_CASES.length
    && new Set(entries.map((entry) => entry.id)).size === entries.length
    && PRIVACY_HTTP_REQUIRED_CASES.every((id) => entries.some((entry) => entry.id === id && entry.result === "PASS"))
    && result.cleanup === "PASS" && result.diagnostics?.active === 0 && result.diagnostics?.queued === 0
    && result.diagnostics.spawned === result.diagnostics.closed;
}
const wait = async (predicate, ms = 4000) => {
  const end = Date.now() + ms;
  while (!predicate() && Date.now() < end) await delay(20);
  assert.ok(predicate(), "FIXTURE_OBSERVATION_TIMEOUT");
};

export async function runPrivacyHttpFixture() {
  const assertions = [];
  const checkpointPath = fileURLToPath(new URL("../../test/fixtures/privacy/fake-checkpoint", import.meta.url));
  const bridgePath = fileURLToPath(new URL("../../test/fixtures/privacy/fake-opf-bridge.py", import.meta.url));
  const adapter = new OpfLocalAdapter({ checkpointPath, bridgePath, pythonCommand: "python", timeoutMs: 3500, maxQueue: 0 });
  const credentials = { AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_INTERNAL_SERVICE_TOKEN: randomBytes(32).toString("base64url"),
    HIPASS_PRIVACY_SERVICE_TOKEN: randomBytes(32).toString("base64url") };
  const rows = JSON.parse(await readFile(new URL("../../config/privacy/approved-uses.synthetic.json", import.meta.url), "utf8")).records
    .map((row) => ({ ...row, requesterRef: "privacy-service" }));
  rows.push({ ...rows[0], approvedUseRef: "SYNTH-LEGACY-REQUESTER", requesterRef: "internal-service" });
  let countCalls = 0;
  let detectCalls = 0;
  const wrapped = {
    readiness: (options) => adapter.readiness(options),
    countTokens: (text, options) => { countCalls++; return adapter.countTokens(text, options); },
    detect: (text, options) => { detectCalls++; return adapter.detect(text, options); },
  };
  const service = new PrivacyTextInspectionService({ adapter: wrapped,
    approvedUses: new ApprovedUseRegistry(rows, { clock: () => new Date("2026-10-08T00:00:00Z") }), rules: PrivacyRuleRegistry.fromFile() });
  const handler = createPrivacyHttpHandler({ service, env: credentials, timeoutMs: 1500 });
  const sockets = new Set();
  const server = createServer((req, res) => {
    if (req.url === "/fixture/health") { res.end("{}"); return; }
    handler(req, res, new URL(req.url, "http://localhost")).catch(() => { res.destroy(); });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await Promise.race([
    new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("FIXTURE_START_TIMEOUT")), 3000).unref()),
  ]);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const input = { mediaType: "text/plain", content: "연락처 synth.patient@example.invalid, 병변 5 mm, 발열 없음.",
    approvedUseRef: rows[0].approvedUseRef, purpose: rows[0].purpose, recipientRef: rows[0].recipientRef,
    sourceOrganizationId: rows[0].sourceOrganizationId, sourceArtifactRef: rows[0].sourceArtifactRef, sourceArtifactVersion: rows[0].sourceArtifactVersion };
  const call = async (body = input, options = {}) => {
    const result = await fetch(origin + (options.url ?? "/internal/privacy/text-inspections"), {
      method: options.method ?? "POST", signal: options.signal ?? AbortSignal.timeout(5000),
      headers: { "content-type": options.contentType ?? "application/json",
        ...(options.noAuth ? {} : { "x-hipass-service-token": options.token ?? credentials.HIPASS_PRIVACY_SERVICE_TOKEN }) },
      body: options.method === "GET" ? undefined : (options.raw ?? JSON.stringify(body)),
    });
    return { status: result.status, body: await result.json(), cache: result.headers.get("cache-control") };
  };
  const check = async (id, operation) => {
    const start = performance.now();
    try { await operation(); assertions.push({ id, result: "PASS", durationMs: Math.round(performance.now() - start) }); }
    catch { assertions.push({ id, result: "FAIL", code: "FIXTURE_ASSERTION_FAILED" }); }
  };
  let cleanup = "NOT VERIFIED";
  try {
    await check("ready", async () => { assert.equal((await call(undefined, { method: "GET", url: "/internal/privacy/health/ready" })).status, 200); });
    await check("normal-masking-review-only", async () => {
      const out = await call();
      assert.equal(out.status, 200);
      assert.equal(out.body.redactedText.includes("synth.patient@example.invalid"), false);
      assert.ok(out.body.redactedText.includes("5 mm"));
      assert.ok(out.body.redactedText.includes("발열 없음"));
      assert.equal(out.body.policyDecision, "REVIEW_REQUIRED");
      assert.equal(out.body.reviewStatus, "PENDING");
      assert.equal(out.body.releaseEligible, false);
      assert.equal(out.cache, "no-store");
      assert.equal(out.body.modelRevision, "fake");
    });
    const denied = [
      ["no-auth", input, { noAuth: true }, 401, "AUTH_REQUIRED"],
      ["wrong-token", input, { token: randomBytes(32).toString("base64url") }, 401, "AUTH_REQUIRED"],
      ["shared-token-no-scope", input, { token: credentials.HIPASS_INTERNAL_SERVICE_TOKEN }, 403, "AUTH_REQUIRED"],
      ["organization-mismatch", { ...input, sourceOrganizationId: "SYNTH-OTHER" }, {}, 403, "POLICY_DENIED"],
      ["artifact-mismatch", { ...input, sourceArtifactRef: "SYNTH-OTHER" }, {}, 403, "POLICY_DENIED"],
      ["version-mismatch", { ...input, sourceArtifactVersion: 2 }, {}, 403, "POLICY_DENIED"],
      ["recipient-mismatch", { ...input, recipientRef: "SYNTH-OTHER" }, {}, 403, "POLICY_DENIED"],
      ["purpose-mismatch", { ...input, purpose: "CLINICAL" }, {}, 403, "POLICY_DENIED"],
      ["unknown-use", { ...input, approvedUseRef: "SYNTH-UNKNOWN" }, {}, 403, "POLICY_DENIED"],
      ["requester-mismatch", { ...input, approvedUseRef: "SYNTH-LEGACY-REQUESTER" }, {}, 403, "POLICY_DENIED"],
      ["invalid-json", input, { raw: "{" }, 422, "INVALID_CONTENT"],
      ["invalid-utf8", input, { raw: Buffer.from([0xc3, 0x28]) }, 422, "INVALID_CONTENT"],
      ["unsupported-content", input, { contentType: "text/plain" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
      ["extra-body-field", { ...input, actorId: "SYNTH-OTHER" }, {}, 422, "INVALID_CONTENT"],
      ["body-too-large", input, { raw: "x".repeat(41000) }, 413, "INPUT_TOO_LARGE"],
      ["text-too-large", { ...input, content: "가".repeat(11000) }, {}, 413, "INPUT_TOO_LARGE"],
    ];
    for (const [id, body, options, status, error] of denied) await check(id, async () => {
      const before = [countCalls, detectCalls, adapter.diagnostics().spawned];
      const out = await call(body, options);
      assert.equal(out.status, status); assert.equal(out.body.error, error);
      assert.deepEqual([countCalls, detectCalls, adapter.diagnostics().spawned], before);
    });
    for (const [text, status, error] of [["bad-json", 502, "MODEL_OUTPUT_INVALID"], ["model-unavailable", 503, "MODEL_UNAVAILABLE"], ["output-overflow", 502, "MODEL_OUTPUT_INVALID"]]) {
      await check(text, async () => { const out = await call({ ...input, content: text }); assert.equal(out.status, status); assert.equal(out.body.error, error); });
    }
    await check("token-limit-before-detect", async () => {
      const before = detectCalls;
      assert.equal((await call({ ...input, content: "x".repeat(2049) })).status, 413);
      assert.equal(detectCalls, before);
    });
    await check("queue-full-and-total-timeout", async () => {
      const before = detectCalls;
      const slow = call({ ...input, content: "long-timeout" });
      await wait(() => detectCalls > before && adapter.active === 1);
      assert.equal((await call()).status, 429);
      assert.equal((await slow).status, 504);
      await wait(() => adapter.active === 0 && adapter.queue.length === 0);
    });
    await check("late-result-not-success-and-health", async () => {
      await delay(100);
      assert.equal((await call(undefined, { method: "GET", url: "/internal/privacy/health/ready" })).status, 200);
      assert.equal((await fetch(origin + "/fixture/health", { signal: AbortSignal.timeout(1000) })).status, 200);
    });
    await check("actual-child-client-abort", async () => {
      const before = adapter.diagnostics().spawned;
      const controller = new AbortController();
      const aborted = call({ ...input, content: "long-timeout" }, { signal: controller.signal }).then(() => false, () => true);
      await wait(() => adapter.diagnostics().spawned >= before + 2 && adapter.active === 1);
      controller.abort();
      assert.equal(await aborted, true);
      await wait(() => adapter.active === 0);
    });
    await check("actual-slow-body-deadline", async () => {
      const before = countCalls;
      const out = await new Promise((resolve, reject) => {
        const request = httpRequest(origin + "/internal/privacy/text-inspections", { method: "POST",
          headers: { "content-type": "application/json", "content-length": "100", "x-hipass-service-token": credentials.HIPASS_PRIVACY_SERVICE_TOKEN } }, (response) => {
          let data = "";
          response.on("data", (chunk) => { data += chunk; });
          response.once("end", () => { request.destroy(); resolve({ status: response.statusCode, body: JSON.parse(data) }); });
        });
        request.once("error", reject);
        request.setTimeout(4000, () => request.destroy(new Error("FIXTURE_HTTP_TIMEOUT")));
        request.write("{");
      });
      assert.equal(out.status, 504); assert.equal(out.body.error, "MODEL_TIMEOUT");
      assert.equal(countCalls, before);
    });
    await check("spawn-error-typed-and-closed", async () => {
      const missing = new OpfLocalAdapter({ checkpointPath, bridgePath, pythonCommand: "__highpass_absent_fixture_python__", timeoutMs: 1000 });
      await assert.rejects(missing.detect("SYNTHETIC-ONLY"), (error) => error.code === "MODEL_UNAVAILABLE");
      await wait(() => missing.active === 0);
      assert.equal(missing.diagnostics().spawnFailures, 1);
    });
    await check("stdin-error-typed-and-closed", async () => {
      const early = new OpfLocalAdapter({ checkpointPath: checkpointPath + "-stdin-close", bridgePath, pythonCommand: "python", timeoutMs: 2000 });
      await assert.rejects(early.detect("x".repeat(8 * 1024 * 1024)), (error) => error.code === "MODEL_OUTPUT_INVALID");
      await wait(() => early.active === 0);
      assert.ok(early.diagnostics().stdinFailures >= 1);
    });
    await check("cancelled-queue-never-spawns-child", async () => {
      const queuedAdapter = new OpfLocalAdapter({ checkpointPath, bridgePath, pythonCommand: "python", timeoutMs: 3500, maxQueue: 1 });
      const runningController = new AbortController();
      const queuedController = new AbortController();
      const running = queuedAdapter.detect("long-timeout", { signal: runningController.signal }).catch((error) => error.code);
      try {
        await wait(() => queuedAdapter.diagnostics().spawned === 1);
        const queued = queuedAdapter.detect("ok", { signal: queuedController.signal }).catch((error) => error.code);
        assert.equal(queuedAdapter.queue.length, 1);
        queuedController.abort();
        assert.equal(await queued, "MODEL_TIMEOUT");
        assert.equal(queuedAdapter.queue.length, 0);
      } finally { runningController.abort(); }
      assert.equal(await running, "MODEL_TIMEOUT");
      await wait(() => queuedAdapter.active === 0);
      assert.equal(queuedAdapter.diagnostics().spawned, 1);
      assert.equal(queuedAdapter.diagnostics().closed, 1);
    });
    await check("abort-listeners-cleaned", async () => {
      const budget = new PrivacyRequestBudget(1000);
      try { for (let i = 0; i < 20; i++) { await budget.run(() => 1); assert.equal(getEventListeners(budget.signal, "abort").length, 0); } }
      finally { budget.dispose(); }
    });
    await check("shared-handler-source-binding", async () => {
      const source = await readFile(new URL("../../src/server.js", import.meta.url), "utf8");
      assert.ok(source.includes('import { createPrivacyHttpHandler } from "./privacy-http-handler.js"'));
      assert.ok(source.includes("await routePrivacy(request, response, url)"));
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    try {
      await Promise.race([new Promise((resolve) => server.close(resolve)), new Promise((_, reject) => setTimeout(() => reject(new Error("FIXTURE_CLOSE_TIMEOUT")), 3000).unref())]);
      await wait(() => adapter.active === 0 && adapter.queue.length === 0);
      assert.equal(adapter.diagnostics().spawned, adapter.diagnostics().closed);
      cleanup = "PASS";
    } catch { cleanup = "FAIL"; }
  }
  return { assertions, cleanup, diagnostics: adapter.diagnostics(), counters: { countCalls, detectCalls },
    qualifier: "LOOPBACK HTTP / SYNTHETIC DATA / FAKE MODEL ONLY", nodeVersion: process.version,
    notVerified: ["ACTUAL_MODEL", "TLS_AND_EXTERNAL_STAGING", "NODE_20_BINARY_EXECUTION", "INDEPENDENT_HUMAN_REVIEW"] };
}
