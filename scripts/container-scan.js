#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const scannerImage = process.env.HIPASS_TRIVY_IMAGE ?? "aquasec/trivy:0.58.2@sha256:665030f4d33a82c1e8d9d5e0453365842236723c1ee5cc3becca698268e66a56";
const targetImage = process.env.HIPASS_CONTAINER_SCAN_IMAGE ?? "newproject-orthanc-secured:latest";
const outputPath = path.resolve(process.env.HIPASS_TRIVY_RESULT ?? "artifacts/security/container-scan/orthanc-trivy-final.json");
const outputDirectory = path.dirname(outputPath);
const outputFile = path.basename(outputPath);
mkdirSync(outputDirectory, { recursive: true });

try {
  execFileSync("docker", [
    "run", "--rm",
    "-v", "/var/run/docker.sock:/var/run/docker.sock",
    "-v", `${outputDirectory}:/output`,
    "-v", "hipass-trivy-cache:/root/.cache/trivy",
    scannerImage,
    "image", "--quiet", "--scanners", "vuln", "--severity", "CRITICAL,HIGH",
    "--format", "json", "--output", `/output/${outputFile}`, targetImage,
  ], { stdio: "inherit", timeout: 300_000 });
} catch (error) {
  console.log(JSON.stringify({ status: "ENVIRONMENT_BLOCKED", gate: "CONTAINER_SCAN", reason: error.code ?? error.message }));
  process.exit(2);
}

const scan = JSON.parse(readFileSync(outputPath, "utf8"));
const vulnerabilities = (scan.Results ?? []).flatMap((result) => result.Vulnerabilities ?? []);
console.log(JSON.stringify({
  status: "PASS",
  gate: "CONTAINER_SCAN",
  scannerImage,
  targetImage,
  imageDigest: scan.Metadata?.ImageID ?? null,
  critical: vulnerabilities.filter((item) => item.Severity === "CRITICAL").length,
  high: vulnerabilities.filter((item) => item.Severity === "HIGH").length,
  output: path.relative(root, outputPath),
}, null, 2));
