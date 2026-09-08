#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { probePnpmRuntime, runPnpm } from "../src/pnpm-runtime.js";

const pnpmRuntime = probePnpmRuntime();

const commands = [
  { name: "unit-tests", command: process.execPath, args: ["--test"] },
  { name: "secret-scan", command: process.execPath, args: ["scripts/security-secret-scan.js"] },
  { name: "dependency-audit", packageManagerCommand: true, args: ["audit", "--prod", "--audit-level", "critical"] },
];

const commandTimeoutMs = positiveInteger(process.env.HIPASS_SECURITY_GATE_TIMEOUT_MS, 60_000);

const results = [];
for (const item of commands) {
  const startedAt = Date.now();
  if (item.packageManagerCommand && pnpmRuntime.status !== "PASS") {
    results.push({ name: item.name, status: pnpmRuntime.status, exitCode: pnpmRuntime.status === "FAIL" ? 1 : 2, signal: null, durationMs: Date.now() - startedAt, stderr: pnpmRuntime.reason, packageManager: pnpmRuntime });
    continue;
  }
  const result = item.packageManagerCommand
    ? runPnpm(pnpmRuntime.commandPath, item.args, { env: process.env, cwd: process.cwd(), runner: timedRunner })
    : timedRunner(item.command, item.args, {});
  const blocked = item.name === "dependency-audit" && isRegistryEnvironmentFailure(result);
  results.push({
    name: item.name,
    status: result.status === 0 ? "PASS" : blocked ? "ENVIRONMENT_BLOCKED" : "FAIL",
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    stderr: trim(result.stderr),
    ...(item.packageManagerCommand ? { packageManager: pnpmRuntime } : {}),
  });
}

const ok = results.every((item) => item.status === "PASS");
const environmentBlocked = !results.some((item) => item.status === "FAIL") && results.some((item) => item.status === "ENVIRONMENT_BLOCKED");
console.log(JSON.stringify({
  status: ok ? "PASS" : environmentBlocked ? "ENVIRONMENT_BLOCKED" : "FAIL",
  generatedAt: new Date().toISOString(),
  results,
}, null, 2));
process.exit(ok ? 0 : environmentBlocked ? 2 : 1);

function trim(value) {
  const text = String(value ?? "").trim();
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

function isRegistryEnvironmentFailure(result) {
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.toLowerCase();
  return result.error?.code === "ENOENT" || result.error?.code === "ETIMEDOUT" || [
    "fetch failed",
    "registry signature",
    "signature could not be verified",
    "bytes selected by this project's lockfile",
    "could not resolve host",
    "getaddrinfo",
    "network request",
    "timed out",
    "etimedout",
    "econnrefused",
  ].some((value) => output.includes(value));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function timedRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    ...options,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
    timeout: commandTimeoutMs,
    windowsHide: true,
  });
}
