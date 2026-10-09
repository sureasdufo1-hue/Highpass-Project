import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { HipassService } from "../src/services.js";
import { JsonStore } from "../src/store.js";
import { ingressMeta, signIngress, validateIngressConfig } from "../src/ingress.js";

function keyPair() {
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { ...keys, jwk: keys.publicKey.export({ format: "jwk" }) };
}
function proof(key, method, url, token, overrides = {}, headerOverrides = {}) {
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: key.jwk, ...headerOverrides };
  const payload = { jti: randomUUID(), htm: method, htu: url, iat: Math.floor(Date.now() / 1000), ...(token ? { ath: createHash("sha256").update(token).digest("base64url") } : {}), ...overrides };
  const input = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${input}.${sign("sha256", Buffer.from(input), { key: key.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

test("FIX-006 ingress ignores spoofing and authenticates exact method/path/token metadata", () => {
  const secret = randomBytes(32).toString("hex");
  const request = { method: "GET", url: "/dicomweb/studies", socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https", "x-ja3-fingerprint": "spoofed" } };
  assert.equal(ingressMeta(request, secret).ipAddress, "127.0.0.1");
  const envelope = signIngress(request, request.headers["x-forwarded-for"], secret);
  Object.assign(request.headers, { "x-hipass-ingress-time": envelope.timestamp, "x-hipass-ingress-signature": envelope.signature });
  assert.equal(ingressMeta(request, secret).ingressTrusted, true);
  assert.equal(ingressMeta(request, secret).ja3Fingerprint, null);
  assert.equal(ingressMeta(request, secret, Date.now() + 11000).ingressTrusted, false);
  for (const change of [{ url: "/different" }, { method: "POST" }, { headers: { ...request.headers, authorization: "Bearer changed" } }, { headers: { ...request.headers, "x-forwarded-for": "bad,ip" } }]) {
    assert.equal(ingressMeta({ ...request, ...change }, secret).ingressTrusted, false);
  }
  assert.throws(() => validateIngressConfig({ HIPASS_DPOP_REQUIRED: "1", HIPASS_PUBLIC_BASE_URL: "http://localhost" }));
  assert.throws(() => validateIngressConfig({ HIPASS_INGRESS_SECRET: "short" }));
});

test("FIX-006 strict proof rejects malformed claims, wrong origin/case, ath and private JWK; forgery cannot poison replay", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "hp-proof-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new JsonStore(path.join(dir, "db.json")); await store.load();
  const service = new HipassService(store, undefined, { tokenSecret: randomBytes(32).toString("hex") });
  const key = keyPair(); const url = "https://localhost:3443/dicomweb/studies";
  for (const overrides of [{ htu: "https://evil.test/dicomweb/studies" }, { htu: "https://localhost:3443/Dicomweb/studies" }, { htu: `${url}?query=1` }, { htu: "https://[malformed" }, { iat: "Infinity" }, { iat: "1" }, { jti: {} }, { ath: "wrong" }, { htm: "POST" }, { htm: "get" }]) {
    const result = await service.verifyDPoPProof(proof(key, "GET", url, "synthetic-token", overrides), { method: "GET", url, accessToken: "synthetic-token", requireAbsoluteUrl: true });
    assert.equal(result.valid, false, JSON.stringify(overrides));
  }
  assert.equal((await service.verifyDPoPProof(proof(key, "GET", url, null, {}, { jwk: { ...key.jwk, d: "private" } }), { method: "GET", url, requireAbsoluteUrl: true })).valid, false);
  const valid = proof(key, "GET", url, "synthetic-token");
  const parts = valid.split(".");
  const forged = `${parts[0]}.${parts[1]}.${Buffer.alloc(64).toString("base64url")}`;
  const context = { method: "GET", url, accessToken: "synthetic-token", requireAbsoluteUrl: true };
  assert.equal((await service.verifyDPoPProof(forged, context)).valid, false);
  assert.equal((await service.verifyDPoPProof(valid, context)).valid, true);
  assert.equal((await service.verifyDPoPProof(valid, context)).reason, "DPOP_NONCE_REPLAYED");
});

test("FIX-006 rejected DPoP leaves the one-time patient handoff unconsumed", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "hp-proof-ticket-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new JsonStore(path.join(dir, "db.json")); await store.load();
  const service = new HipassService(store, () => "2026-06-25T10:00:00.000Z", { tokenSecret: randomBytes(32).toString("hex") });
  const ticket = await service.issueConsentHandoffTicket("CONSENT-DEMO-ACTIVE", "P-1001");
  const nonce = ticket.qr.payload.split("/").at(-1);
  const result = await service.redeemViewerHandoff(nonce, { doctorId: "DOC-B-01", hospitalId: "HOSP-B" }, { dpopProof: "forged", ingressTrusted: true, method: "POST", externalUrl: "https://localhost:3443/api/transfers/tickets/redeem-viewer" });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "DPOP_SIGNATURE_INVALID");
  assert.equal(store.get("transferTickets")[0].status, "ISSUED");
  assert.equal(store.get("dicomAccessTokenLogs").length, 0);
  const key = keyPair(); const url = "https://localhost:3443/api/transfers/tickets/redeem-viewer";
  const context = () => ({ ingressTrusted: true, method: "POST", externalUrl: url, dpopProof: proof(key, "POST", url, null, { iat: Date.parse("2026-06-25T10:00:00.000Z") / 1000 }) });
  const concurrent = await Promise.all([context(), context()].map(meta => service.redeemViewerHandoff(nonce, { doctorId: "DOC-B-01", hospitalId: "HOSP-B" }, meta)));
  assert.equal(concurrent.filter(item => item.decision === "ALLOWED").length, 1, JSON.stringify(concurrent.map(item => ({ decision: item.decision, reasonCode: item.reasonCode }))));
  assert.equal(concurrent.find(item => item.decision === "DENIED").reasonCode, "TICKET_ALREADY_USED");
});

test("FIX-006 protected HTTP routes enforce bound tokens, no downgrade, scope, consent and safe audit", { timeout: 80000 }, async t => {
  // Explicit REST test double, not live Orthanc/DICOM evidence. No DNS/external service.
  let upstreamRequests = 0;
  const upstream = createHttpServer((req, res) => {
    upstreamRequests += 1;
    res.writeHead(req.url === '/studies' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(req.url === '/studies' ? '[]' : '{}');
  });
  upstream.requestTimeout = 5000; upstream.headersTimeout = 5000; upstream.timeout = 5000;
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const listener = createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const dir = await mkdtemp(path.join(tmpdir(), "hp-dpop-http-"));
  const secret = randomBytes(32).toString("hex"); const origin = "https://localhost:3443";
  const child = spawn(process.execPath, ["src/server.js"], { windowsHide: true, stdio: "pipe", env: { ...process.env, NODE_ENV: "development", AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_STORE: "json", HIPASS_DB_PATH: path.join(dir, "db.json"), PORT: String(port), DICOM_TOKEN_SECRET: randomBytes(32).toString("hex"), HIPASS_INGRESS_SECRET: secret, HIPASS_PUBLIC_BASE_URL: origin, HIPASS_DPOP_REQUIRED: "1", HIPASS_ENABLE_CURATED_DICOM: '0', ORTHANC_REST_URL: `http://127.0.0.1:${upstream.address().port}` } });
  child.stdout.resume(); child.stderr.resume();
  t.after(async () => { if (child.exitCode === null) { const ended = new Promise(resolve => child.once("exit", resolve)); child.kill(); await ended; } await rm(dir, { recursive: true, force: true }); });
  const request = async (url, headers = {}, body, trusted = true) => {
    const method = body === undefined ? "GET" : "POST";
    headers = { "content-type": "application/json", ...headers };
    if (trusted) {
      const envelope = signIngress({ method, url, headers }, "127.0.0.1", secret);
      Object.assign(headers, { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https", "x-hipass-ingress-time": envelope.timestamp, "x-hipass-ingress-signature": envelope.signature });
    }
    // Fixed operation labels only: never log URL identifiers, proofs or tokens.
    const operation = url === '/api/health' ? 'HEALTH' : url === '/api/consents' ? 'CONSENT_CREATE'
      : url === '/api/dicom-access/request' ? 'TOKEN_ISSUE' : url === '/dicomweb/studies' ? 'STUDY_LIST'
      : url.endsWith('/revoke') ? 'CONSENT_REVOKE' : 'SCOPED_RESOURCE';
    try {
      const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json() };
    } catch (error) {
      const kind = error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.name === 'AbortError' ? 'ABORTED' : 'TRANSPORT_OR_RESPONSE_FAILURE';
      throw new Error(`ISOLATED_DPOP_${operation}_${kind}`);
    }
  };
  const deadline = Date.now() + 8000;
  while (true) { try { if ((await request("/api/health")).status === 200) break; } catch {} if (Date.now() > deadline || child.exitCode !== null) throw new Error("Isolated DPoP server unavailable"); await new Promise(resolve => setTimeout(resolve, 50)); }
  const patient = { "x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001" };
  const doctor = { "x-hipass-role": "DOCTOR", "x-hipass-doctor-id": "DOC-B-01", "x-hipass-hospital-id": "HOSP-B" };
  const study = "1.2.410.100.1.20260620.001";
  const consent = await request("/api/consents", patient, { patientId: "P-1001", sourceHospitalId: "HOSP-A", targetHospitalId: "HOSP-B", purpose: "TREATMENT", permission: "VIEW_ONLY", validUntil: new Date(Date.now() + 3600000).toISOString(), scopes: [{ studyInstanceUid: study }] });
  assert.equal(consent.status, 201);
  const input = { consentId: consent.body.consentId, doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study };
  const key = keyPair(); const issueUrl = "/api/dicom-access/request";
  assert.equal((await request(issueUrl, doctor, input)).body.reasonCode, "DPOP_PROOF_REQUIRED");
  const issueHeaders = () => ({ ...doctor, dpop: proof(key, "POST", origin + issueUrl) });
  assert.equal((await request(issueUrl, issueHeaders(), input, false)).body.reasonCode, "TRUSTED_INGRESS_REQUIRED");
  const issued = await request(issueUrl, issueHeaders(), input);
  assert.equal(issued.status, 200); assert.equal(issued.body.tokenType, "DPoP");
  const token = issued.body.accessToken;
  assert.ok(JSON.parse(Buffer.from(token.split(".")[1], "base64url")).cnf.jkt);
  const resource = "/dicomweb/studies";
  const resourceHeaders = (overrides = {}) => ({ authorization: `DPoP ${token}`, dpop: proof(key, "GET", origin + resource, token), ...overrides });
  assert.equal((await request(resource, resourceHeaders({ dpop: "" }))).body.error, "DPOP_PROOF_REQUIRED");
  assert.equal((await request(resource, resourceHeaders({ authorization: `Bearer ${token}` }))).body.error, "DPOP_AUTH_SCHEME_REQUIRED");
  assert.equal((await request(resource, resourceHeaders(), undefined, false)).body.error, "TRUSTED_INGRESS_REQUIRED");
  assert.equal((await request(resource, resourceHeaders({ dpop: proof(keyPair(), "GET", origin + resource, token) }))).body.error, "DPOP_KEY_MISMATCH");
  assert.equal((await request(resource, resourceHeaders({ dpop: proof(key, "GET", origin + resource, token, { ath: "wrong" }) }))).body.error, "DPOP_ATH_MISMATCH");
  const replay = resourceHeaders();
  assert.equal(upstreamRequests, 0, 'DPoP denials never query upstream');
  const allow = await request(resource, replay);
  assert.equal(allow.status, 200, 'valid proof reaches explicit empty REST fixture');
  assert.equal(upstreamRequests, 1);
  assert.equal((await request(resource, replay)).body.error, "DPOP_NONCE_REPLAYED");
  const wrongStudy = "/dicomweb/studies/1.2.3/series";
  assert.equal((await request(wrongStudy, resourceHeaders({ dpop: proof(key, "GET", origin + wrongStudy, token) }))).body.error, "TOKEN_STUDY_MISMATCH");
  assert.equal((await request(`/api/consents/${input.consentId}/revoke`, patient, {})).status, 200);
  assert.equal((await request(resource, resourceHeaders())).body.error, "TOKEN_CONSENT_INACTIVE");
  assert.equal(upstreamRequests, 1, 'replay/scope/revocation denials never query upstream');
  const raw = await readFile(path.join(dir, "db.json"), "utf8");
  assert.equal(raw.includes(token), false);
  assert.equal(raw.includes(replay.dpop), false);
  assert.ok(JSON.parse(raw).auditLogs.some(log => log.reasonCode === "DPOP_ATH_MISMATCH"));
});
