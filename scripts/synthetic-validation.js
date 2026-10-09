import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

const exec = promisify(execFile);
const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
const project = `hp-validation-${runId}`;
const output = path.join(root, "evidence/generated", project);
mkdirSync(output, { recursive: true });
const password = randomBytes(24).toString("hex");
const httpPort = await freePort();
const httpsPort = await freePort();
const image = process.env.HIPASS_VALIDATION_IMAGE ?? "highpass-platform-mvp:synthetic-patched-20261007";
const dpopProfile = process.argv.includes("--dpop");
const env = {
  ...process.env, COMPOSE_FILE: path.join(root, "docker-compose.validation.yml"), COMPOSE_PROJECT_NAME: project,
  HIPASS_COMPOSE_PROJECT: project, HIPASS_VALIDATION_PREFIX: project, HIPASS_NETWORK_PREFIX: project,
  HIPASS_APP_IMAGE: image, HIPASS_HTTP_HOST_PORT: String(httpPort), HIPASS_HTTPS_HOST_PORT: String(httpsPort),
  DATABASE_URL: `postgres://hipass_app:${password}@postgres:5432/hipass`, POSTGRES_PASSWORD: password,
  POSTGRES_DB: "hipass", POSTGRES_USER: "hipass_app", DICOM_TOKEN_SECRET: randomBytes(32).toString("hex"),
  TEST_JWT_SECRET: randomBytes(32).toString("hex"), HIPASS_INTERNAL_SERVICE_TOKEN: randomBytes(32).toString("hex"),
  AUTH_MODE: "DEVELOPMENT_MOCK", NODE_ENV: "development", HIPASS_ENABLE_CURATED_DICOM: "0",
  HIPASS_DPOP_REQUIRED: dpopProfile ? "1" : "0",
  HIPASS_INGRESS_SECRET: dpopProfile ? randomBytes(32).toString("hex") : "",
  HIPASS_PUBLIC_BASE_URL: `https://localhost:${httpsPort}`,
  HIPASS_BROWSER_REQUIRE_DPOP: dpopProfile ? "1" : "0",
  HIPASS_DPOP_PERSISTENT_TEST: dpopProfile ? "1" : "0",
  HIPASS_E2E_API_CONTAINER: `${project}-api`, HIPASS_ATTEST_CONTAINER: `${project}-api`,
  HIPASS_MTLS_PROXY_CONTAINER: `${project}-mtls`, HIPASS_MTLS_TEST_NETWORK: `${project}_dicom_gateway_net`, HIPASS_MTLS_TEST_IMAGE: image,
  HIPASS_VIEWER_CONTAINER: `${project}-viewer`, HIPASS_POSTGRES_CONTAINER: `${project}-db`, HIPASS_ORTHANC_CONTAINER: `${project}-pacs`,
  HIPASS_E2E_BASE_URL: `https://localhost:${httpsPort}`, HIPASS_E2E_VIEWER_URL: `https://localhost:${httpsPort}/hipass/`,
  HIPASS_E2E_DATABASE_DOCKER: "1", HIPASS_E2E_REQUEST_TIMEOUT_MS: "20000", HIPASS_E2E_TIMEOUT_MS: "240000",
  NODE_EXTRA_CA_CERTS: path.join(root, "tmp/certs/mtls/ca.crt"), HIPASS_CONTAINER_SCAN_IMAGE: image,
  HIPASS_TRIVY_RESULT: path.join(output, "app-trivy.json"),
};
const results = [];
let started = false;
const profile = { project, image, httpPort, httpsPort, dpopRequired: dpopProfile, createdAt: new Date().toISOString(), scope: "SYNTHETIC / INDEPENDENT / NOT PRODUCTION", reviewStatus: "DRAFT", reviewer: "UNASSIGNED" };
writeFileSync(path.join(output, "profile.json"), JSON.stringify(profile, null, 2));
console.log(JSON.stringify({ event: "VALIDATION_PROFILE", ...profile, output }, null, 2));
try {
  await run("compose-config", "docker", ["compose", "config", "--quiet"]);
  if (process.argv.includes("--preflight")) { process.exitCode = 0; }
  else {
    started = true;
    await run("compose-start", "docker", ["compose", "up", "-d", "--no-build"], 360000);
    await waitReady();
    await run("runtime-attest", process.execPath, ["scripts/attest-runtime.js"], 180000);
    if (dpopProfile && !process.argv.includes("--start-only")) {
      await run("proof-http-unit", process.execPath, ["--test", "test/dpop-enforcement.test.js", "test/dpop-token-binding.test.js", "test/dpop-replay-store.test.js"], 90000, false);
      await run("replay-postgres", "docker", ["exec", "-e", "HIPASS_COMPOSE_PROJECT", `${project}-api`, "/nodejs/bin/node", "scripts/test-support/dpop-replay-postgres-check.js"], 90000, false);
      await run("browser-strict-dpop", "powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/run-browser-authorization-trace.ps1", "-BrowserUrl", env.HIPASS_E2E_VIEWER_URL], 150000, false);
      await run("https-strict-dpop", process.execPath, ["scripts/dpop-https-check.js"], 310000, false);
      await run("mtls", process.execPath, ["scripts/mtls-negative-check.js"], 300000, false);
      await run("security-gate", process.execPath, ["scripts/security-gate.js"], 180000, false);
      await run("scan", process.execPath, ["scripts/container-scan.js"], 330000, false);
      await run("container-gate", process.execPath, ["scripts/container-vulnerability-gate.js"], 30000, false);
    } else if (!process.argv.includes("--start-only")) {
      await run("unit", process.execPath, ["--test", "--test-concurrency=4", "--test-reporter=spec"], 90000, false);
      await run("network", process.execPath, ["scripts/security-network-check.js"], 120000, false);
      await run("https-e2e", process.execPath, ["scripts/e2e-integration-test.js"], 260000, false);
      await run("mtls", process.execPath, ["scripts/mtls-negative-check.js"], 300000, false);
      await run("security-gate", process.execPath, ["scripts/security-gate.js"], 180000, false);
      await run("scan", process.execPath, ["scripts/container-scan.js"], 330000, false);
      await run("container-gate", process.execPath, ["scripts/container-vulnerability-gate.js"], 30000, false);
    }
  }
} catch (error) {
  if (started) await run("startup-diagnostics", "docker", ["compose", "logs", "--no-color", "--tail", "30"], 30000, false);
  console.log(JSON.stringify({ event: "VALIDATION_STOP", reason: error.code ?? "COMMAND_FAILED" }));
  process.exitCode = 1;
} finally {
  if (started && !process.argv.includes("--keep")) {
    // Exact newly-created project only; never down -v or touch existing stacks.
    await run("cleanup", "docker", ["compose", "down", "--remove-orphans"], 90000, false);
  }
  const repositorySha = (await exec("git", ["rev-parse", "HEAD"], { timeout: 10000, windowsHide: true })).stdout.trim();
  const evidence = results.map((result) => ({ evidenceId: result.name, result: result.result, repositorySha, sourcePath: path.relative(root, result.file).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(result.file)).digest("hex"), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsSecrets: false, containsPersonalData: false }));
  if (existsSync(env.HIPASS_TRIVY_RESULT)) evidence.push({ evidenceId: "raw-container-scan", repositorySha, sourcePath: path.relative(root, env.HIPASS_TRIVY_RESULT).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(env.HIPASS_TRIVY_RESULT)).digest("hex"), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsSecrets: false, containsPersonalData: false });
  writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ ...profile, repositorySha, workingTreeDirty: true, containsSecrets: false, containsPersonalData: false, evidence }, null, 2));
  const failed = results.some((item) => item.result !== "PASS");
  console.log(JSON.stringify({ output, status: failed ? "NOT ACHIEVED" : "SCOPED COMMANDS PASS", results: results.map(({ name, exitCode, result }) => ({ name, exitCode, result })) }, null, 2));
  if (failed) process.exitCode = 1;
}

async function run(name, command, args, timeout = 30000, required = true) {
  const begin = Date.now();
  let stdout = "", stderr = "", exitCode = 0;
  const commandEnv = ["proof-http-unit", "security-gate"].includes(name) ? { ...env, HIPASS_DPOP_REQUIRED: "0", HIPASS_INGRESS_SECRET: "" } : env;
  try { ({ stdout, stderr } = await exec(command, args, { cwd: root, env: commandEnv, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })); }
  catch (error) { stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; exitCode = typeof error.code === "number" ? error.code : 2; }
  // Secrets may appear in startup exceptions; redact all generated values.
  for (const secret of [password, env.DICOM_TOKEN_SECRET, env.TEST_JWT_SECRET, env.HIPASS_INTERNAL_SERVICE_TOKEN, env.HIPASS_INGRESS_SECRET].filter(Boolean)) { stdout = stdout.replaceAll(secret, "[REDACTED]"); stderr = stderr.replaceAll(secret, "[REDACTED]"); }
  const result = exitCode === 0 ? "PASS" : exitCode === 2 ? "NOT VERIFIED" : "FAIL";
  const file = path.join(output, `${name}.json`);
  writeFileSync(file, JSON.stringify({ name, command: path.basename(command), args, exitCode, result, durationMs: Date.now() - begin, stdout, stderr }, null, 2));
  results.push({ name, file, exitCode, result });
  console.log(JSON.stringify({ event: "COMMAND_RESULT", name, exitCode, result }));
  if (required && exitCode !== 0) throw Object.assign(new Error(name), { code: `${name.toUpperCase()}_FAILED` });
}
async function waitReady() {
  const required = ["hipass-edge", "hipass-control-api", "hospital-a-orthanc-mtls", "hospital-a-orthanc", "hospital-b-viewer", "postgres"];
  const begin = Date.now();
  while (Date.now() - begin < 120000) {
    const { stdout } = await exec("docker", ["compose", "ps", "--format", "json"], { env, cwd: root, timeout: 10000, windowsHide: true });
    const rows = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (required.every((service) => rows.some((row) => row.Service === service && row.State === "running" && row.Health === "healthy"))) { console.log("Independent synthetic stack ready"); return; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Object.assign(new Error("readiness"), { code: "READINESS_TIMEOUT" });
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
