import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const exec = promisify(execFile);
const prefix = process.env.HIPASS_VALIDATION_PREFIX;
if (!prefix?.startsWith("hp-validation-")) throw new Error("Synthetic validation prefix required");
const root = process.cwd();
const output = path.join(root, "evidence/generated", `browser-boundary-${Date.now()}`);
mkdirSync(output, { recursive: true });
const repositorySha = (await exec("git", ["rev-parse", "HEAD"], { timeout: 10000, windowsHide: true })).stdout.trim();
const inspect = JSON.parse((await exec("docker", ["inspect", `${prefix}-api`], { timeout: 10000, windowsHide: true })).stdout)[0];
if (inspect.Config.Labels["com.docker.compose.project"] !== prefix) throw new Error("Project mismatch");
const edge = JSON.parse((await exec("docker", ["inspect", `${prefix}-edge`], { timeout: 10000, windowsHide: true })).stdout)[0];
if (edge.Config.Labels["com.docker.compose.project"] !== prefix) throw new Error("Edge project mismatch");
const httpsPort = edge.NetworkSettings.Ports["8443/tcp"][0].HostPort;
const image = inspect.Image;
const env = { ...process.env, HIPASS_ATTEST_CONTAINER: `${prefix}-api`, HIPASS_CONTAINER_SCAN_IMAGE: image, HIPASS_TRIVY_RESULT: path.join(output, "app-trivy.json") };
Object.assign(env, { COMPOSE_FILE: path.join(root, "docker-compose.validation.yml"), COMPOSE_PROJECT_NAME: prefix, HIPASS_COMPOSE_PROJECT: prefix, HIPASS_APP_IMAGE: image, HIPASS_E2E_API_CONTAINER: `${prefix}-api`, HIPASS_E2E_BASE_URL: `https://localhost:${httpsPort}`, HIPASS_E2E_VIEWER_URL: `https://localhost:${httpsPort}/hipass/`, HIPASS_E2E_DATABASE_DOCKER: "1", HIPASS_E2E_REQUEST_TIMEOUT_MS: "20000", HIPASS_E2E_TIMEOUT_MS: "240000", NODE_EXTRA_CA_CERTS: path.join(root, "tmp/certs/mtls/ca.crt"), HIPASS_MTLS_TEST_IMAGE: image, HIPASS_MTLS_TEST_NETWORK: `${prefix}_dicom_gateway_net`, HIPASS_MTLS_PROXY_CONTAINER: `${prefix}-mtls` });
const secretValues = inspect.Config.Env.filter(item => /^(DATABASE_URL|DICOM_TOKEN_SECRET|TEST_JWT_SECRET|HIPASS_INTERNAL_SERVICE_TOKEN)=/.test(item)).map(item => item.slice(item.indexOf("=") + 1)).filter(Boolean);
for (const item of inspect.Config.Env) {
  const index = item.indexOf("=");
  if (/^(DATABASE_URL|DICOM_TOKEN_SECRET|TEST_JWT_SECRET|HIPASS_INTERNAL_SERVICE_TOKEN|AUTH_MODE|NODE_ENV)$/.test(item.slice(0, index))) env[item.slice(0, index)] = item.slice(index + 1);
}
const evidence = [];
const began = Date.now();
console.log(JSON.stringify({ output, project: prefix, imageDigest: image }));
for (const [name, command, args, timeout] of [
  ["runtime-attest", process.execPath, ["scripts/attest-runtime.js"], 90000],
  ["unit", process.execPath, ["--test", "--test-reporter=spec"], 90000],
  ["browser", "powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/run-browser-authorization-trace.ps1", "-Port", "9227", "-BrowserUrl", `https://localhost:${httpsPort}/hipass/`], 150000],
  ["packet", process.execPath, ["scripts/packet-boundary-check.js"], 180000],
  ["https-e2e", process.execPath, ["scripts/e2e-integration-test.js"], 260000],
  ["mtls", process.execPath, ["scripts/mtls-negative-check.js"], 300000],
  ["security-gate", process.execPath, ["scripts/security-gate.js"], 180000],
  ["scan", process.execPath, ["scripts/container-scan.js"], 330000],
  ["container-gate", process.execPath, ["scripts/container-vulnerability-gate.js"], 30000],
]) {
  if (process.argv.includes("--packet-only") && name !== "packet") continue;
  const start = Date.now();
  let stdout = "", stderr = "", exitCode = 0;
  try { ({ stdout, stderr } = await exec(command, args, { env, cwd: root, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })); }
  catch (error) { stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; exitCode = typeof error.code === "number" ? error.code : 2; }
  for (const secret of secretValues) { stdout = stdout.replaceAll(secret, "[REDACTED]"); stderr = stderr.replaceAll(secret, "[REDACTED]"); }
  const result = exitCode === 0 ? "PASS" : exitCode === 2 ? "NOT VERIFIED" : "FAIL";
  const filename = path.join(output, `${name}.json`);
  writeFileSync(filename, JSON.stringify({ name, exitCode, result, durationMs: Date.now() - start, stdout, stderr }, null, 2));
  record(name, filename, result);
  console.log(JSON.stringify({ name, exitCode, result }));
}
if (existsSync(env.HIPASS_TRIVY_RESULT)) record("raw-scan", env.HIPASS_TRIVY_RESULT, "COLLECTED");
writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), durationMs: Date.now() - began, repositorySha, workingTreeDirty: true, project: prefix, imageDigest: image, reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsSecrets: false, containsPersonalData: false, evidence }, null, 2));
process.exitCode = evidence.every(entry => ["PASS", "COLLECTED"].includes(entry.result)) ? 0 : 1;
function record(evidenceId, filename, result) {
  evidence.push({ evidenceId, result, repositorySha, sourcePath: path.relative(root, filename).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(filename)).digest("hex"), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsSecrets: false, containsPersonalData: false });
}
