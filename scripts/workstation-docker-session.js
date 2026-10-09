import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function installerEvidence(lines, exitCode) {
  const marker = lines.some((line) => /^DOCKER_SETUP=PASS(?: \(existing package set; no package replacement performed\))?$/u.test(line));
  const engine = lines.find((line) => /^docker-engine=\d+\.\d+\.\d+$/u.test(line));
  const compose = lines.find((line) => /^Docker Compose version v\d+\.\d+\.\d+$/u.test(line));
  return { status: exitCode !== 0 ? "FAIL" : marker && engine && compose ? "PASS" : "NOT VERIFIED",
    engine: engine?.split("=")[1] ?? null, compose: compose?.split(" ").at(-1) ?? null,
    application: "NOT VERIFIED", crossHospitalE2e: "NOT VERIFIED" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== "win32") throw new Error("WINDOWS_INTERACTIVE_SESSION_REQUIRED");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = path.join(root, "artifacts/workstation");
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const diagnose = process.argv.includes("--diagnose");
  const recordPath = path.join(directory, `hospital-a-${diagnose ? "diagnostics" : "docker"}-${startedAt.replace(/[:.]/gu, "-")}.json`);
  const latestPath = path.join(directory, "hospital-a-docker-setup.json");
  let result = { hospital: "A", address: "192.168.111.129", startedAt, status: "RUNNING", exitCode: null,
    review: "DRAFT / UNASSIGNED", application: "NOT VERIFIED", crossHospitalE2e: "NOT VERIFIED" };
  const save = () => {
    const text = JSON.stringify(result, null, 2) + "\n";
    writeFileSync(recordPath, text);
    if (!diagnose) writeFileSync(latestPath, text);
  };
  save();
  const script = readFileSync(path.join(root, "scripts", diagnose ? "workstation-install-diagnostics.sh" : "workstation-install-docker-ubuntu.sh"), "utf8").replace(/\r\n/gu, "\n");
  // Execute a decoded command string, not bash's stdin. apt/dpkg cannot consume
  // the remaining script as interactive input. Node passes the command literally.
  const remote = `test $(cat /sys/class/net/ens33/address) = 00:0c:29:25:f6:b4 && test $(id -un) = server && code=$(printf %s ${Buffer.from(script).toString("base64")} | base64 --decode) && HIPASS_DOCKER_SUDO_MODE=interactive timeout ${diagnose ? 45 : 900}s bash -c "$code"`;
  console.log(`Hospital A ${diagnose ? "read-only diagnostics" : "installation"} run: ${startedAt}. Enter credentials only in this terminal.`);
  const child = spawn("ssh.exe", ["-tt", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=5", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=2", "server@192.168.111.129", remote], {
    stdio: ["inherit", "pipe", "inherit"], windowsHide: false,
  });
  const observed = [];
  let pending = "";
  let timedOut = false;
  let finished = false;
  // No transcript retained; only anchored nonsecret versions and final marker.
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    pending += chunk.toString("utf8");
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop().slice(-4096);
    for (const line of lines) {
      if (diagnose && observed.length < 100) observed.push(line.slice(0, 1024));
      else if (/^(?:DOCKER_SETUP=PASS|docker-engine=\d+\.\d+\.\d+$|Docker Compose version v\d+\.\d+\.\d+$)/u.test(line) && observed.length < 8) observed.push(line);
    }
  });
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.on("error", () => {});
    }
  }, diagnose ? 180000 : 950000);
  const finish = (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    result = { ...result, ...installerEvidence(observed, code), exitCode: code,
      completedAt: new Date().toISOString(), ...(timedOut ? { reason: "OWNED_SSH_SESSION_TIMEOUT" } : {}) };
    if (diagnose) result = { ...result, status: "NOT VERIFIED", scope: "READ-ONLY INSTALL DIAGNOSTICS", observations: observed, collected: code === 0 && observed.includes("diagnostics=COLLECTED") };
    save();
    console.log(`Hospital A Docker setup: ${result.status}; exitCode=${code}`);
    console.log(`Result: ${recordPath}`);
    process.exitCode = result.status === "PASS" || result.collected === true ? 0 : 1;
  };
  child.on("error", () => finish(1));
  child.on("close", (code) => finish(code ?? 1));
}
