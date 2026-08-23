#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import path from "node:path";
import tls from "node:tls";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);
const env = process.env;
const startedAt = new Date();
const results = [];

if (env.NODE_TEST_CONTEXT && env.RUN_HIPASS_STAGING_SMOKE !== "1") {
  console.log("Skipping live staging smoke test during node --test. Run with pnpm run staging:smoke.");
  process.exit(0);
}

await checkHttpsEndpoint();
await checkOidcDiscovery();
await checkDatabaseTls();
await checkCommand("External Secret Provider", "STAGING_SECRET_CHECK_COMMAND_JSON", "L7-02");
await checkCommand("External Secret Rotation", "STAGING_SECRET_ROTATION_CHECK_COMMAND_JSON", "L7-02R");
await checkCommand("External KMS", "STAGING_KMS_CHECK_COMMAND_JSON", "L7-03");
await checkCommand("External OIDC Test Token", "STAGING_OIDC_TEST_TOKEN_COMMAND_JSON", "L7-04T");
await checkDigestPromotion();
await checkCommand("Human Notification", "STAGING_NOTIFICATION_CHECK_COMMAND_JSON", "L7-07");
await checkCommand("Staging DR Exercise", "STAGING_DR_CHECK_COMMAND_JSON", "L7-08");
await checkCommand("Browser Regression", "STAGING_BROWSER_TRACE_COMMAND_JSON", "L7-09B");
await checkCommand("mTLS Regression", "STAGING_MTLS_CHECK_COMMAND_JSON", "L7-09M");

const summary = {
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
  blocked: results.filter((item) => item.status === "BLOCKED").length,
  notApplicable: results.filter((item) => item.status === "NOT_APPLICABLE").length,
};

const report = {
  status: summary.fail > 0 ? "FAIL" : summary.blocked > 0 ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  commitSha: await gitValue(["rev-parse", "HEAD"]),
  environment: env.HIPASS_ENV ?? "NOT_SET",
  summary,
  results,
};

const outDir = path.join("artifacts", "level-7");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `staging-smoke-${timestamp(startedAt)}.json`);
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, artifact: outFile }, null, 2));

if (report.status === "FAIL") process.exit(1);
if (report.status === "BLOCKED" && env.HIPASS_STAGING_ALLOW_BLOCKED !== "1") process.exit(2);

async function checkHttpsEndpoint() {
  const baseUrl = env.STAGING_BASE_URL;
  if (!baseUrl) {
    blocked("L7-01", "External Staging HTTPS", "STAGING_BASE_URL is required");
    return;
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    fail("L7-01", "External Staging HTTPS", "STAGING_BASE_URL is not a valid URL");
    return;
  }
  if (url.protocol !== "https:") {
    fail("L7-01", "External Staging HTTPS", "Staging base URL must use HTTPS");
    return;
  }
  await checkTlsCertificate(url);
  await fetchJsonCheck("L7-01H", "Staging Health", new URL(env.STAGING_HEALTH_PATH ?? "/api/health", url));
  await fetchJsonCheck("L7-01R", "Staging Readiness", new URL(env.STAGING_READINESS_PATH ?? "/api/health", url));
}

async function checkTlsCertificate(url) {
  try {
    const info = await new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: url.hostname,
        port: Number(url.port || 443),
        servername: url.hostname,
        rejectUnauthorized: true,
      }, () => {
        const cert = socket.getPeerCertificate(true);
        socket.end();
        resolve(cert);
      });
      socket.setTimeout(10_000, () => {
        socket.destroy(new Error("TLS_TIMEOUT"));
      });
      socket.on("error", reject);
    });
    const cert = new X509Certificate(info.raw);
    pass("L7-01T", "Staging TLS Certificate", {
      subject: cert.subject,
      issuer: cert.issuer,
      validTo: cert.validTo,
      fingerprint256: cert.fingerprint256,
    });
  } catch (error) {
    fail("L7-01T", "Staging TLS Certificate", sanitizeError(error));
  }
}

async function fetchJsonCheck(controlId, name, url) {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { nonJson: true };
    }
    if (!response.ok) {
      fail(controlId, name, { status: response.status, body: redact(body) });
      return;
    }
    pass(controlId, name, { status: response.status, body: redact(body) });
  } catch (error) {
    fail(controlId, name, sanitizeError(error));
  }
}

async function checkOidcDiscovery() {
  const discoveryUrl = env.OIDC_DISCOVERY_URL;
  if (!discoveryUrl) {
    blocked("L7-04", "External OIDC Discovery", "OIDC_DISCOVERY_URL is required");
    return;
  }
  try {
    const response = await fetch(discoveryUrl, { headers: { accept: "application/json" } });
    const body = await response.json();
    const required = ["issuer", "jwks_uri", "authorization_endpoint", "token_endpoint"];
    const missing = required.filter((field) => !body[field]);
    if (!response.ok || missing.length) {
      fail("L7-04", "External OIDC Discovery", { status: response.status, missing });
      return;
    }
    if (env.JWT_ISSUER && body.issuer !== env.JWT_ISSUER) {
      fail("L7-04", "External OIDC Discovery", "issuer does not match JWT_ISSUER");
      return;
    }
    pass("L7-04", "External OIDC Discovery", {
      issuer: body.issuer,
      jwksUriHost: new URL(body.jwks_uri).host,
    });
  } catch (error) {
    fail("L7-04", "External OIDC Discovery", sanitizeError(error));
  }
}

async function checkDatabaseTls() {
  if (!env.DATABASE_URL) {
    blocked("L7-05", "PostgreSQL TLS", "DATABASE_URL must be supplied by external Secret Provider at runtime");
    return;
  }
  const sslMode = env.STAGING_DB_SSLMODE ?? env.POSTGRES_SSLMODE;
  if (!["verify-full", "require"].includes(String(sslMode))) {
    fail("L7-05", "PostgreSQL TLS", "STAGING_DB_SSLMODE or POSTGRES_SSLMODE must require TLS");
    return;
  }
  const caFile = env.STAGING_DB_CA_FILE ?? env.POSTGRES_SSL_CA_FILE;
  const ssl = caFile && existsSync(caFile)
    ? { ca: await readText(caFile), rejectUnauthorized: sslMode === "verify-full" }
    : { rejectUnauthorized: sslMode === "verify-full" };
  const client = new Client({ connectionString: env.DATABASE_URL, ssl });
  try {
    await client.connect();
    const result = await client.query("select current_database() as database, current_user as user, version() as version");
    pass("L7-05", "PostgreSQL TLS", redact(result.rows[0]));
  } catch (error) {
    fail("L7-05", "PostgreSQL TLS", sanitizeError(error));
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkDigestPromotion() {
  const registry = await runOptionalCommand("STAGING_REGISTRY_DIGEST_COMMAND_JSON");
  const runtime = await runOptionalCommand("STAGING_RUNTIME_DIGEST_COMMAND_JSON");
  if (registry.status === "BLOCKED" || runtime.status === "BLOCKED") {
    blocked("L7-06", "Registry Digest Promotion", "Registry and runtime digest commands are required");
    return;
  }
  if (registry.status === "FAIL" || runtime.status === "FAIL") {
    fail("L7-06", "Registry Digest Promotion", { registry, runtime });
    return;
  }
  const registryDigest = extractDigest(registry.output);
  const runtimeDigest = extractDigest(runtime.output);
  if (!registryDigest || !runtimeDigest) {
    fail("L7-06", "Registry Digest Promotion", "Both commands must output or include sha256 digests");
    return;
  }
  if (registryDigest !== runtimeDigest) {
    fail("L7-06", "Registry Digest Promotion", { registryDigest, runtimeDigest });
    return;
  }
  pass("L7-06", "Registry Digest Promotion", { digest: registryDigest });
}

async function checkCommand(name, envName, controlId) {
  const result = await runOptionalCommand(envName);
  if (result.status === "BLOCKED") blocked(controlId, name, `${envName} is required`);
  else if (result.status === "FAIL") fail(controlId, name, result.error);
  else pass(controlId, name, result.output);
}

async function runOptionalCommand(envName) {
  const raw = env[envName];
  if (!raw) return { status: "BLOCKED" };
  let command;
  try {
    command = JSON.parse(raw);
  } catch {
    return { status: "FAIL", error: `${envName} must be a JSON array` };
  }
  if (!Array.isArray(command) || !command.length || !command.every((item) => typeof item === "string")) {
    return { status: "FAIL", error: `${envName} must be a non-empty string array` };
  }
  try {
    const { stdout } = await execFileAsync(command[0], command.slice(1), {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return { status: "PASS", output: redact(parseOutput(stdout)) };
  } catch (error) {
    return { status: "FAIL", error: sanitizeError(error) };
  }
}

async function gitValue(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { windowsHide: true });
    return stdout.trim();
  } catch {
    return "NOT_AVAILABLE";
  }
}

async function readText(file) {
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf8");
}

function pass(controlId, name, evidence) {
  results.push({ controlId, name, status: "PASS", evidence });
}

function fail(controlId, name, evidence) {
  results.push({ controlId, name, status: "FAIL", evidence });
}

function blocked(controlId, name, blocker) {
  results.push({
    controlId,
    name,
    status: "BLOCKED",
    blocker,
    requiredExternalResource: requirementFor(controlId),
    exitCondition: "Provide external resource/configuration and rerun pnpm run staging:smoke",
  });
}

function requirementFor(controlId) {
  const map = {
    "L7-01": "External staging HTTPS endpoint",
    "L7-02": "External Secret Manager or Vault",
    "L7-02R": "External Secret Manager or Vault with rotation evidence",
    "L7-03": "External KMS or managed key service",
    "L7-04": "External OIDC test tenant",
    "L7-04T": "External OIDC test tenant token issuer",
    "L7-05": "Dedicated staging PostgreSQL with TLS",
    "L7-06": "Registry and staging runtime digest access",
    "L7-07": "Human notification channel",
    "L7-08": "Independent staging recovery environment",
    "L7-09B": "External staging browser target",
    "L7-09M": "External staging mTLS endpoint or N/A decision",
  };
  return map[controlId] ?? "External staging resource";
}

function parseOutput(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { text: text.slice(0, 500) };
  }
}

function extractDigest(output) {
  const text = JSON.stringify(output);
  return text.match(/sha256:[a-f0-9]{64}/i)?.[0] ?? null;
}

function sanitizeError(error) {
  return {
    message: String(error?.message ?? error).replaceAll(/(password|token|secret|key)=([^&\s]+)/gi, "$1=REDACTED"),
    code: error?.code,
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret|private|credential|authorization/i.test(key)) redacted[key] = "REDACTED";
    else redacted[key] = redact(item);
  }
  return redacted;
}

function timestamp(date) {
  return date.toISOString().replaceAll(/[-:.]/g, "").slice(0, 15);
}
