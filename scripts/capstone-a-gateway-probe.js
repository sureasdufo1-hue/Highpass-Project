// Runs inside the actual A Gateway container. Never logs keys/tokens/DICOM tags.
import { readFileSync } from "node:fs";
import { boundedHttps } from "/app/src/data-plane-gateway.js";
const ca = readFileSync("/run/secrets/ca.crt");
const serviceToken = readFileSync("/run/secrets/data-plane-secret", "utf8").trim();
const checks = [];
try {
  const control = await boundedHttps("https://10.90.88.1", "/api/health", { tls: { ca }, maxBytes: 32768, timeoutMs: 5000 });
  checks.push({ test: "GATEWAY_CONTAINER_PRIVATE_CLOUD_TLS", status: control.status === 200 ? "PASS" : "FAIL" });
  const authorization = await boundedHttps("https://10.90.88.1", "/gateway/data-plane/authorize", { tls: { ca }, method: "POST", headers: { "content-type": "application/json", "x-hipass-service-token": serviceToken }, body: "{}", maxBytes: 32768, timeoutMs: 5000 });
  const decision = JSON.parse(authorization.body);
  checks.push({ test: "GATEWAY_LEAST_PRIVILEGE_PRINCIPAL_REACHES_LIVE_POLICY", status: authorization.status === 400 && decision.reason === "DATA_PLANE_REQUEST_INVALID" ? "PASS" : "FAIL" });
  const pacs = await boundedHttps("https://orthanc-mtls:8443", "/dicom-web/studies", { tls: { ca, cert: readFileSync("/run/secrets/gateway-client.crt"), key: readFileSync("/run/secrets/gateway-client.key"), servername: "hospital-a-orthanc-mtls" }, maxBytes: 1048576, timeoutMs: 5000 });
  const rows = JSON.parse(pacs.body);
  const expected = new Set(["1.2.410.100.1.20260620.001", "1.2.410.100.1.20260518.002", "1.2.826.0.1.3680043.10.5432.20260908.1001.1"]);
  const found = new Set(rows.map(row => row["0020000D"]?.Value?.[0]));
  checks.push({ test: "GATEWAY_REAL_PACS_MTLS_SYNTHETIC_QIDO", status: pacs.status === 200 && found.size === expected.size && [...expected].every(uid => found.has(uid)) ? "PASS" : "FAIL", syntheticStudyCount: found.size });
} catch (error) {
  checks.push({ test: "GATEWAY_CONTAINER_TRANSPORT", status: "NOT VERIFIED", reason: ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED"].includes(error.code) ? error.code : "TRANSPORT_OR_RESPONSE_FAILED" });
}
console.log(JSON.stringify({ scope: "ACTUAL_GATEWAY_TRANSPORT_ONLY", checks, status: checks.every(item => item.status === "PASS") ? "PASS" : "NOT VERIFIED", authorizedViewerE2E: "NOT VERIFIED" }));
process.exitCode = checks.every(item => item.status === "PASS") ? 0 : 1;
