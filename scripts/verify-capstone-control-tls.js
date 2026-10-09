// Fresh, isolated LOCAL Docker TLS gate. Does not claim Azure or VM deployment.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import https from "node:https";
import net from "node:net";
import path from "node:path";

const project = `hp-control-tls-${Date.now()}`;
const directory = path.resolve("artifacts/azure", project);
mkdirSync(directory, { recursive: true });
const names = ["admin-password", "app-password", "token-secret", "test-auth-secret", "ingress-secret", "data-plane-secret"];
for (const name of names) writeFileSync(path.join(directory, name), randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const override = path.join(directory, "local-only.compose.json");
writeFileSync(override, JSON.stringify({ services: { ingress: { ports: [`127.0.0.1:${port}:8443`] } } }), { flag: "wx" });
const env = { ...process.env, HIPASS_APP_IMAGE: "highpass-platform-mvp:capstone-20261008-dataplane", HIPASS_POSTGRES_IMAGE: process.env.HIPASS_POSTGRES_IMAGE ?? "postgres:16-alpine", HIPASS_CLOUD_SECRET_DIR: directory, HIPASS_CAPSTONE_PUBLIC_ORIGIN: "https://192.168.111.149:9443" };
// The loopback override replaces the publication for THIS unique local test only.
// Build a merged artifact rather than accidentally publishing the production IP.
const compose = JSON.parse(execFileSync("docker", ["compose", "--project-directory", process.cwd(), "-f", "infra/azure/capstone-control.compose.yml", "-f", "infra/azure/capstone-control-ingress.compose.yml", "config", "--format", "json"], { env, timeout: 15000, windowsHide: true, encoding: "utf8", stdio: "pipe" }));
compose.services.ingress.ports = [{ target: 8443, published: String(port), host_ip: "127.0.0.1", protocol: "tcp" }];
delete compose.name;
for (const item of Object.values(compose.networks)) delete item.name;
for (const item of Object.values(compose.volumes)) delete item.name;
writeFileSync(override, JSON.stringify(compose));
const run = (args, timeout = 15000) => execFileSync("docker", ["compose", "-p", project, "-f", override, ...args], { env, timeout, windowsHide: true, encoding: "utf8", stdio: "pipe", maxBuffer: 262144 });
const checks = [];
let phase = "CERTIFICATE_SETUP";
const request = (pathname, options = {}) => new Promise((resolve, reject) => {
  const req = https.get({ hostname: "127.0.0.1", port, path: pathname, ca: readFileSync(path.join(directory, "cloud-server.crt")), rejectUnauthorized: true, ...options }, response => {
    let body = "";
    response.on("data", chunk => { body += chunk; if (body.length > 65536) req.destroy(new Error("BODY_LIMIT")); });
    response.on("end", () => resolve({ status: response.statusCode, body }));
    response.on("error", reject);
  });
  req.on("error", reject);
  const timer = setTimeout(() => req.destroy(new Error("TLS_GATE_TIMEOUT")), 5000);
  req.on("close", () => clearTimeout(timer));
});
try {
  const openssl = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
  execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-noenc", "-days", "1", "-subj", "/CN=highpass-isolated-local-test-only", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "extendedKeyUsage=serverAuth", "-keyout", path.join(directory, "cloud-server.key"), "-out", path.join(directory, "cloud-server.crt")], { timeout: 15000, windowsHide: true, stdio: "pipe" });
  phase = "COMPOSE_READINESS";
  run(["up", "-d", "--wait", "--wait-timeout", "180"], 220000);
  phase = "TLS_READINESS";
  const health = await request("/api/health");
  checks.push({ test: "LOCAL_TLS_PRIVATE_CONTROL_READINESS", status: health.status === 200 ? "PASS" : "FAIL" });
  const proof = await request("/api/security/proof-policy");
  const policy = JSON.parse(proof.body);
  checks.push({ test: "TLS_STRICT_PERSISTENT_DPOP", status: proof.status === 200 && policy.required && policy.replayScope === "SHARED_POSTGRES" ? "PASS" : "FAIL" });
  for (const pathname of ["/dicomweb/studies", "/viewer", "/api/transfers/pacs-import"]) {
    const denied = await request(pathname);
    checks.push({ test: `TLS_METADATA_BOUNDARY:${pathname}`, status: denied.status === 403 && JSON.parse(denied.body).error === "METADATA_ROUTE_REQUIRED" ? "PASS" : "FAIL" });
  }
  for (const [name, options, codes] of [
    ["TLS_UNTRUSTED_CA", { ca: undefined }, ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"]],
    ["TLS_HOSTNAME_MISMATCH", { servername: "not-the-local-test-host.invalid" }, ["ERR_TLS_CERT_ALTNAME_INVALID"]],
  ]) {
    try { await request("/api/health", options); checks.push({ test: name, status: "FAIL" }); }
    catch (error) { checks.push({ test: name, status: codes.includes(error.code) ? "PASS" : "NOT VERIFIED", reason: codes.includes(error.code) ? "EXPECTED_TLS_VERIFICATION_REJECTION" : "NON_POLICY_TRANSPORT_ERROR" }); }
  }
} catch (error) {
  checks.push({ test: "LOCAL_TLS_RUNTIME_GATE", status: "NOT VERIFIED", phase, reason: typeof error.code === "string" ? error.code : "SETUP_OR_TRANSPORT_FAILED" });
} finally {
  try { run(["down", "--volumes", "--remove-orphans", "--timeout", "15"], 90000); checks.push({ test: "OWNED_TLS_TEST_CLEANUP", status: "PASS" }); }
  catch { checks.push({ test: "OWNED_TLS_TEST_CLEANUP", status: "FAIL" }); }
  for (const name of [...names, "cloud-server.key"]) { try { unlinkSync(path.join(directory, name)); } catch {} }
}
const result = { scope: "LOCAL_ISOLATED_TLS_ONLY", review: "DRAFT / UNASSIGNED", azureDeployment: "NOT VERIFIED", checks, status: checks.every(check => check.status === "PASS") ? "PASS" : "NOT VERIFIED" };
writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ ...result, evidence: path.join(directory, "result.json") }));
process.exitCode = result.status === "PASS" ? 0 : 1;
