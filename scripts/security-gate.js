#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const commands = [
  { name: "unit-tests", command: process.execPath, args: ["--test"] },
  { name: "secret-scan", command: process.execPath, args: ["scripts/security-secret-scan.js"] },
  { name: "dependency-audit", command: "pnpm", args: ["audit", "--prod", "--audit-level", "critical"], shell: process.platform === "win32" },
];

const results = [];
for (const item of commands) {
  const startedAt = Date.now();
  const result = spawnSync(item.command, item.args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: item.shell === true,
  });
  results.push({
    name: item.name,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    stderr: trim(result.stderr),
  });
}

const ok = results.every((item) => item.status === "PASS");
console.log(JSON.stringify({
  status: ok ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  results,
}, null, 2));
process.exit(ok ? 0 : 1);

function trim(value) {
  const text = String(value ?? "").trim();
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}
