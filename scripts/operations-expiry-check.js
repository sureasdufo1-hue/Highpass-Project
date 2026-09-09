#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";

const root = process.cwd();
const now = new Date(process.env.HIPASS_CERTIFICATE_NOW ?? Date.now());
const warningDays = Number(process.env.HIPASS_OPS_CERT_WARNING_DAYS ?? 30);
const highDays = Number(process.env.HIPASS_OPS_CERT_HIGH_DAYS ?? 7);
const exceptionPath = resolveProjectPath(process.env.HIPASS_CONTAINER_EXCEPTIONS ?? "security/container-vulnerability-exceptions.json");
const certificateManifestPath = resolveProjectPath(process.env.HIPASS_CERTIFICATE_MANIFEST ?? "config/certificate-lifecycle.json");

const risk = JSON.parse(readFileSync(exceptionPath, "utf8"));
const currentImageDigest = risk.image?.imageDigest ?? null;
const exceptionResults = (risk.exceptions ?? []).map((item) => {
  const expiresAt = new Date(item.expiresAt);
  const active = item.status === "APPROVED" && Boolean(currentImageDigest) && item.imageDigest === currentImageDigest;
  const expired = active && (Number.isNaN(expiresAt.getTime()) || expiresAt <= now);
  return {
    cve: item.cve,
    package: item.package,
    status: item.status,
    approvedBy: item.approvedBy,
    expiresAt: item.expiresAt,
    imageDigest: item.imageDigest,
    scope: active ? "CURRENT_IMAGE" : "HISTORICAL_IMAGE",
    result: active ? (expired ? "EXPIRED" : "VALID") : "HISTORICAL",
  };
});

const certificateManifest = JSON.parse(readFileSync(certificateManifestPath, "utf8"));
const certificateEntries = certificateManifest.certificates ?? [];
const runtimeCertificateResults = certificateEntries
  .filter((item) => item.type === "runtime" && item.expiryPolicy === "enforce")
  .map(evaluateCertificate);
const testFixtureResults = certificateEntries
  .filter((item) => item.type === "test-fixture")
  .map((item) => ({
    id: item.id,
    file: item.path,
    type: item.type,
    expectedState: item.expectedState,
    expiryPolicy: item.expiryPolicy,
    result: "EXCLUDED_FROM_RUNTIME_GATE",
  }));

const expiredExceptions = exceptionResults.filter((item) => item.result === "EXPIRED");
const activeExceptions = exceptionResults.filter((item) => item.scope === "CURRENT_IMAGE");
const historicalExceptions = exceptionResults.filter((item) => item.scope === "HISTORICAL_IMAGE");
const criticalCerts = runtimeCertificateResults.filter((item) => item.severity === "CRITICAL");
const status = expiredExceptions.length === 0 && criticalCerts.length === 0 ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  generatedAt: now.toISOString(),
  riskExceptions: {
    total: exceptionResults.length,
    currentImageDigest,
    active: activeExceptions.length,
    historical: historicalExceptions.length,
    expired: expiredExceptions.length,
    results: exceptionResults,
  },
  certificates: {
    manifest: path.relative(root, certificateManifestPath),
    warningDays,
    highDays,
    runtime: runtimeCertificateResults,
    testFixtures: testFixtureResults,
  },
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);

function evaluateCertificate(item) {
  const file = resolveProjectPath(item.path);
  try {
    const cert = new X509Certificate(readFileSync(file));
    const validTo = new Date(cert.validTo);
    const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
    return {
      id: item.id,
      file: item.path,
      type: item.type,
      expiryPolicy: item.expiryPolicy,
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: new Date(cert.validFrom).toISOString(),
      validTo: validTo.toISOString(),
      fingerprint256: cert.fingerprint256,
      severity: certSeverity(daysRemaining),
      daysRemaining,
    };
  } catch (error) {
    return {
      id: item.id,
      file: item.path,
      type: item.type,
      expiryPolicy: item.expiryPolicy,
      severity: "CRITICAL",
      error: error.code ?? error.message,
    };
  }
}

function resolveProjectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function certSeverity(daysRemaining) {
  if (daysRemaining < 0) return "CRITICAL";
  if (daysRemaining <= highDays) return "HIGH";
  if (daysRemaining <= warningDays) return "WARNING";
  return "OK";
}
