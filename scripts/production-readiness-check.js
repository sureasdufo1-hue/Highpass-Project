#!/usr/bin/env node
import { existsSync } from "node:fs";
import { validateAuthConfiguration } from "../src/auth.js";
import { validateProductionSecrets } from "../src/secrets.js";

const checks = [];

function record(name, ok, detail = {}) {
  checks.push({ name, status: ok ? "PASS" : "FAIL", ...detail });
}

try {
  const auth = validateAuthConfiguration(process.env);
  record("auth.configuration", true, auth);
} catch (error) {
  record("auth.configuration", false, { code: error.code ?? error.message });
}

const secrets = validateProductionSecrets(process.env);
record("secrets.production", secrets.ok, {
  checked: secrets.checked,
  failures: secrets.failures ?? [],
});

const nodeEnv = String(process.env.NODE_ENV ?? "development").toLowerCase();
record("production.mock-auth-disabled", !(nodeEnv === "production" && process.env.AUTH_MODE === "DEVELOPMENT_MOCK"), {
  nodeEnv,
  authMode: process.env.AUTH_MODE ?? null,
});

record("dicom.token-ttl", tokenTtlIsAllowed(process.env.DICOM_TOKEN_TTL_MINUTES), {
  ttlMinutes: process.env.DICOM_TOKEN_TTL_MINUTES ?? "default",
  allowedRange: "5..10",
});

const orthancTrust = validateOrthancTrust(process.env);
record("orthanc.service-trust", orthancTrust.ok, {
  mode: orthancTrust.mode,
  failures: orthancTrust.failures,
});

const edgeTls = validateEdgeTls(process.env);
record("edge.tls-configured", edgeTls.ok, {
  mode: edgeTls.mode,
  failures: edgeTls.failures,
});

const ok = checks.every((check) => check.status === "PASS");
const result = {
  status: ok ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  level: ok && nodeEnv === "production" ? "PRE_PRODUCTION_CONFIG_VERIFIED" : "LOCAL_CONFIG_ONLY",
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);

function tokenTtlIsAllowed(value) {
  if (value === undefined || value === "") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 5 && parsed <= 10;
}

function validateOrthancTrust(env) {
  const restUrl = String(env.ORTHANC_REST_URL ?? "");
  const failures = [];
  if (!restUrl.startsWith("https://")) failures.push("ORTHANC_REST_URL_HTTPS_REQUIRED");

  for (const key of ["ORTHANC_TLS_CA_FILE", "ORTHANC_TLS_CERT_FILE", "ORTHANC_TLS_KEY_FILE"]) {
    if (!env[key]) failures.push(`${key}_REQUIRED`);
    else if (!existsSync(env[key])) failures.push(`${key}_NOT_FOUND`);
  }

  if (env.ORTHANC_TLS_REJECT_UNAUTHORIZED === "0" || env.ORTHANC_TLS_REJECT_UNAUTHORIZED === "false") {
    failures.push("ORTHANC_TLS_REJECT_UNAUTHORIZED_FORBIDDEN");
  }

  return {
    ok: failures.length === 0,
    mode: "MUTUAL_TLS",
    failures,
  };
}

function validateEdgeTls(env) {
  if (env.HIPASS_TLS_TERMINATION === "EXTERNAL") {
    return { ok: true, mode: "EXTERNAL_TERMINATION", failures: [] };
  }

  const failures = [];
  for (const key of ["EDGE_TLS_CERT_FILE", "EDGE_TLS_KEY_FILE"]) {
    if (!env[key]) failures.push(`${key}_REQUIRED`);
    else if (!existsSync(env[key])) failures.push(`${key}_NOT_FOUND`);
  }

  return {
    ok: failures.length === 0,
    mode: "IN_PROCESS_TLS",
    failures,
  };
}
