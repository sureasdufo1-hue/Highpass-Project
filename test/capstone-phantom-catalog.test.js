import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/postgres-store.js';
import { HipassService } from '../src/services.js';
import { createSeedData } from '../src/seed.js';
import { phantomCatalog, registerPhantomCatalog, isPhantomCatalogCommitted, PHANTOM_DATASET_ID, PHANTOM_PATIENT_ID } from '../src/capstone-phantom-catalog.js';

function fixture() {
  const store = Object.create(PostgresStore.prototype), statements = [];
  store.data = createSeedData(); store.data.auditLogs = [];
  store.persistedData = structuredClone(store.data); store.saveQueue = Promise.resolve();
  store.client = { async query(sql) { statements.push(sql); return { rows: [] }; } };
  const service = new HipassService(store, () => '2026-10-09T07:30:00.000Z');
  return { store, service, statements, principal: { role: 'SECURITY_ADMIN', hospitalId: 'HOSP-A', actorId: 'synthetic-source-admin' }, input: { datasetId: PHANTOM_DATASET_ID }, env: { HIPASS_CAPSTONE_PHANTOM_CATALOG: '1', HIPASS_CAPSTONE_MOCK_IDP: '1', HIPASS_CONTROL_PLANE_ONLY: '1', HIPASS_STORE: 'postgres', NODE_ENV: 'production', AUTH_MODE: 'TEST' } };
}

test('fixed phantom registration appends a separate patient and 2x12 catalog with chained audit, without consent or access tokens', async () => {
  const f = fixture(), before = structuredClone(f.store.data);
  const result = await registerPhantomCatalog(f);
  assert.equal(result.addedStudies, 2); assert.equal(result.instanceCount, 24);
  assert.equal(result.consentIssued, false); assert.equal(result.sourceLiveVerification, 'NOT VERIFIED');
  assert.equal(isPhantomCatalogCommitted(f.store), true);
  assert.equal(f.service.listStudies(PHANTOM_PATIENT_ID).length, 2);
  assert.deepEqual(f.service.listStudies('P-1001'), before.imagingStudies.filter(row => row.patientId === 'P-1001').map(({ series, ...row }) => row));
  assert.deepEqual(f.store.data.consents, before.consents); assert.deepEqual(f.store.data.dicomAccessTokenLogs, before.dicomAccessTokenLogs);
  assert.equal(f.store.data.auditLogs.at(-1).actorId, f.principal.actorId);
  assert.equal(f.service.verifyAuditIntegrity().ok, true);
  assert.ok(!f.statements.some(sql => /TRUNCATE|DELETE|UPDATE/i.test(sql)));
  assert.ok(!JSON.stringify(result).includes('DICM'));
});

test('registration is idempotent after database Series rows gain parent identifiers and property order changes', async () => {
  const f = fixture(); await registerPhantomCatalog(f);
  for (const row of f.store.data.imagingStudies.filter(row => row.patientId === PHANTOM_PATIENT_ID)) row.series[0] = { studyInstanceUid: row.studyInstanceUid, ...row.series[0] };
  f.store.persistedData = structuredClone(f.store.data);
  const result = await registerPhantomCatalog(f);
  assert.equal(result.addedStudies, 0); assert.equal(f.store.data.patients.filter(row => row.patientId === PHANTOM_PATIENT_ID).length, 1);
});

test('disabled profile, patient/doctor/foreign admin, arbitrary input and catalog collision deny without adding rows', async () => {
  for (const change of [f => { f.env.HIPASS_CAPSTONE_PHANTOM_CATALOG = '0'; }, f => { f.principal.role = 'PATIENT'; }, f => { f.principal.role = 'DOCTOR'; }, f => { f.principal.hospitalId = 'HOSP-B'; }, f => { f.input.patientId = 'P-1001'; }, f => { f.input.datasetId = 'foreign'; }, f => { f.store.data.imagingStudies[0].studyInstanceUid = phantomCatalog('x').studies[0].studyInstanceUid; f.store.persistedData = structuredClone(f.store.data); }]) {
    const f = fixture(); change(f); const before = structuredClone(f.store.data);
    await assert.rejects(registerPhantomCatalog(f)); assert.deepEqual(f.store.data, before);
  }
});

test('failed transaction never marks phantom identity committed or grants a patient profile', async () => {
  const f = fixture(); f.store.client.query = async sql => { if (/INSERT INTO patients/.test(sql)) throw new Error('DATABASE_UNAVAILABLE'); return { rows: [] }; };
  await assert.rejects(registerPhantomCatalog(f), /DATABASE_UNAVAILABLE/);
  assert.equal(isPhantomCatalogCommitted(f.store), false);
  assert.equal(f.service.listStudies(PHANTOM_PATIENT_ID).length, 0);
  assert.equal(f.store.data.patients.some(row => row.patientId === PHANTOM_PATIENT_ID), false);
  assert.equal(f.store.data.auditLogs.at(-1).result, 'REQUESTED');
  assert.equal(f.service.verifyAuditIntegrity().ok, true);
});
