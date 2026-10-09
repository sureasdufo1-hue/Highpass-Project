import {readFile} from 'node:fs/promises';

const migrations=['033_capstone_patient_self_view_authority.sql','034_capstone_patient_self_view_grants.sql',
  '035_capstone_patient_audit_lock.sql','036_capstone_patient_key_releases.sql'];

// Explicit fresh installation only. Never rotates or repairs existing objects.
// Caller supplies a bounded migration connection, never the runtime pool.
export async function preparePatientDatabase(client,{password,apply=false}={}){
  if(typeof password!=='string' || password.length<32 || password.length>256 || /[\r\n\0]/.test(password))
    throw new Error('PATIENT_PREPARATION_SECRET_INVALID');
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL search_path=public,pg_catalog");
    await client.query("SELECT pg_advisory_xact_lock(736104,33)");
    const state=(await client.query(`SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hipass_patient_authority') AS role_exists,
      to_regclass('public.capstone_patient_accounts') IS NOT NULL OR
      to_regclass('public.capstone_patient_ownership_refs') IS NOT NULL OR
      to_regclass('public.capstone_patient_self_view_grants') IS NOT NULL OR
      to_regclass('public.capstone_patient_key_releases') IS NOT NULL OR
      to_regprocedure('public.capstone_patient_lock_audit()') IS NOT NULL AS objects_exist,
      to_regclass('public.patients') IS NOT NULL AND to_regclass('public.hospitals') IS NOT NULL AND
      to_regclass('public.imaging_studies') IS NOT NULL AND to_regclass('public.imaging_series') IS NOT NULL AND
      to_regclass('public.audit_logs') IS NOT NULL AS baseline_ready`)).rows[0];
    if(state?.role_exists || state?.objects_exist)throw new Error('PATIENT_PREPARATION_EXISTING_STATE_PRESERVED');
    if(state?.baseline_ready!==true)throw new Error('PATIENT_PREPARATION_BASELINE_REQUIRED');
    if(!apply){await client.query('ROLLBACK');return {status:'READY',applied:false};}
    for(const file of migrations)await client.query(await readFile(new URL('../../db/migrations/'+file,import.meta.url),'utf8'));
    const ddl=(await client.query("SELECT format('CREATE ROLE hipass_patient_authority LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',$1::text) AS statement",[password])).rows[0].statement;
    await client.query(ddl);
    const connect=(await client.query("SELECT format('GRANT CONNECT ON DATABASE %I TO hipass_patient_authority',current_database()) AS statement")).rows[0].statement;
    await client.query(connect);
    await client.query(`GRANT USAGE ON SCHEMA public TO hipass_patient_authority;
      GRANT SELECT ON patients,hospitals,imaging_studies,imaging_series,capstone_patient_accounts,capstone_patient_ownership_refs,audit_logs TO hipass_patient_authority;
      GRANT SELECT,INSERT ON capstone_patient_self_view_grants,capstone_patient_key_releases TO hipass_patient_authority;
      GRANT INSERT ON audit_logs TO hipass_patient_authority;
      GRANT UPDATE(status,consumed_at) ON capstone_patient_key_releases TO hipass_patient_authority;
      GRANT EXECUTE ON FUNCTION public.capstone_patient_lock_audit() TO hipass_patient_authority;
      GRANT UPDATE(patient_id) ON patients TO hipass_patient_authority;
      GRANT UPDATE(hospital_name) ON hospitals TO hipass_patient_authority;
      GRANT UPDATE(study_id) ON imaging_studies TO hipass_patient_authority;
      GRANT UPDATE(description) ON imaging_series TO hipass_patient_authority;
      GRANT UPDATE(evidence_kind) ON capstone_patient_accounts TO hipass_patient_authority;
      GRANT UPDATE(ref_id) ON capstone_patient_ownership_refs TO hipass_patient_authority`);
    // Column UPDATE grants above are needed for SELECT FOR SHARE; no DELETE,
    // metadata UPDATE, broad table UPDATE, role membership or schema CREATE.
    await client.query('COMMIT');
    return {status:'PASS',applied:true,migrations:4};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
