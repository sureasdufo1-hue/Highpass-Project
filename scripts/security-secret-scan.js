#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules", "data", "tmp", "coverage", "artifacts", ".next", "dist", "build"]);
const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".dcm", ".pdf", ".zip"]);
const findings = [];

const patterns = [
  { id: "PRIVATE_KEY_BLOCK", pattern: /-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----/ },
  { id: "AWS_ACCESS_KEY_ID", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "OPENAI_API_KEY", pattern: /sk-[A-Za-z0-9_-]{32,}/ },
  { id: "GITHUB_TOKEN", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { id: "SLACK_TOKEN", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
];

await scanDir(root);

const result = {
  status: findings.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  findings,
};
console.log(JSON.stringify(result, null, 2));
process.exit(findings.length ? 1 : 0);

async function scanDir(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await scanDir(path.join(dir, entry.name));
      continue;
    }
    const filePath = path.join(dir, entry.name);
    if (ignoredExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await stat(filePath);
    if (info.size > 1024 * 1024) continue;
    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const relativePath = path.relative(root, filePath);
    if (relativePath === path.join("scripts", "security-secret-scan.js")) continue;
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const { id, pattern } of patterns) {
        if (pattern.test(line)) findings.push({ id, file: relativePath, line: index + 1 });
      }
    }
  }
}
