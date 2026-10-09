#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const project = process.env.HIPASS_COMPOSE_PROJECT ?? "newproject";
const networkPrefix = process.env.HIPASS_NETWORK_PREFIX ?? project;

const checks = [
  {
    name: "Viewer -> PostgreSQL",
    expected: "DENY",
    command: ["docker", ["run", "--rm", "--network", `${networkPrefix}_frontend_net`, "alpine:3.20", "sh", "-lc", "nc -vz -w 3 hipass-postgres 5432"]],
  },
  {
    name: "Viewer -> Orthanc direct",
    expected: "DENY",
    command: ["docker", ["run", "--rm", "--network", `${networkPrefix}_frontend_net`, "alpine:3.20", "sh", "-lc", "nc -vz -w 3 hospital-a-orthanc 8042"]],
  },
  {
    name: "Viewer -> Gateway",
    expected: "ALLOW",
    command: ["docker", ["run", "--rm", "--network", `${networkPrefix}_frontend_net`, process.env.HIPASS_APP_IMAGE ?? "highpass-platform-mvp:local", "-e", "fetch('http://hipass-control-api:3000/api/health',{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]],
  },
  {
    name: "API -> PostgreSQL",
    expected: "ALLOW",
    command: ["docker", ["compose", "exec", "-T", "hipass-control-api", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const body=await r.json(); process.exit(r.ok && body.database === 'UP' ? 0 : 1);}).catch(()=>process.exit(1));"]],
  },
  {
    name: "Gateway -> Orthanc mTLS proxy",
    expected: "ALLOW",
    command: ["docker", ["compose", "exec", "-T", "hipass-control-api", "/nodejs/bin/node", "-e", "const tls=require('node:tls'); const fs=require('node:fs'); const s=tls.connect({host:'hospital-a-orthanc-mtls',port:8443,ca:fs.readFileSync('/run/secrets/hipass_mtls_ca'),cert:fs.readFileSync('/run/secrets/hipass_gateway_client_cert'),key:fs.readFileSync('/run/secrets/hipass_gateway_client_key'),servername:'hospital-a-orthanc-mtls'},()=>{console.log('authorized='+s.authorized); process.exit(s.authorized?0:1);}); s.on('error',(e)=>{console.error(e.message); process.exit(1);}); setTimeout(()=>process.exit(2),3000);"]],
  },
];

const results = checks.map((check) => {
  const allowed = check.expected === "DENY" ? inspectIsolation(check.name) : run(check.command[0], check.command[1]);
  const pass = allowed === check.expected;
  return {
    name: check.name,
    expected: check.expected,
    actual: allowed,
    result: pass ? "PASS" : allowed === "ENVIRONMENT_ERROR" ? "NOT VERIFIED" : "FAIL",
    evidenceType: check.expected === "DENY" ? "NETWORK_TOPOLOGY_ONLY" : "TRANSPORT_PROBE",
  };
});

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(results.every((item) => item.result === "PASS") ? 0 : 1);

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "pipe", timeout: 30000, windowsHide: true });
    return "ALLOW";
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    // Only an explicit refused connection proves this transport was denied.
    // DNS/image/daemon/timeout errors never count as a policy DENY.
    if (error.status === 1 && /connection refused/i.test(output) && !/docker.*error|daemon|pull access denied/i.test(output)) return "DENY";
    return "ENVIRONMENT_ERROR";
  }
}

function inspectIsolation(name) {
  try {
    const source = JSON.parse(execFileSync("docker", ["inspect", process.env.HIPASS_VIEWER_CONTAINER ?? "hospital-b-viewer"], { encoding: "utf8", timeout: 10000, windowsHide: true }))[0];
    const targetName = name.includes("PostgreSQL") ? (process.env.HIPASS_POSTGRES_CONTAINER ?? "hipass-postgres") : (process.env.HIPASS_ORTHANC_CONTAINER ?? "hospital-a-orthanc");
    const target = JSON.parse(execFileSync("docker", ["inspect", targetName], { encoding: "utf8", timeout: 10000, windowsHide: true }))[0];
    if (!source.State.Running || !target.State.Running) return "ENVIRONMENT_ERROR";
    const shared = Object.keys(source.NetworkSettings.Networks).some((network) => network in target.NetworkSettings.Networks);
    const published = Object.values(target.NetworkSettings.Ports ?? {}).some((bindings) => bindings?.length);
    return !shared && !published ? "DENY" : "BOUNDARY_NOT_PROVEN";
  } catch { return "ENVIRONMENT_ERROR"; }
}
