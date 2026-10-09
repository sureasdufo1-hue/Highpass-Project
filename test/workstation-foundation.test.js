import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { installerEvidence } from "../scripts/workstation-docker-session.js";

test("installer PASS requires marker, both live versions and zero exit, never application completion", () => {
  const lines = ["docker-engine=29.8.2", "Docker Compose version v5.6.0", "DOCKER_SETUP=PASS"];
  assert.equal(installerEvidence(lines, 0).status, "PASS");
  assert.equal(installerEvidence(lines, 0).crossHospitalE2e, "NOT VERIFIED");
  assert.equal(installerEvidence(lines, 1).status, "FAIL");
  assert.equal(installerEvidence(lines.slice(0, 2), 0).status, "NOT VERIFIED");
  assert.equal(installerEvidence(["DOCKER_SETUP=PASS"], 0).status, "NOT VERIFIED");
  assert.equal(installerEvidence(["DOCKER_SETUP=PASS SECRET", ...lines.slice(0, 2)], 0).status, "NOT VERIFIED");
});

test("interactive installer has a global owned-process deadline and no stored transcript", () => {
  const source = readFileSync("scripts/workstation-docker-session.js", "utf8");
  assert.match(source, /950000/u);
  assert.match(source, /String\(child.pid\)/u);
  assert.match(source, /StrictHostKeyChecking=yes/u);
  assert.match(source, /stdio: \["inherit", "pipe", "inherit"\]/u);
  assert.doesNotMatch(source, /StrictHostKeyChecking=no|Password=|Start-Transcript/u);
  assert.match(source, /diagnose \? 180000 : 950000/u);
  assert.match(source, /if \(!diagnose\) writeFileSync\(latestPath/u);
  const diagnostics = readFileSync("scripts/workstation-install-diagnostics.sh", "utf8");
  assert.doesNotMatch(diagnostics, /apt-get .*install|systemctl (?:start|restart|enable)|ssh_host_.*_key/u);
  assert.match(diagnostics, /sudo -n docker info/u);
});

test("new hospital VM templates are distinct, isolated and contain no credentials", () => {
  for (const [hospital, network] of [["a", "VMnet20"], ["b", "VMnet21"]]) {
    const text = readFileSync(`infra/workstation/hospital-${hospital}.vmx`, "utf8");
    assert.match(text, /memsize = "8192"/u);
    assert.match(text, /numvcpus = "2"/u);
    assert.ok(text.includes(`ethernet0.vnet = "${network}"`));
    assert.match(text, /ethernet0.connectionType = "custom"/u);
    assert.match(text, /ethernet1.present = "FALSE"/u);
    assert.match(text, /isolation.tools.copy.disable = "TRUE"/u);
    assert.match(text, /sharedFolder.maxNum = "0"/u);
    assert.doesNotMatch(text, /password|secret|token|bridged/iu);
  }
});

// Configuration-only CLI validation; no Docker Engine/VM/service startup.
function config(role, env) {
  const result = spawnSync("docker", ["compose", "--project-directory", process.cwd(), "-p", `hp-workstation-test-${role}`, "-f", `infra/workstation/hospital-${role}.compose.yml`, "--profile", "seed", "config", "--format", "json"], { env: { ...process.env, ...env }, timeout: 15000, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, "Compose config validation failed (CLI required); no service startup implied");
  return JSON.parse(result.stdout);
}
test("A Compose exposes only loopback mTLS and keeps PACS volume local", () => {
  const value = config("a", { HIPASS_APP_IMAGE: "highpass-platform-mvp:local", HIPASS_ORTHANC_IMAGE: "newproject-orthanc-secured", HIPASS_VM_SECRETS_DIR: "/opt/highpass/secrets" });
  assert.equal(value.services.orthanc.ports, undefined);
  assert.equal(value.services["orthanc-mtls"].ports[0].host_ip, "127.0.0.1");
  assert.equal(value.services["orthanc-mtls"].ports[0].target, 8443);
  assert.equal(value.networks.pacs_private.internal, true);
  assert.ok(Object.values(value.services).every((service) => !service.container_name));
  assert.ok(Object.values(value.services).every((service) => service.healthcheck || service.profiles?.includes("seed")));
});
test("B Compose never publishes bare Viewer or creates a clinical data volume", () => {
  const value = config("b", { HIPASS_VIEWER_IMAGE: "newproject-ohif-static" });
  assert.equal(value.services.viewer.ports, undefined);
  assert.equal(value.networks.viewer_private.internal, true);
  assert.equal(value.volumes, undefined);
});
test("synthetic seeding includes a finite request/body deadline", () => {
  assert.match(readFileSync("scripts/load-sample-dicom.js", "utf8"), /signal: AbortSignal\.timeout\(10000\)/u);
});

test("guest inventory is read-only, bounded and never asserts application completion", () => {
  const text = readFileSync("scripts/workstation-guest-check.sh", "utf8");
  assert.match(text, /timeout 5s docker info/u);
  assert.match(text, /timeout 5s docker compose version/u);
  assert.match(text, /application=NOT VERIFIED/u);
  assert.match(text, /key-vault=NOT VERIFIED/u);
  assert.match(text, /cross-hospital-e2e=NOT VERIFIED/u);
  const commands = text.split(/\r?\n/u).filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(commands, /sudo|apt-get|docker compose up|machine-id|cat .*ssh_host_.*_key(?:\s|$)/u);
  assert.match(text, /exit 1/u);
  assert.match(text, /exit 2/u);
});

test("interactive SSH enrollment preserves identities and requires console-verified public trust", () => {
  const text = readFileSync("scripts/workstation-ssh-enroll.ps1", "utf8");
  assert.match(text, /StrictHostKeyChecking=ask/u);
  assert.match(text, /HostKeyAlgorithms=ssh-ed25519/u);
  assert.match(text, /Host fingerprint mismatch/u);
  assert.match(text, /StrictHostKeyChecking=yes/u);
  assert.match(text, /B still shares A host key/u);
  assert.match(text, /knownOutput = @\(& \$keygen -F/u);
  assert.match(text, /WaitForExit\(10000\)/u);
  assert.match(text, /timeout 15s sh -s/u);
  assert.match(text, /highpass_capstone_hospital_/u);
  assert.match(text, /WRONG_HOSPITAL_GUEST/u);
  assert.match(text, /grep -qxF/u);
  assert.match(text, /inheritance:r/u);
  assert.doesNotMatch(text, /StrictHostKeyChecking=no|UserKnownHostsFile=NUL|\s-pw\s|\s-N\s|Remove-Item/u);
});
