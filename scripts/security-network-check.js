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
    command: ["docker", ["run", "--rm", "--network", `${networkPrefix}_frontend_net`, "alpine:3.20", "sh", "-lc", "nc -vz -w 3 hipass-control-api 3000"]],
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
  const allowed = run(check.command[0], check.command[1]);
  const pass = check.expected === "ALLOW" ? allowed : !allowed;
  return {
    name: check.name,
    expected: check.expected,
    actual: allowed ? "ALLOW" : "DENY",
    result: pass ? "PASS" : "FAIL",
  };
});

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(results.every((item) => item.result === "PASS") ? 0 : 1);

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
