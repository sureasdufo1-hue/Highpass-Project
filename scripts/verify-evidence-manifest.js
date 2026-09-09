#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function verifyEvidenceManifest(manifestPath, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const resolvedManifest = path.resolve(repositoryRoot, manifestPath);
  const manifestDirectory = path.dirname(resolvedManifest);
  const manifest = JSON.parse(readFileSync(resolvedManifest, "utf8"));
  const errors = [];

  if (!/^[a-f0-9]{40}$/i.test(manifest.repositorySha ?? "")) errors.push("repositorySha must be a full Git SHA");
  if (manifest.containsPersonalData !== false) errors.push("manifest containsPersonalData must be false");
  if (manifest.containsSecrets !== false) errors.push("manifest containsSecrets must be false");
  if (!Array.isArray(manifest.evidence) || manifest.evidence.length === 0) errors.push("manifest evidence must not be empty");

  const seenIds = new Set();
  const results = [];
  for (const entry of manifest.evidence ?? []) {
    const entryErrors = [];
    if (!entry.evidenceId || seenIds.has(entry.evidenceId)) entryErrors.push("evidenceId is missing or duplicated");
    seenIds.add(entry.evidenceId);
    if (entry.repositorySha !== manifest.repositorySha) entryErrors.push("repositorySha does not match manifest");
    if (entry.containsPersonalData !== false) entryErrors.push("containsPersonalData must be false");
    if (entry.containsSecrets !== false) entryErrors.push("containsSecrets must be false");
    if (!/^[a-f0-9]{64}$/i.test(entry.sha256 ?? "")) entryErrors.push("sha256 is invalid");

    const sourcePath = path.resolve(repositoryRoot, entry.sourcePath ?? "");
    if (path.dirname(sourcePath) !== manifestDirectory) {
      entryErrors.push("sourcePath must remain in the manifest directory");
    } else {
      try {
        const actualHash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
        if (actualHash !== entry.sha256) entryErrors.push("sha256 mismatch");
      } catch (error) {
        entryErrors.push(`source file unavailable: ${error.code ?? error.message}`);
      }
    }
    results.push({ evidenceId: entry.evidenceId, sourcePath: entry.sourcePath, errors: entryErrors });
    errors.push(...entryErrors.map((message) => `${entry.evidenceId ?? "UNKNOWN"}: ${message}`));
  }

  if (options.verifyGit !== false && /^[a-f0-9]{40}$/i.test(manifest.repositorySha ?? "")) {
    try {
      execFileSync("git", ["cat-file", "-e", `${manifest.repositorySha}^{commit}`], {
        cwd: repositoryRoot,
        stdio: "ignore",
        windowsHide: true,
        timeout: 10_000,
      });
    } catch {
      errors.push("repositorySha is not an available Git commit");
    }
  }

  return {
    ok: errors.length === 0,
    manifestPath: path.relative(repositoryRoot, resolvedManifest).replaceAll("\\", "/"),
    repositorySha: manifest.repositorySha,
    evidenceCount: manifest.evidence?.length ?? 0,
    draftCount: (manifest.evidence ?? []).filter((entry) => entry.reviewStatus === "DRAFT").length,
    unassignedCount: (manifest.evidence ?? []).filter((entry) => entry.reviewer === "UNASSIGNED").length,
    results,
    errors,
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node scripts/verify-evidence-manifest.js <manifest.json>");
    process.exitCode = 2;
    return;
  }
  const result = verifyEvidenceManifest(manifestPath);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
