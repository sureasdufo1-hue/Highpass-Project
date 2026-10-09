import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { InternalServiceProvider, requireInternalServiceScope } from "../src/auth.js";
import { parseDataPlaneRequest, authorizeDataPlane, recordDataPlaneReady, isLegacyImageOperation } from "../src/data-plane-authorization.js";

const origin = "https://hospital-a.demo.test";
const study = "1.2.410.100.1.20260620.001";
const series = `${study}.1`;
const config = { sourceHospitalId: "HOSP-A", publicBaseUrl: origin };

test("Data Plane accepts only bounded UID routes and never raw PACS, arbitrary query or bulk downloads", () => {
  assert.equal(parseDataPlaneRequest({ method: "GET", path: `/dicomweb/studies/${study}/series/${series}/instances` }, origin).seriesInstanceUid, series);
  for (const input of [
    { method: "POST", path: "/dicomweb/studies" },
    ...["/system", "//evil.test/dicomweb/studies", "/dicomweb/studies/../system", "/dicomweb/studies/%31.2/series", "/dicomweb/studies?token=secret", "/dicomweb/studies?StudyInstanceUID=1.2&StudyInstanceUID=1.3", `/dicomweb/studies/${study}/download`].map(value => ({ method: "GET", path: value })),
  ]) assert.throws(() => parseDataPlaneRequest(input, origin));
  assert.throws(() => parseDataPlaneRequest({ method: "GET", path: "/dicomweb/studies" }, "http://unsafe.test"));
});

test("dedicated Gateway credential is least-privilege and cannot be replaced by generic internal credential", () => {
  const token = randomBytes(32).toString("base64url");
  const generic = randomBytes(32).toString("base64url");
  const provider = new InternalServiceProvider({ HIPASS_DATA_PLANE_SERVICE_TOKEN: token, HIPASS_INTERNAL_SERVICE_TOKEN: generic });
  const principal = provider.authenticate({ headers: { "x-hipass-service-token": token } });
  assert.deepEqual(principal.scopes, ["gateway:data-plane-authorize"]);
  requireInternalServiceScope(principal, "gateway:data-plane-authorize");
  assert.throws(() => requireInternalServiceScope(principal, "audit:write"));
  assert.throws(() => requireInternalServiceScope(provider.authenticate({ headers: { "x-hipass-service-token": generic } }), "gateway:data-plane-authorize"));
  assert.throws(() => new InternalServiceProvider({ HIPASS_DATA_PLANE_SERVICE_TOKEN: token, HIPASS_INTERNAL_SERVICE_TOKEN: token }).authenticate({ headers: { "x-hipass-service-token": token } }));
});

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "hp-data-plane-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(path.join(directory, "db.json"));
  await store.load();
  const service = new HipassService(store, () => "2026-10-08T14:00:00.000Z", { tokenSecret: randomBytes(32).toString("hex") });
  const issued = await service.requestDicomAccessToken({ consentId: "CONSENT-DEMO-ACTIVE", doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study, seriesInstanceUid: series });
  assert.equal(issued.decision, "ALLOWED");
  const input = { method: "GET", path: `/dicomweb/studies/${study}/series/${series}/instances`, clientIp: "192.0.2.2", authorizationScheme: "Bearer", token: issued.accessToken };
  return { service, store, input };
}

test("live metadata authorization returns scope only and never invokes Orthanc", async t => {
  const { service, input } = await setup(t);
  service.orthanc = new Proxy({}, { get() { throw new Error("Control Plane must not fetch image data"); } });
  const result = await authorizeDataPlane(service, input, config);
  assert.equal(result.status, 200);
  assert.equal(result.body.active, true);
  assert.equal(result.body.studyInstanceUid, study);
  assert.deepEqual(result.body.allowedSeriesUids, [series]);
  assert.ok(!JSON.stringify(result).includes(input.token));
  assert.equal((await authorizeDataPlane(service, { ...input, path: `/dicomweb/studies/${study}/series/${series}.9/instances` }, config)).body.reason, "TOKEN_SERIES_MISMATCH");
  assert.equal((await authorizeDataPlane(service, input, { ...config, sourceHospitalId: "HOSP-C" })).body.reason, "GATEWAY_SOURCE_HOSPITAL_MISMATCH");
});

test("revocation, expiry, tampering and VIEW_ONLY download fail closed", async t => {
  const { service, store, input } = await setup(t);
  assert.equal((await authorizeDataPlane(service, { ...input, token: `${input.token}tampered` }, config)).body.active, false);
  assert.equal((await authorizeDataPlane(service, { ...input, path: `/dicomweb/studies/${study}/series/${series}/instances/${series}.1/download` }, config)).body.reason, "TOKEN_PERMISSION_MISMATCH");
  store.get("consents").find(value => value.consentId === "CONSENT-DEMO-ACTIVE").status = "REVOKED";
  assert.equal((await authorizeDataPlane(service, input, config)).body.reason, "TOKEN_CONSENT_INACTIVE");
  store.get("consents").find(value => value.consentId === "CONSENT-DEMO-ACTIVE").status = "ACTIVE";
  service.clock = () => "2026-10-09T14:00:00.000Z";
  assert.equal((await authorizeDataPlane(service, input, config)).body.reason, "TOKEN_EXPIRED");
});

test("live hospital suspension and changed consent scope deny despite an unexpired signed token", async t => {
  const { service, store, input } = await setup(t);
  const hospital = store.get("hospitals").find(value => value.hospitalId === "HOSP-B");
  hospital.status = "SUSPENDED";
  assert.equal((await authorizeDataPlane(service, input, config)).body.reason, "GATEWAY_HOSPITAL_INACTIVE");
  hospital.status = "ACTIVE";
  for (const scope of store.get("consentScopes")) if (scope.consentId === "CONSENT-DEMO-ACTIVE") scope.allowed = false;
  assert.equal((await authorizeDataPlane(service, input, config)).body.active, false);
  assert.ok(store.get("auditLogs").some(value => value.reason === "GATEWAY_HOSPITAL_INACTIVE"));
});

test("DPoP is verified against the actual hospital URL and persists replay rejection", async t => {
  const { service, store, input } = await setup(t);
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = keys.publicKey.export({ format: "jwk" });
  const thumbprint = createHash("sha256").update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest("base64url");
  const claims = service.verifyAccessTokenSignature(input.token).claims;
  claims.cnf = { jkt: thumbprint };
  input.token = service.signAccessToken(claims);
  store.get("dicomAccessTokenLogs").find(value => value.tokenId === claims.jti).tokenHash = `sha256:${createHash("sha256").update(input.token).digest("hex")}`;
  input.authorizationScheme = "DPoP";
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ typ: "dpop+jwt", alg: "ES256", jwk })}.${encode({ jti: randomUUID(), htm: "GET", htu: origin + input.path, iat: Date.parse(service.clock()) / 1000, ath: createHash("sha256").update(input.token).digest("base64url") })}`;
  input.dpopProof = `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  const allowed = await authorizeDataPlane(service, input, config);
  assert.equal(allowed.status, 200, allowed.body.reason);
  assert.equal((await authorizeDataPlane(service, input, config)).body.reason, "DPOP_NONCE_REPLAYED");
});

test("signed report binds audit scope and rechecks consent before releasing prepared bytes", async t => {
  const { service, store, input } = await setup(t);
  const grant = await authorizeDataPlane(service, input, config);
  const report = { receipt: grant.body.receipt, bytesPrepared: 64, outcome: "READY" };
  assert.equal((await recordDataPlaneReady(service, { ...report, receipt: report.receipt + "forged" }, config)).status, 403);
  const acknowledged = await recordDataPlaneReady(service, report, config);
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.body.delivery, "NOT VERIFIED");
  assert.ok(store.get("auditLogs").some(row => row.action === "DATA_PLANE_RESPONSE_PREPARED" && row.studyInstanceUid === study && row.auditSessionId === grant.body.auditSessionId));
  store.get("consents").find(row => row.consentId === grant.body.consentId).status = "REVOKED";
  assert.equal((await recordDataPlaneReady(service, report, config)).status, 403);
  store.get("consents").find(row => row.consentId === grant.body.consentId).status = "ACTIVE";
  service.clock = () => "2026-10-08T14:00:31.000Z";
  assert.equal((await recordDataPlaneReady(service, report, config)).body.reason, "DATA_PLANE_RECEIPT_INVALID");
});

test("real isolated HTTP route requires the dedicated service and preserves metadata-only scope", { timeout: 20000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "hp-data-plane-http-"));
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const token = randomBytes(32).toString("base64url");
  const generic = randomBytes(32).toString("base64url");
  const child = spawn(process.execPath, ["src/server.js"], { windowsHide: true, stdio: "ignore", env: { ...process.env,
    NODE_ENV: "development", AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_STORE: "json",
    HIPASS_DB_PATH: path.join(directory, "db.json"), PORT: String(port),
    DICOM_TOKEN_SECRET: randomBytes(32).toString("hex"), HIPASS_DPOP_REQUIRED: "0",
    HIPASS_INGRESS_SECRET: "", HIPASS_PRIVACY_SERVICE_TOKEN: undefined,
    HIPASS_CONTROL_PLANE_ONLY: "1",
    HIPASS_DATA_PLANE_SERVICE_TOKEN: token, HIPASS_INTERNAL_SERVICE_TOKEN: generic,
    HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID: "HOSP-A", HIPASS_DATA_PLANE_PUBLIC_BASE_URL: origin } });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const call = async (route, headers = {}, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json(), cacheControl: response.headers.get("cache-control") };
  };
  const deadline = Date.now() + 8000;
  while (true) {
    try { if ((await call("/api/health")).status === 200) break; } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw new Error("DATA_PLANE_TEST_SERVER_UNAVAILABLE");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const issued = await call("/api/dicom-access/request", { "x-hipass-role": "DOCTOR", "x-hipass-doctor-id": "DOC-B-01", "x-hipass-hospital-id": "HOSP-B" }, { consentId: "CONSENT-DEMO-ACTIVE", doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study, seriesInstanceUid: series });
  assert.equal(issued.body.decision, "ALLOWED");
  const input = { method: "GET", path: `/dicomweb/studies/${study}/series/${series}/instances`, token: issued.body.accessToken, clientIp: "192.0.2.2", authorizationScheme: "Bearer" };
  const route = "/gateway/data-plane/authorize";
  assert.equal((await call(route, {}, input)).status, 401);
  assert.equal((await call(route, { "x-hipass-service-token": generic }, input)).status, 403);
  assert.equal((await call(route, { "x-hipass-role": "PLATFORM_ADMIN" }, input)).status, 403);
  const allowed = await call(route, { "x-hipass-service-token": token }, input);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.cacheControl, "no-store");
  assert.equal(allowed.body.studyInstanceUid, study);
  assert.equal(allowed.body.active, true);
  assert.ok(!JSON.stringify(allowed).includes(input.token));
  const ready = await call("/gateway/data-plane/ready", { "x-hipass-service-token": token }, { receipt: allowed.body.receipt, bytesPrepared: 64, outcome: "READY" });
  assert.equal(ready.status, 200);
  assert.equal(ready.body.delivery, "NOT VERIFIED");
  for (const imagePath of ["/dicomweb/studies", "/api/transfers/pacs-import", "/api/research/datasets/prepare"]) {
    assert.equal((await call(imagePath, { "x-hipass-role": "PLATFORM_ADMIN" }, {})).body.error, "CONTROL_PLANE_IMAGE_ROUTE_DISABLED");
  }
});

test("cloud boundary covers raw clinical/import/export paths but preserves policy and metadata", () => {
  for (const value of ["/dicomweb/studies", "/assets/clinical/fixture.dcm", "/api/transfers/pacs-import", "/api/research/exports/id/export"]) assert.equal(isLegacyImageOperation(value), true);
  for (const value of ["/gateway/data-plane/authorize", "/gateway/data-plane/ready", "/api/imaging-studies", "/api/consents", "/api/dicom-access/request"]) assert.equal(isLegacyImageOperation(value), false);
});
