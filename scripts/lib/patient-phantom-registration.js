import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {phantomCatalog,PHANTOM_DATASET_ID} from '../../src/capstone-phantom-catalog.js';
import {PostgresStore} from '../../src/postgres-store.js';
import {HipassService,buildAuditLog} from '../../src/services.js';

// Offline operator only: fixed synthetic account, no arbitrary identity/UID input.
// Runtime authority credentials intentionally cannot INSERT accounts or refs.
export async function registerPatientPhantom(client,{datasetId,apply=false,clock=Date.now}={}){
  if(datasetId!==PHANTOM_DATASET_ID)throw new Error('PATIENT_REGISTRATION_FIXED_DATASET_REQUIRED');
  const expected=phantomCatalog('2026-10-09T00:00:00.000Z'),subject='synthetic-phantom-account';
  let committing=false;
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='10s'; SET LOCAL search_path=public,pg_catalog");
    await client.query('SELECT pg_advisory_xact_lock(736104,34)');
    // Block legacy snapshot writes during this transaction. Existing processes
    // must still be stopped/reloaded, since SQL locks cannot refresh their RAM.
    await client.query('LOCK TABLE patients,hospitals,imaging_studies,imaging_series,audit_logs,capstone_patient_accounts,capstone_patient_ownership_refs IN SHARE ROW EXCLUSIVE MODE');
    const writers=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND usename IN ('hipass_app','hipass_patient_authority','hipass_bootstrap')) AS present")).rows[0];
    if(writers?.present!==false)throw new Error('PATIENT_REGISTRATION_WRITERS_MUST_STOP');
    const existing=(await client.query(`SELECT EXISTS(SELECT 1 FROM capstone_patient_accounts WHERE subject=$1 OR patient_id=$2)
      OR EXISTS(SELECT 1 FROM capstone_patient_ownership_refs WHERE subject=$1 OR patient_id=$2 OR study_instance_uid=ANY($3::text[])) AS present`,
      [subject,expected.patient.patientId,expected.studies.map(s=>s.studyInstanceUid)])).rows[0];
    if(existing?.present!==false)throw new Error('PATIENT_REGISTRATION_EXISTING_STATE_PRESERVED');
    const patient=(await client.query("SELECT patient_id AS \"patientId\",name,birth_date::text AS \"birthDate\",phone FROM patients WHERE patient_id=$1",[expected.patient.patientId])).rows;
    const {createdAt,...fixedPatient}=expected.patient;
    if(patient.length!==1 || !isDeepStrictEqual(patient[0],fixedPatient))throw new Error('PATIENT_REGISTRATION_CATALOG_MISMATCH');
    const hospital=(await client.query('SELECT status FROM hospitals WHERE hospital_id=$1',['HOSP-A'])).rows;
    if(hospital.length!==1 || hospital[0].status!=='ACTIVE')throw new Error('PATIENT_REGISTRATION_SOURCE_INACTIVE');
    for(const study of expected.studies){
      const rows=(await client.query(`SELECT study_id AS "studyId",patient_id AS "patientId",source_hospital_id AS "sourceHospitalId",
        study_instance_uid AS "studyInstanceUid",modality,body_part AS "bodyPart",study_date::text AS "studyDate",description,metadata_only AS "metadataOnly"
        FROM imaging_studies WHERE study_id=$1 OR study_instance_uid=$2`,[study.studyId,study.studyInstanceUid])).rows;
      const {series,...fixedStudy}=study;
      const seriesRows=(await client.query(`SELECT series_instance_uid AS "seriesInstanceUid",study_instance_uid AS "studyInstanceUid",modality,description,instance_count AS "instanceCount",bytes::text AS bytes,preview_image_url AS "previewImageUrl"
        FROM imaging_series WHERE study_instance_uid=$1 OR series_instance_uid=$2 ORDER BY series_instance_uid`,[study.studyInstanceUid,series[0].seriesInstanceUid])).rows;
      if(rows.length!==1 || !isDeepStrictEqual(rows[0],fixedStudy) || !isDeepStrictEqual(seriesRows,series.map(s=>({...s,studyInstanceUid:study.studyInstanceUid,bytes:String(s.bytes)}))))
        throw new Error('PATIENT_REGISTRATION_CATALOG_MISMATCH');
    }
    await client.query('SELECT public.capstone_patient_lock_audit()');
    const audit=await PostgresStore.prototype.readTable.call({client},'auditLogs');
    if(!HipassService.prototype.verifyAuditIntegrity.call({store:{get:()=>audit}}).ok)throw new Error('PATIENT_REGISTRATION_AUDIT_INVALID');
    if(!apply){await client.query('ROLLBACK');return {status:'READY',applied:false,datasetId,studyCount:2,review:'DRAFT / UNASSIGNED'};}
    await client.query('INSERT INTO capstone_patient_accounts (subject,patient_id,evidence_kind,status,revision) VALUES ($1,$2,$3,$4,$5)',
      [subject,expected.patient.patientId,'CAPSTONE_MOCK_IDP','ACTIVE',randomUUID()]);
    for(const study of expected.studies)await client.query('INSERT INTO capstone_patient_ownership_refs (ref_id,subject,patient_id,study_instance_uid,source_hospital_id,status,version) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(),subject,expected.patient.patientId,study.studyInstanceUid,'HOSP-A','ACTIVE',1]);
    const log=buildAuditLog({actorType:'SYSTEM',actorId:'capstone-offline-registration-operator',hospitalId:'HOSP-A',patientId:expected.patient.patientId,
      action:'SYNTHETIC_PATIENT_OWNERSHIP_REGISTERED',result:'SUCCESS',reasonCode:'CAPSTONE_FIXED_PHANTOM_OWNERSHIP_ONLY'},audit.at(-1)?.recordHash??null,new Date(clock()).toISOString(),randomUUID());
    await PostgresStore.prototype.insertAuditLogs.call({},[log],client);
    committing=true;await client.query('COMMIT');
    return {status:'PASS',applied:true,datasetId,studyCount:2,auditId:log.auditId,review:'DRAFT / UNASSIGNED',scope:'fixed synthetic ownership registration only; not PACS live verification, consent, deployment or MVP completion'};
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    if(committing)throw new Error('PATIENT_REGISTRATION_COMMIT_OUTCOME_UNKNOWN');
    throw error;
  }
}
