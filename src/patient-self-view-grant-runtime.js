import pg from 'pg';
import { PatientSelfViewAuthorityReader } from './patient-self-view-authority.js';
import { createPatientSelfViewPersistence } from './patient-self-view-audit-adapter.js';
import { PatientSelfViewGrantService } from './patient-self-view-grant-service.js';
import { PatientSelfViewAuthorization } from './patient-self-view-authorization.js';
import { InternalServiceProvider, requireInternalServiceScope } from './auth.js';

export async function createPatientSelfViewGrantRuntime({store,service,env=process.env}) {
  if(env.HIPASS_CAPSTONE_PATIENT_GRANTS!=='1')return null;
  if(env.HIPASS_CONTROL_PLANE_ONLY!=='1' || env.HIPASS_STORE!=='postgres' || env.AUTH_MODE!=='TEST'
    || env.HIPASS_DPOP_REQUIRED!=='1' || env.HIPASS_CAPSTONE_SINGLE_WRITER!=='1'
    || !env.HIPASS_PATIENT_AUTHORITY_DATABASE_URL || !env.HIPASS_INGRESS_SECRET
    || env.JWT_ISSUER!=='highpass-capstone-test-idp' || env.JWT_AUDIENCE!=='highpass-capstone-api')
    throw new Error('PATIENT_GRANT_PROFILE_REQUIRED');
  requireInternalServiceScope(new InternalServiceProvider(env).authenticate({headers:{'x-hipass-service-token':env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN}}),
    'gateway:patient-self-view-authorize');
  const pool=new pg.Pool({connectionString:env.HIPASS_PATIENT_AUTHORITY_DATABASE_URL,max:2,
    connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:4000,
    options:'-c lock_timeout=2000 -c search_path=public,pg_catalog'});
  pool.on('error',()=>console.warn('PATIENT_AUTHORITY_DATABASE_UNAVAILABLE'));
  try {
    const role=(await pool.query(`SELECT r.rolsuper,r.rolbypassrls,
      EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
        OR x.rolname IN ('pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend'))
        AND pg_has_role(current_user,x.oid,'MEMBER')) AS unsafe_member,
      EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_tables
      FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    if(!role || Object.values(role).some(value=>value!==false))throw new Error('PATIENT_AUTHORITY_ROLE_UNSAFE');
    const ready=(await pool.query(`SELECT to_regclass('public.capstone_patient_accounts') IS NOT NULL
      AND to_regclass('public.capstone_patient_ownership_refs') IS NOT NULL
      AND to_regclass('public.capstone_patient_self_view_grants') IS NOT NULL
      AND to_regprocedure('public.capstone_patient_lock_audit()') IS NOT NULL AS ready`)).rows[0];
    if(ready?.ready!==true)throw new Error('PATIENT_AUTHORITY_MIGRATION_REQUIRED');
    const issuer=new PatientSelfViewGrantService({authority:new PatientSelfViewAuthorityReader({pool,enabled:true}),
      persistence:createPatientSelfViewPersistence({store,pool,enabled:true,singleWriter:true}),proofService:service,
      keyProvider:service.dicomTokenKeyProvider,allowedOrigin:service.publicBaseUrl,enabled:true});
    const authorizer=new PatientSelfViewAuthorization({pool,
      authority:new PatientSelfViewAuthorityReader({pool,enabled:true,allowIssuedGrant:true}),service,
      keyProvider:service.dicomTokenKeyProvider,publicBaseUrl:service.publicBaseUrl,
      sourceHospitalId:env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID,enabled:true});
    return {issuer,authorizer,close:()=>pool.end()};
  } catch(error){await pool.end();throw new Error(['PATIENT_AUTHORITY_ROLE_UNSAFE','PATIENT_AUTHORITY_MIGRATION_REQUIRED'].includes(error.message)
    ?error.message:'PATIENT_AUTHORITY_STARTUP_UNAVAILABLE');}
}
