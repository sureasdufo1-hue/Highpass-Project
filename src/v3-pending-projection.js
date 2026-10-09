import {createHash,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {parseExchangeResourceSelection,parseExchangeActionSelection} from './v3-exchange-session-contract.js';

const pendingRoleSql=`SELECT pg_has_role(current_user,'hp_v3_pending_policy','MEMBER') AS pending,
 pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AS clinical,
 pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS expiry`;
const pendingTransactions=new WeakSet();
export function createPendingTransactions({pool,deadlineMs=8000,queryMs=5000}={}){
 const transactions=new V3TenantTransaction({pool:guardPendingPool(pool),deadlineMs,queryMs});
 pendingTransactions.add(transactions);return transactions;
}
export function assertPendingTransactions(transactions){
 if(!pendingTransactions.has(transactions))throw new V3TransactionError('V3_PENDING_CONFIGURATION_INVALID');
 return transactions;
}
function assertPoolRole(rows){
 if(rows.length!==1||rows[0].pending!==true||rows[0].clinical!==false||rows[0].expiry!==false)
  throw new V3TransactionError('V3_PENDING_DATABASE_ROLE_UNSAFE');
}
// Check capability separation BEFORE registry RLS is planned, not after BEGIN.
// V3TenantTransaction still provides deadline, admin/owner guards and binding locks.
export function guardPendingPool(pool){
 if(!pool||typeof pool.connect!=='function')throw new V3TransactionError('V3_PENDING_POOL_INVALID');
 return Object.freeze({async connect(){
  const client=await pool.connect(),onFault=()=>{};
  client.on?.('error',onFault);
  try{
   assertPoolRole((await client.query({text:pendingRoleSql,values:[],query_timeout:3000})).rows);
   client.removeListener?.('error',onFault);return client;
  }catch(error){
   client.release(true); // keep safe listener until the destroyed socket closes
   if(error instanceof V3TransactionError)throw error;
   throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
  }
 }});
}

// Internal SAME-TRANSACTION repository helper, NOT a public read service.
// Caller must use V3TenantTransaction.run(binding,'consent:write', ...) and audit
// outcomes before commit. Returning this projection creates no authority outside tx.
export async function selectPendingSourceProjection(tx,binding,id,version){
 v3BindingExpiry(binding);
 if(!['PATIENT','DOCTOR','HOSPITAL_ADMIN'].includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:write'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
 if(!tx||typeof tx.query!=='function'||typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ||!Number.isInteger(version)||version<1||version>2147483646)throw new AuthError(422,'V3_CONSENT_PENDING_INVALID');
 assertPoolRole((await tx.query(pendingRoleSql)).rows);
 const denied=reason=>Object.freeze({denied:true,reasonCode:reason});
 const rows=(await tx.query(`SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
  requester_id,purpose,state,version,valid_from,valid_until,resource_snapshot_digest,resource_count,requested_actions,
  valid_until>clock_timestamp() AS live FROM highpass_v3.exchange_sessions
  WHERE session_id=$1 AND owner_tenant_id=$2 AND source_hospital_id=$3 FOR SHARE`,[id.toLowerCase(),binding.tenantId,binding.hospitalId])).rows;
 if(rows.length===0)return denied('SESSION_NOT_FOUND');
 if(rows.length!==1)throw new V3TransactionError('V3_PENDING_PROJECTION_INVALID');
 const row=rows[0];
 if(row.owner_tenant_id!==binding.tenantId||row.source_hospital_id!==binding.hospitalId
  ||binding.role==='PATIENT'&&row.patient_ref!==binding.patientRefId||binding.role==='DOCTOR'&&row.requester_id!==binding.actorId)
  return denied('SESSION_NOT_FOUND');
 if(row.live!==true)return denied('SESSION_EXPIRED');
 if(row.version!==version)return denied('VERSION_MISMATCH');
 if(row.state!=='REQUESTED'||row.version!==1)return denied('SESSION_TERMINAL');
 const ref=(await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs
  WHERE patient_ref=$1 AND owner_tenant_id=$2 AND owner_hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,
 [row.patient_ref,binding.tenantId,binding.hospitalId])).rows;
 if(ref.length!==1)return denied('SOURCE_REF_UNAVAILABLE');
 const participant=(await tx.query(`SELECT session_id FROM highpass_v3.exchange_session_participants
  WHERE session_id=$1 AND patient_ref=$2 AND tenant_id=$3 AND hospital_id=$4 AND participant_role='SOURCE' AND status='ACTIVE'`,
 [row.session_id,row.patient_ref,binding.tenantId,binding.hospitalId])).rows;
 // Participants are immutable; no UPDATE privilege needed for their read.
 if(participant.length!==1)return denied('SOURCE_REF_UNAVAILABLE');
 await tx.query(`SELECT set_config('app.pending_target_hospital',$1,true),set_config('app.pending_target_tenant',$2,true)`,
 [row.target_hospital_id,row.target_tenant_id]);
 const target=(await tx.query(`SELECT h.hospital_id FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
  WHERE h.hospital_id=$1 AND h.tenant_id=$2 AND h.status='ACTIVE' AND t.status='ACTIVE' FOR SHARE OF h,t`,
 [row.target_hospital_id,row.target_tenant_id])).rows;
 if(target.length!==1)return denied('TARGET_UNAVAILABLE');
 const scopes=(await tx.query(`SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes
  WHERE session_id=$1 ORDER BY ordinal`,[row.session_id])).rows;
 let resources,actions;
 try{
  resources=parseExchangeResourceSelection(scopes.map(r=>{
   if(typeof r.whole_study!=='boolean'||r.whole_study&&r.series_instance_uids!==null)throw Error();
   return r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids};
  }));
  actions=parseExchangeActionSelection(row.requested_actions);
 }catch{throw new V3TransactionError('V3_PENDING_PROJECTION_INVALID');}
 const hash=createHash('sha256').update(JSON.stringify(resources)).digest();
 if(resources.length!==row.resource_count||!Buffer.isBuffer(row.resource_snapshot_digest)||row.resource_snapshot_digest.length!==32
  ||!timingSafeEqual(hash,row.resource_snapshot_digest))throw new V3TransactionError('V3_PENDING_PROJECTION_INVALID');
 const now=Number((await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0]?.now_ms);
 const from=new Date(row.valid_from).getTime(),until=new Date(row.valid_until).getTime();
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(from)||!Number.isSafeInteger(until)||until<=from)
  throw new V3TransactionError('V3_PENDING_PROJECTION_INVALID');
 if(until<=now)return denied('SESSION_EXPIRED');
 return Object.freeze({denied:false,nowMs:now,selection:Object.freeze({sessionId:row.session_id,patientRefId:row.patient_ref,
  ownerTenantId:row.owner_tenant_id,sourceHospitalId:row.source_hospital_id,targetHospitalId:row.target_hospital_id,purpose:row.purpose,
  requestedActions:actions,resources,validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString(),version:row.version})});
}
