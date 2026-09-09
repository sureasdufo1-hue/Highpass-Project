#!/usr/bin/env node
import { spawn } from "node:child_process";

const steps = [
  { name: "privacy-postgres-rls", command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/privacy-db-gate.ps1"], timeoutMs: 180_000 },
  { name: "development-certificate-rollback", command: process.execPath, args: ["scripts/rehearse-dev-cert-rollback.js"], timeoutMs: 60_000 },
  { name: "fresh-container-scan", command: process.execPath, args: ["scripts/container-scan.js"], timeoutMs: 300_000 },
  { name: "cyclonedx-sbom", command: process.execPath, args: ["scripts/generate-sbom.js"], timeoutMs: 60_000 },
  { name: "capstone-mvp", command: process.execPath, args: ["scripts/mvp-verify.js"], timeoutMs: 600_000 },
];
const results = [];

for (const step of steps) {
  const startedAt = Date.now();
  const result = await run(step);
  const parsedStatus = parseStatus(result.stdout);
  const status = result.code === 0 ? "PASS" : result.code === 2 || parsedStatus === "ENVIRONMENT_BLOCKED" ? "ENVIRONMENT_BLOCKED" : "FAIL";
  results.push({ name: step.name, status, exitCode: result.code, durationMs: Date.now() - startedAt, detail: safe(result.stderr || parsedStatus || "completed") });
  if (status !== "PASS") break;
}

const status = results.length === steps.length && results.every((result) => result.status === "PASS")
  ? "PASS"
  : results.some((result) => result.status === "FAIL") ? "FAIL" : "ENVIRONMENT_BLOCKED";
console.log(JSON.stringify({
  status,
  qualifier: "CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY",
  gate: "PHASE_5_PRESENTATION_PACKAGE",
  results,
}, null, 2));
process.exit(status === "PASS" ? 0 : status === "ENVIRONMENT_BLOCKED" ? 2 : 1);

function run(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, { cwd: process.cwd(), env: process.env, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), step.timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: error.code === "ENOENT" ? 2 : 1, stdout, stderr: error.message }); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr: signal ? `${stderr}\nterminated by ${signal}` : stderr }); });
  });
}

function parseStatus(output) {
  const matches = String(output).match(/"status"\s*:\s*"([A-Z_]+)"/g);
  return matches?.at(-1)?.match(/"([A-Z_]+)"\s*$/)?.[1] ?? null;
}

function safe(value) {
  const redacted = String(value ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]").trim();
  return redacted.length > 1200 ? `...[truncated]\n${redacted.slice(-1200)}` : redacted;
}
