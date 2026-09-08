#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const generatedAt = new Date();
const runId = generatedAt.toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(root, "evidence", "generated", runId);
const commandTimeoutMs = positiveInteger(process.env.HIPASS_COMPLIANCE_COMMAND_TIMEOUT_MS, 180_000);
const repositorySha = await gitValue(["rev-parse", "HEAD"]);
const nodeExtraCa = path.join(root, "tmp", "certs", "mtls", "ca.crt");
const nodeRunner = process.execPath;

mkdirSync(outputRoot, { recursive: true });

const evidence = [];

await collectJson("EV-ENV-001", ["ISMSP-2.1", "HOSP-NET-001"], "Docker Compose service state", "local-test", "docker", ["compose", "ps", "--format", "json"], "compose-ps.json");
await collectCommand("EV-NET-001", ["ISMSP-2.6", "HOSP-NET-002"], "Network segmentation gate", "local-test", nodeRunner, ["scripts/security-network-check.js"], "network-gate.txt");
await collectCommand("EV-MTLS-001", ["ISMSP-2.5", "HOSP-CRYPTO-001"], "Gateway to Orthanc mTLS positive and negative validation", "local-test", nodeRunner, ["scripts/mtls-negative-check.js"], "mtls-negative.txt");
await collectCommand("EV-SEC-001", ["ISMSP-2.9", "ISMSP-2.10"], "Security gate", "local-test", nodeRunner, ["scripts/security-gate.js"], "security-gate.txt");
await collectCommand("EV-VULN-001", ["ISMSP-2.11", "HOSP-SUPPLY-001"], "Container vulnerability exception gate", "local-test", nodeRunner, ["scripts/container-vulnerability-gate.js"], "container-gate.txt");
await collectCommand("EV-EXP-001", ["ISMSP-1.2", "ISMSP-2.11"], "Risk exception and runtime certificate expiry gate", "local-test", nodeRunner, ["scripts/operations-expiry-check.js"], "expiry-gate.txt");
await collectCommand("EV-CERTFIX-001", ["ISMSP-2.5", "HOSP-CRYPTO-002"], "Expired negative certificate fixture validation", "local-test", nodeRunner, ["scripts/cert-fixture-check.js"], "cert-fixtures.txt");
await collectCommand("EV-E2E-001", ["HOSP-E2E-001", "ISMSP-2.6", "ISMSP-2.12"], "HTTPS E2E consent-policy-token-gateway-viewer flow", "local-test", nodeRunner, ["scripts/e2e-integration-test.js"], "https-e2e.txt", {
  HIPASS_E2E_BASE_URL: "https://localhost:3443",
  HIPASS_E2E_VIEWER_URL: "https://localhost:3443/hipass/",
  HIPASS_E2E_DATABASE_DOCKER: "1",
  HIPASS_E2E_REQUEST_TIMEOUT_MS: "20000",
  HIPASS_E2E_DOCKER_TIMEOUT_MS: "30000",
  HIPASS_E2E_TIMEOUT_MS: "180000",
  ...(existsSync(nodeExtraCa) ? { NODE_EXTRA_CA_CERTS: nodeExtraCa } : {}),
});

writeEvidence("EV-CERT-001", ["ISMSP-2.5", "HOSP-CRYPTO-001"], "Certificate non-sensitive metadata", "local-test", "certificate-metadata.json", collectCertificateMetadata());

const manifestPath = path.join(outputRoot, "manifest.json");
const manifest = {
  schemaVersion: 1,
  generatedAt: generatedAt.toISOString(),
  generatedBy: "scripts/collect-compliance-evidence.js",
  repositorySha,
  commandTimeoutMs,
  containsPersonalData: false,
  containsSecrets: false,
  evidence,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const hasFailure = evidence.some((item) => item.result === "FAIL");
const hasEnvironmentBlocker = evidence.some((item) => item.result === "ENVIRONMENT_BLOCKED");
console.log(JSON.stringify({
  status: hasFailure ? "FAIL" : hasEnvironmentBlocker ? "ENVIRONMENT_BLOCKED" : "PASS",
  repositorySha,
  outputRoot: path.relative(root, outputRoot),
  manifest: path.relative(root, manifestPath),
  evidence: evidence.map((item) => ({ evidenceId: item.evidenceId, result: item.result, sourcePath: item.sourcePath })),
}, null, 2));

process.exit(hasFailure ? 1 : hasEnvironmentBlocker ? 2 : 0);

async function collectJson(evidenceId, controlIds, title, environment, command, args, fileName, extraEnv = {}) {
  await collectCommand(evidenceId, controlIds, title, environment, command, args, fileName, extraEnv);
}

async function collectCommand(evidenceId, controlIds, title, environment, command, args, fileName, extraEnv = {}) {
  const startedAt = new Date();
  const outputPath = path.join(outputRoot, fileName);
  let exitCode = 0;
  let stdout = "";
  let stderr = "";
  let errorMessage = "";

  try {
    const result = await execFileAsync(command, args, {
      cwd: root,
      timeout: commandTimeoutMs,
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      maxBuffer: 1024 * 1024 * 20,
    });
    stdout = result.stdout ?? "";
    stderr = result.stderr ?? "";
  } catch (error) {
    exitCode = typeof error.code === "number" ? error.code : 1;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
    errorMessage = error.killed ? `Command timed out after ${commandTimeoutMs}ms` : error.message;
  }

  const endedAt = new Date();
  const result = exitCode === 0 ? "PASS" : exitCode === 2 || isEnvironmentBlocked(stdout, stderr, errorMessage) ? "ENVIRONMENT_BLOCKED" : "FAIL";
  const payload = {
    evidenceId,
    title,
    command: `${command} ${args.join(" ")}`,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    exitCode,
    result,
    stdout: redact(stdout),
    stderr: redact(stderr),
    errorMessage: redact(errorMessage),
  };
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  pushEvidence(evidenceId, controlIds, title, environment, outputPath, payload.result, `${command} ${args.join(" ")}`);
}

function writeEvidence(evidenceId, controlIds, title, environment, fileName, payload) {
  const outputPath = path.join(outputRoot, fileName);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  pushEvidence(evidenceId, controlIds, title, environment, outputPath, "PASS", "node scripts/collect-compliance-evidence.js");
}

function pushEvidence(evidenceId, controlIds, title, environment, sourcePath, result, verificationCommand) {
  evidence.push({
    evidenceId,
    controlIds,
    title,
    description: `${title} collected from the local Hi-PASS repository without copying private keys, tokens, passwords, or real patient data.`,
    environment,
    repositorySha,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/collect-compliance-evidence.js",
    sourcePath: path.relative(root, sourcePath).replace(/\\/g, "/"),
    verificationCommand,
    result,
    validUntil: "2026-09-25",
    containsPersonalData: false,
    containsSecrets: false,
    sha256: sha256(sourcePath),
    reviewStatus: "DRAFT",
    reviewer: "UNASSIGNED",
    notes: "Local PoC evidence only. Not a legal opinion, ISMS-P certification, or hospital production approval.",
  });
}

function collectCertificateMetadata() {
  const files = [
    ["edge-localhost", "tmp/certs/edge/localhost.crt"],
    ["hipass-dev-root-ca", "tmp/certs/mtls/ca.crt"],
    ["gateway-client", "tmp/certs/mtls/gateway-client.crt"],
    ["orthanc-mtls-server", "tmp/certs/mtls/orthanc-server.crt"],
    ["expired-client-negative-fixture", "tmp/certs/bad/bad.crt"],
  ];
  return {
    generatedAt: new Date().toISOString(),
    certificates: files.map(([id, relativePath]) => {
      const file = path.join(root, relativePath);
      if (!existsSync(file)) return { id, file: relativePath, result: "MISSING" };
      const cert = new X509Certificate(readFileSync(file));
      return {
        id,
        file: relativePath,
        subject: cert.subject,
        issuer: cert.issuer,
        subjectAltName: cert.subjectAltName,
        keyUsage: cert.keyUsage,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        fingerprint256: cert.fingerprint256,
        ca: cert.ca,
        result: "PRESENT",
      };
    }),
  };
}

async function gitValue(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, timeout: 10_000, windowsHide: true });
    return stdout.trim();
  } catch {
    return "NOT_AVAILABLE";
  }
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function redact(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/"?(accessToken|token|password|secret|key)"?\s*[:=]\s*"[^"]+"/gi, "\"$1\":\"[REDACTED]\"");
}

function isEnvironmentBlocked(...values) {
  const output = values.join("\n").toLowerCase();
  return ["environment_blocked", "fetch failed", "registry signature", "docker daemon", "permission denied while trying to connect"].some((item) => output.includes(item));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
