import { randomUUID } from 'node:crypto';
import { HCC_PATIENT_ID, HCC_PATIENT_SUBJECT, HCC_STUDY_UID } from '../../src/capstone-hcc-catalog.js';
import { PostgresStore } from '../../src/postgres-store.js';
import { HipassService, buildAuditLog } from '../../src/services.js';

export const LEGACY_DEMO_PATIENT_IDS = Object.freeze(['P-1001', 'P-1002', 'P-1003', 'HP-TEST-PHANTOM-001']);

// Preserve patient/Study history and audit. Retire only the listed synthetic
// profiles and their live capabilities after the main patient's ownership exists.
export async function retireCapstonePatients(client, { apply = false, backup, clock = Date.now } = {}) {
  let committing = false;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL search_path=public,pg_catalog");
    await client.query('SELECT pg_advisory_xact_lock(736104, 35)');
    await client.query('LOCK TABLE patients,imaging_studies,consents,transfer_requests,transfer_tickets,dicom_access_token_logs,capstone_patient_accounts,capstone_patient_ownership_refs,capstone_patient_self_view_grants,audit_logs IN SHARE ROW EXCLUSIVE MODE');
    const writers = (await client.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND usename IN ('hipass_app','hipass_patient_authority','hipass_bootstrap')) AS present")).rows[0];
    if (writers?.present !== false) throw new Error('SCENARIO_RESET_WRITERS_MUST_STOP');
    const ready = (await client.query(`SELECT a.subject FROM capstone_patient_accounts a
      JOIN capstone_patient_ownership_refs r ON r.subject=a.subject AND r.patient_id=a.patient_id
      JOIN imaging_studies s ON s.patient_id=r.patient_id AND s.study_instance_uid=r.study_instance_uid
      JOIN patients p ON p.patient_id=s.patient_id
      WHERE a.subject=$1 AND a.patient_id=$2 AND r.study_instance_uid=$3
        AND a.status='ACTIVE' AND a.evidence_kind='CAPSTONE_MOCK_IDP' AND r.status='ACTIVE'
        AND r.source_hospital_id='HOSP-A' AND s.source_hospital_id='HOSP-A'
        AND p.name='홍길동 (합성 환자)' AND p.birth_date='1970-01-01'`, [HCC_PATIENT_SUBJECT, HCC_PATIENT_ID, HCC_STUDY_UID])).rows;
    if (ready.length !== 1) throw new Error('SCENARIO_RESET_MAIN_PATIENT_NOT_READY');
    const unknown = (await client.query(`SELECT EXISTS(SELECT 1 FROM capstone_patient_accounts
      WHERE status='ACTIVE' AND (evidence_kind<>'CAPSTONE_MOCK_IDP' OR patient_id<>ALL($1::text[]))) AS present`,
    [[...LEGACY_DEMO_PATIENT_IDS, HCC_PATIENT_ID]])).rows[0];
    if (unknown?.present !== false) throw new Error('SCENARIO_RESET_UNKNOWN_ACTIVE_ACCOUNT');
    const snapshot = { scope: 'FIXED_SYNTHETIC_PATIENT_BASELINE_ONLY', mainPatientId: HCC_PATIENT_ID, createdAt: new Date(clock()).toISOString() };
    const queries = {
      accounts: 'SELECT subject,patient_id,evidence_kind,status,revision FROM capstone_patient_accounts WHERE patient_id=ANY($1::text[])',
      ownership: 'SELECT ref_id,subject,patient_id,study_instance_uid,source_hospital_id,status,version FROM capstone_patient_ownership_refs WHERE patient_id=ANY($1::text[])',
      consents: 'SELECT consent_id,patient_id,status,updated_at,revoked_at FROM consents WHERE patient_id=ANY($1::text[])',
      grants: 'SELECT grant_id,patient_id,status FROM capstone_patient_self_view_grants WHERE patient_id=ANY($1::text[])',
      tokens: 'SELECT token_id,consent_id,status FROM dicom_access_token_logs WHERE consent_id IN (SELECT consent_id FROM consents WHERE patient_id=ANY($1::text[]))',
      tickets: 'SELECT ticket_id,patient_id,consent_id,status,revoked_at FROM transfer_tickets WHERE patient_id=ANY($1::text[])',
      requests: 'SELECT request_id,patient_id,status,updated_at FROM transfer_requests WHERE patient_id=ANY($1::text[])',
    };
    for (const [key, query] of Object.entries(queries)) snapshot[key] = (await client.query(query, [LEGACY_DEMO_PATIENT_IDS])).rows;
    await client.query('SELECT public.capstone_patient_lock_audit()');
    const chain = await PostgresStore.prototype.readTable.call({ client }, 'auditLogs');
    if (!HipassService.prototype.verifyAuditIntegrity.call({ store: { get: () => chain } }).ok) throw new Error('SCENARIO_RESET_AUDIT_INVALID');
    if (!apply) {
      await client.query('ROLLBACK');
      return { applied: false, status: 'READY', snapshot, review: 'DRAFT / UNASSIGNED' };
    }
    const receipt = await backup?.(snapshot);
    if (!/^[a-f0-9]{64}$/.test(receipt?.sha256 ?? '')) throw new Error('SCENARIO_RESET_BACKUP_REQUIRED');
    const now = new Date(clock()).toISOString();
    for (const account of snapshot.accounts) if (account.status === 'ACTIVE') {
      await client.query("UPDATE capstone_patient_accounts SET status='SUSPENDED',revision=$1 WHERE subject=$2 AND patient_id=$3 AND status='ACTIVE'", [randomUUID(), account.subject, account.patient_id]);
    }
    await client.query("UPDATE capstone_patient_ownership_refs SET status='REVOKED',version=version+1 WHERE patient_id=ANY($1::text[]) AND status='ACTIVE'", [LEGACY_DEMO_PATIENT_IDS]);
    await client.query("UPDATE capstone_patient_self_view_grants SET status='REVOKED' WHERE patient_id=ANY($1::text[]) AND status='ACTIVE'", [LEGACY_DEMO_PATIENT_IDS]);
    await client.query("UPDATE consents SET status='REVOKED',updated_at=$2,revoked_at=$2 WHERE patient_id=ANY($1::text[]) AND status IN ('ACTIVE','PENDING')", [LEGACY_DEMO_PATIENT_IDS, now]);
    await client.query("UPDATE dicom_access_token_logs SET status='REVOKED' WHERE status='ACTIVE' AND consent_id IN (SELECT consent_id FROM consents WHERE patient_id=ANY($1::text[]))", [LEGACY_DEMO_PATIENT_IDS]);
    await client.query("UPDATE transfer_tickets SET status='REVOKED',revoked_at=$2 WHERE patient_id=ANY($1::text[]) AND status='ISSUED'", [LEGACY_DEMO_PATIENT_IDS, now]);
    await client.query("UPDATE transfer_requests SET status='REVOKED',updated_at=$2 WHERE patient_id=ANY($1::text[]) AND status IN ('PENDING_CONSENT','TICKET_ISSUED')", [LEGACY_DEMO_PATIENT_IDS, now]);
    const events = [
      ...snapshot.consents.filter(row => ['ACTIVE', 'PENDING'].includes(row.status)).map(row => ({ action: 'CONSENT_REVOKED', patientId: row.patient_id, consentId: row.consent_id })),
      ...snapshot.tickets.filter(row => row.status === 'ISSUED').map(row => ({ action: 'TICKET_REVOKED', patientId: row.patient_id, consentId: row.consent_id, ticketId: row.ticket_id })),
      { action: 'SYNTHETIC_PATIENT_BASELINE_RESET', patientId: HCC_PATIENT_ID },
    ];
    const logs = [];
    for (const event of events) logs.push(buildAuditLog({ ...event, actorType: 'SYSTEM', actorId: 'capstone-offline-scenario-operator',
      result: 'SUCCESS', reasonCode: 'DEMO_MAIN_SCENARIO_RESET' },
    logs.at(-1)?.recordHash ?? chain.at(-1)?.recordHash ?? null, now, randomUUID()));
    await PostgresStore.prototype.insertAuditLogs.call({}, logs, client);
    committing = true; await client.query('COMMIT');
    return { status: 'PASS', applied: true, backupSha256: receipt.sha256, mainPatientId: HCC_PATIENT_ID,
      retiredPatientIds: LEGACY_DEMO_PATIENT_IDS, auditId: logs.at(-1).auditId, review: 'DRAFT / UNASSIGNED' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (committing) throw new Error('SCENARIO_RESET_COMMIT_OUTCOME_UNKNOWN');
    throw error;
  }
}
