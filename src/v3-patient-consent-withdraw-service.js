import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {parsePatientConsentWithdrawalCommand} from './v3-patient-consent-withdraw-command.js';
import {assertPatientWithdrawalTransactions,patientWithdrawalCommandPolicy,patientWithdrawalTransactionAssurance,
 selectPatientWithdrawalContext,assertPatientWithdrawalContext,selectPatientWithdrawalProjection,
 assertLivePatientWithdrawalProjection} from './v3-patient-consent-withdraw-projection.js';

const privateState=new WeakMap(),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=()=>{throw new V3TransactionError('V3_PATIENT_WITHDRAW_RESULT_INVALID');};
function receipt(row,command){
 if(row?.consent_id!==command.consentId||row.content_version!==1||row.event_sequence!==3||row.state!=='WITHDRAWN'
  ||!uuid.test(row.event_id??'')||!Buffer.isBuffer(row.evidence_digest)||row.evidence_digest.length!==32
  ||!Number.isFinite(Date.parse(row.effective_at))||!Number.isFinite(Date.parse(row.recorded_at)))invalid();
 return Object.freeze({consentId:row.consent_id,contentVersion:1,eventId:row.event_id,eventSequence:3,state:'WITHDRAWN',
  effectiveAt:row.effective_at,recordedAt:row.recorded_at,evidenceDigest:row.evidence_digest.toString('hex'),cascadeStatus:'REQUESTED'});
}
/** Internal synthetic service. Original receipt is never a current access authority. */
export class V3PatientConsentWithdrawalService {
 constructor({transactions,hmacKey}={}){
  assertPatientWithdrawalTransactions(transactions);
  if(!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,key:Buffer.from(hmacKey)});
 }
 async withdraw(binding,idempotencyKey,request){
  const s=privateState.get(this);
  if(!s?.key)throw new V3TransactionError('V3_PATIENT_WITHDRAW_PROVIDER_UNAVAILABLE');
  const command=parsePatientConsentWithdrawalCommand(binding,request,patientWithdrawalCommandPolicy(s.transactions));
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey))
   throw new AuthError(422,'V3_PATIENT_WITHDRAW_COMMAND_INVALID');
  const scope=[binding.tenantId,binding.hospitalId,binding.actorId,binding.patientRefId,'CONSENT_WITHDRAW'];
  const hash=(domain,value)=>createHmac('sha256',s.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HP-V3-WITHDRAW-KEY',idempotencyKey),requestDigest=hash('HP-V3-WITHDRAW-COMMAND',
   [command.consentId,command.contentVersion,command.expectedEventSequence]);
  const outcome=await s.transactions.run(binding,command,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   const context=await selectPatientWithdrawalContext(tx,binding,command);
   const audit=async(result,reason,event=null)=>{
    const rows=(await tx.query(`INSERT INTO highpass_v3.consent_withdrawal_outcomes
    (outcome_id,tenant_id,hospital_id,patient_ref,actor_id,selector_digest,key_digest,result,reason_code,receipt_event_id,audit_session_id,trace_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING outcome_id`,[randomUUID(),binding.tenantId,binding.hospitalId,binding.patientRefId,
     binding.actorId,requestDigest,keyDigest,result,reason,event,randomUUID(),randomUUID().replaceAll('-','')])).rows;
    if(rows.length!==1)invalid();
   };
   const deny=async reason=>{await audit('DENY',reason);return {denied:true,reasonCode:reason};};
   if(context.denied)return deny(context.reasonCode);
   assertPatientWithdrawalContext(tx,binding,command,context);
   const prior=(await tx.query(`SELECT r.request_digest,e.consent_id,e.content_version,e.event_id,e.event_sequence,e.state,
    e.effective_at::text,e.recorded_at::text,e.evidence_digest FROM highpass_v3.consent_lifecycle_results r
    JOIN highpass_v3.consent_lifecycle_events e USING(event_id)
    WHERE r.tenant_id=$1 AND r.hospital_id=$2 AND r.actor_id=$3 AND r.operation='CONSENT_WITHDRAW' AND r.key_digest=$4`,
    [binding.tenantId,binding.hospitalId,binding.actorId,keyDigest])).rows;
   if(prior.length>1)invalid();
   if(prior.length){
    const r=prior[0];if(!Buffer.isBuffer(r.request_digest)||r.request_digest.length!==32)invalid();
    if(!timingSafeEqual(r.request_digest,requestDigest))return deny('IDEMPOTENCY_CONFLICT');
    if(context.terminalId!==r.event_id||context.terminalState!=='WITHDRAWN')invalid();
    const original=receipt(r,command);await audit('HISTORICAL_RESULT','ORIGINAL_RECEIPT_RECOVERED',r.event_id);return original;
   }
   const p=await selectPatientWithdrawalProjection(tx,binding,command,context);
   if(p.denied)return deny(p.reasonCode);
   assertLivePatientWithdrawalProjection(tx,binding,command,p);
   const a=patientWithdrawalTransactionAssurance(tx,binding,command),eventId=randomUUID();
   // Copy exact immutable DB times/content; CTE stamps one actual DB clock for both times.
   const inserted=(await tx.query(`INSERT INTO highpass_v3.consent_lifecycle_events
    WITH stamp AS MATERIALIZED(SELECT clock_timestamp() AS at), payload AS
    (SELECT jsonb_build_object('event_id',$1::uuid,'consent_id',v.consent_id,'content_version',1,'event_sequence',3,
     'predecessor_id',e.event_id,'predecessor_sequence',2,'predecessor_state','ACTIVE','predecessor_at',e.occurred_at,
     'tenant_id',v.owner_tenant_id,'hospital_id',v.source_hospital_id,'patient_ref',v.patient_ref,'subject_actor_id',v.patient_actor_id,
     'actor_id',$2::uuid,'actor_role','PATIENT','actor_purpose','PATIENT_WITHDRAWAL','operation','CONSENT_WITHDRAW','state','WITHDRAWN',
     'content_digest',v.content_digest,'valid_until',v.valid_until,'policy_version',v.policy_version,
     'effective_at',stamp.at,'recorded_at',stamp.at,'assurance_kind','SIGNED_SYNTHETIC_REAUTH_ONLY',
     'reauthenticated_at',to_timestamp($3::double precision/1000),'max_reauth_age_ms',$4::integer,
     'audit_session_id',$5::uuid,'trace_id',$6::text,'reason_code','PATIENT_WITHDRAWN','key_digest',$7::bytea,
     'request_digest',$8::bytea,'evidence_digest',decode(repeat('00',32),'hex')) AS value
     FROM highpass_v3.consent_content_versions v JOIN highpass_v3.consent_state_events e USING(consent_id,content_version),stamp
     WHERE v.consent_id=$9 AND v.content_version=1 AND e.event_sequence=2), typed AS
    (SELECT r.* FROM payload,jsonb_populate_record(NULL::highpass_v3.consent_lifecycle_events,payload.value) r)
    SELECT (r).* FROM typed t,jsonb_populate_record(NULL::highpass_v3.consent_lifecycle_events,
     to_jsonb(t)||jsonb_build_object('evidence_digest',highpass_v3.consent_lifecycle_evidence(to_jsonb(t)))) r
    RETURNING consent_id,content_version,event_id,event_sequence,state,effective_at::text,recorded_at::text,evidence_digest`,
    [eventId,binding.actorId,a.authTimeMs,a.maxReauthAgeMs,randomUUID(),randomUUID().replaceAll('-',''),keyDigest,requestDigest,command.consentId])).rows;
   if(inserted.length!==1)invalid();
   await tx.query('INSERT INTO highpass_v3.consent_lifecycle_audit SELECT * FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1',[eventId]);
   await tx.query(`INSERT INTO highpass_v3.consent_lifecycle_results SELECT event_id,tenant_id,hospital_id,actor_id,operation,
    key_digest,request_digest,state,effective_at,recorded_at,evidence_digest FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1`,[eventId]);
   await tx.query('INSERT INTO highpass_v3.consent_lifecycle_cascade(event_id) VALUES($1)',[eventId]);
   return receipt(inserted[0],command);
  });
  if(outcome.denied)throw new AuthError(outcome.reasonCode==='IDEMPOTENCY_CONFLICT'?409:403,`V3_WITHDRAW_${outcome.reasonCode}`);
  return outcome;
 }
 dispose(){const s=privateState.get(this);s?.key?.fill(0);if(s)s.key=null;}
}
