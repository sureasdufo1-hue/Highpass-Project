import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { cloudParameters } from "../scripts/azure-cloud-parameters.js";
import { assessCloudHost } from "../scripts/azure-cloud-host-check.js";

const { publicKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" });
const wire = Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from("ssh-ed25519"), Buffer.from([0, 0, 0, 32]), Buffer.from(jwk.x, "base64url")]);
const valid = { managementSourceCidr: "8.8.4.4/32", imageVersion: "24.04.202609040", sshPublicKey: `ssh-ed25519 ${wire.toString("base64")} highpass-capstone-cloud` };

test("host foundation requires actual Docker and private TLS denial, never infers crypto or VPN", () => {
  const output = "host=highpass-cloud\ndocker=29.8.2\ncompose=Docker Compose version v5.6.0\nvault=401,10.89.1.4,0\n";
  assert.equal(assessCloudHost(output).status, "PASS");
  assert.equal(assessCloudHost(output).keyOperations, "NOT VERIFIED");
  assert.equal(assessCloudHost(output).distributedMvp, "NOT VERIFIED");
  for (const replacement of ["vault=200,10.89.1.4,0", "vault=401,20.1.1.1,0", "vault=401,10.89.1.4,1", "vault=000,10.89.1.4,0"]) {
    assert.equal(assessCloudHost(output.replace("vault=401,10.89.1.4,0", replacement)).status, "FAIL");
  }
  assert.equal(assessCloudHost(output + "vault=401,10.89.1.4,0\n").status, "FAIL");
  assert.equal(assessCloudHost(output.replace("docker=29.8.2\n", "")).status, "FAIL");
});

test("host check uses strict noninteractive SSH and finite TLS-verified probes", () => {
  const source = readFileSync("scripts/azure-cloud-host-check.js", "utf8");
  assert.match(source, /StrictHostKeyChecking=yes/u);
  assert.match(source, /BatchMode=yes/u);
  assert.match(source, /timeout: 35000/u);
  assert.match(source, /--max-time 8/u);
  assert.doesNotMatch(source, /--insecure|StrictHostKeyChecking=no|rejectUnauthorized: false/u);
});

test("cloud deployment parameters require a narrow public management source, pinned image and public key", () => {
  assert.equal(cloudParameters(valid).parameters.managementSourceCidr.value, valid.managementSourceCidr);
  for (const managementSourceCidr of ["*", "0.0.0.0/0", "8.8.4.4/24", "10.89.0.1/32", "192.168.111.129/32", "127.0.0.1/32", "100.64.0.1/32", "300.8.4.4/32", "008.8.4.4/32"]) {
    assert.throws(() => cloudParameters({ ...valid, managementSourceCidr }));
  }
  assert.throws(() => cloudParameters({ ...valid, imageVersion: "latest" }));
  assert.throws(() => cloudParameters({ ...valid, vmSize: "Standard_D64s_v5" }));
  // Construct the invalid marker without embedding a PEM block marker in source.
  assert.throws(() => cloudParameters({ ...valid, sshPublicKey: ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ") }));
  assert.throws(() => cloudParameters({ ...valid, sshPublicKey: "ssh-ed25519 AAAA" }));
});

test("cloud VM uses public-key login, narrow ingress and assigns no Key Vault identity/permission", () => {
  const template = JSON.parse(readFileSync("infra/azure/capstone-cloud-vm.json", "utf8"));
  const vm = template.resources.find((resource) => resource.type === "Microsoft.Compute/virtualMachines");
  assert.equal(vm.properties.osProfile.linuxConfiguration.disablePasswordAuthentication, true);
  assert.equal(vm.properties.osProfile.adminPassword, undefined);
  assert.equal(vm.identity, undefined);
  assert.equal(template.resources.some((resource) => /roleAssignments|vaults/u.test(resource.type)), false);
  assert.deepEqual(template.parameters.vmSize.allowedValues, ["Standard_B2s", "Standard_B1ms", "Standard_B2als_v2"]);
  assert.equal(vm.properties.storageProfile.osDisk.diskSizeGB, 32);
  const nsg = template.resources.find((resource) => resource.type === "Microsoft.Network/networkSecurityGroups");
  const allows = nsg.properties.securityRules.filter((rule) => rule.properties.access === "Allow");
  assert.deepEqual(allows.map((rule) => rule.properties.destinationPortRange), ["22", "51820", "443"]);
  assert.ok(allows.every((rule) => rule.properties.sourceAddressPrefix === "[parameters('managementSourceCidr')]"));
  assert.ok(nsg.properties.securityRules.some((rule) => rule.properties.access === "Deny" && rule.properties.destinationPortRange === "*"));
});
