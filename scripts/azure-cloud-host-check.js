import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function assessCloudHost(output) {
  const lines = output.trim().split(/\r?\n/u);
  const value = (prefix) => lines.filter((line) => line.startsWith(prefix));
  const checks = [
    { name: "host", pass: value("host=").length === 1 && lines.includes("host=highpass-cloud") },
    { name: "docker", pass: value("docker=").length === 1 && value("docker=").every((line) => /^docker=\d+\.\d+\.\d+$/u.test(line)) },
    { name: "compose", pass: value("compose=").length === 1 && value("compose=").every((line) => /^compose=Docker Compose version v\d+\.\d+\.\d+$/u.test(line)) },
    { name: "private-keyvault-tls-unauthenticated-denial", pass: value("vault=").length === 1 && lines.includes("vault=401,10.89.1.4,0") },
  ].map(({ name, pass }) => ({ name, status: pass ? "PASS" : "FAIL" }));
  return { scope: "CLOUD HOST FOUNDATION ONLY", review: "DRAFT / UNASSIGNED", checks,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    keyOperations: "NOT VERIFIED", vpn: "NOT VERIFIED", distributedMvp: "NOT VERIFIED" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const address = process.env.HIPASS_AZURE_CLOUD_IP;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(address ?? "") || address.split(".").some((part) => Number(part) > 255 || String(Number(part)) !== part)) throw new Error("EXPLICIT_CLOUD_IPV4_REQUIRED");
  if (process.platform !== "win32" || !process.env.USERPROFILE) throw new Error("WINDOWS_IDENTITY_REQUIRED");
  const identityDirectory = path.join(process.env.USERPROFILE, ".ssh", "highpass-capstone-cloud");
  const remote = "set -eu; printf 'host=%s\\n' \"$(hostname)\"; printf 'docker=%s\\n' \"$(sudo -n timeout 10s docker info --format '{{.ServerVersion}}')\"; printf 'compose=%s\\n' \"$(timeout 5s docker compose version)\"; timeout 10s curl --silent --show-error --connect-timeout 3 --max-time 8 --output /dev/null --write-out 'vault=%{http_code},%{remote_ip},%{ssl_verify_result}\\n' 'https://kv-hp-demo-4869edd9.vault.azure.net/keys?api-version=7.4'";
  let result;
  try {
    const output = execFileSync("ssh.exe", ["-i", path.join(identityDirectory, "id_ed25519"), "-o", `UserKnownHostsFile=${path.join(identityDirectory, "known_hosts")}`, "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", `highpassadmin@${address}`, remote], { encoding: "utf8", timeout: 35000, maxBuffer: 16384, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    result = { ...assessCloudHost(output), observedAt: new Date().toISOString(), address, observations: output.trim().split(/\r?\n/u) };
  } catch {
    result = { scope: "CLOUD HOST FOUNDATION ONLY", status: "NOT VERIFIED", reason: "SSH_OR_REMOTE_CHECK_FAILED", review: "DRAFT / UNASSIGNED", observedAt: new Date().toISOString(), distributedMvp: "NOT VERIFIED" };
  }
  const directory = path.resolve("artifacts/azure");
  mkdirSync(directory, { recursive: true });
  // Separate immutable run record; do not overwrite a prior failure.
  const filename = `cloud-host-${result.observedAt.replace(/[:.]/gu, "-")}.json`;
  writeFileSync(path.join(directory, filename), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...result, evidence: path.join(directory, filename) }));
  process.exitCode = result.status === "PASS" ? 0 : 1;
}
