import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {parseExchangeSessionCreate,prepareExchangeSessionCreate} from './v3-exchange-session-contract.js';
import {exchangeCorrelation,appendExchangeAudit} from './v3-exchange-audit.js';
import {appendPairedExchangeAudit} from './v3-exchange-network-audit.js';
import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';

const privateState=new WeakMap();
export function originalExchangeCreateReceipt(row,ledger,resources,command){
 const created=new Date(ledger?.response_created_at).getTime();
 const digest=createHash('sha256').update(JSON.stringify(resources)).digest();
 if(!ledger||ledger.session_id!==row.session_id||ledger.response_state!=='REQUESTED'||ledger.response_version!==1
  ||!Number.isSafeInteger(created)||created!==new Date(row.created_at).getTime()
  ||!Buffer.isBuffer(row.resource_snapshot_digest)||row.resource_snapshot_digest.length!==32
  ||!timingSafeEqual(digest,row.resource_snapshot_digest)||JSON.stringify(resources)!==JSON.stringify(command.resources)
  ||row.patient_ref!==command.patientRefId||row.target_hospital_id!==command.targetHospitalId
  ||row.owner_tenant_id!==command.ownerTenantId||row.source_hospital_id!==command.sourceHospitalId||row.requester_id!==command.requesterId
  ||row.purpose!==command.purpose||row.initiation_type!==command.initiationType
  ||new Date(row.valid_until).toISOString()!==command.validUntil
  ||JSON.stringify(row.requested_actions)!==JSON.stringify(command.requestedActions))throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
 return {sessionId:row.session_id,patientRefId:row.patient_ref,ownerTenantId:row.owner_tenant_id,sourceHospitalId:row.source_hospital_id,
  targetHospitalId:row.target_hospital_id,requesterId:row.requester_id,purpose:row.purpose,initiationType:row.initiation_type,state:ledger.response_state,requestedActions:[...row.requested_actions],
  validFrom:new Date(row.valid_from).toISOString(),validUntil:new Date(row.valid_until).toISOString(),resources,version:ledger.response_version,
  createdAt:new Date(created).toISOString(),updatedAt:new Date(created).toISOString()};
}
async function metadata(tx,binding,id,command,ledger){
 const found=await tx.query(`SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,target_hospital_id,requester_id,
 purpose,initiation_type,state,version,valid_from,valid_until,created_at,updated_at,resource_snapshot_digest,requested_actions
 FROM highpass_v3.exchange_sessions WHERE session_id=$1 AND owner_tenant_id=$2 AND source_hospital_id=$3
 AND requester_id=$4 AND valid_until>clock_timestamp() AND state='REQUESTED' AND version=1 FOR SHARE`,[id,binding.tenantId,binding.hospitalId,binding.actorId]);
 if(found.rows.length!==1)throw new AuthError(404,'V3_SESSION_RESOURCE_UNAVAILABLE');
 const row=found.rows[0],scopes=await tx.query(`SELECT study_instance_uid,whole_study,series_instance_uids
 FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1 ORDER BY ordinal`,[id]);
 const resources=scopes.rows.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
 return originalExchangeCreateReceipt(row,ledger,resources,command);
}

/** Internal source-owned REQUESTED creation only; neither consent nor clinical grant. */
export class V3ExchangeSessionService {
 constructor({transactions,hmacKey,maxLifetimeMs,requireNetworkAudit=false}={}){
  if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000||!Buffer.isBuffer(hmacKey)||hmacKey.length!==32
   ||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1||maxLifetimeMs>86400000||typeof requireNetworkAudit!=='boolean')
   throw new V3TransactionError('V3_SESSION_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,key:Buffer.from(hmacKey),maxLifetimeMs,requireNetworkAudit});
 }
 get requireNetworkAudit(){return privateState.get(this).requireNetworkAudit;}
 async create(binding,key,request,options={},network){
  const state=privateState.get(this),command=parseExchangeSessionCreate(binding,request);
  if(typeof key!=='string'||! /^[A-Za-z0-9._:-]{16,128}$/.test(key))throw new AuthError(422,'V3_SESSION_REQUEST_INVALID');
  const context=exchangeCorrelation(options);if(!state.key)throw new V3TransactionError('V3_SESSION_PROVIDER_UNAVAILABLE');
  if(state.requireNetworkAudit)readIdentityNetworkAuditInput(network?.input,binding,context);
  else if(network!==undefined)throw new V3TransactionError('V3_SESSION_NETWORK_MODE_MISMATCH');
  const scope=JSON.stringify([binding.tenantId,binding.hospitalId,binding.actorId,'SESSION_CREATE']);
  const hash=(domain,value)=>createHmac('sha256',state.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HPV3-SESSION-KEY',key),requestDigest=hash('HPV3-SESSION-COMMAND',JSON.stringify(command));
  const operation=async tx=>{
   const audit=event=>state.requireNetworkAudit?appendPairedExchangeAudit(tx,binding,event,network.input):appendExchangeAudit(tx,binding,event);
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   const prior=await tx.query(`SELECT request_digest,session_id,response_state,response_version,response_created_at FROM highpass_v3.exchange_write_results
    WHERE tenant_id=$1 AND hospital_id=$2 AND actor_id=$3 AND operation='SESSION_CREATE' AND key_digest=$4`,
   [binding.tenantId,binding.hospitalId,binding.actorId,keyDigest]);
   if(prior.rows.length>1)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
   if(prior.rows.length){const digest=prior.rows[0].request_digest;
    if(!Buffer.isBuffer(digest)||digest.length!==32)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
    if(!timingSafeEqual(digest,requestDigest)){
     await audit({...context,action:'SESSION_DENIED',reasonCode:'IDEMPOTENCY_CONFLICT'});
     return {denied:true,code:'V3_SESSION_IDEMPOTENCY_CONFLICT',status:409};
    }
   }
   if(!prior.rows.length){
    const clock=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0];
    prepareExchangeSessionCreate(binding,request,{nowMs:Number(clock?.now_ms),maxLifetimeMs:state.maxLifetimeMs});
   }
   const owned=await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1
    AND owner_tenant_id=$2 AND owner_hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,[command.patientRefId,binding.tenantId,binding.hospitalId]);
   await tx.query(`SELECT set_config('app.exchange_target_hospital',$1,true),set_config('app.exchange_max_lifetime_ms',$2,true)`,[command.targetHospitalId,String(state.maxLifetimeMs)]);
   const target=await tx.query(`SELECT hospital_id,tenant_id,status FROM highpass_v3.hospitals WHERE hospital_id=$1 FOR SHARE`,[command.targetHospitalId]);
   let targetTenant;
   if(target.rows.length===1){targetTenant=target.rows[0].tenant_id;
    await tx.query(`SELECT set_config('app.exchange_target_tenant',$1,true)`,[targetTenant]);
   }
   const tenant=targetTenant?await tx.query(`SELECT tenant_id,status FROM highpass_v3.tenants WHERE tenant_id=$1 FOR SHARE`,[targetTenant]):{rows:[]};
   if(owned.rows.length!==1||target.rows.length!==1||target.rows[0].status!=='ACTIVE'||tenant.rows.length!==1||tenant.rows[0].status!=='ACTIVE'){
    await audit({...context,action:'SESSION_DENIED',reasonCode:owned.rows.length!==1?'SOURCE_REF_UNAVAILABLE':'TARGET_UNAVAILABLE'});
    return {denied:true};
   }
   if(prior.rows.length){
    const eligible=(await tx.query('SELECT state,version,valid_until>clock_timestamp() AS live FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR SHARE',[prior.rows[0].session_id])).rows[0];
    if(!eligible||!eligible.live||eligible.state!=='REQUESTED'||eligible.version!==1){
     await audit({...context,action:'SESSION_DENIED',reasonCode:eligible&&!eligible.live?'SESSION_EXPIRED':'SESSION_TERMINAL'});
     return {denied:true,code:'V3_SESSION_RESOURCE_UNAVAILABLE',status:404};
    }
    const receipt=await metadata(tx,binding,prior.rows[0].session_id,command,prior.rows[0]);
    // Reading the original receipt is a new auditable metadata read, not a
    // second creation. Never return it before the new audit pair commits.
    await audit({...context,sessionId:receipt.sessionId,sessionVersion:1,action:'SESSION_READ',reasonCode:'METADATA_READ'});
    return receipt;
   }
   const id=randomUUID(),snapshot=createHash('sha256').update(JSON.stringify(command.resources)).digest();
   await tx.query(`INSERT INTO highpass_v3.exchange_sessions
    (session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,initiation_type,
     valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,command.patientRefId,binding.tenantId,binding.hospitalId,targetTenant,
    command.targetHospitalId,binding.actorId,command.purpose,command.initiationType,command.validUntil,snapshot,command.resources.length,context.auditSessionId,context.traceId,command.requestedActions]);
   await tx.query(`INSERT INTO highpass_v3.exchange_creation_context
    (session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,initiation_type,target_tenant_id,target_hospital_id,creation_event_id,audit_session_id,trace_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$1,$9,$10)`,
    [id,command.patientRefId,binding.tenantId,binding.hospitalId,binding.actorId,command.initiationType,targetTenant,command.targetHospitalId,context.auditSessionId,context.traceId]);
   await tx.query(`INSERT INTO highpass_v3.exchange_session_participants VALUES
    ($1,$2,$3,$4,'SOURCE','ACTIVE'),($1,$2,$5,$6,'DESTINATION','INVITED')`,[id,command.patientRefId,binding.tenantId,binding.hospitalId,targetTenant,command.targetHospitalId]);
   await tx.query(`INSERT INTO highpass_v3.exchange_resource_scopes
    SELECT $1,ordinality::integer,value->>'studyInstanceUid',NOT(value ? 'seriesInstanceUids'),
     CASE WHEN value ? 'seriesInstanceUids' THEN ARRAY(SELECT jsonb_array_elements_text(value->'seriesInstanceUids')) ELSE NULL END
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY`,[id,JSON.stringify(command.resources)]);
   await audit({...context,sessionId:id,action:'SESSION_CREATED',reasonCode:'SESSION_REQUESTED'});
   const ledger=await tx.query(`INSERT INTO highpass_v3.exchange_write_results
    SELECT $1,$2,$3,'SESSION_CREATE',$4,$5,session_id,'REQUESTED',1,created_at FROM highpass_v3.exchange_sessions WHERE session_id=$6
    RETURNING session_id,response_state,response_version,response_created_at`,
   [binding.tenantId,binding.hospitalId,binding.actorId,keyDigest,requestDigest,id]);
   if(ledger.rows.length!==1)throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
   return metadata(tx,binding,id,command,ledger.rows[0]);
  };
  const outcome=await(state.requireNetworkAudit?state.transactions.runWithIdentityNetwork(binding,'exchange:create',operation,network.input):state.transactions.run(binding,'exchange:create',operation));
  if(outcome.denied)throw new AuthError(outcome.status??404,outcome.code??'V3_SESSION_RESOURCE_UNAVAILABLE');return outcome;
 }
 dispose(){const state=privateState.get(this);state.key?.fill(0);state.key=null;}
}
