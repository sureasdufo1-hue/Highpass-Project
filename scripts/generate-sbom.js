#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};

const components = Object.entries(dependencies).map(([name, version]) => ({
  type: "library",
  name,
  version: String(version).replace(/^[~^]/, ""),
  purl: `pkg:npm/${encodeURIComponent(name)}@${String(version).replace(/^[~^]/, "")}`,
}));

const containerImages = inspectContainerImages([
  "newproject-hipass-control-api:latest",
  "newproject-ohif-static:latest",
  "newproject-orthanc-secured:latest",
]);

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${cryptoRandomUuid()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{
      vendor: "HiPass",
      name: "local-sbom-generator",
      version: packageJson.version ?? "0.0.0",
    }],
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
    },
    properties: [
      { name: "hipass.scope", value: "npm application dependencies only" },
      { name: "hipass.containerImages", value: JSON.stringify(containerImages) },
      { name: "hipass.syntheticOnly", value: "true" },
    ],
  },
  components,
};

const outputDir = path.join(root, "artifacts", "sbom");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "application.cdx.json");
await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`);

console.log(JSON.stringify({
  status: "PASS",
  output: path.relative(root, outputPath),
  components: components.length,
  containerImages,
}, null, 2));

function cryptoRandomUuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inspectContainerImages(images) {
  return images.map((image) => {
    try {
      const output = execFileSync("docker", [
        "image",
        "inspect",
        image,
        "--format",
        "{{.Id}} {{json .RepoDigests}}",
      ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      const [imageId, ...repoDigestParts] = output.split(" ");
      return {
        image,
        imageId,
        repoDigests: JSON.parse(repoDigestParts.join(" ") || "[]"),
        status: "VERIFIED",
      };
    } catch (error) {
      return {
        image,
        status: "NOT_VERIFIED",
        reason: error.message,
      };
    }
  });
}
