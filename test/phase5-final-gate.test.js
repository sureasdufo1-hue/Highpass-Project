import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scan = readFileSync("scripts/container-scan.js", "utf8");
const finalGate = readFileSync("scripts/phase5-final-gate.js", "utf8");

test("container scan uses a digest-pinned scanner and finite timeout", () => {
  assert.match(scan, /aquasec\/trivy:0\.58\.2@sha256:[a-f0-9]{64}/);
  assert.match(scan, /timeout:\s*300_000/);
  assert.match(scan, /CRITICAL,HIGH/);
  assert.match(scan, /hipass-trivy-cache/);
});

test("Phase 5 gate freezes the required validation order", () => {
  const db = finalGate.indexOf("privacy-postgres-rls");
  const rollback = finalGate.indexOf("development-certificate-rollback");
  const scanIndex = finalGate.indexOf("fresh-container-scan");
  const sbom = finalGate.indexOf("cyclonedx-sbom");
  const mvp = finalGate.indexOf("capstone-mvp");
  assert.ok(db >= 0 && db < rollback && rollback < scanIndex && scanIndex < sbom && sbom < mvp);
  assert.match(finalGate, /PHASE_5_PRESENTATION_PACKAGE/);
});
