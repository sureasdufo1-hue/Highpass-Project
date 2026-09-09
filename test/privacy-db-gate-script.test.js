import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/privacy-db-gate.ps1", "utf8");

test("PF-0 DB gate waits for the final PostgreSQL server, not bootstrap readiness", () => {
  assert.match(script, /postgres:16-alpine@sha256:[a-f0-9]{64}/);
  assert.ok(script.includes("PostgreSQL init process complete; ready for start up\\."));
  assert.match(script, /startupTimeoutSeconds = 90/);
  assert.match(script, /SELECT 1/);
  assert.doesNotMatch(script, /foreach \(\$attempt in 1\.\.30\)/);
});

test("PF-0 DB gate checks every SQL migration and always removes its temporary container", () => {
  assert.match(script, /Invoke-PrivacySqlScript 'db\/migrations\/001_highpass_mobile_core\.sql'/);
  assert.match(script, /Invoke-PrivacySqlScript 'db\/migrations\/003_privacy_pf0_contract\.sql'/);
  assert.match(script, /Invoke-PrivacySqlScript 'test\/sql\/privacy_pf0_rls_gate\.sql'/);
  assert.match(script, /finally\s*\{[\s\S]*docker rm -f \$container/);
});
