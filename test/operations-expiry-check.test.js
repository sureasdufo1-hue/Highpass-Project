import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runExpiry({ currentDigest, exceptionDigest }) {
  const directory = mkdtempSync(path.join(tmpdir(), "hipass-expiry-"));
  const policyPath = path.join(directory, "policy.json");
  const certificatePath = path.join(directory, "certificates.json");
  writeFileSync(policyPath, JSON.stringify({
    image: { imageDigest: currentDigest },
    exceptions: [{
      cve: "CVE-TEST",
      package: "test-package",
      imageDigest: exceptionDigest,
      status: "APPROVED",
      approvedBy: "security-owner",
      expiresAt: "2026-01-01T00:00:00Z",
    }],
  }));
  writeFileSync(certificatePath, JSON.stringify({ certificates: [] }));
  const result = spawnSync(process.execPath, ["scripts/operations-expiry-check.js"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HIPASS_CONTAINER_EXCEPTIONS: policyPath,
      HIPASS_CERTIFICATE_MANIFEST: certificatePath,
      HIPASS_CERTIFICATE_NOW: "2026-09-09T00:00:00Z",
    },
  });
  rmSync(directory, { recursive: true, force: true });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

test("expired exception for a historical image does not fail the current image gate", () => {
  const result = runExpiry({ currentDigest: "sha256:current", exceptionDigest: "sha256:old" });
  assert.equal(result.status, 0);
  assert.equal(result.output.status, "PASS");
  assert.equal(result.output.riskExceptions.active, 0);
  assert.equal(result.output.riskExceptions.historical, 1);
  assert.equal(result.output.riskExceptions.results[0].result, "HISTORICAL");
});

test("expired exception for the current image fails the expiry gate", () => {
  const result = runExpiry({ currentDigest: "sha256:current", exceptionDigest: "sha256:current" });
  assert.equal(result.status, 1);
  assert.equal(result.output.status, "FAIL");
  assert.equal(result.output.riskExceptions.active, 1);
  assert.equal(result.output.riskExceptions.expired, 1);
});
