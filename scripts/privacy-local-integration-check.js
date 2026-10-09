import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPrivacyHttpFixture, privacyHttpFixturePassed } from "./test-support/privacy-http-fixture.js";
import { verifyEvidenceManifest } from "./verify-evidence-manifest.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sources = new Set([
  "src/server.js", "scripts/privacy-local-integration-check.js", "scripts/test-support/privacy-http-fixture.js",
  "scripts/verify-evidence-manifest.js", "test/privacy-isolated-http.test.js", "test/privacy-request-deadline.test.js",
  "test/privacy-filter.test.js", "test/privacy-service-identity.test.js", "test/fixtures/privacy/fake-opf-bridge.py",
  "test/fixtures/privacy/fake-checkpoint/config.json", "config/privacy/approved-uses.synthetic.json",
  "config/privacy/rules.synthetic.json", "schemas/privacy-responses.schema.json", "schemas/privacy-text-inspection.schema.json",
  "docs/api/highpass-privacy-internal.openapi.yaml", "package.json", "pnpm-lock.yaml",
]);
// Recursively include local JS imports rather than binding just one service file.
async function sourceClosure() {
  const pending = [...sources];
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const content = await readFile(path.join(root, file));
    if (!file.endsWith(".js")) continue;
    for (const match of content.toString("utf8").matchAll(/^\s*import\s+(?:[^;]*?\sfrom\s*)?["'](\.[^"']+)["']/gm)) {
      const target = path.relative(root, path.resolve(root, path.dirname(file), match[1])).replaceAll("\\", "/");
      if (target.startsWith("../") || path.isAbsolute(target)) throw new Error("SOURCE_OUTSIDE_REPOSITORY");
      sources.add(target); pending.push(target);
    }
  }
  return Promise.all([...sources].sort().map(async (file) => ({ path: file, sha256: sha(await readFile(path.join(root, file))) })));
}

const generatedAt = new Date().toISOString();
const run = `hp-privacy-http-${generatedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const directory = path.join(root, "evidence", "generated", run);
await mkdir(directory, { recursive: true });
const repositorySha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
const start = performance.now();
let result;
let before = [];
try {
  before = await sourceClosure();
  result = await runPrivacyHttpFixture();
  const after = await sourceClosure();
  result.sourceUnchanged = JSON.stringify(before) === JSON.stringify(after)
    && execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true }).trim() === repositorySha;
} catch {
  result = { assertions: [], cleanup: "NOT VERIFIED", sourceUnchanged: false, failureCode: "FIXTURE_OR_SOURCE_FAILED" };
}
const passed = privacyHttpFixturePassed(result) && result.sourceUnchanged === true;
const report = { gate: "PRIVACY_LOOPBACK_HTTP_FAKE_MODEL", status: passed ? "PASS" : "FAIL", reviewStatus: "DRAFT", reviewer: "UNASSIGNED",
  generatedAt, repositorySha, durationMs: Math.round(performance.now() - start), sources: before, ...result };
const payload = JSON.stringify(report, null, 2) + "\n";
await writeFile(path.join(directory, "result.json"), payload);
const sourcePath = path.relative(root, path.join(directory, "result.json")).replaceAll("\\", "/");
const manifest = { repositorySha, generatedAt, containsPersonalData: false, containsSecrets: false,
  qualifier: "SYNTHETIC FIXTURE RESULTS ONLY / NO RAW BODY OR CREDENTIALS", evidence: [{ evidenceId: "PRIVACY-LOCAL-HTTP",
    repositorySha, sourcePath, sha256: sha(payload), containsPersonalData: false, containsSecrets: false,
    reviewStatus: "DRAFT", reviewer: "UNASSIGNED" }] };
await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const verification = verifyEvidenceManifest(path.join(directory, "manifest.json"), { repositoryRoot: root });
console.log(JSON.stringify({ status: passed && verification.ok ? "PASS" : "FAIL", gate: report.gate,
  assertions: report.assertions.length, failed: report.assertions.filter((entry) => entry.result !== "PASS").map((entry) => entry.id),
  cleanup: report.cleanup, sourceUnchanged: report.sourceUnchanged, sources: before.length,
  durationMs: report.durationMs, manifest: path.relative(root, path.join(directory, "manifest.json")).replaceAll("\\", "/"),
  integrityVerified: verification.ok, reviewStatus: "DRAFT", reviewer: "UNASSIGNED" }, null, 2));
process.exitCode = passed && verification.ok ? 0 : 1;
