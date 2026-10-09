import {randomBytes,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {selectPendingSourceProjection,guardPendingPool} from '../../src/v3-pending-projection.js';
import {checkPendingWrite} from './v3-pending-write-fixture.js';
import {checkPendingHttp} from './v3-pending-http-fixture.js';
import {checkPendingSecureEdge} from './v3-pending-secure-edge-fixture.js';
import {checkPendingNetworkSchema} from './v3-pending-network-schema-fixture.js';
import {checkPendingNetworkRaces} from './v3-pending-network-race-fixture.js';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';

// Caller owns disposable DB; this never reads an existing deployment.
export async function checkPendingProjection({admin,base,record,sessionId,check,lifecycle}){
 const password=randomBytes(32).toString('hex');
 await admin.query(`CREATE ROLE hp_v3_pending_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
 GRANT hp_v3_pending_policy TO hp_v3_pending_app;GRANT USAGE ON SCHEMA highpass_v3 TO hp_v3_pending_app;
 GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_v3_pending_app;
 GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_v3_pending_app;
 GRANT SELECT(hospital_id,tenant_id,status) ON highpass_v3.hospitals TO hp_v3_pending_app;
 GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_v3_pending_app;
 GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id) ON highpass_v3.exchange_creation_context TO hp_v3_pending_app;
 GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,state,version,
 valid_from,valid_until,resource_snapshot_digest,resource_count,requested_actions) ON highpass_v3.exchange_sessions TO hp_v3_pending_app;
 GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_v3_pending_app;
 GRANT SELECT(patient_ref,owner_tenant_id,owner_hospital_id,deleted_at) ON highpass_v3.patient_refs TO hp_v3_pending_app;
 GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_v3_pending_app;
 GRANT SELECT(session_id,patient_ref,tenant_id,hospital_id,participant_role,status) ON highpass_v3.exchange_session_participants TO hp_v3_pending_app;
 GRANT SELECT(session_id,ordinal,study_instance_uid,whole_study,series_instance_uids) ON highpass_v3.exchange_resource_scopes TO hp_v3_pending_app;
 GRANT EXECUTE ON FUNCTION highpass_v3.pending_source_actor(uuid,uuid,uuid,uuid),highpass_v3.pending_directory_caller(),highpass_v3.clinical_principal_context() TO hp_v3_pending_app;`);
 const original=(await admin.query('SELECT scopes FROM highpass_v3.principal_bindings WHERE actor_id=$1',[record.actorId])).rows[0].scopes;
 await admin.query("UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['consent:write'] WHERE actor_id=$1",[record.actorId]);
 const secret=randomBytes(32).toString('hex'),issuer='synthetic-pending-pg';
 const r={...record,issuer,scopes:['consent:write']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-pending',TEST_JWT_SECRET:secret}),records:[r]});
 const input=[{alg:'HS256'},{iss:issuer,aud:'synthetic-pending',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'consent:write',exp:Math.floor(Date.now()/1000)+120}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
  {requiredScope:'consent:write',allowedRoles:['HOSPITAL_ADMIN']});
 const pool=new Pool({...base,user:'hp_v3_pending_app',password,max:2});pool.on('error',()=>{});
 const transactions=new V3TenantTransaction({pool:guardPendingPool(pool),deadlineMs:8000});
 const run=(id=sessionId,version=1)=>transactions.run(binding,'consent:write',tx=>selectPendingSourceProjection(tx,binding,id,version));
 try{
  const out=await run();
  check('real nonowner JS pending projection uses consent-only binding and locks valid source',out.denied===false&&out.selection.sessionId===sessionId&&out.selection.resources.length>0&&Number.isSafeInteger(out.nowMs));
  check('actual pending projection stale If-Match classification',(await run(sessionId,2)).reasonCode==='VERSION_MISMATCH');
  const target=(await admin.query('SELECT target_hospital_id,patient_ref FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0];
  await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[target.target_hospital_id]);
  try{check('actual pending projection rejects suspended target',(await run()).reasonCode==='TARGET_UNAVAILABLE');}
  finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[target.target_hospital_id]);}
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',[target.patient_ref]);
  try{check('actual pending projection rejects deleted owned ref',(await run()).reasonCode==='SOURCE_REF_UNAVAILABLE');}
  finally{await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[target.patient_ref]);}
  await admin.query('GRANT hp_v3_clinical_policy TO hp_v3_pending_app');
  try{let denied=false;try{await run();}catch(e){denied=e.code==='V3_PENDING_DATABASE_ROLE_UNSAFE';}
   check('real pending helper refuses mixed clinical pool before Session query',denied);}
  finally{await admin.query('REVOKE hp_v3_clinical_policy FROM hp_v3_pending_app');}
  await checkPendingWrite({admin,pool,binding,sessionId,check,lifecycle});
  const parent=await lifecycle.createTransportParent();
  const service=new V3PendingPreparationService({transactions:createPendingTransactions({pool}),hmacKey:randomBytes(32),maxLifetimeMs:3600000});
  const request={patientRefId:parent.patientRefId,sourceHospitalId:parent.sourceHospitalId,targetHospitalId:parent.targetHospitalId,
   purpose:parent.purpose,allowedActions:parent.requestedActions,resources:parent.resources,state:'PENDING',policyVersion:'synthetic-http-v1',
   evidenceDigest:'SYNTHETIC_HTTP_UNVERIFIED_'.padEnd(64,'X')};
  const issueToken=({scope='consent:write',subject=r.subject,assurance={}}={})=>{
   const data=[{alg:'HS256'},{iss:issuer,aud:'synthetic-pending',sub:subject,role:r.role,hospitalId:r.authHospitalId,scope,exp:Math.floor(Date.now()/1000)+120,...assurance}]
    .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`;
  };
  try{
   await checkPendingHttp({admin,registry,service,issueToken,parent,request,binding,check});
   await admin.query(`GRANT SELECT ON highpass_v3.consent_preparation_network_audit TO hp_v3_pending_app;
    GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
    ON highpass_v3.consent_preparation_network_audit TO hp_v3_pending_app;`);
   const strictService=new V3PendingPreparationService({transactions:createPendingTransactions({pool}),hmacKey:randomBytes(32),maxLifetimeMs:3600000,requireNetworkAudit:true});
   try{await checkPendingSecureEdge({admin,base,registry,service:strictService,issueToken,parent,request,check});}finally{strictService.dispose();}
   await checkPendingNetworkSchema({admin,pool,binding,check});
   await checkPendingNetworkRaces({admin,pool,binding,parent,request,issueToken,check});
  }finally{service.dispose();}
 }finally{
  await pool.end();await admin.query('UPDATE highpass_v3.principal_bindings SET scopes=$2 WHERE actor_id=$1',[record.actorId,original]);
 }
}
