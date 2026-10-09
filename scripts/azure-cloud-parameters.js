import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function cloudParameters({ managementSourceCidr, imageVersion, sshPublicKey, vmSize = "Standard_B2s" }) {
  if (!["Standard_B2s", "Standard_B1ms", "Standard_B2als_v2"].includes(vmSize)) throw new Error("BUDGETED_VM_SIZE_REQUIRED");
  if (typeof managementSourceCidr !== "string" || !/^(?:\d{1,3}\.){3}\d{1,3}\/32$/u.test(managementSourceCidr)) throw new Error("EXPLICIT_PUBLIC_IPV4_32_REQUIRED");
  const octets = managementSourceCidr.slice(0, -3).split(".");
  const [a, b] = octets.map(Number);
  if (octets.some((part) => String(Number(part)) !== part || Number(part) > 255)
    || a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) throw new Error("PUBLIC_MANAGEMENT_SOURCE_REQUIRED");
  if (typeof imageVersion !== "string" || !/^24\.04\.\d{9}$/u.test(imageVersion)) throw new Error("VERIFIED_PINNED_UBUNTU_IMAGE_REQUIRED");
  if (typeof sshPublicKey !== "string" || !/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: highpass-capstone-cloud)?$/u.test(sshPublicKey)) throw new Error("PUBLIC_ED25519_KEY_REQUIRED");
  const encoded = sshPublicKey.split(" ")[1];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 51 || bytes.toString("base64") !== encoded
    || bytes.readUInt32BE(0) !== 11 || bytes.subarray(4, 15).toString() !== "ssh-ed25519"
    || bytes.readUInt32BE(15) !== 32) throw new Error("PUBLIC_ED25519_KEY_INVALID");
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: { managementSourceCidr: { value: managementSourceCidr }, imageVersion: { value: imageVersion }, sshPublicKey: { value: sshPublicKey }, vmSize: { value: vmSize } },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicPath = path.join(process.env.USERPROFILE, ".ssh", "highpass-capstone-cloud", "id_ed25519.pub");
  const parameters = cloudParameters({ managementSourceCidr: process.env.HIPASS_AZURE_MANAGEMENT_CIDR,
    imageVersion: process.env.HIPASS_AZURE_IMAGE_VERSION, sshPublicKey: readFileSync(publicPath, "utf8").trim(), vmSize: process.env.HIPASS_AZURE_VM_SIZE });
  const outputPath = path.resolve("artifacts", "azure", "cloud-vm.parameters.json");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(parameters, null, 2));
  console.log(JSON.stringify({ scope: "PUBLIC_DEPLOYMENT_PARAMETERS_ONLY", status: "PASS", outputPath, review: "DRAFT / UNASSIGNED" }));
}
