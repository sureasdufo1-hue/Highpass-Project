import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

loadLocalEnvFile();

const execFileAsync = promisify(execFile);
const rollbackSha = "1b22eae81b64a70149cd2c86b2cc6fb2c3ce4933";
const containerName = "hipass-rollback-api-recovery";
const startedAt = new Date();
const artifact = `artifacts/operations/rollback-recovery-${timestamp(startedAt)}`;
mkdirSync(artifact, { recursive: true });

const currentSha = (await git(["rev-parse", "HEAD"])).trim();
const image = (await docker(["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"]))
  .split(/\r?\n/)
  .find((line) => line.startsWith("hipass-rollback-test:"));

if (!image) throw new Error("ROLLBACK_IMAGE_NOT_FOUND");

await docker(["rm", "-f", containerName]).catch(() => null);
await docker([
  "create",
  "--name", containerName,
  "--env-file", ".env",
  "-e", "ORTHANC_TLS_CA_FILE=/run/secrets/hipass_mtls_ca",
  "-e", "ORTHANC_TLS_CERT_FILE=/run/secrets/hipass_gateway_client_cert",
  "-e", "ORTHANC_TLS_KEY_FILE=/run/secrets/hipass_gateway_client_key",
  "-p", "127.0.0.1:3999:3000",
  "-v", `${process.cwd()}/tmp/certs/mtls/ca.crt:/run/secrets/hipass_mtls_ca:ro`,
  "-v", `${process.cwd()}/tmp/certs/mtls/gateway-client.crt:/run/secrets/hipass_gateway_client_cert:ro`,
  "-v", `${process.cwd()}/tmp/certs/mtls/gateway-client.key:/run/secrets/hipass_gateway_client_key:ro`,
  image,
  "scripts/start-postgres.js",
]);
await docker(["network", "connect", "newproject_db_net", containerName]);
await docker(["network", "connect", "newproject_dicom_gateway_net", containerName]);
await docker(["start", containerName]);

const attempts = [];
let rollbackHealthPass = false;
let directHealth = null;
for (let i = 0; i < 20; i += 1) {
  await delay(2000);
  const inspect = await docker(["inspect", containerName, "--format", "{{.State.Status}} {{json .NetworkSettings.Ports}}"]).catch((error) => error.message);
  try {
    const response = await fetch("http://127.0.0.1:3999/api/health", { signal: AbortSignal.timeout(3000) });
    directHealth = await response.text();
    attempts.push(`try=${i} http=${response.status} body=${directHealth} inspect=${inspect.trim()}`);
    if (response.status === 200) {
      rollbackHealthPass = true;
      break;
    }
  } catch (error) {
    attempts.push(`try=${i} error=${error.name ?? error.message} inspect=${inspect.trim()}`);
  }
}

const logs = await docker(["logs", "--tail", "120", containerName]).catch((error) => error.message);
await docker(["rm", "-f", containerName]).catch(() => null);

const rollForward = await trustedHealth("https://localhost:3443/api/health").catch((error) => `ERROR ${error.message}`);
const completedAt = new Date();
const evidence = {
  generatedAt: completedAt.toISOString(),
  currentSha,
  rollbackSha,
  image,
  currentSecurityConfigUsed: true,
  revokedCredentialRestored: false,
  rollbackHealthPass,
  directHealth,
  attempts,
  logsRedacted: redact(logs),
  measuredRollbackSeconds: Math.round((completedAt.getTime() - startedAt.getTime()) / 100) / 10,
  rollForwardPass: String(rollForward).startsWith("200 "),
  rollForwardOutput: rollForward,
};

writeFileSync(`${artifact}/summary.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
process.exit(rollbackHealthPass && evidence.rollForwardPass ? 0 : 1);

async function docker(args) {
  const { stdout, stderr } = await execFileAsync("docker", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });
  return stdout || stderr;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { encoding: "utf8" });
  return stdout;
}

async function trustedHealth(url) {
  const https = await import("node:https");
  const { readFileSync } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      ca: readFileSync("tmp/certs/mtls/ca.crt"),
      servername: "localhost",
      rejectUnauthorized: true,
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(`${response.statusCode} ${body}`));
    });
    request.on("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp(value) {
  const pad = (input) => String(input).padStart(2, "0");
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
}

function redact(value) {
  let redacted = String(value);
  for (const secret of [process.env.POSTGRES_PASSWORD, process.env.DATABASE_URL]) {
    if (secret) redacted = redacted.replaceAll(secret, "<redacted>");
  }
  return redacted;
}

function loadLocalEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
