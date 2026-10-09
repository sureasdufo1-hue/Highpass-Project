import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/postgres-store.js';
import { HipassService } from '../src/services.js';
import { registerPhantomCatalog, isPhantomCatalogCommitted, PHANTOM_DATASET_ID, PHANTOM_PATIENT_ID } from '../src/capstone-phantom-catalog.js';
import { startOwnedPostgresFixture, removeOwnedPostgresFixture } from './test-support/owned-postgres-start.js';

const owner = randomUUID(), name = `hp-v3-phantom-catalog-${owner}`;
const docker = (args, timeout) => spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 1048576 });
const fixture = { owner, name, label: 'highpass.validation.phantom-catalog', password: randomBytes(32).toString('hex'), docker };
const checks = [];
const env = { HIPASS_CAPSTONE_PHANTOM_CATALOG: '1', HIPASS_CAPSTONE_MOCK_IDP: '1', HIPASS_CONTROL_PLANE_ONLY: '1', HIPASS_STORE: 'postgres', NODE_ENV: 'production', AUTH_MODE: 'TEST' };
const principal = { role: 'SECURITY_ADMIN', hospitalId: 'HOSP-A', actorId: 'synthetic-source-admin' };
let store, owned = false, phase = 'OWNED_POSTGRES_START';
try {
  const start = startOwnedPostgresFixture(fixture); owned = start.owned;
  if (!owned || !start.running) throw new Error('OWNED_POSTGRES_START_NOT_VERIFIED');
  const until = Date.now() + 20000;
  let ready = false;
  while (Date.now() < until) {
    // The image's temporary init server accepts Unix sockets before the final
    // TCP server starts. Require TCP readiness to avoid a false ready signal.
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], 3000).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('POSTGRES_READINESS_TIMEOUT');
  const port = docker(['port', name, '5432/tcp'], 5000);
  if (port.status !== 0 || !/^127\.0\.0\.1:[0-9]+\s*$/.test(port.stdout)) throw new Error('LOOPBACK_PORT_NOT_VERIFIED');
  const connection = `postgres://postgres:${fixture.password}@${port.stdout.trim()}/postgres`;
  store = new PostgresStore(connection); await store.load();
  const baseline = structuredClone(store.persistedData);
  const queries = [], query = store.client.query.bind(store.client);
  store.client.query = (...args) => { queries.push(typeof args[0] === 'string' ? args[0] : args[0].text); return query(...args); };
  const service = new HipassService(store);
  phase = 'CATALOG_REGISTRATION';
  const receipt = await registerPhantomCatalog({ store, service, principal, input: { datasetId: PHANTOM_DATASET_ID }, env });
  assert.equal(receipt.registrationCommitAcknowledged, true);
  assert.ok(!queries.some(sql => /TRUNCATE|DELETE|UPDATE/i.test(sql)));
  assert.deepEqual(store.persistedData.patients.slice(0, baseline.patients.length), baseline.patients);
  assert.deepEqual(store.persistedData.imagingStudies.slice(0, baseline.imagingStudies.length), baseline.imagingStudies);
  assert.deepEqual(store.persistedData.consents, baseline.consents);
  checks.push({ test: 'REAL_POSTGRES_ADDITIVE_CATALOG_AND_PRIOR_RECORDS', status: 'PASS' });
  await store.close(); store = new PostgresStore(connection); await store.load();
  const restarted = new HipassService(store);
  phase = 'COMMITTED_CATALOG_AFTER_RESTART';
  const synthetic = store.persistedData.patients.find(row => row.patientId === PHANTOM_PATIENT_ID);
  if (synthetic?.birthDate !== '1970-01-01' || store.persistedData.imagingStudies.filter(row => row.patientId === PHANTOM_PATIENT_ID).some(row => row.studyDate !== '2026-10-09')) {
    phase = 'DATE_ONLY_FIELDS_SHIFTED_AFTER_DATABASE_READ';
  }
  assert.equal(isPhantomCatalogCommitted(store), true);
  phase = 'STUDY_SERIES_AFTER_RESTART';
  assert.equal(restarted.listStudies(PHANTOM_PATIENT_ID).length, 2);
  assert.ok(restarted.listStudies(PHANTOM_PATIENT_ID, { includeSeries: true }).every(row => row.series.length === 1 && row.series[0].instanceCount === 12));
  phase = 'AUDIT_CHAIN_AFTER_RESTART';
  assert.equal(restarted.verifyAuditIntegrity().ok, true);
  phase = 'CROSS_PATIENT_DENIAL';
  await assert.rejects(restarted.recordPatientSelfView('P-1001', restarted.listStudies(PHANTOM_PATIENT_ID)[0].studyInstanceUid), /not found/i);
  phase = 'REGISTRATION_IDEMPOTENCE_AFTER_RESTART';
  const second = await registerPhantomCatalog({ service: restarted, principal, input: { datasetId: PHANTOM_DATASET_ID }, env });
  assert.equal(second.addedStudies, 0);
  assert.equal(restarted.verifyAuditIntegrity().ok, true);
  checks.push({ test: 'RESTART_IDEMPOTENCE_AND_AUDIT_CHAIN', status: 'PASS' });
} catch (error) {
  checks.push({ test: phase, status: 'NOT VERIFIED', reason: error.code ?? error.name });
} finally {
  if (store) { try { await store.close(); } catch { checks.push({ test: 'DATABASE_CONNECTION_CLOSE', status: 'NOT VERIFIED' }); } }
  const cleanup = removeOwnedPostgresFixture(fixture);
  checks.push({ test: 'EXACT_OWNED_FIXTURE_CLEANUP', status: cleanup.absent && (!owned || cleanup.owned) ? 'PASS' : 'NOT VERIFIED' });
  fixture.password = null;
}
const result = { scope: 'ISOLATED_POSTGRES_PHANTOM_CATALOG_NOT_VM_PACS_OR_VIEWER_E2E', review: 'DRAFT / UNASSIGNED', checks, status: checks.length === 3 && checks.every(row => row.status === 'PASS') ? 'PASS' : 'NOT VERIFIED' };
const directory = path.resolve('artifacts/workstation', `phantom-catalog-postgres-${Date.now()}`);
mkdirSync(directory, { recursive: true }); writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: path.join(directory, 'result.json') }, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
