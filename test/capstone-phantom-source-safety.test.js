import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const probe = readFileSync(new URL('../scripts/test-support/capstone-phantom-source-probe.js', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../scripts/capstone-phantom-source-ops.py', import.meta.url), 'utf8');

test('source seeding prechecks every UID/hash before upload; verify-only fails before mutation', () => {
  assert.ok(probe.indexOf('SOURCE_EXISTING_UID_CONFLICT') < probe.indexOf('if (!exists)'));
  assert.ok(probe.indexOf('SOURCE_VERIFY_ONLY_MISSING_INSTANCE') < probe.indexOf('if (!exists)'));
  assert.match(probe, /hash\(bytes\) !== entry\.sha256/);
  assert.match(probe, /before\.some\(id => !after\.includes\(id\)\)/);
  assert.doesNotMatch(probe, /method:\s*['"]DELETE['"]|rejectUnauthorized:\s*false/);
});

test('source probe uses strict mTLS and explicit rendering negotiation, own-host credentials and bounded cleanup', () => {
  assert.match(probe, /servername: 'hospital-a-orthanc-mtls'/);
  assert.match(probe, /headers: \{ accept: pathname\.endsWith\('\/rendered'\) \? 'image\/png'/);
  assert.match(probe, /SOURCE_PROBE_DEADLINE/);
  assert.match(ops, /paramiko\.RejectPolicy\(\)/);
  assert.match(ops, /--network hp-capstone-hospital-a_pacs_private/);
  assert.match(ops, /capstone-a-gateway-secrets:\/run\/pacs:ro/);
  assert.match(ops, /highpass\.phantom-stage/);
  assert.match(ops, /credential = None/);
  assert.doesNotMatch(ops, /sftp\.get\(|StrictHostKeyChecking=no|--insecure|docker (prune|compose down)/);
});
