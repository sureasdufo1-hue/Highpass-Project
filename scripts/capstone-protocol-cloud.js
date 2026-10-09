// Synthetic TEST IdP actor + real HTTPS policy API. Never print JWT/DPoP keys/token.
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { boundedHttps } from "/app/src/data-plane-gateway.js";
const publicOrigin = "https://192.168.111.149:9443";
const study = "1.2.410.100.1.20260620.001";
const series = `${study}.1`;
const ca = readFileSync("/run/secrets/ca.crt");
const authSecret = readFileSync("/run/secrets/test-auth-secret", "utf8").trim();
const file = "/run/result/grant.json";
const checks = [];
const jwt = claims => {
  const now = Math.floor(Date.now() / 1000);
  const encoded = [{ alg: "HS256", typ: "JWT" }, { iss: "highpass-capstone-test-idp", aud: "highpass-capstone-api", iat: now, exp: now + 600, jti: randomUUID(), ...claims }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${encoded}.${createHmac("sha256", authSecret).update(encoded).digest("base64url")}`;
};
const patient = () => jwt({ sub: "capstone-synthetic-patient", role: "PATIENT", patientId: "P-1001" });
const call = async (method, path, auth, body, proof) => {
  const result = await boundedHttps("https://10.90.88.1", path, { tls: { ca }, method,
    headers: { "content-type": "application/json", authorization: `Bearer ${auth}`, ...(proof ? { dpop: proof } : {}) }, body: body ? JSON.stringify(body) : undefined, maxBytes: 1048576, timeoutMs: 5000 });
  return { status: result.status, body: JSON.parse(result.body) };
};
try {
  if (process.env.HIPASS_PROTOCOL_PHASE === "issue") {
    const consent = await call("POST", "/api/consents", patient(), { patientId: "P-1001", sourceHospitalId: "HOSP-A", targetHospitalId: "HOSP-B", purpose: "TREATMENT", permission: "VIEW_ONLY", validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: new Date(Date.now() + 15 * 60000).toISOString(), scopes: [{ studyInstanceUid: study, seriesInstanceUid: series }] });
    if (consent.status !== 201 || consent.body.status !== "ACTIVE") throw new Error("CONSENT_CREATE_FAILED");
    writeFileSync(file, JSON.stringify({ consentId: consent.body.consentId }), { flag: "wx", mode: 0o600 });
    checks.push({ test: "REAL_PATIENT_CONSENT_CREATE", status: "PASS", consentId: consent.body.consentId });
    const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = keys.publicKey.export({ format: "jwk" });
    const input = [{ typ: "dpop+jwt", alg: "ES256", jwk }, { jti: randomUUID(), htm: "POST", htu: `${publicOrigin}/api/dicom-access/request`, iat: Math.floor(Date.now() / 1000) }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    const proof = `${input}.${sign("sha256", Buffer.from(input), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
    const doctor = jwt({ sub: "capstone-synthetic-doctor", role: "DOCTOR", doctorId: "DOC-B-01", hospitalId: "HOSP-B" });
    const issued = await call("POST", "/api/dicom-access/request", doctor, { consentId: consent.body.consentId, doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", studyInstanceUid: study, seriesInstanceUid: series, purpose: "TREATMENT", requestedAction: "VIEW" }, proof);
    if (issued.status !== 200 || issued.body.decision !== "ALLOWED" || typeof issued.body.accessToken !== "string") throw new Error("POLICY_TOKEN_ISSUE_FAILED");
    const claims = JSON.parse(Buffer.from(issued.body.accessToken.split(".")[1], "base64url"));
    // DICOM token contract uses ISO expiresAt/issuedAt, not JWT NumericDate exp.
    // Missing/NaN expiry must never silently pass a comparison or become null evidence.
    const expiresAt = Date.parse(claims.expiresAt);
    const issuedAt = Date.parse(claims.issuedAt);
    if (!claims.cnf?.jkt || !Number.isFinite(expiresAt) || !Number.isFinite(issuedAt)
        || expiresAt <= Date.now() || expiresAt - issuedAt > 600000 || expiresAt <= issuedAt) throw new Error("BOUND_TOKEN_REQUIRED");
    writeFileSync(file, JSON.stringify({ consentId: consent.body.consentId, token: issued.body.accessToken, privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }), jwk, study, series, publicOrigin }), { flag: "w", mode: 0o600 });
    checks.push({ test: "REAL_DOCTOR_POLICY_DPOP_TOKEN_ISSUE", status: "PASS", expiresInSeconds: Math.floor((expiresAt - Date.now()) / 1000) });
  } else if (["finalize", "audit"].includes(process.env.HIPASS_PROTOCOL_PHASE)) {
    const fixture = JSON.parse(readFileSync(file));
    if (process.env.HIPASS_PROTOCOL_PHASE === "finalize") {
      const revoked = await call("POST", `/api/consents/${fixture.consentId}/revoke`, patient(), {});
      checks.push({ test: "REAL_PATIENT_CONSENT_REVOKE", status: revoked.status === 200 && revoked.body.status === "REVOKED" ? "PASS" : "FAIL" });
    }
    const admin = jwt({ sub: "capstone-synthetic-security-reviewer", role: "SECURITY_ADMIN", hospitalId: "HOSP-A" });
    const integrity = await call("GET", "/api/audit-integrity", admin);
    checks.push({ test: "REAL_POSTGRES_AUDIT_HASH_CHAIN", status: integrity.status === 200 && integrity.body.ok === true ? "PASS" : "FAIL", checked: integrity.body.checked ?? null });
    const logs = await call("GET", "/api/audit-logs?limit=200", admin);
    const rows = Array.isArray(logs.body) ? logs.body.filter(row => row.consentId === fixture.consentId) : [];
    const actions = new Set(rows.map(row => row.action));
    checks.push({ test: "REAL_TRANSFER_RESPONSE_PREPARED_AUDIT", status: logs.status === 200 && actions.has("DATA_PLANE_RESPONSE_PREPARED") && actions.has("CONSENT_REVOKED") ? "PASS" : "FAIL", matchedRecordCount: rows.length });
  } else throw new Error("INVALID_PHASE");
} catch (error) {
  checks.push({ test: "CLOUD_PROTOCOL_STAGE", status: "NOT VERIFIED", reason: ["CONSENT_CREATE_FAILED", "POLICY_TOKEN_ISSUE_FAILED", "BOUND_TOKEN_REQUIRED", "INVALID_PHASE"].includes(error.message) ? error.message : "TLS_API_OR_RESPONSE_FAILED" });
}
console.log(JSON.stringify({ scope: "REAL_SYNTHETIC_POLICY_API_PROTOCOL_ONLY", review: "DRAFT / UNASSIGNED", checks, status: checks.every(item => item.status === "PASS") ? "PASS" : "NOT VERIFIED" }));
process.exitCode = checks.every(item => item.status === "PASS") ? 0 : 1;
