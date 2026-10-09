import {randomBytes,randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {assertPatientApprovalTransactions,selectPatientApprovalProjection,assertLivePatientApprovalProjection,
 patientApprovalTransactionAssurance,registerPatientApprovalDeadline} from './v3-patient-approval-projection.js';

const privateState=new WeakMap(),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(){throw new AuthError(422,'V3_PATIENT_CHALLENGE_INPUT_INVALID');}
function plain(value,keys){
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const actual=Reflect.ownKeys(value);
 if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))invalid();
}
function command(value){
 plain(value,['preparationId','expectedSessionVersion']);
 if(typeof value.preparationId!=='string'||!uuid.test(value.preparationId)||value.expectedSessionVersion!==1)invalid();
 return Object.freeze({preparationId:value.preparationId.toLowerCase(),expectedSessionVersion:1});
}
function malformed(){throw new V3TransactionError('V3_PATIENT_CHALLENGE_RESULT_INVALID');}
function metadata(row,selector){
 const issued=new Date(row?.issued_at).getTime(),expires=new Date(row?.expires_at).getTime();
 if(!uuid.test(row?.ceremony_id??'')||row.preparation_id!==selector.preparationId||row.session_version!==1
  ||!Buffer.isBuffer(row.content_digest)||row.content_digest.length!==32||!Number.isSafeInteger(issued)
  ||!Number.isSafeInteger(expires)||expires<=issued||expires-issued>300000)malformed();
 return Object.freeze({ceremonyId:row.ceremony_id,preparationId:row.preparation_id,expectedSessionVersion:1,
  contentDigest:row.content_digest.toString('hex'),issuedAt:new Date(issued).toISOString(),expiresAt:new Date(expires).toISOString()});
}
/** Internal only. A challenge is neither a consent approval nor clinical authority. */
export class V3PatientChallengeIssuanceService {
 constructor({transactions,hmacKey,clausePolicy}={}){
  assertPatientApprovalTransactions(transactions);
  if(!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)throw new V3TransactionError('V3_PATIENT_CHALLENGE_CONFIGURATION_INVALID');
  plain(clausePolicy,['clauseVersion','clauseText']);
  if(typeof clausePolicy.clauseVersion!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(clausePolicy.clauseVersion)
   ||typeof clausePolicy.clauseText!=='string'||clausePolicy.clauseText.includes('\0')||Buffer.byteLength(clausePolicy.clauseText)<1
   ||Buffer.byteLength(clausePolicy.clauseText)>8192)throw new V3TransactionError('V3_PATIENT_CHALLENGE_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,key:Buffer.from(hmacKey),policy:Object.freeze({...clausePolicy})});
 }
 async issue(binding,idempotencyKey,input){
  const selector=command(input);
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey))invalid();
  const state=privateState.get(this);
  if(!state?.key)throw new V3TransactionError('V3_PATIENT_CHALLENGE_PROVIDER_UNAVAILABLE');
  v3BindingExpiry(binding);
  const scope=[binding.tenantId,binding.hospitalId,binding.actorId,binding.patientRefId,'CHALLENGE_ISSUE'];
  const hash=(domain,value)=>createHmac('sha256',state.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HPV3-PATIENT-CHALLENGE-KEY',idempotencyKey),requestDigest=hash('HPV3-PATIENT-CHALLENGE-COMMAND',selector);
  let nonce;
  try{
   const result=await state.transactions.run(binding,async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
    const projection=await selectPatientApprovalProjection(tx,binding,selector.preparationId,1,state.policy);
    if(projection.denied)return projection;
    assertLivePatientApprovalProjection(tx,binding,projection);
    const p=projection.selection,assurance=patientApprovalTransactionAssurance(tx,binding);
    const prior=(await tx.query(`SELECT request_digest,ceremony_id,preparation_id,session_version,content_digest,issued_at,expires_at
     FROM highpass_v3.consent_patient_challenge_results WHERE tenant_id=$1 AND hospital_id=$2 AND patient_actor_id=$3
     AND patient_ref=$4 AND operation='CHALLENGE_ISSUE' AND key_digest=$5`,
    [binding.tenantId,binding.hospitalId,binding.actorId,binding.patientRefId,keyDigest])).rows;
    if(prior.length>1)malformed();
    if(prior.length){
     if(!Buffer.isBuffer(prior[0].request_digest)||prior[0].request_digest.length!==32)malformed();
     if(!timingSafeEqual(prior[0].request_digest,requestDigest))return {denied:true,reasonCode:'IDEMPOTENCY_CONFLICT'};
     return Object.freeze({status:'ISSUED_NONCE_UNAVAILABLE',nonceAvailable:false,requiresFreshChallenge:true,...metadata(prior[0],selector)});
    }
    nonce=randomBytes(32);
    const ceremonyId=randomUUID(),eventId=randomUUID(),auditId=randomUUID(),traceId=randomUUID().replaceAll('-','');
    const rows=(await tx.query(`WITH timing AS MATERIALIZED(SELECT clock_timestamp() AS now)
     INSERT INTO highpass_v3.consent_patient_ceremonies(ceremony_id,preparation_id,session_id,session_version,patient_ref,
      owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,patient_actor_id,nonce_hash,content_digest,
      link_clause_version,link_clause_text,link_clause_digest,link_purpose,link_valid_from,link_valid_until,
      assurance_kind,reauthenticated_at,max_reauth_age_ms,issued_at,expires_at,creation_event_id,audit_session_id,trace_id)
     SELECT $1,p.preparation_id,p.session_id,p.session_version,p.patient_ref,p.owner_tenant_id,p.source_hospital_id,
      p.target_tenant_id,p.target_hospital_id,$3,$4,$5,$6,$7,$8,'PATIENT_IDENTITY_LINK',p.valid_from,p.valid_until,
      'SIGNED_SYNTHETIC_REAUTH_ONLY',to_timestamp($9::double precision/1000),$10::integer,t.now,
      LEAST(t.now+interval '5 minutes',to_timestamp(($9::double precision+$10::integer)/1000),p.valid_until,
       to_timestamp($14::double precision/1000),(SELECT valid_until FROM highpass_v3.exchange_sessions WHERE session_id=p.session_id)),
      $11,$12,$13 FROM highpass_v3.consent_preparation_requests p CROSS JOIN timing t WHERE p.preparation_id=$2
     RETURNING ceremony_id,preparation_id,session_version,content_digest,issued_at,expires_at`,
    [ceremonyId,p.preparationId,binding.actorId,createHash('sha256').update(nonce).digest(),Buffer.from(p.contentDigest,'hex'),
     p.identityLink.clauseVersion,p.identityLink.clauseText,Buffer.from(p.identityLink.clauseDigest,'hex'),
     assurance.authTimeMs,assurance.maxReauthAgeMs,eventId,auditId,traceId,v3BindingExpiry(binding)])).rows;
    if(rows.length!==1)malformed();const receipt=metadata(rows[0],selector);
    registerPatientApprovalDeadline(tx,binding,new Date(receipt.expiresAt).getTime());
    await tx.query(`INSERT INTO highpass_v3.consent_patient_ceremony_audit SELECT creation_event_id,ceremony_id,preparation_id,
     session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id,audit_session_id,trace_id,
     'CEREMONY_CREATED','RECORDED','SYNTHETIC_CHALLENGE_ONLY',issued_at
     FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id=$1`,[ceremonyId]);
    await tx.query(`INSERT INTO highpass_v3.consent_patient_challenge_results(tenant_id,hospital_id,patient_actor_id,patient_ref,
     operation,key_digest,request_digest,ceremony_id,preparation_id,session_id,session_version,content_digest,issued_at,expires_at)
     SELECT owner_tenant_id,source_hospital_id,patient_actor_id,patient_ref,'CHALLENGE_ISSUE',$2,$3,ceremony_id,
     preparation_id,session_id,session_version,content_digest,issued_at,expires_at
     FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id=$1`,[ceremonyId,keyDigest,requestDigest]);
    assertLivePatientApprovalProjection(tx,binding,projection);
    return Object.freeze({status:'ISSUED',nonceAvailable:true,requiresFreshChallenge:false,...receipt});
   });
   if(result.denied)throw new AuthError(result.reasonCode==='PREPARATION_NOT_FOUND'?404:409,
    `V3_PATIENT_CHALLENGE_${result.reasonCode}`);
   // No nonce can escape until acknowledged COMMIT. Unknown commit throws instead.
   return result.status==='ISSUED'?Object.freeze({...result,nonce:nonce.toString('base64url')}):result;
  }finally{nonce?.fill(0);}
 }
 dispose(){const state=privateState.get(this);state?.key?.fill(0);if(state)state.key=null;}
}
