import {randomUUID,createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {prepareExchangeSessionCancel,validateExchangeCancellation,validateExchangeCancellationOwnership} from './v3-exchange-cancel-contract.js';
import {exchangeCorrelation,appendExchangeAudit} from './v3-exchange-audit.js';

const privateState=new WeakMap();
function selected(row){return row?{sessionId:row.session_id,ownerTenantId:row.owner_tenant_id,sourceHospitalId:row.source_hospital_id,
 requesterId:row.requester_id,patientRefId:row.patient_ref,state:row.state,version:row.version,validUntilMs:new Date(row.valid_until).getTime()}:null;}
async function receipt(tx,row,event){
 const scopes=await tx.query('SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1 ORDER BY ordinal',[row.session_id]);
 const resources=scopes.rows.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
 const digest=createHash('sha256').update(JSON.stringify(resources)).digest();
 if(!Buffer.isBuffer(row.resource_snapshot_digest)||row.resource_snapshot_digest.length!==32||!timingSafeEqual(digest,row.resource_snapshot_digest)||resources.length!==row.resource_count)
  throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
 return {sessionId:row.session_id,patientRefId:row.patient_ref,ownerTenantId:row.owner_tenant_id,sourceHospitalId:row.source_hospital_id,
  targetHospitalId:row.target_hospital_id,requesterId:row.requester_id,purpose:row.purpose,initiationType:row.initiation_type,
  state:event.to_state,version:event.to_version,requestedActions:[...row.requested_actions],resources,
  validFrom:new Date(row.valid_from).toISOString(),validUntil:new Date(row.valid_until).toISOString(),createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(event.occurred_at).toISOString()};
}
/** Internal only: atomic REQUESTED cancellation and durable cascade REQUEST, not delivery. */
export class V3ExchangeCancelService {
 constructor({transactions,hmacKey}={}){
  if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000||!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)
   throw new V3TransactionError('V3_SESSION_CANCEL_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,key:Buffer.from(hmacKey)});
 }
 async cancel(binding,key,id,ifMatch,request,options={}){
  const command=prepareExchangeSessionCancel(binding,id,ifMatch,request),context=exchangeCorrelation(options),state=privateState.get(this);
  if(typeof key!=='string'||! /^[A-Za-z0-9._:-]{16,128}$/.test(key))throw new AuthError(422,'V3_SESSION_CANCEL_INVALID');
  if(!state.key)throw new V3TransactionError('V3_SESSION_PROVIDER_UNAVAILABLE');
  const scope=[binding.tenantId,binding.hospitalId,binding.actorId,'SESSION_CANCEL'];
  const hash=(domain,value)=>createHmac('sha256',state.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HPV3-CANCEL-KEY',key),requestDigest=hash('HPV3-CANCEL-COMMAND',command);
  const outcome=await state.transactions.run(binding,'exchange:cancel',async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   const prior=await tx.query('SELECT request_digest,event_id,session_id FROM highpass_v3.exchange_cancel_results WHERE tenant_id=$1 AND hospital_id=$2 AND actor_id=$3 AND key_digest=$4',
    [binding.tenantId,binding.hospitalId,binding.actorId,keyDigest]);
   const deny=async(code,status,reasonCode)=>{await appendExchangeAudit(tx,binding,{...context,action:'SESSION_DENIED',reasonCode});return {denied:true,code,status};};
   if(prior.rows.length>1)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
   if(prior.rows.length){const digest=prior.rows[0].request_digest;
    if(!Buffer.isBuffer(digest)||digest.length!==32)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
    if(!timingSafeEqual(digest,requestDigest))return deny('V3_SESSION_IDEMPOTENCY_CONFLICT',409,'IDEMPOTENCY_CONFLICT');}
   const rows=await tx.query('SELECT * FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR UPDATE',[command.sessionId]),row=rows.rows[0];
   try{validateExchangeCancellationOwnership(binding,command,selected(row));}
   catch(error){if(error instanceof AuthError&&error.statusCode===404)return deny(error.code,404,'SESSION_NOT_FOUND');throw error;}
   if(prior.rows.length){
    if(prior.rows[0].session_id!==row.session_id)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
    const event=(await tx.query('SELECT to_state,to_version,occurred_at FROM highpass_v3.exchange_state_events WHERE event_id=$1 AND actor_id=$2',[prior.rows[0].event_id,binding.actorId])).rows[0];
    if(!event||row.state!=='CANCELLED'||row.version!==event.to_version)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
    return receipt(tx,row,event);
   }
   const clock=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0];
   try{validateExchangeCancellation(binding,command,selected(row),{nowMs:Number(clock?.now_ms)});}
   catch(error){if(error instanceof AuthError&&[409,412].includes(error.statusCode))return deny(error.code,error.statusCode,
    error.code==='V3_SESSION_VERSION_MISMATCH'?'VERSION_MISMATCH':error.code==='V3_SESSION_EXPIRED'?'SESSION_EXPIRED':'SESSION_TERMINAL');throw error;}
   if(row.state!=='REQUESTED'||row.version!==1)return deny('V3_SESSION_CANCEL_NOT_SUPPORTED',409,'CANCEL_NOT_SUPPORTED');
   const updated=(await tx.query("UPDATE highpass_v3.exchange_sessions SET state='CANCELLED',version=version+1,updated_at=clock_timestamp() WHERE session_id=$1 AND version=$2 RETURNING *",
    [command.sessionId,command.expectedVersion])).rows[0];
   if(!updated)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
   const eventId=randomUUID();
   await tx.query(`INSERT INTO highpass_v3.exchange_state_events(event_id,session_id,patient_ref,tenant_id,hospital_id,requester_id,actor_id,
    from_state,to_state,from_version,to_version,reason_code,audit_session_id,trace_id,occurred_at)
    SELECT $1,session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,$2,'REQUESTED','CANCELLED',1,2,$3,$4,$5,updated_at
    FROM highpass_v3.exchange_sessions WHERE session_id=$6`,[eventId,binding.actorId,command.reasonCode,context.auditSessionId,context.traceId,command.sessionId]);
   await appendExchangeAudit(tx,binding,{...context,eventId,sessionId:command.sessionId,sessionVersion:2,action:'SESSION_CANCELLED',reasonCode:command.reasonCode});
   await tx.query('INSERT INTO highpass_v3.exchange_cascade_outbox(event_id) VALUES($1)',[eventId]);
   await tx.query('INSERT INTO highpass_v3.exchange_cancel_results(tenant_id,hospital_id,actor_id,key_digest,request_digest,event_id,session_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [binding.tenantId,binding.hospitalId,binding.actorId,keyDigest,requestDigest,eventId,command.sessionId]);
   return receipt(tx,updated,{to_state:'CANCELLED',to_version:2,occurred_at:updated.updated_at});
  });
  if(outcome.denied)throw new AuthError(outcome.status,outcome.code);return outcome;
 }
 dispose(){const state=privateState.get(this);state.key?.fill(0);state.key=null;}
}
