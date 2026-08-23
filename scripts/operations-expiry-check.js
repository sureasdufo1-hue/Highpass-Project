#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";

const root = process.cwd();
const now = new Date();
const warningDays = Number(process.env.HIPASS_OPS_CERT_WARNING_DAYS ?? 30);
const highDays = Number(process.env.HIPASS_OPS_CERT_HIGH_DAYS ?? 7);
const exceptionPath = path.join(root, "security", "container-vulnerability-exceptions.json");
const certRoot = path.join(root, "tmp", "certs");

const risk = JSON.parse(readFileSync(exceptionPath, "utf8"));
const exceptionResults = (risk.exceptions ?? []).map((item) => {
  const expiresAt = new Date(item.expiresAt);
  const expired = Number.isNaN(expiresAt.getTime()) || expiresAt <= now;
  return {
    cve: item.cve,
    package: item.package,
    status: item.status,
    approvedBy: item.approvedBy,
    expiresAt: item.expiresAt,
    result: expired ? "EXPIRED" : "VALID",
  };
});

const certResults = listCerts(certRoot).map((file) => {
  const cert = new X509Certificate(readFileSync(file));
  const validTo = new Date(cert.validTo);
  const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
  return {
    file: path.relative(root, file),
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: new Date(cert.validFrom).toISOString(),
    validTo: validTo.toISOString(),
    fingerprint256: cert.fingerprint256,
    severity: certSeverity(daysRemaining),
    daysRemaining,
  };
});

const expiredExceptions = exceptionResults.filter((item) => item.result === "EXPIRED");
const criticalCerts = certResults.filter((item) => item.severity === "CRITICAL");
const status = expiredExceptions.length === 0 && criticalCerts.length === 0 ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  generatedAt: now.toISOString(),
  riskExceptions: {
    total: exceptionResults.length,
    expired: expiredExceptions.length,
    results: exceptionResults,
  },
  certificates: {
    warningDays,
    highDays,
    results: certResults,
  },
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);

function listCerts(dir) {
  try {
    return readdirSync(dir).flatMap((entry) => {
      const target = path.join(dir, entry);
      if (statSync(target).isDirectory()) return listCerts(target);
      return target.endsWith(".crt") ? [target] : [];
    });
  } catch {
    return [];
  }
}

function certSeverity(daysRemaining) {
  if (daysRemaining < 0) return "CRITICAL";
  if (daysRemaining <= highDays) return "HIGH";
  if (daysRemaining <= warningDays) return "WARNING";
  return "OK";
}
