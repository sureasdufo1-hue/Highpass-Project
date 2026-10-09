import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { InternalServiceProvider, requireInternalServiceScope } from "../src/auth.js";
import { authorizeDataPlane } from "../src/data-plane-authorization.js";
import { createKeyReleaseHttpHandler } from "../src/key-release-http-handler.js";

const config = { sourceHospitalId: "HOSP-A", recipientHospitalId: "HOSP-B", publicBaseUrl: "https://demo.test",
  keyId: `https://capstone-demo.vault.azure.net/keys/demo/${"a".repeat(32)}` };
const credentials = () => ({ HIPASS_DATA_PLANE_SERVICE_TOKEN: randomBytes(32).toString("hex"),
  HIPASS_KEY_RELEASE_SERVICE_TOKEN: randomBytes(32).toString("hex"), HIPASS_INTERNAL_SERVICE_TOKEN: randomBytes(32).toString("hex"),
  HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID: "HOSP-A", HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID: "HOSP-B" });

test("recipient key credential has one scope, fixed hospital and no A/generic authority", () => {
  const env = credentials();
  const provider = new InternalServiceProvider(env);
  const authenticate = token => provider.authenticate({ headers: { "x-hipass-service-token": token, "x-hipass-hospital-id": "HOSP-C" } });
  const b = authenticate(env.HIPASS_KEY_RELEASE_SERVICE_TOKEN);
  assert.equal(b.hospitalId, "HOSP-B");
  assert.deepEqual(b.scopes, ["gateway:package-key-release"]);
  requireInternalServiceScope(b, "gateway:package-key-release");
  assert.throws(() => requireInternalServiceScope(b, "gateway:data-plane-authorize"));
  for (const token of [env.HIPASS_DATA_PLANE_SERVICE_TOKEN, env.HIPASS_INTERNAL_SERVICE_TOKEN]) assert.throws(() => requireInternalServiceScope(authenticate(token), "gateway:package-key-release"));
  for (const changed of [{ HIPASS_KEY_RELEASE_SERVICE_TOKEN: env.HIPASS_DATA_PLANE_SERVICE_TOKEN },
    { HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID: "HOSP-A" }, { HIPASS_KEY_RELEASE_SERVICE_TOKEN: "short" }]) {
    const bad = { ...env, ...changed };
    assert.throws(() => new InternalServiceProvider(bad).authenticate({ headers: { "x-hipass-service-token": bad.HIPASS_KEY_RELEASE_SERVICE_TOKEN } }), /CONFIGURATION_INVALID/);
  }
});

test("actual HTTP package APIs separate A prepare/B unwrap, deny replay/spoof/tamper and hide storage errors", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "hp-key-http-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(path.join(directory, "db.json"));
  await store.load();
  const service = new HipassService(store, () => "2026-10-08T14:00:00.000Z", { tokenSecret: randomBytes(32).toString("hex") });
  const study = "1.2.410.100.1.20260620.001", series = `${study}.1`;
  const issued = await service.requestDicomAccessToken({ consentId: "CONSENT-DEMO-ACTIVE", doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study, seriesInstanceUid: series });
  const grant = await authorizeDataPlane(service, { method: "GET", path: `/dicomweb/studies/${study}/series/${series}/instances/${series}.1/rendered`, token: issued.accessToken, authorizationScheme: "Bearer", clientIp: "192.0.2.1" }, config);
  const records = new Map(); // HTTP fixture only, not durable deployment evidence.
  const repository = { persistent: true, async create(row) { records.set(row.releaseId, row); }, async read(id) { return records.get(id); },
    async consume(id) { const row = records.get(id); if (!row || row.consumed) return false; row.consumed = true; return true; } };
  const handler = createKeyReleaseHttpHandler({ service, repository, configuration: config });
  const env = credentials(), provider = new InternalServiceProvider(env);
  const server = http.createServer(async (request, response) => {
    try {
      const principal = provider.authenticate(request);
      await handler(request, response, new URL(request.url, "http://fixture.test"), principal);
    } catch (error) {
      request.resume(); response.writeHead(error.statusCode ?? 500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.code ?? "TEST_HANDLER_FAILURE" }));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const call = async (endpoint, token, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/gateway/data-plane/package/${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-hipass-service-token": token } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const binding = { packageId: "synthetic-http", keyId: config.keyId, recipientHospitalId: "HOSP-B", wrappedKeyHash: "1".repeat(64), ciphertextHash: "2".repeat(64), manifestHash: "3".repeat(64) };
  const prepare = { receipt: grant.body.receipt, packageBinding: binding };
  const wrap = { receipt: grant.body.receipt, packageId: "pkg_" + "a".repeat(32), keyId: config.keyId };
  assert.equal((await call("wrap-authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, wrap)).status, 403);
  assert.equal((await call("wrap-authorize", env.HIPASS_DATA_PLANE_SERVICE_TOKEN, wrap)).status, 200);
  assert.equal((await call("prepare", null, prepare)).status, 401);
  assert.equal((await call("prepare", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, prepare)).status, 403);
  assert.equal((await call("prepare", env.HIPASS_INTERNAL_SERVICE_TOKEN, prepare)).status, 403);
  const prepared = await call("prepare", env.HIPASS_DATA_PLANE_SERVICE_TOKEN, prepare);
  assert.equal(prepared.status, 200); assert.equal(prepared.cache, "no-store");
  const authorize = { ...prepare, releaseId: prepared.body.releaseId, phase: "BEFORE_UNWRAP" };
  assert.equal((await call("authorize", env.HIPASS_DATA_PLANE_SERVICE_TOKEN, authorize)).status, 403);
  assert.equal((await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, { ...authorize, authenticatedHospitalId: "HOSP-C" })).status, 400);
  assert.equal((await call("authorize?token=forbidden", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, authorize)).status, 400);
  assert.equal((await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, { ...authorize, packageBinding: { ...binding, ciphertextHash: "4".repeat(64) } })).status, 403);
  assert.equal((await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, authorize)).status, 200);
  assert.equal((await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, { ...authorize, phase: "AFTER_UNWRAP" })).status, 200);
  assert.equal((await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, authorize)).status, 403);
  repository.read = async () => { throw new Error("PRIVATE_DATABASE_DIAGNOSTIC"); };
  const unavailable = await call("authorize", env.HIPASS_KEY_RELEASE_SERVICE_TOKEN, authorize);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, { error: "KEY_RELEASE_UNAVAILABLE" });
});
