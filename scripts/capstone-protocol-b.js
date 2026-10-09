// Runs on B; raw token/ephemeral proof key never appear in logs/URLs/evidence.
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign, randomUUID } from "node:crypto";
import { boundedHttps } from "/app/src/data-plane-gateway.js";
const fixture = JSON.parse(readFileSync("/run/result/grant.json"));
const ca = readFileSync("/run/secrets/ca.crt");
const key = createPrivateKey(fixture.privateKey);
const proof = path => {
  const input = [{ typ: "dpop+jwt", alg: "ES256", jwk: fixture.jwk }, { jti: randomUUID(), htm: "GET", htu: fixture.publicOrigin + path, iat: Math.floor(Date.now() / 1000), ath: createHash("sha256").update(fixture.token).digest("base64url") }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${input}.${sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
};
const call = (path, provided = proof(path), token = fixture.token) => boundedHttps("https://10.90.88.2:9443", path, { tls: { ca }, headers: { authorization: `DPoP ${token}`, ...(provided ? { dpop: provided } : {}) }, maxBytes: 1048576, timeoutMs: 10000 });
const checks = [];
try {
  if (process.env.HIPASS_PROTOCOL_PHASE === "revoked") {
    const denied = await call("/dicomweb/studies");
    checks.push({ test: "REAL_REVOKED_TOKEN_ACCESS_DENIED", status: denied.status === 403 ? "PASS" : "FAIL" });
  } else {
    const path = "/dicomweb/studies";
    const reuse = proof(path);
    const studies = await call(path, reuse);
    const rows = JSON.parse(studies.body);
    checks.push({ test: "REAL_GRANTED_STUDY_ONLY", status: studies.status === 200 && rows.length === 1 && rows[0]["0020000D"]?.Value?.[0] === fixture.study ? "PASS" : "FAIL" });
    const series = await call(`/dicomweb/studies/${fixture.study}/series`);
    const seriesRows = JSON.parse(series.body);
    checks.push({ test: "REAL_GRANTED_SERIES_ONLY", status: series.status === 200 && seriesRows.length === 1 && seriesRows[0]["0020000E"]?.Value?.[0] === fixture.series ? "PASS" : "FAIL" });
    const instancePath = `/dicomweb/studies/${fixture.study}/series/${fixture.series}/instances`;
    const instances = await call(instancePath);
    const instanceRows = JSON.parse(instances.body);
    const instance = instanceRows[0]?.["00080018"]?.Value?.[0];
    checks.push({ test: "REAL_GRANTED_INSTANCE_LIST", status: instances.status === 200 && instanceRows.length >= 1 && typeof instance === "string" ? "PASS" : "FAIL" });
    if (instance) {
      const image = await call(`${instancePath}/${instance}`);
      checks.push({ test: "REAL_MTLS_WADO_SYNTHETIC_DICOM", status: image.status === 200 && image.body.includes(Buffer.from("DICM")) ? "PASS" : "FAIL", bytesReceived: image.body.length });
    }
    const replay = await call(path, reuse);
    checks.push({ test: "REAL_PERSISTENT_DPOP_REPLAY_DENY", status: replay.status === 403 ? "PASS" : "FAIL" });
    const otherSeries = await call(`/dicomweb/studies/${fixture.study}/series/${fixture.study}.2/instances`);
    checks.push({ test: "REAL_OUT_OF_SERIES_DENY", status: otherSeries.status === 403 ? "PASS" : "FAIL" });
    const missingProof = await call(path, "");
    checks.push({ test: "REAL_BOUND_TOKEN_WITHOUT_PROOF_DENY", status: missingProof.status === 403 ? "PASS" : "FAIL" });
  }
} catch {
  checks.push({ test: "B_PROTOCOL_STAGE", status: "NOT VERIFIED", reason: "TLS_API_OR_DICOM_RESPONSE_FAILED" });
}
console.log(JSON.stringify({ scope: "REAL_B_A_CLOUD_AUTHORIZED_DICOM_PROTOCOL_ONLY", review: "DRAFT / UNASSIGNED", checks, status: checks.every(item => item.status === "PASS") ? "PASS" : "NOT VERIFIED", browserViewer: "NOT VERIFIED", keyVaultCrypto: "NOT VERIFIED" }));
process.exitCode = checks.every(item => item.status === "PASS") ? 0 : 1;
