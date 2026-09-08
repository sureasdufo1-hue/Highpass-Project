#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";

const root = process.cwd();
const now = new Date(process.env.HIPASS_CERTIFICATE_NOW ?? Date.now());
const manifestPath = resolveProjectPath(process.env.HIPASS_CERTIFICATE_MANIFEST ?? "config/certificate-lifecycle.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const fixtures = (manifest.certificates ?? [])
  .filter((item) => item.type === "test-fixture")
  .map(validateFixture);

const status = fixtures.length > 0 && fixtures.every((item) => item.result === "PASS") ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  generatedAt: now.toISOString(),
  manifest: path.relative(root, manifestPath),
  fixtures,
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);

function validateFixture(item) {
  try {
    const cert = new X509Certificate(readFileSync(resolveProjectPath(item.path)));
    const validTo = new Date(cert.validTo);
    const actualState = validTo <= now ? "expired" : "valid";
    const expectedState = item.expectedState ?? "unspecified";
    return {
      id: item.id,
      file: item.path,
      type: item.type,
      production: item.production,
      expiryPolicy: item.expiryPolicy,
      expectedState,
      actualState,
      validTo: validTo.toISOString(),
      result: expectedState === actualState ? "PASS" : "FAIL",
    };
  } catch (error) {
    return {
      id: item.id,
      file: item.path,
      type: item.type,
      expectedState: item.expectedState ?? "unspecified",
      actualState: "unreadable",
      error: error.code ?? error.message,
      result: "FAIL",
    };
  }
}

function resolveProjectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}
