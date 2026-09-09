#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const rollbackRoot = path.resolve(process.env.HIPASS_CERT_ROLLBACK_ROOT ?? "tmp/certs-phase2-rollback-20260908T080400Z");
const currentCertsRoot = path.resolve("tmp/certs");
const proxyScript = path.resolve("scripts/orthanc-mtls-proxy.js");
const network = process.env.HIPASS_CERT_ROLLBACK_NETWORK ?? "highpass-phase2_dicom_private_net";
const image = process.env.HIPASS_CERT_ROLLBACK_IMAGE ?? "highpass-platform-mvp:local";
const container = `hipass-dev-cert-rollback-proxy-${process.pid}`;
const requiredFiles = [
  "mtls/ca.crt",
  "mtls/gateway-client.crt",
  "mtls/gateway-client.key",
  "mtls/orthanc-server.crt",
  "mtls/orthanc-server.key",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(rollbackRoot, relativePath))) {
    fail(`missing rollback file: ${relativePath}`);
  }
}

const oldClient = new X509Certificate(readFileSync(path.join(rollbackRoot, "mtls/gateway-client.crt")));
const oldServer = new X509Certificate(readFileSync(path.join(rollbackRoot, "mtls/orthanc-server.crt")));
const now = Date.now();
if (Date.parse(oldClient.validFrom) > now || Date.parse(oldClient.validTo) <= now) fail("rollback client certificate is not currently valid");
if (Date.parse(oldServer.validFrom) > now || Date.parse(oldServer.validTo) <= now) fail("rollback server certificate is not currently valid");
if (oldClient.subject !== "CN=hipass-gateway-service") fail("unexpected rollback client subject");
if (!oldServer.subjectAltName?.includes("DNS:hospital-a-orthanc-mtls")) fail("rollback server SAN mismatch");

const results = [];
try {
  runDocker([
    "run", "--detach", "--rm", "--name", container,
    "--network", network,
    "-v", `${rollbackRoot}:/rollback:ro`,
    "-v", `${proxyScript}:/app/scripts/orthanc-mtls-proxy.js:ro`,
    "-e", "ORTHANC_MTLS_PORT=8443",
    "-e", "ORTHANC_UPSTREAM_ORIGIN=http://hospital-a-orthanc:8042",
    "-e", "ORTHANC_MTLS_CA_FILE=/rollback/mtls/ca.crt",
    "-e", "ORTHANC_MTLS_CERT_FILE=/rollback/mtls/orthanc-server.crt",
    "-e", "ORTHANC_MTLS_KEY_FILE=/rollback/mtls/orthanc-server.key",
    "-e", "ORTHANC_MTLS_ALLOWED_CLIENT_SUBJECT_CN=hipass-gateway-service",
    image, "scripts/orthanc-mtls-proxy.js",
  ]);
  waitForProxy();

  results.push(check("rollback-client", true, [
    "-v", `${rollbackRoot}:/rollback:ro`,
    "-e", "MTLS_CA_FILE=/rollback/mtls/ca.crt",
    "-e", "MTLS_CERT_FILE=/rollback/mtls/gateway-client.crt",
    "-e", "MTLS_KEY_FILE=/rollback/mtls/gateway-client.key",
  ]));
  results.push(check("no-client-certificate", false, [
    "-v", `${rollbackRoot}:/rollback:ro`,
    "-e", "MTLS_CA_FILE=/rollback/mtls/ca.crt",
  ]));
  results.push(check("current-ca-client-is-untrusted-by-rollback-ca", false, [
    "-v", `${rollbackRoot}:/rollback:ro`,
    "-v", `${currentCertsRoot}:/current:ro`,
    "-e", "MTLS_CA_FILE=/rollback/mtls/ca.crt",
    "-e", "MTLS_CERT_FILE=/current/mtls/gateway-client.crt",
    "-e", "MTLS_KEY_FILE=/current/mtls/gateway-client.key",
  ]));
} finally {
  spawnSync("docker", ["rm", "-f", container], { encoding: "utf8", timeout: 15_000 });
}

const passed = results.every((result) => result.result === "PASS");
console.log(JSON.stringify({
  status: passed ? "PASS" : "FAIL",
  qualifier: "ISOLATED DEVELOPMENT CERTIFICATE ROLLBACK REHEARSAL",
  rollbackRoot: path.relative(root, rollbackRoot),
  network,
  identityPolicy: "subject CN pinned for legacy no-SAN client certificate",
  rollbackClientFingerprint256: oldClient.fingerprint256,
  rollbackServerFingerprint256: oldServer.fingerprint256,
  results,
}, null, 2));
process.exit(passed ? 0 : 1);

function check(name, expectAllow, mountsAndEnvironment) {
  const args = [
    "run", "--rm", "--network", network,
    ...mountsAndEnvironment,
    "-e", `MTLS_HOST=${container}`,
    "-e", "MTLS_SERVERNAME=hospital-a-orthanc-mtls",
    image, "scripts/ops-mtls-client-check.js",
  ];
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 20_000 });
  const actual = result.status === 0 ? "ALLOW" : "DENY";
  const expected = expectAllow ? "ALLOW" : "DENY";
  return { name, expected, actual, result: actual === expected ? "PASS" : "FAIL" };
}

function waitForProxy() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["logs", container], { encoding: "utf8", timeout: 5_000 });
    if (`${result.stdout}${result.stderr}`.includes("Orthanc mTLS proxy listening on 8443")) return;
    const state = spawnSync("docker", ["inspect", "--format", "{{.State.Running}}", container], { encoding: "utf8", timeout: 5_000 });
    if (state.status !== 0 || state.stdout.trim() !== "true") fail("rollback proxy exited before readiness");
    execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 250)"], { timeout: 2_000 });
  }
  fail("rollback proxy readiness timeout");
}

function runDocker(args) {
  execFileSync("docker", args, { stdio: "pipe", timeout: 30_000 });
}

function fail(message) {
  console.error(JSON.stringify({ status: "FAIL", reason: message }));
  process.exit(1);
}
