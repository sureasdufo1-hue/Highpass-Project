import {randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {normalizePendingConsentRequest,parsePendingConsentIntent,validatePendingConsentIntentWindow} from './v3-consent-pending-contract.js';
import {selectPendingSourceProjection,assertPendingTransactions} from './v3-pending-projection.js';
import {appendPendingAudit} from './v3-pending-audit.js';
import {exchangeCorrelation} from './v3-exchange-audit.js';
import {readPendingNetworkAuditInput} from './v3-pending-network-context.js';
import {appendPendingNetworkAudit} from './v3-pending-network-audit.js';

const state=new WeakMap(),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameDigest=(a,b)=>Buffer.isBuffer(a)&&a.length===32&&Buffer.isBuffer(b)&&b.length===32&&timingSafeEqual(a,b);
const invalid=()=>{throw new AuthError(422,'V3_CONSENT_PENDING_INVALID');};
export function assertStrictPendingNetworkService(service){if(state.get(service)?.requireNetworkAudit!==true)throw new V3TransactionError('V3_PENDING_NETWORK_AUDIT_REQUIRED');}
function receipt(row){
 const created=new Date(row?.response_created_at).getTime();
 if(!row||typeof row.preparation_id!=='string'||!uuid.test(row.preparation_id)||typeof row.session_id!=='string'||!uuid.test(row.session_id)
  ||row.response_session_version!==1||row.response_state!=='PENDING'||row.response_evidence_status!=='UNVERIFIED'||!Number.isSafeInteger(created))
  throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
 return Object.freeze({preparationId:row.preparation_id,sessionId:row.session_id,expectedSessionVersion:row.response_session_version,
  state:'PENDING',evidenceStatus:'UNVERIFIED',createdAt:new Date(created).toISOString()});
}
/** Internal staging only. transactions MUST use guardPendingPool; helper rechecks pool. */
export class V3PendingPreparationService{
 constructor({transactions,hmacKey,maxLifetimeMs,requireNetworkAudit=false}={}){
  assertPendingTransactions(transactions);
  if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000||!Buffer.isBuffer(hmacKey)||hmacKey.length!==32
   ||typeof requireNetworkAudit!=='boolean'||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1||maxLifetimeMs>86400000)
   throw new V3TransactionError('V3_PENDING_CONFIGURATION_INVALID');
  state.set(this,{transactions,key:Buffer.from(hmacKey),maxLifetimeMs,requireNetworkAudit});
 }
 async prepare(binding,key,sessionId,ifMatch,request,options={},networkInput){
  const command=normalizePendingConsentRequest(binding,request),s=state.get(this);
  if(typeof key!=='string'||! /^[A-Za-z0-9._:-]{16,128}$/.test(key)||typeof sessionId!=='string'||!uuid.test(sessionId)
   ||typeof ifMatch!=='string'||! /^"[1-9][0-9]{0,9}"$/.test(ifMatch))invalid();
  const version=Number(ifMatch.slice(1,-1));if(version>2147483646)invalid();sessionId=sessionId.toLowerCase();
  const correlation=exchangeCorrelation(options);if(!s.key)throw new V3TransactionError('V3_PENDING_PROVIDER_UNAVAILABLE');
  const networkRequired=s.requireNetworkAudit||networkInput!==undefined;
  if(networkRequired)readPendingNetworkAuditInput(networkInput,binding,correlation);
  const domain=JSON.stringify([binding.tenantId,binding.hospitalId,binding.actorId,'CONSENT_PREPARE']);
  const hash=(tag,value)=>createHmac('sha256',s.key).update(JSON.stringify([tag,domain,value])).digest();
  const keyDigest=hash('HPV3-PENDING-KEY',key),evidence=hash('HPV3-PENDING-EVIDENCE',command.evidenceDigest),
   requestDigest=hash('HPV3-PENDING-COMMAND',JSON.stringify([sessionId,version,command]));
  const result=await s.transactions.run(binding,'consent:write',async tx=>{
   const audit=async event=>{
    const id=await appendPendingAudit(tx,binding,event);
    if(networkRequired)await appendPendingNetworkAudit(tx,binding,id,correlation,networkInput);return id;
   };
   const deny=async(reason,status=404)=>{await audit({...correlation,action:'PREPARATION_DENIED',reasonCode:reason});
    return {denied:true,status,code:status===409?'V3_PENDING_IDEMPOTENCY_CONFLICT':status===412?'V3_PENDING_VERSION_MISMATCH':
     status===422?'V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID':'V3_PENDING_RESOURCE_UNAVAILABLE'};};
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   const prior=(await tx.query(`SELECT request_digest,preparation_id,session_id,response_session_version,response_state,response_evidence_status,response_created_at
    FROM highpass_v3.consent_preparation_results WHERE tenant_id=$1 AND hospital_id=$2 AND actor_id=$3
     AND operation='CONSENT_PREPARE' AND key_digest=$4`,[binding.tenantId,binding.hospitalId,binding.actorId,keyDigest])).rows;
   if(prior.length>1||prior.length&&(!Buffer.isBuffer(prior[0].request_digest)||prior[0].request_digest.length!==32))throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
   if(prior.length&&!sameDigest(prior[0].request_digest,requestDigest))return deny('IDEMPOTENCY_CONFLICT',409);
   const projection=await selectPendingSourceProjection(tx,binding,sessionId,version);
   if(projection.denied)return deny(projection.reasonCode,projection.reasonCode==='VERSION_MISMATCH'?412:404);
   let intent;
   try{
    intent=parsePendingConsentIntent(binding,command,projection.selection);
    validatePendingConsentIntentWindow(binding,intent,{nowMs:projection.nowMs,maxLifetimeMs:s.maxLifetimeMs},prior.length?'REPLAY':'FRESH');
   }catch(error){
    if(!(error instanceof AuthError)||error.statusCode>=500)throw error;
    const window=error.code==='V3_CONSENT_PENDING_WINDOW_INVALID';
    return deny(window?'WINDOW_DENIED':'SCOPE_DENIED',prior.length&&window?404:422);
   }
   let original;
   if(prior.length){
    const stored=(await tx.query(`SELECT preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_hospital_id,
     actor_id,purpose,valid_from,valid_until,policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,created_at
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[prior[0].preparation_id])).rows;
    if(stored.length!==1)throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
    const row=stored[0];
    const scopes=(await tx.query(`SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1 ORDER BY ordinal`,[row.preparation_id])).rows;
    const resources=scopes.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
    const actions=(await tx.query('SELECT action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1 ORDER BY ordinal',[row.preparation_id])).rows.map(r=>r.action);
    if(row.session_id!==sessionId||prior[0].session_id!==sessionId||row.session_version!==version||row.patient_ref!==command.patientRefId
     ||row.owner_tenant_id!==binding.tenantId||row.source_hospital_id!==binding.hospitalId||row.target_hospital_id!==command.targetHospitalId
     ||row.actor_id!==binding.actorId||row.purpose!==command.purpose||row.policy_version!==command.policyVersion
     ||new Date(row.valid_from).toISOString()!==command.validFrom||new Date(row.valid_until).toISOString()!==command.validUntil
     ||new Date(row.created_at).getTime()!==new Date(prior[0].response_created_at).getTime()
     ||resources.length!==row.resource_count||actions.length!==row.action_count||JSON.stringify(resources)!==JSON.stringify(command.resources)
     ||JSON.stringify(actions)!==JSON.stringify(command.allowedActions)||!sameDigest(row.submitted_evidence_commitment,evidence)
     ||!sameDigest(row.resource_snapshot_digest,createHash('sha256').update(JSON.stringify(resources)).digest()))
     throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
    original=receipt(prior[0]);
    await audit({...correlation,preparationId:row.preparation_id,sessionId,sessionVersion:version,
     action:'PREPARATION_REPLAYED',reasonCode:'PENDING_UNVERIFIED'});
   }else{
    const id=randomUUID(),eventId=randomUUID();
    const inserted=await tx.query(`INSERT INTO highpass_v3.consent_preparation_requests
     (preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,
      valid_from,valid_until,policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
     SELECT $1,session_id,version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,$3,purpose,
      $4,$5,$6,$7,$8,$9,$10,$11,$12,$13 FROM highpass_v3.exchange_sessions WHERE session_id=$2`,
    [id,sessionId,binding.actorId,command.validFrom,command.validUntil,command.policyVersion,evidence,
     createHash('sha256').update(JSON.stringify(command.resources)).digest(),command.resources.length,command.allowedActions.length,eventId,correlation.auditSessionId,correlation.traceId]);
    if(inserted.rowCount!==1)throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
    await tx.query(`INSERT INTO highpass_v3.consent_preparation_scopes
     SELECT $1,ordinality::integer,value->>'studyInstanceUid',NOT(value ? 'seriesInstanceUids'),
      CASE WHEN value ? 'seriesInstanceUids' THEN ARRAY(SELECT jsonb_array_elements_text(value->'seriesInstanceUids')) ELSE NULL END
     FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY`,[id,JSON.stringify(command.resources)]);
    await tx.query(`INSERT INTO highpass_v3.consent_preparation_actions SELECT $1,ordinality::integer,value FROM unnest($2::text[]) WITH ORDINALITY AS x(value,ordinality)`,[id,command.allowedActions]);
    await audit({...correlation,eventId,preparationId:id,sessionId,sessionVersion:version,action:'PREPARATION_CREATED',reasonCode:'PENDING_UNVERIFIED'});
    const ledger=(await tx.query(`INSERT INTO highpass_v3.consent_preparation_results
     SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',$2,$3,preparation_id,session_id,session_version,state,evidence_status,created_at
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1
     RETURNING preparation_id,session_id,response_session_version,response_state,response_evidence_status,response_created_at`,[id,keyDigest,requestDigest])).rows;
    if(ledger.length!==1)throw new V3TransactionError('V3_PENDING_RESULT_INVALID');original=receipt(ledger[0]);
   }
   const clock=Number((await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0]?.now_ms);
   // Work may cross expiry: rollback the entire result/audit, never return expired ALLOW.
   validatePendingConsentIntentWindow(binding,intent,{nowMs:clock,maxLifetimeMs:s.maxLifetimeMs},'REPLAY');
   return original;
  },networkRequired?networkInput:undefined);
  if(result.denied)throw new AuthError(result.status,result.code);return result;
 }
 dispose(){const s=state.get(this);s.key?.fill(0);s.key=null;}
}
