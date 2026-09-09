import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyEvidenceManifest } from "../scripts/verify-evidence-manifest.js";

test("evidence verifier accepts a confined source with a matching digest", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hipass-evidence-"));
  const run = path.join(root, "evidence", "generated", "run-1");
  const source = path.join(run, "gate.txt");
  mkdirSync(run, { recursive: true });
  writeFileSync(source, "PASS\n");
  const sha256 = createHash("sha256").update("PASS\n").digest("hex");
  writeFileSync(path.join(run, "manifest.json"), JSON.stringify(manifest("evidence/generated/run-1/gate.txt", sha256)));

  const result = verifyEvidenceManifest("evidence/generated/run-1/manifest.json", { repositoryRoot: root, verifyGit: false });
  assert.equal(result.ok, true);
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.draftCount, 1);
});

test("evidence verifier rejects tampering and paths outside the run directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hipass-evidence-"));
  const run = path.join(root, "evidence", "generated", "run-2");
  mkdirSync(run, { recursive: true });
  writeFileSync(path.join(root, "outside.txt"), "changed");
  writeFileSync(path.join(run, "manifest.json"), JSON.stringify(manifest("outside.txt", "0".repeat(64))));

  const result = verifyEvidenceManifest("evidence/generated/run-2/manifest.json", { repositoryRoot: root, verifyGit: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("manifest directory")));
});

function manifest(sourcePath, sha256) {
  const repositorySha = "a".repeat(40);
  return {
    repositorySha,
    containsPersonalData: false,
    containsSecrets: false,
    evidence: [{
      evidenceId: "EV-TEST-001",
      repositorySha,
      sourcePath,
      sha256,
      containsPersonalData: false,
      containsSecrets: false,
      reviewStatus: "DRAFT",
      reviewer: "UNASSIGNED",
    }],
  };
}
