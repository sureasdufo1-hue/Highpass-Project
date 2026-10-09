import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStore } from "../src/postgres-store.js";
import { createSeedData } from "../src/seed.js";
import { spawnSync } from 'node:child_process';

const audit = id => ({ auditId: id, reasonCode: "SYNTHETIC" });
function storeFixture() {
  const store = Object.create(PostgresStore.prototype);
  store.data = createSeedData();
  store.data.auditLogs = [];
  store.persistedData = structuredClone(store.data);
  store.saveQueue = Promise.resolve();
  return store;
}

test("append save baseline contains only committed snapshot, never concurrent audit additions", async () => {
  const store = storeFixture(), committed = [];
  store.data.auditLogs.push(audit("first"));
  store.saveAppendOnly = async changes => {
    committed.push(...structuredClone(changes.auditLogs));
    if (committed.length === 1) {
      await Promise.resolve();
      store.data.auditLogs.push(audit("concurrent"));
    }
  };
  await store.save();
  assert.deepEqual(store.persistedData.auditLogs.map(row => row.auditId), ["first"]);
  store.data.auditLogs.push(audit("third"));
  await store.save();
  assert.deepEqual(committed.map(row => row.auditId), ["first", "concurrent", "third"]);
});

test("append save snapshot is detached from mutable records during database latency", async () => {
  const store = storeFixture();
  store.data.auditLogs.push(audit("first"));
  let committed;
  store.saveAppendOnly = async changes => {
    store.data.auditLogs[0].reasonCode = "LATER_CHANGE";
    await Promise.resolve();
    committed = structuredClone(changes.auditLogs);
  };
  await store.save();
  assert.equal(committed[0].reasonCode, "SYNTHETIC");
  assert.equal(store.persistedData.auditLogs[0].reasonCode, "SYNTHETIC");
  assert.equal(store.data.auditLogs[0].reasonCode, "LATER_CHANGE");
});

test("full save captures one snapshot and leaves concurrently appended audit for the next commit", async () => {
  const store = storeFixture(), committed = [];
  store.persistedData = null;
  store.client = { async query() { return { rows: [] }; } };
  for (const method of ["insertHospitals", "insertGateways", "insertDoctors", "insertStudies", "insertConsents", "insertConsentScopes", "insertTransferRequests", "insertTransferTickets", "insertTokenLogs", "insertTransferUsageLogs", "insertResearchExportRequests", "insertPseudonymMappings"]) store[method] = async () => {};
  store.insertPatients = async () => {
    await Promise.resolve();
    store.data.auditLogs.push(audit("during-full-save"));
  };
  store.insertAuditLogs = async rows => committed.push(...structuredClone(rows));
  await store.save();
  assert.deepEqual(committed, []);
  assert.deepEqual(store.persistedData.auditLogs, []);
  store.saveAppendOnly = async changes => committed.push(...structuredClone(changes.auditLogs));
  await store.save();
  assert.deepEqual(committed.map(row => row.auditId), ["during-full-save"]);
});

test("new patient and nested Study/Series use append inserts without truncating existing records", async () => {
  const store = storeFixture(), statements = [];
  const before = structuredClone(store.data);
  store.data.patients.push({ patientId: 'HP-TEST-PHANTOM-001', name: 'Synthetic phantom', birthDate: '1970-01-01', phone: null, createdAt: '2026-10-09T00:00:00.000Z' });
  store.data.imagingStudies.push({ studyId: 'SYNTHETIC-PHANTOM-CT', patientId: 'HP-TEST-PHANTOM-001', sourceHospitalId: 'HOSP-A', studyInstanceUid: '1.2.3.4.5', modality: 'CT', bodyPart: 'PHANTOM', studyDate: '2026-10-09', description: 'Synthetic', metadataOnly: true, series: [{ seriesInstanceUid: '1.2.3.4.5.1', modality: 'CT', description: 'Synthetic series', instanceCount: 12, bytes: 120, previewImageUrl: null }] });
  store.client = { async query(sql, parameters) { statements.push({ sql, parameters }); return { rows: [] }; } };
  await store.save();
  assert.equal(statements[0].sql, 'BEGIN');
  assert.equal(statements.at(-1).sql, 'COMMIT');
  assert.ok(!statements.some(row => /TRUNCATE|DELETE|UPDATE/i.test(row.sql)));
  assert.deepEqual(statements.filter(row => /INSERT INTO/i.test(row.sql)).map(row => row.sql.match(/INSERT INTO (\w+)/i)[1]), ['patients', 'imaging_studies', 'imaging_series']);
  assert.deepEqual(store.persistedData.patients.slice(0, before.patients.length), before.patients);
  assert.deepEqual(store.persistedData.imagingStudies.slice(0, before.imagingStudies.length), before.imagingStudies);
});

test("catalog append failure rolls back and never advances the committed snapshot", async () => {
  const store = storeFixture(), statements = [];
  const before = structuredClone(store.persistedData);
  store.data.patients.push({ patientId: 'HP-TEST-PHANTOM-001', name: 'Synthetic', birthDate: '1970-01-01', phone: null, createdAt: '2026-10-09T00:00:00.000Z' });
  store.client = { async query(sql) { statements.push(sql); if (/INSERT INTO patients/.test(sql)) throw new Error('SYNTHETIC_DB_FAILURE'); return { rows: [] }; } };
  await assert.rejects(store.save(), /SYNTHETIC_DB_FAILURE/);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.deepEqual(store.persistedData, before);
});

test("existing patient or nested Series mutation is never classified as a catalog append", () => {
  for (const mutate of [store => { store.data.patients[0].name = 'changed'; }, store => { store.data.imagingStudies[0].series[0].instanceCount++; }]) {
    const store = storeFixture(); mutate(store);
    assert.equal(store.appendOnlyChanges(), null);
  }
});

test('Postgres DATE calendar values survive read mapping in Korean and UTC timezones', () => {
  const program = `import {PostgresStore} from './src/postgres-store.js'; import pg from 'pg'; const store=Object.create(PostgresStore.prototype);store.client={query:async()=>({rows:[{patient_id:'synthetic',name:'Synthetic',birth_date:pg.types.getTypeParser(1082)('1970-01-01'),created_at:new Date('2026-10-09T00:00:00Z')}]})}; console.log(JSON.stringify((await store.readTable('patients'))[0]));`;
  for (const timezone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 0);
    const row = JSON.parse(run.stdout);
    assert.equal(row.birthDate, '1970-01-01');
    assert.equal(row.createdAt, '2026-10-09T00:00:00.000Z');
  }
});
