import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const container = process.env.HIPASS_ATTEST_CONTAINER ?? "hipass-control-api";
const files = ["src/server.js", "src/services.js", "src/pacs-import-engine.js", "src/pacs-crypto-engine.js", "src/orthanc-client.js", "src/curated-dicom-store.js", "public/app.js", "public/index.html", "public/mobile/app.js", "public/mobile/index.html", "scripts/edge-proxy.js", "scripts/edge-healthcheck.js", "scripts/ops-mtls-client-check.js"];
files.push("src/postgres-store.js");
files.push("src/ingress.js", "src/http-utils.js");
files.push("src/dpop-replay-store.js");
const results = [];
for (const file of files) {
  const host = createHash("sha256").update(readFileSync(file)).digest("hex");
  try {
    const script = `console.log(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(${JSON.stringify(file)})).digest('hex'))`;
    const runtime = execFileSync("docker", ["exec", container, "/nodejs/bin/node", "-e", script], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
    results.push({ path: file, host, runtime, result: host === runtime ? "PASS" : "FAIL" });
  } catch { results.push({ path: file, host, result: "NOT VERIFIED" }); }
}
const status = results.every((item) => item.result === "PASS") ? "PASS" : results.some((item) => item.result === "FAIL") ? "FAIL" : "NOT VERIFIED";
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), container, status, results }, null, 2));
process.exitCode = status === "PASS" ? 0 : status === "FAIL" ? 1 : 2;
