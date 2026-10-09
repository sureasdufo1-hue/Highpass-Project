// Local isolated real Docker/PG gate. Not Azure deployment or external HTTPS proof.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const project = `hp-control-test-${Date.now()}`;
const directory = path.resolve("artifacts/azure", project);
const secrets = ["admin-password", "app-password", "token-secret", "test-auth-secret", "ingress-secret", "data-plane-secret"];
mkdirSync(directory, { recursive: true });
for (const name of secrets) writeFileSync(path.join(directory, name), randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
const env = { ...process.env, HIPASS_APP_IMAGE: "highpass-platform-mvp:capstone-20261008-dataplane",
  HIPASS_POSTGRES_IMAGE: process.env.HIPASS_POSTGRES_IMAGE ?? "postgres:16-alpine", HIPASS_CLOUD_SECRET_DIR: directory,
  HIPASS_CAPSTONE_PUBLIC_ORIGIN: "https://192.168.111.149:9443" };
const args = ["compose", "--project-directory", process.cwd(), "-p", project, "-f", "infra/azure/capstone-control.compose.yml"];
const run = (command, timeout = 15000) => execFileSync("docker", [...args, ...command], { env, timeout, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 262144 });
const checks = [];
let started = false;
try {
  const config = JSON.parse(run(["config", "--format", "json"]));
  if (Object.values(config.services).some(service => service.ports)) throw new Error("UNEXPECTED_PUBLIC_PORT");
  run(["up", "-d", "--wait", "--wait-timeout", "180"], 220000); started = true;
  const health = run(["exec", "-T", "control", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(3000)}).then(async r=>{console.log(r.status);process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"]);
  checks.push({ test: "CONTROL_REAL_PG_READINESS", status: health.trim() === "200" ? "PASS" : "FAIL" });
  const boundary = run(["exec", "-T", "control", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/dicomweb/studies',{signal:AbortSignal.timeout(3000)}).then(async r=>{console.log(r.status);process.exit(r.status===403?0:1)}).catch(()=>process.exit(1))"]);
  checks.push({ test: "CLOUD_IMAGE_ROUTE_DISABLED", status: boundary.trim() === "403" ? "PASS" : "FAIL" });
  const proof = run(["exec", "-T", "control", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/security/proof-policy',{signal:AbortSignal.timeout(3000)}).then(async r=>{const p=await r.json();console.log(JSON.stringify(p));process.exit(p.required&&p.replayScope==='SHARED_POSTGRES'?0:1)}).catch(()=>process.exit(1))"]);
  checks.push({ test: "PERSISTENT_STRICT_DPOP", status: "PASS", proof: JSON.parse(proof) });
  const role = run(["exec", "-T", "postgres", "psql", "-U", "hipass_bootstrap", "-d", "hipass", "-Atc", "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='hipass_app'"]);
  checks.push({ test: "APP_ROLE_LEAST_PRIVILEGE", status: role.trim() === "f" ? "PASS" : "FAIL" });
} catch {
  checks.push({ test: started ? "CONTROL_RUNTIME_GATE" : "CONTROL_STARTUP", status: "NOT VERIFIED", reason: "DOCKER_OR_SERVICE_CHECK_FAILED" });
  // Typed service inventory only; do not print logs containing bootstrap SQL/secrets.
  try { console.log(run(["ps", "--format", "json"])); } catch {}
} finally {
  try { run(["down", "--volumes", "--remove-orphans", "--timeout", "15"], 30000); checks.push({ test: "OWNED_TEST_PROJECT_CLEANUP", status: "PASS" }); }
  catch { checks.push({ test: "OWNED_TEST_PROJECT_CLEANUP", status: "FAIL" }); }
  for (const name of secrets) unlinkSync(path.join(directory, name));
}
const result = { scope: "LOCAL_ISOLATED_CLOUD_PROFILE_ONLY", review: "DRAFT / UNASSIGNED", checks,
  status: checks.every(check => check.status === "PASS") ? "PASS" : "NOT VERIFIED", azureDeployment: "NOT VERIFIED" };
writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ ...result, evidence: path.join(directory, "result.json") }));
process.exitCode = result.status === "PASS" ? 0 : 1;
