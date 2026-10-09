import { generateKeyPairSync, sign, createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

if (process.env.NODE_TEST_CONTEXT) process.exit(0);
if (!/^hp-validation-[a-z0-9-]+$/.test(process.env.HIPASS_COMPOSE_PROJECT ?? "")) throw new Error("Independent synthetic project required");
const origin = new URL(process.env.HIPASS_E2E_BASE_URL).origin;
if (new URL(origin).protocol !== "https:") throw new Error("HTTPS required");
let stage = "HTTPS_SCENARIOS";
const deadline = setTimeout(() => { console.log(JSON.stringify({ result: "NOT VERIFIED", stage, reason: "DPOP_HTTPS_DEADLINE" })); process.exit(2); }, 300000);
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = publicKey.export({ format: "jwk" });
const results = [];
function proof(method, url, token, overrides = {}) {
  const payload = { jti: randomUUID(), htm: method, htu: origin + url, iat: Math.floor(Date.now() / 1000), ...(token ? { ath: createHash("sha256").update(token).digest("base64url") } : {}), ...overrides };
  const input = [{ typ: "dpop+jwt", alg: "ES256", jwk }, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
async function request(url, headers = {}, body) {
  const response = await fetch(origin + url, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(55000) });
  try { return { status: response.status, body: await response.json() }; }
  catch (error) {
    if (error instanceof SyntaxError) throw Object.assign(new Error("RESPONSE_INVALID_JSON"), { code: "RESPONSE_INVALID_JSON", httpStatus: response.status });
    throw error;
  }
}
function check(name, actual, expectedStatus, expectedReason) {
  const reason = actual.body.error ?? actual.body.reasonCode;
  results.push({ name, status: actual.status, reason: reason ?? null, result: actual.status === expectedStatus && (!expectedReason || reason === expectedReason) ? "PASS" : "FAIL" });
}
async function scopedContainer(container) {
  if (!container?.startsWith(`${process.env.HIPASS_COMPOSE_PROJECT}-`)) throw new Error("Scope mismatch");
  const { stdout } = await exec("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', container], { timeout: 10000, windowsHide: true });
  if (stdout.trim() !== process.env.HIPASS_COMPOSE_PROJECT) throw new Error("Project label mismatch");
  return container;
}
async function database(sql) {
  const container = await scopedContainer(process.env.HIPASS_POSTGRES_CONTAINER);
  return exec("docker", ["exec", container, "psql", "-U", "hipass_app", "-d", "hipass", "-v", "ON_ERROR_STOP=1", "-c", sql], { timeout: 10000, windowsHide: true });
}
try {
  const patient = { "x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001" };
  const doctor = { "x-hipass-role": "DOCTOR", "x-hipass-doctor-id": "DOC-B-01", "x-hipass-hospital-id": "HOSP-B" };
  const study = "1.2.410.100.1.20260620.001";
  const consent = await request("/api/consents", patient, { patientId: "P-1001", sourceHospitalId: "HOSP-A", targetHospitalId: "HOSP-B", purpose: "TREATMENT", permission: "VIEW_ONLY", validUntil: new Date(Date.now() + 3600000).toISOString(), scopes: [{ studyInstanceUid: study }] });
  check("synthetic consent", consent, 201);
  const issuance = "/api/dicom-access/request";
  const input = { consentId: consent.body.consentId, doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study };
  check("strict issuance without proof", await request(issuance, doctor, input), 403, "DPOP_PROOF_REQUIRED");
  const issued = await request(issuance, { ...doctor, dpop: proof("POST", issuance), "x-forwarded-for": "198.51.100.5", "x-forwarded-proto": "http", "x-ja3-fingerprint": "spoofed", "x-hipass-ingress-time": "0000000000000", "x-hipass-ingress-signature": "forged" }, input);
  check("bound issuance through edge overwriting forged metadata", issued, 200);
  if (!issued.body.accessToken || issued.body.tokenType !== "DPoP") throw new Error("Bound token prerequisite failed");
  const token = issued.body.accessToken;
  const resource = "/dicomweb/studies";
  const headers = (overrides = {}) => ({ authorization: `DPoP ${token}`, dpop: proof("GET", resource, token), ...overrides });
  check("normal authenticated ingress + QIDO", await request(resource, headers()), 200);
  check("missing proof", await request(resource, headers({ dpop: "" })), 403, "DPOP_PROOF_REQUIRED");
  check("Bearer downgrade", await request(resource, headers({ authorization: `Bearer ${token}` })), 403, "DPOP_AUTH_SCHEME_REQUIRED");
  for (const [name, change, reason] of [
    ["wrong ath", { ath: "wrong" }, "DPOP_ATH_MISMATCH"],
    ["wrong origin", { htu: "https://wrong.invalid/dicomweb/studies" }, "DPOP_URI_MISMATCH"],
    ["wrong path case", { htu: origin + "/Dicomweb/studies" }, "DPOP_URI_MISMATCH"],
    ["wrong method", { htm: "POST" }, "DPOP_METHOD_MISMATCH"],
    ["expired proof", { iat: Math.floor(Date.now() / 1000) - 120 }, "DPOP_PROOF_EXPIRED"],
  ]) check(name, await request(resource, headers({ dpop: proof("GET", resource, token, change) })), 403, reason);
  const replay = headers();
  check("fresh proof before replay", await request(resource, replay), 200);
  check("replayed proof", await request(resource, replay), 403, "DPOP_NONCE_REPLAYED");
  if (process.env.HIPASS_DPOP_PERSISTENT_TEST === "1") {
    const restartProof = proof("GET", resource, token, { iat: Math.floor(Date.now() / 1000) + 50 });
    const restartHeaders = headers({ dpop: restartProof });
    check("before API container restart", await request(resource, restartHeaders), 200);
    const api = await scopedContainer(process.env.HIPASS_E2E_API_CONTAINER);
    stage = "API_CONTAINER_RESTART";
    await exec("docker", ["restart", "--time", "10", api], { timeout: 90000, windowsHide: true });
    stage = "RESTART_READINESS";
    const readyDeadline = Date.now() + 60000;
    while (true) {
      try { if ((await request("/api/health")).status === 200) break; } catch {}
      if (Date.now() > readyDeadline) throw new Error("Restart readiness failed");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    stage = "POST_RESTART_REPLAY";
    check("same proof after actual API restart", await request(resource, restartHeaders), 403, "DPOP_NONCE_REPLAYED");
    // Rename only this fresh project's replay table; no data is deleted. Restore
    // in finally, never create a replacement ledger that would clear live claims.
    stage = "REPLAY_STORE_FAULT_AND_RECOVERY";
    const collision = await database("SELECT to_regclass('public.dpop_replay_entries_test_unavailable') IS NULL AS safe");
    if (!/\bt\b/.test(collision.stdout)) throw new Error("Fault fixture collision");
    await database("ALTER TABLE dpop_replay_entries RENAME TO dpop_replay_entries_test_unavailable");
    try {
      check("missing replay table is infrastructure 503, no fallback", await request(resource, headers()), 503, "DPOP_REPLAY_STORE_UNAVAILABLE");
    } finally { await database("ALTER TABLE dpop_replay_entries_test_unavailable RENAME TO dpop_replay_entries"); }
    check("new proof after store recovery", await request(resource, headers()), 200);
    const admin = { "x-hipass-role": "SECURITY_ADMIN", "x-hipass-user-id": "synthetic-replay-reviewer" };
    const audit = await request("/api/audit-logs", admin);
    const logs = Array.isArray(audit.body) ? audit.body : [];
    check("store failure recorded in restricted audit", { status: logs.some(log => log.reasonCode === "DPOP_REPLAY_STORE_UNAVAILABLE") ? 200 : 500, body: {} }, 200);
  }
  stage = "SCOPE_AND_REVOCATION";
  const wrongStudy = "/dicomweb/studies/1.2.3/series";
  check("scope is still required", await request(wrongStudy, headers({ dpop: proof("GET", wrongStudy, token) })), 403, "TOKEN_STUDY_MISMATCH");
  check("consent revoke", await request(`/api/consents/${input.consentId}/revoke`, patient, {}), 200);
  check("revoked consent overrides valid proof", await request(resource, headers()), 403, "TOKEN_CONSENT_INACTIVE");
  const result = results.every(item => item.result === "PASS") ? "PASS" : "FAIL";
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), result, scope: process.env.HIPASS_DPOP_PERSISTENT_TEST === "1" ? "INDEPENDENT SYNTHETIC / ACTUAL API RESTART + STORE FAILURE" : "INDEPENDENT SYNTHETIC", results }, null, 2));
  process.exitCode = result === "PASS" ? 0 : 1;
} catch (error) {
  const safeCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "RESPONSE_INVALID_JSON", "TimeoutError", "AbortError"];
  const code = [error.cause?.code, error.code, error.name].find(value => safeCodes.includes(value));
  const reason = code ?? (error.killed ? "COMMAND_TIMEOUT" : "PREREQUISITE_OR_TRANSPORT_ERROR");
  console.log(JSON.stringify({ result: "NOT VERIFIED", stage, reason, ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}), results }, null, 2)); process.exitCode = 2;
}
finally { clearTimeout(deadline); }
