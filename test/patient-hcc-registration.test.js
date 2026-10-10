import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPatientHcc } from '../scripts/lib/patient-hcc-registration.js';
import { hccCatalog, HCC_DATASET_ID } from '../src/capstone-hcc-catalog.js';

const expected = hccCatalog('2026-10-10T00:00:00.000Z');
function fixture({ writer = false, existing = false, mismatch = false, seriesMismatch = false, seriesParentMismatch = false,
  inactive = false, auditFault = false, commitFault = false } = {}) {
  const calls = [];
  return { calls, query: async (text, values) => {
    calls.push({ text, values });
    if (text.includes('pg_stat_activity')) return { rows: [{ present: writer }] };
    if (text.includes('EXISTS(SELECT 1 FROM capstone_patient_accounts')) return { rows: [{ present: existing }] };
    if (text.startsWith('SELECT patient_id')) { const { createdAt, ...patient } = expected.patient; return { rows: [patient] }; }
    if (text.startsWith('SELECT status')) return { rows: [{ status: inactive ? 'SUSPENDED' : 'ACTIVE' }] };
    if (text.startsWith('SELECT study_id')) { const { series, ...study } = expected.studies.find(row => row.studyId === values[0]); return { rows: [{ ...study, patientId: mismatch ? 'OTHER' : study.patientId }] }; }
    if (text.startsWith('SELECT series_instance_uid')) return { rows: expected.studies[0].series.map(row => ({ ...row,
      studyInstanceUid: seriesParentMismatch ? 'OTHER' : expected.studies[0].studyInstanceUid,
      bytes: String(row.bytes), instanceCount: seriesMismatch ? row.instanceCount - 1 : row.instanceCount,
    })).sort((a, b) => a.seriesInstanceUid.localeCompare(b.seriesInstanceUid)) };
    if (text.includes('INSERT INTO audit_logs') && auditFault) throw new Error('SIMULATED_AUDIT_FAILURE');
    if (text === 'COMMIT' && commitFault) throw new Error('SIMULATED_CONNECTION_LOSS');
    return { rows: [] };
  } };
}

test('fixed HCC ownership registration defaults to rollback-only with no identity or audit inserts', async () => {
  const client = fixture(), result = await registerPatientHcc(client, { datasetId: HCC_DATASET_ID });
  assert.equal(result.status, 'READY'); assert.equal(result.applied, false);
  assert.equal(result.studyCount, 1); assert.equal(result.seriesCount, 4);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  assert.ok(!client.calls.some(row => row.text.includes('INSERT')));
});

test('unknown dataset, live writers, existing identity, or metadata mismatch fail closed', async () => {
  const arbitrary = fixture();
  await assert.rejects(registerPatientHcc(arbitrary, { datasetId: 'OTHER', apply: true }), /FIXED_DATASET_REQUIRED/);
  assert.equal(arbitrary.calls.length, 0);
  for (const options of [{ writer: true }, { existing: true }, { mismatch: true }, { seriesMismatch: true }, { seriesParentMismatch: true }, { inactive: true }]) {
    const client = fixture(options);
    await assert.rejects(registerPatientHcc(client, { datasetId: HCC_DATASET_ID, apply: true }), /PATIENT_REGISTRATION_/);
    assert.equal(client.calls.at(-1).text, 'ROLLBACK');
    assert.ok(!client.calls.some(row => row.text.includes('INSERT')));
  }
});

test('explicit apply creates one fixed synthetic account, one Study ownership ref, and one chained audit atomically', async () => {
  const client = fixture(), result = await registerPatientHcc(client, { datasetId: HCC_DATASET_ID, apply: true });
  assert.equal(result.status, 'PASS'); assert.equal(result.studyCount, 1); assert.equal(result.seriesCount, 4);
  assert.equal(result.review, 'DRAFT / UNASSIGNED'); assert.equal(client.calls.at(-1).text, 'COMMIT');
  const inserts = client.calls.filter(row => row.text.includes('INSERT'));
  assert.equal(inserts.length, 3);
  assert.ok(inserts.every(row => row.values?.length > 0));
  assert.ok(!client.calls.some(row => /DELETE|UPSERT|ON CONFLICT/.test(row.text)));
});

test('audit failure rolls back; uncertain commit requires reconciliation', async () => {
  const failed = fixture({ auditFault: true });
  await assert.rejects(registerPatientHcc(failed, { datasetId: HCC_DATASET_ID, apply: true }), /SIMULATED_AUDIT_FAILURE/);
  assert.equal(failed.calls.at(-1).text, 'ROLLBACK');
  const uncertain = fixture({ commitFault: true });
  await assert.rejects(registerPatientHcc(uncertain, { datasetId: HCC_DATASET_ID, apply: true }), /COMMIT_OUTCOME_UNKNOWN/);
});
