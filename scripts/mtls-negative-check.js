#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = resolveProjectPath(process.env.HIPASS_CERTIFICATE_MANIFEST ?? "config/certificate-lifecycle.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const certsRoot = resolveProjectPath(process.env.HIPASS_CERTS_ROOT ?? "tmp/certs");
const network = process.env.HIPASS_MTLS_TEST_NETWORK ?? "newproject_dicom_gateway_net";
const image = process.env.HIPASS_MTLS_TEST_IMAGE ?? "newproject-hipass-control-api";
const generatedFixtureRoot = path.join(certsRoot, "generated-fixtures");

const gatewayClient = findCertificate("gateway-client");
const expiredFixture = (manifest.certificates ?? []).find((item) => (
  item.type === "test-fixture" &&
  item.expiryPolicy === "expect-expired" &&
  item.expectedState === "expired"
));

const results = [
  checkClient("valid-client", gatewayClient, "ALLOW", false),
  checkNoCertificate("no-client-certificate", "DENY"),
  checkGeneratedClient("wrong-issuer-client", "wrong-issuer", "DENY"),
  checkGeneratedClient("wrong-san-client", "wrong-san", "DENY"),
  checkGeneratedClient("wrong-eku-client", "wrong-eku", "DENY"),
  checkGeneratedClient("expired-current-ca-client", "expired", "DENY"),
  checkClient("expired-bad-client-fixture", expiredFixture, "DENY", true),
];

const status = results.every((item) => item.result === "PASS") ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  generatedAt: new Date().toISOString(),
  manifest: path.relative(root, manifestPath),
  network,
  results,
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);

function checkClient(name, certificate, expected, runAsRoot) {
  if (!certificate?.path || !certificate?.keyPath) {
    return { name, expected, actual: "CONFIG_MISSING", result: "FAIL" };
  }

  const args = [
    "run",
    "--rm",
    ...(runAsRoot ? ["--user", "0"] : []),
    "--network",
    network,
    "-v",
    `${certsRoot}:/certs:ro`,
    "-e",
    "MTLS_CA_FILE=/certs/mtls/ca.crt",
    "-e",
    `MTLS_CERT_FILE=/certs/${relativeCertPath(certificate.path)}`,
    "-e",
    `MTLS_KEY_FILE=/certs/${relativeCertPath(certificate.keyPath)}`,
    image,
    "scripts/ops-mtls-client-check.js",
  ];

  const allowed = runDocker(args);
  const actual = allowed ? "ALLOW" : "DENY";
  return {
    name,
    certificateId: certificate.id,
    expected,
    actual,
    result: actual === expected ? "PASS" : "FAIL",
  };
}

function checkNoCertificate(name, expected) {
  const allowed = runDocker([
    "run",
    "--rm",
    "--network",
    network,
    "-v",
    `${certsRoot}:/certs:ro`,
    "-e",
    "MTLS_CA_FILE=/certs/mtls/ca.crt",
    image,
    "scripts/ops-mtls-client-check.js",
  ]);
  const actual = allowed ? "ALLOW" : "DENY";
  return {
    name,
    expected,
    actual,
    result: actual === expected ? "PASS" : "FAIL",
  };
}

function checkGeneratedClient(name, fixtureType, expected) {
  const certificate = ensureGeneratedClient(fixtureType);
  return checkClient(name, certificate, expected, true);
}

function ensureGeneratedClient(fixtureType) {
  const outputDir = path.join(generatedFixtureRoot, fixtureType);
  mkdirSync(outputDir, { recursive: true });
  const signedByRuntimeCa = fixtureType !== "wrong-issuer";
  const san = fixtureType === "wrong-san"
    ? "URI:spiffe://highpass.local/gateway/not-authorized"
    : "URI:spiffe://highpass.local/gateway/hipass-gateway-service";
  const eku = fixtureType === "wrong-eku" ? "serverAuth" : "clientAuth";
  const validityDays = fixtureType === "expired" ? "0" : "1";
  const signCommand = signedByRuntimeCa
    ? `openssl x509 -req -days ${validityDays} -in /fixtures/${fixtureType}/client.csr -CA /certs/mtls/ca.crt -CAkey /certs/mtls/ca.key -CAserial /fixtures/${fixtureType}/ca.srl -CAcreateserial -out /fixtures/${fixtureType}/client.crt -extfile /fixtures/${fixtureType}/client.ext`
    : `openssl x509 -req -signkey /fixtures/${fixtureType}/client.key -days 1 -in /fixtures/${fixtureType}/client.csr -out /fixtures/${fixtureType}/client.crt -extfile /fixtures/${fixtureType}/client.ext`;
  runDocker([
    "run",
    "--rm",
    "-v",
    `${certsRoot}:/certs:ro`,
    "-v",
    `${generatedFixtureRoot}:/fixtures`,
    "alpine:3.20",
    "sh",
    "-lc",
    [
      "set -eu",
      "apk add --no-cache openssl >/dev/null",
      `mkdir -p /fixtures/${fixtureType}`,
      `openssl req -newkey rsa:2048 -nodes -subj '/CN=${fixtureType}-client' -keyout /fixtures/${fixtureType}/client.key -out /fixtures/${fixtureType}/client.csr >/dev/null 2>&1`,
      `printf '%s\\n' 'subjectAltName=${san}' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=${eku}' > /fixtures/${fixtureType}/client.ext`,
      `${signCommand} >/dev/null 2>&1`,
      `rm -f /fixtures/${fixtureType}/client.csr /fixtures/${fixtureType}/client.ext /fixtures/${fixtureType}/ca.srl`,
      `chmod 644 /fixtures/${fixtureType}/client.key /fixtures/${fixtureType}/client.crt`,
    ].join(" && "),
  ]);
  return {
    id: `${fixtureType}-generated-fixture`,
    path: `tmp/certs/generated-fixtures/${fixtureType}/client.crt`,
    keyPath: `tmp/certs/generated-fixtures/${fixtureType}/client.key`,
  };
}

function runDocker(args) {
  try {
    execFileSync("docker", args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function findCertificate(id) {
  return (manifest.certificates ?? []).find((item) => item.id === id);
}

function relativeCertPath(value) {
  const normalized = value.replace(/\\/g, "/");
  return normalized.replace(/^tmp\/certs\//, "");
}

function resolveProjectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}
