import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/postgres-store.js';
import { HipassService } from '../src/services.js';
import { createSeedData } from '../src/seed.js';
import { HCC_DATASET_ID, HCC_MANIFEST_SHA256, HCC_PATIENT_ID, HCC_STUDY_UID, hccCatalog, isHccCatalogCommitted, registerHccCatalog } from '../src/capstone-hcc-catalog.js';

const value = (Value, vr = 'LO') => ({ Value: [Value], vr });
function source({ missing = false, badSeries = false, badCount = false } = {}) {
  const study = hccCatalog('2026-10-10T00:00:00.000Z').studies[0];
  return {
    async qidoStudies(uid) {
      return { status: 200, body: missing ? [] : [{
        '0020000D': value(uid, 'UI'), '00100020': value(HCC_PATIENT_ID), '00100010': value('SYNTHETIC^HCC_TEST_001'),
        '00080020': value('20261010', 'DA'),
        '00081030': value('SYNTHETIC HCC MIMIC - NOT FOR CLINICAL USE'),
      }] };
    },
    async qidoSeries(uid) {
      return { status: 200, body: (badSeries ? study.series.slice(1) : study.series).map(row => ({
        '0020000D': value(uid, 'UI'), '0020000E': value(row.seriesInstanceUid, 'UI'), '00080060': value('CT', 'CS'),
        '0008103E': value(row.description),
      })) };
    },
    async qidoInstances(uid, seriesUid) {
      const record = study.series.find(row => row.seriesInstanceUid === seriesUid);
      const count = badCount ? record.instanceCount - 1 : record.instanceCount;
      return { status: 200, body: Array.from({ length: count }, (_, i) => ({
        '0020000D': value(uid, 'UI'), '0020000E': value(seriesUid, 'UI'), '00080018': value(`2.25.${i + 1}`, 'UI'),
      })) };
    },
  };
}
function fixture(sourceOptions) {
  const store = Object.create(PostgresStore.prototype), calls = [];
  store.data = createSeedData(); store.data.auditLogs = [];
  store.persistedData = structuredClone(store.data); store.saveQueue = Promise.resolve();
  store.client = { async query(sql) { calls.push(sql); return { rows: [] }; } };
  const service = new HipassService(store, () => '2026-10-10T12:00:00.000Z'); service.orthanc = source(sourceOptions);
  return { store, service, calls,
    principal: { role: 'SECURITY_ADMIN', hospitalId: 'HOSP-A', actorId: 'synthetic-source-admin' },
    input: { datasetId: HCC_DATASET_ID },
    env: { HIPASS_CAPSTONE_HCC_CATALOG: '1', HIPASS_CAPSTONE_MOCK_IDP: '1', HIPASS_CONTROL_PLANE_ONLY: '1', HIPASS_STORE: 'postgres', NODE_ENV: 'production', AUTH_MODE: 'TEST' },
  };
}

test('fixed synthetic HCC catalog requires exact live QIDO Study, four CT Series, and 720 instances before append', async () => {
  const f = fixture(), before = structuredClone(f.store.data);
  const result = await registerHccCatalog(f);
  assert.equal(result.studyCount, 1); assert.equal(result.seriesCount, 4); assert.equal(result.instanceCount, 720);
  assert.equal(result.sourceVerification, 'ORTHANC_QIDO_COUNTS_ONLY');
  assert.equal(result.manifestSha256, HCC_MANIFEST_SHA256); assert.equal(result.consentIssued, false);
  assert.equal(result.patientOwnership, 'NOT VERIFIED'); assert.equal(result.review, 'DRAFT / UNASSIGNED');
  assert.equal(isHccCatalogCommitted(f.store), true);
  assert.equal(f.service.listStudies(HCC_PATIENT_ID, { includeSeries: true })[0].series.length, 4);
  assert.equal(f.store.data.imagingStudies.filter(row => row.patientId !== HCC_PATIENT_ID).length,
    before.imagingStudies.length);
  assert.deepEqual(f.store.data.consents, before.consents);
  assert.deepEqual(f.store.data.dicomAccessTokenLogs, before.dicomAccessTokenLogs);
  assert.equal(f.service.verifyAuditIntegrity().ok, true);
  assert.ok(!f.calls.some(sql => /TRUNCATE|DELETE|UPDATE/i.test(sql)));
});

test('catalog does not register metadata when source Study, Series, or instance inventory is incomplete', async () => {
  for (const options of [{ missing: true }, { badSeries: true }, { badCount: true }]) {
    const f = fixture(options), before = structuredClone(f.store.data);
    await assert.rejects(registerHccCatalog(f), error => error.code === 'SOURCE_DATASET_NOT_READY');
    assert.deepEqual(f.store.data, before);
  }
});

test('catalog is opt-in, Hospital-A-admin-only, fixed-input-only, and refuses collisions', async () => {
  for (const change of [
    f => { f.env.HIPASS_CAPSTONE_HCC_CATALOG = '0'; },
    f => { f.principal.role = 'PATIENT'; },
    f => { f.principal.hospitalId = 'HOSP-B'; },
    f => { f.input.datasetId = 'OTHER'; },
    f => { f.store.data.imagingStudies.push({ ...hccCatalog('x').studies[0], description: 'FOREIGN' }); f.store.persistedData = structuredClone(f.store.data); },
  ]) {
    const f = fixture(); change(f); const before = structuredClone(f.store.data);
    await assert.rejects(registerHccCatalog(f)); assert.deepEqual(f.store.data, before);
  }
  const f = fixture(); f.service.orthanc = source({ missing: true });
  await assert.rejects(registerHccCatalog(f), error => error.code === 'SOURCE_DATASET_NOT_READY');
  assert.equal(f.store.data.imagingStudies.some(row => row.studyInstanceUid === HCC_STUDY_UID), false);
});

test('failed persistence never advertises the HCC profile as committed', async () => {
  const f = fixture();
  f.store.client.query = async sql => { if (/INSERT INTO patients/.test(sql)) throw new Error('DATABASE_UNAVAILABLE'); return { rows: [] }; };
  await assert.rejects(registerHccCatalog(f), /DATABASE_UNAVAILABLE/);
  assert.equal(isHccCatalogCommitted(f.store), false);
  assert.equal(f.service.listStudies(HCC_PATIENT_ID).length, 0);
  assert.equal(f.store.data.auditLogs.at(-1).result, 'REQUESTED');
});
