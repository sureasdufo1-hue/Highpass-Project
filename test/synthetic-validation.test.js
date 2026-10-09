import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("independent validation uses fresh names, credentials, ports and never deletes existing volumes", () => {
  const compose = readFileSync("docker-compose.validation.yml", "utf8");
  const runner = readFileSync("scripts/synthetic-validation.js", "utf8");
  assert.equal((compose.match(/container_name: \$\{HIPASS_VALIDATION_PREFIX:\?/g) ?? []).length, 7);
  assert.ok(!compose.includes("external: true"));
  assert.match(runner, /const project = `hp-validation-\$\{runId\}`/);
  assert.match(runner, /randomBytes\(32\)/);
  assert.match(runner, /await freePort\(\)/);
  assert.match(runner, /HIPASS_E2E_API_CONTAINER: `\$\{project\}-api`/);
  assert.ok(!runner.includes('["compose", "down", "-v"'));
  assert.match(runner, /replaceAll\(secret, "\[REDACTED\]"\)/);
  const base = readFileSync("docker-compose.yml", "utf8");
  assert.match(base, /pg_isready -h 127\.0\.0\.1 -t 3/);
  assert.match(base, /start_period: 90s/);
  assert.match(runner, /required\.every\(\(service\) => rows\.some\(\(row\) => row\.Service === service/);
  const edge = readFileSync("scripts/edge-proxy.js", "utf8");
  assert.match(edge, /request\.setTimeout\(40000/);
  assert.match(edge, /UPSTREAM_TIMEOUT.*50000/);
  assert.match(readFileSync("scripts/dpop-https-check.js", "utf8"), /AbortSignal\.timeout\(55000\)/);
});

test("runtime upgrade stays nonroot, Node 24, digest-pinned and preserves TLS verification", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}/);
  assert.match(dockerfile, /pnpm install --prod --frozen-lockfile/);
  const probe = readFileSync("scripts/ops-mtls-client-check.js", "utf8");
  assert.match(probe, /rejectUnauthorized: true/);
  const gate = readFileSync("scripts/mtls-negative-check.js", "utf8");
  assert.match(gate, /item\.remotePort === client\?\.localPort/);
  assert.match(gate, /TLS_CLIENT_REJECTED/);
  assert.match(gate, /return "ENVIRONMENT_ERROR"/);
});
