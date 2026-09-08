#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";

const root = process.cwd();
const mode = process.argv[2] ?? "--verify";
const timeoutMs = positiveInteger(process.env.HIPASS_MVP_COMMAND_TIMEOUT_MS, 240_000);
const manageCompose = process.env.HIPASS_MVP_MANAGE_COMPOSE === "1";
const keepRunning = process.env.HIPASS_MVP_KEEP_RUNNING === "1";
const results = [];
let startedCompose = false;

try {
  await preflight();
  if (mode === "--preflight") finish();

  if (manageCompose) {
    await run("compose-start", "docker", ["compose", "up", "-d", "--build", "--wait"], { timeoutMs: 600_000 });
    startedCompose = true;
  }
  await readiness();
  if (mode === "--readiness") finish();

  await run("unit-integration", process.execPath, ["--test"]);
  await run("certificate-expiry", process.execPath, ["scripts/operations-expiry-check.js"]);
  await run("expired-certificate-fixture", process.execPath, ["scripts/cert-fixture-check.js"]);
  await run("https-e2e", process.execPath, ["scripts/e2e-integration-test.js"], {
    env: e2eEnvironment(),
    timeoutMs: 240_000,
  });
  await run("mtls-positive-negative", process.execPath, ["scripts/mtls-negative-check.js"]);
  await run("network-boundary", process.execPath, ["scripts/security-network-check.js"]);
  await run("security-gate", process.execPath, ["scripts/security-gate.js"], { allowEnvironmentBlocked: true });
  await run("container-gate", process.execPath, ["scripts/container-vulnerability-gate.js"], { allowEnvironmentBlocked: true });
  await run("compliance-evidence", process.execPath, ["scripts/collect-compliance-evidence.js"], {
    env: e2eEnvironment(),
    timeoutMs: 600_000,
    allowEnvironmentBlocked: true,
  });
} catch (error) {
  if (!results.some((item) => item.name === error.step && item.status !== "PASS")) {
    results.push({ name: error.step ?? "orchestrator", status: "FAIL", detail: safe(error.message) });
  }
} finally {
  if (startedCompose && !keepRunning) {
    await run("compose-cleanup", "docker", ["compose", "stop"], { recordFailureOnly: true, timeoutMs: 120_000 });
  }
}

finish();

async function preflight() {
  for (const file of [
    "docker-compose.yml",
    "pnpm-lock.yaml",
    "tmp/certs/edge/localhost.crt",
    "tmp/certs/edge/localhost.key",
    "tmp/certs/mtls/ca.crt",
    "tmp/certs/mtls/gateway-client.crt",
    "tmp/certs/mtls/gateway-client.key",
    "tmp/certs/mtls/orthanc-server.crt",
    "tmp/certs/mtls/orthanc-server.key",
  ]) {
    if (!existsSync(path.join(root, file))) throw stepError("preflight", `Required file is missing: ${file}`);
  }
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (packageJson.packageManager !== "pnpm@11.7.0") throw stepError("preflight", "packageManager must remain pinned to pnpm@11.7.0");
  await run("compose-config", "docker", ["compose", "config", "--quiet"]);
  await requireDockerDaemon();
  results.push({ name: "preflight", status: "PASS", detail: "required files and pinned package manager verified" });
}

async function requireDockerDaemon() {
  const startedAt = Date.now();
  const result = await spawnCommand("docker", ["version", "--format", "{{.Server.Version}}"], {}, 15_000);
  if (result.code === 0 && result.stdout.trim()) {
    results.push({
      name: "docker-daemon",
      status: "PASS",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      detail: `Docker Engine ${safe(result.stdout.trim())}`,
    });
    return;
  }

  results.push({
    name: "docker-daemon",
    status: "ENVIRONMENT_BLOCKED",
    exitCode: result.code,
    durationMs: Date.now() - startedAt,
    detail: safe(result.stderr || "Docker daemon did not return a server version"),
  });
  throw stepError("docker-daemon", "Docker daemon is unavailable");
}

async function readiness() {
  const output = await run("compose-readiness", "docker", ["compose", "ps", "--format", "json"], { capture: true });
  const rows = String(output).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const required = ["hipass-edge", "hipass-control-api", "hospital-a-orthanc-mtls", "hospital-a-orthanc", "hospital-b-viewer", "postgres"];
  for (const service of required) {
    const row = rows.find((item) => item.Service === service);
    if (!row || row.State !== "running" || (row.Health && row.Health !== "healthy")) {
      throw stepError("readiness", `Service is not ready: ${service}`);
    }
  }
  const healthStatus = await getHttpsHealth(10_000);
  if (healthStatus !== 200) throw stepError("readiness", `HTTPS health returned ${healthStatus}`);
  results.push({ name: "readiness", status: "PASS", detail: `${required.length} services healthy; HTTPS health ${healthStatus}` });
}

async function run(name, command, args, options = {}) {
  const startedAt = Date.now();
  const result = await spawnCommand(command, args, options.env, options.timeoutMs ?? timeoutMs);
  const parsedStatus = parseStatus(result.stdout);
  const environmentBlocked = result.code === 2 || parsedStatus === "ENVIRONMENT_BLOCKED";
  const status = result.code === 0 ? "PASS" : environmentBlocked && options.allowEnvironmentBlocked ? "ENVIRONMENT_BLOCKED" : "FAIL";
  results.push({ name, status, exitCode: result.code, durationMs: Date.now() - startedAt, detail: safe(result.stderr || parsedStatus || "completed") });
  if (status === "FAIL" && !options.recordFailureOnly) throw stepError(name, `${command} exited ${result.code}: ${safe(result.stderr)}`);
  return options.capture ? result.stdout : undefined;
}

function spawnCommand(command, args, extraEnv = {}, commandTimeoutMs = timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...extraEnv }, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), commandTimeoutMs);
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: error.code === "ENOENT" ? 2 : 1, stdout, stderr: error.message }); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr: signal ? `${stderr}\nterminated by ${signal}` : stderr }); });
  });
}

function getHttpsHealth(milliseconds) {
  return new Promise((resolve, reject) => {
    const request = https.get("https://localhost:3443/api/health", {
      ca: readFileSync(path.join(root, "tmp", "certs", "mtls", "ca.crt")),
      timeout: milliseconds,
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("timeout", () => request.destroy(new Error(`HTTPS readiness timed out after ${milliseconds}ms`)));
    request.on("error", reject);
  });
}

function e2eEnvironment() {
  const ca = path.join(root, "tmp", "certs", "mtls", "ca.crt");
  return {
    NODE_EXTRA_CA_CERTS: ca,
    HIPASS_E2E_BASE_URL: "https://localhost:3443",
    HIPASS_E2E_VIEWER_URL: "https://localhost:3443/hipass/",
    HIPASS_E2E_DATABASE_DOCKER: "1",
    HIPASS_E2E_REQUEST_TIMEOUT_MS: "20000",
    HIPASS_E2E_DOCKER_TIMEOUT_MS: "30000",
    HIPASS_E2E_TIMEOUT_MS: "180000",
  };
}

function finish() {
  const failed = results.some((item) => item.status === "FAIL");
  const blocked = results.some((item) => item.status === "ENVIRONMENT_BLOCKED");
  const status = failed ? "FAIL" : blocked ? "ENVIRONMENT_BLOCKED" : "PASS";
  console.log(JSON.stringify({ status, qualifier: "CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY", generatedAt: new Date().toISOString(), results }, null, 2));
  process.exit(failed ? 1 : blocked ? 2 : 0);
}

function parseStatus(output) {
  try { return JSON.parse(output).status; } catch { return ""; }
}

function stepError(step, message) { const error = new Error(message); error.step = step; return error; }
function safe(value) {
  const redacted = String(value ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  return redacted.length > 1200 ? `...[truncated]\n${redacted.slice(-1200)}` : redacted;
}
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
