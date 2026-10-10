import test from 'node:test';
import assert from 'node:assert/strict';
import { retireCapstonePatients, LEGACY_DEMO_PATIENT_IDS } from '../scripts/lib/retire-capstone-patients.js';

function fixture({ writers = false, ready = true, unknown = false, auditFailure = false, commitFailure = false } = {}) {
  const calls = [];
  return { calls, async query(text, values) {
    calls.push({ text, values });
    if (text.includes('pg_stat_activity')) return { rows: [{ present: writers }] };
    if (text.startsWith('SELECT a.subject')) return { rows: ready ? [{ subject: 'synthetic-hcc-account' }] : [] };
    if (text.includes("patient_id<>ALL")) return { rows: [{ present: unknown }] };
    if (text.startsWith('SELECT subject,patient_id')) return { rows: [{ subject: 'synthetic-account-a', patient_id: 'P-1001', status: 'ACTIVE' }] };
    if (text.startsWith('SELECT consent_id,patient_id')) return { rows: [{ consent_id: 'C-OLD', patient_id: 'P-1001', status: 'ACTIVE' }] };
    if (text.startsWith('SELECT ticket_id,patient_id')) return { rows: [{ ticket_id: 'T-OLD', consent_id: 'C-OLD', patient_id: 'P-1001', status: 'ISSUED' }] };
    if (text.includes('INSERT INTO audit_logs') && auditFailure) throw new Error('AUDIT_FAILED');
    if (text === 'COMMIT' && commitFailure) throw new Error('CONNECTION_LOST');
    return { rows: [] };
  } };
}

test('legacy retirement preflight is rollback-only and contains no bearer tokens or QR nonces', async () => {
  const client = fixture(), result = await retireCapstonePatients(client);
  assert.equal(result.status, 'READY'); assert.equal(result.applied, false);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  assert.ok(!client.calls.some(row => /^(UPDATE|INSERT|DELETE)/.test(row.text)));
  for (const row of client.calls.filter(row => row.text.startsWith('SELECT ') && /token|ticket/.test(row.text))) {
    assert.doesNotMatch(row.text, /SELECT (?:\*|token,|nonce_hash)/);
  }
});

test('retirement requires a ready main patient, no active writers, and no unknown active identities', async () => {
  for (const options of [{ writers: true }, { ready: false }, { unknown: true }]) {
    const client = fixture(options);
    await assert.rejects(retireCapstonePatients(client, { apply: true }), /SCENARIO_RESET_/);
    assert.equal(client.calls.at(-1).text, 'ROLLBACK');
    assert.ok(!client.calls.some(row => row.text.startsWith('UPDATE')));
  }
});

test('no live state is changed until a durable backup hash is acknowledged', async () => {
  for (const backup of [undefined, async () => ({}), async () => { throw new Error('BACKUP_UNAVAILABLE'); }]) {
    const client = fixture();
    await assert.rejects(retireCapstonePatients(client, { apply: true, backup }));
    assert.ok(!client.calls.some(row => row.text.startsWith('UPDATE')));
    assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  }
});

test('fixed legacy accounts, ownership, grants, consent, tokens, tickets and requests retire with chained audit; no rows are deleted', async () => {
  const client = fixture(); let snapshot;
  const result = await retireCapstonePatients(client, { apply: true, backup: async value => { snapshot = value; return { sha256: 'a'.repeat(64) }; } });
  assert.equal(result.applied, true); assert.equal(snapshot.scope, 'FIXED_SYNTHETIC_PATIENT_BASELINE_ONLY');
  assert.deepEqual(result.retiredPatientIds, LEGACY_DEMO_PATIENT_IDS);
  assert.equal(client.calls.filter(row => row.text.startsWith('UPDATE')).length, 7);
  assert.equal(client.calls.filter(row => row.text.startsWith('INSERT INTO audit_logs')).length, 3);
  assert.equal(client.calls.at(-1).text, 'COMMIT');
  assert.ok(!client.calls.some(row => /DELETE FROM|TRUNCATE/.test(row.text)));
  for (const row of client.calls.filter(row => row.text.startsWith('UPDATE'))) assert.ok(row.values.includes(LEGACY_DEMO_PATIENT_IDS) || row.values.includes('P-1001'));
});

test('audit failure rolls back and an ambiguous COMMIT is reported for reconciliation', async () => {
  const options = { apply: true, backup: async () => ({ sha256: 'b'.repeat(64) }) };
  const failed = fixture({ auditFailure: true }); await assert.rejects(retireCapstonePatients(failed, options), /AUDIT_FAILED/);
  assert.equal(failed.calls.at(-1).text, 'ROLLBACK');
  const uncertain = fixture({ commitFailure: true });
  await assert.rejects(retireCapstonePatients(uncertain, options), /SCENARIO_RESET_COMMIT_OUTCOME_UNKNOWN/);
});
