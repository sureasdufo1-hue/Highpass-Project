#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
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
  const actual = allowed;
  return {
    name,
    certificateId: certificate.id,
    expected,
    actual,
    result: actual === expected ? "PASS" : actual === "ENVIRONMENT_ERROR" ? "NOT VERIFIED" : "FAIL",
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
  const actual = allowed;
  return {
    name,
    expected,
    actual,
    result: actual === expected ? "PASS" : actual === "ENVIRONMENT_ERROR" ? "NOT VERIFIED" : "FAIL",
  };
}

function checkGeneratedClient(name, fixtureType, expected) {
  const certificate = ensureGeneratedClient(fixtureType);
  if (!certificate) return { name, expected, actual: "FIXTURE_GENERATION_FAILED", result: "NOT VERIFIED" };
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
  const localOpenSSL = process.env.HIPASS_OPENSSL_COMMAND ?? (process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : null);
  if (localOpenSSL) {
    try {
      const fixture = (suffix) => path.join(outputDir, `client.${suffix}`);
      const invoke = (args) => execFileSync(localOpenSSL, args, { stdio: "pipe", timeout: 15000, windowsHide: true });
      invoke(["req", "-newkey", "rsa:2048", "-nodes", "-subj", `/CN=${fixtureType}-client`, "-keyout", fixture("key"), "-out", fixture("csr")]);
      writeFileSync(fixture("ext"), `subjectAltName=${san}\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=${eku}\n`);
      const signing = signedByRuntimeCa
        ? ["-CA", path.join(certsRoot, "mtls/ca.crt"), "-CAkey", path.join(certsRoot, "mtls/ca.key"), "-CAserial", path.join(outputDir, "ca.srl"), "-CAcreateserial"]
        : ["-signkey", fixture("key")];
      invoke(["x509", "-req", "-days", validityDays, "-in", fixture("csr"), ...signing, "-out", fixture("crt"), "-extfile", fixture("ext")]);
      for (const file of [fixture("csr"), fixture("ext"), path.join(outputDir, "ca.srl")]) rmSync(file, { force: true });
      return { id: `${fixtureType}-generated-fixture`, path: path.join(outputDir, "client.crt"), keyPath: path.join(outputDir, "client.key") };
    } catch { return null; }
  }
  const signCommand = signedByRuntimeCa
    ? `openssl x509 -req -days ${validityDays} -in /fixtures/${fixtureType}/client.csr -CA /certs/mtls/ca.crt -CAkey /certs/mtls/ca.key -CAserial /fixtures/${fixtureType}/ca.srl -CAcreateserial -out /fixtures/${fixtureType}/client.crt -extfile /fixtures/${fixtureType}/client.ext`
    : `openssl x509 -req -signkey /fixtures/${fixtureType}/client.key -days 1 -in /fixtures/${fixtureType}/client.csr -out /fixtures/${fixtureType}/client.crt -extfile /fixtures/${fixtureType}/client.ext`;
  const generated = runDocker([
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
  if (generated !== "ALLOW") return null;
  return {
    id: `${fixtureType}-generated-fixture`,
    path: `tmp/certs/generated-fixtures/${fixtureType}/client.crt`,
    keyPath: `tmp/certs/generated-fixtures/${fixtureType}/client.key`,
  };
}

function runDocker(args) {
  const since = new Date(Date.now() - 1000).toISOString();
  try {
    execFileSync("docker", args, { stdio: "pipe", timeout: 30000, windowsHide: true });
    return "ALLOW";
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const denied = /ERR_SSL_.*(?:CERTIFICATE|UNKNOWN_CA)|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|"statusCode":403/.test(output);
    if (denied) return "DENY";
    // ECONNRESET alone is not DENY. Correlate the client TCP tuple with a
    // certificate rejection emitted by the actual mTLS server.
    if (process.env.HIPASS_MTLS_PROXY_CONTAINER && output.includes("ECONNRESET")) {
      try {
        const client = output.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line)).find((item) => item.error === "ECONNRESET");
        const logs = execFileSync("docker", ["logs", "--since", since, process.env.HIPASS_MTLS_PROXY_CONTAINER], { encoding: "utf8", timeout: 10000, windowsHide: true });
        const normalize = (ip) => String(ip).replace(/^::ffff:/, "");
        const proof = logs.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line)).some((item) => item.event === "TLS_CLIENT_REJECTED" && item.remotePort === client?.localPort && normalize(item.remoteAddress) === normalize(client?.localAddress) && /CERT_HAS_EXPIRED|INVALID_PURPOSE|SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER|CERT_SIGNATURE_FAILURE|CERTIFICATE/.test(`${item.code} ${item.authorizationError ?? ""}`));
        if (proof) return "DENY";
      } catch {}
    }
    return "ENVIRONMENT_ERROR";
  }
}

function findCertificate(id) {
  return (manifest.certificates ?? []).find((item) => item.id === id);
}

function relativeCertPath(value) {
  const normalized = (path.isAbsolute(value) ? path.relative(certsRoot, value) : value).replace(/\\/g, "/");
  return normalized.replace(/^tmp\/certs\//, "");
}

function resolveProjectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}
