import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hccCatalog, HCC_DATASET_ID, HCC_PATIENT_SUBJECT } from '../../src/capstone-hcc-catalog.js';
import { PostgresStore } from '../../src/postgres-store.js';
import { HipassService, buildAuditLog } from '../../src/services.js';

// Offline, fixed HCC synthetic ownership registration. Runtime DB roles cannot
// create patient accounts or ownership references; there are no caller IDs.
export async function registerPatientHcc(client, { datasetId, apply = false, clock = Date.now } = {}) {
  if (datasetId !== HCC_DATASET_ID) throw new Error('PATIENT_REGISTRATION_FIXED_DATASET_REQUIRED');
  const { patient, studies } = hccCatalog('2026-10-10T00:00:00.000Z');
  const study = studies[0], { createdAt, ...fixedPatient } = patient;
  let committing = false;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='10s'; SET LOCAL search_path=public,pg_catalog");
    await client.query('SELECT pg_advisory_xact_lock(736104, 35)');
    await client.query('LOCK TABLE patients,hospitals,imaging_studies,imaging_series,audit_logs,capstone_patient_accounts,capstone_patient_ownership_refs IN SHARE ROW EXCLUSIVE MODE');
    const writers = (await client.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND usename IN ('hipass_app','hipass_patient_authority','hipass_bootstrap')) AS present")).rows[0];
    if (writers?.present !== false) throw new Error('PATIENT_REGISTRATION_WRITERS_MUST_STOP');
    const existing = (await client.query(`SELECT EXISTS(SELECT 1 FROM capstone_patient_accounts WHERE subject=$1 OR patient_id=$2)
      OR EXISTS(SELECT 1 FROM capstone_patient_ownership_refs WHERE subject=$1 OR patient_id=$2 OR study_instance_uid=ANY($3::text[])) AS present`,
      [HCC_PATIENT_SUBJECT, patient.patientId, [study.studyInstanceUid]])).rows[0];
    if (existing?.present !== false) throw new Error('PATIENT_REGISTRATION_EXISTING_STATE_PRESERVED');
    const patientRows = (await client.query('SELECT patient_id AS "patientId",name,birth_date::text AS "birthDate",phone FROM patients WHERE patient_id=$1', [patient.patientId])).rows;
    if (patientRows.length !== 1 || !isDeepStrictEqual(patientRows[0], fixedPatient)) throw new Error('PATIENT_REGISTRATION_CATALOG_MISMATCH');
    const hospital = (await client.query('SELECT status FROM hospitals WHERE hospital_id=$1', ['HOSP-A'])).rows;
    if (hospital.length !== 1 || hospital[0].status !== 'ACTIVE') throw new Error('PATIENT_REGISTRATION_SOURCE_INACTIVE');
    const studies = (await client.query(`SELECT study_id AS "studyId",patient_id AS "patientId",source_hospital_id AS "sourceHospitalId",
      study_instance_uid AS "studyInstanceUid",modality,body_part AS "bodyPart",study_date::text AS "studyDate",description,metadata_only AS "metadataOnly"
      FROM imaging_studies WHERE study_id=$1 OR study_instance_uid=$2`, [study.studyId, study.studyInstanceUid])).rows;
    const { series, ...fixedStudy } = study;
    const seriesRows = (await client.query(`SELECT series_instance_uid AS "seriesInstanceUid",study_instance_uid AS "studyInstanceUid",modality,description,instance_count AS "instanceCount",bytes::text AS bytes,preview_image_url AS "previewImageUrl"
      FROM imaging_series WHERE study_instance_uid=$1 ORDER BY series_instance_uid`, [study.studyInstanceUid])).rows;
    const fixedSeries = series.map(row => ({ ...row, studyInstanceUid: study.studyInstanceUid, bytes: String(row.bytes) })).sort((a, b) => a.seriesInstanceUid.localeCompare(b.seriesInstanceUid));
    if (studies.length !== 1 || !isDeepStrictEqual(studies[0], fixedStudy) || !isDeepStrictEqual(seriesRows, fixedSeries)) {
      throw new Error('PATIENT_REGISTRATION_CATALOG_MISMATCH');
    }
    await client.query('SELECT public.capstone_patient_lock_audit()');
    const audit = await PostgresStore.prototype.readTable.call({ client }, 'auditLogs');
    if (!HipassService.prototype.verifyAuditIntegrity.call({ store: { get: () => audit } }).ok) throw new Error('PATIENT_REGISTRATION_AUDIT_INVALID');
    if (!apply) {
      await client.query('ROLLBACK');
      return { status: 'READY', applied: false, datasetId, studyCount: 1, seriesCount: series.length, review: 'DRAFT / UNASSIGNED' };
    }
    await client.query('INSERT INTO capstone_patient_accounts (subject,patient_id,evidence_kind,status,revision) VALUES ($1,$2,$3,$4,$5)',
      [HCC_PATIENT_SUBJECT, patient.patientId, 'CAPSTONE_MOCK_IDP', 'ACTIVE', randomUUID()]);
    await client.query('INSERT INTO capstone_patient_ownership_refs (ref_id,subject,patient_id,study_instance_uid,source_hospital_id,status,version) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), HCC_PATIENT_SUBJECT, patient.patientId, study.studyInstanceUid, 'HOSP-A', 'ACTIVE', 1]);
    const log = buildAuditLog({ actorType: 'SYSTEM', actorId: 'capstone-offline-registration-operator', hospitalId: 'HOSP-A', patientId: patient.patientId,
      action: 'SYNTHETIC_PATIENT_OWNERSHIP_REGISTERED', result: 'SUCCESS', reasonCode: 'CAPSTONE_FIXED_HCC_SYNTHETIC_OWNERSHIP_ONLY' },
    audit.at(-1)?.recordHash ?? null, new Date(clock()).toISOString(), randomUUID());
    await PostgresStore.prototype.insertAuditLogs.call({}, [log], client);
    committing = true;
    await client.query('COMMIT');
    return { status: 'PASS', applied: true, datasetId, patientId: patient.patientId, sourceHospitalId: 'HOSP-A', studyCount: 1,
      seriesCount: series.length, auditId: log.auditId, review: 'DRAFT / UNASSIGNED',
      scope: 'fixed synthetic HCC-style dataset ownership only; no consent, deployment or clinical claim' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (committing) throw new Error('PATIENT_REGISTRATION_COMMIT_OUTCOME_UNKNOWN');
    throw error;
  }
}
