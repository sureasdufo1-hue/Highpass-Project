import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

// Scoped technical evidence, not a replacement for full MVP/v3 acceptance.
const root = process.cwd();
const output = path.join(root, "evidence/generated/current-gap-20261007");
mkdirSync(output, { recursive: true });
const repositorySha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", timeout: 10000 }).trim();
const sourcePaths = ["src/server.js", "src/services.js", "src/orthanc-client.js", "src/pacs-import-engine.js", "public/app.js", "public/mobile/app.js", "scripts/security-network-check.js"];
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const evidence = [];
const commands = [
  ["UNIT", ["--test", "--test-reporter=spec"]],
  ["SECRET", ["scripts/security-secret-scan.js"]],
  ["RUNTIME", ["scripts/attest-runtime.js"]],
  ["EXPIRY", ["scripts/operations-expiry-check.js"]],
  ["NETWORK", ["scripts/security-network-check.js"]],
  ["HTTPS", ["scripts/e2e-integration-test.js"]],
  ["CONTAINER", ["scripts/container-vulnerability-gate.js"]],
];
for (const [id, args] of commands) {
  const started = Date.now();
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: id === "HTTPS" ? 240000 : 90000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const result = run.status === 0 ? "PASS" : run.status === 2 || run.error ? "NOT VERIFIED" : "FAIL";
  const file = path.join(output, `${id.toLowerCase()}.json`);
  writeFileSync(file, JSON.stringify({ command: `node ${args.join(" ")}`, exitCode: run.status, durationMs: Date.now() - started, result, stdout: run.stdout, stderr: run.stderr, errorCode: run.error?.code }, null, 2));
  evidence.push({ evidenceId: `EV-CURRENT-${id}`, repositorySha, result, sourcePath: path.relative(root, file).replaceAll("\\", "/"), sha256: hash(file), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsPersonalData: false, containsSecrets: false });
}
const scan = path.join(output, "app-trivy.json");
if (existsSync(scan)) evidence.push({ evidenceId: "EV-CURRENT-SCAN", repositorySha, result: "SCANNER_OUTPUT_ONLY", sourcePath: path.relative(root, scan).replaceAll("\\", "/"), sha256: hash(scan), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsPersonalData: false, containsSecrets: false });
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), repositorySha, workingTreeDirty: true, workingTreeSourceHashes: Object.fromEntries(sourcePaths.map((file) => [file, hash(file)])), reviewStatus: "DRAFT", reviewer: "UNASSIGNED", containsPersonalData: false, containsSecrets: false, scope: "CURRENT GAP TECHNICAL REGRESSION ONLY; mTLS/security audit reported separately; full v3 NOT VERIFIED", evidence };
writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ manifest: path.relative(root, path.join(output, "manifest.json")), results: evidence.map(({ evidenceId, result }) => ({ evidenceId, result })) }, null, 2));
process.exitCode = evidence.some((item) => item.result === "FAIL") ? 1 : evidence.some((item) => item.result === "NOT VERIFIED") ? 2 : 0;
