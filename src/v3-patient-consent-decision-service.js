import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {parsePatientConsentCommand,assertPatientConsentCommand} from './v3-patient-consent-command.js';
import {assertPatientApprovalTransactions,selectPatientApprovalProjection,assertLivePatientApprovalProjection,
 patientApprovalTransactionAssurance,registerPatientApprovalDeadline} from './v3-patient-approval-projection.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,privateState=new WeakMap();
function invalid(){throw new AuthError(422,'V3_PATIENT_DECISION_INPUT_INVALID');}
function exact(value,keys){
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const actual=Reflect.ownKeys(value);
 if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))invalid();
}
function envelope(binding,body){
 v3BindingExpiry(binding);
 if(binding.role!=='PATIENT')throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:approve'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
 exact(body,['ceremonyId','nonce','command']);exact(body.command,['preparationId','expectedSessionVersion','contentDigest','decision','identityLink']);
 const q=body.command;exact(q.identityLink,['approved','clauseVersion']);
 if(typeof body.ceremonyId!=='string'||!uuid.test(body.ceremonyId)||typeof body.nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.nonce)
  ||typeof q.preparationId!=='string'||!uuid.test(q.preparationId)||q.expectedSessionVersion!==1
  ||typeof q.contentDigest!=='string'||!/^[0-9a-f]{64}$/.test(q.contentDigest)||!['APPROVE','REJECT'].includes(q.decision)
  ||typeof q.identityLink.approved!=='boolean'||typeof q.identityLink.clauseVersion!=='string'
  ||!/^[A-Za-z0-9._:-]{1,64}$/.test(q.identityLink.clauseVersion))invalid();
 const raw=Buffer.from(body.nonce,'base64url');
 try{
  if(raw.length!==32||raw.toString('base64url')!==body.nonce)invalid();
  return {ceremonyId:body.ceremonyId.toLowerCase(),nonceDigest:createHash('sha256').update(raw).digest(),
   command:Object.freeze({preparationId:q.preparationId.toLowerCase(),expectedSessionVersion:1,contentDigest:q.contentDigest,
    decision:q.decision,identityLink:Object.freeze({...q.identityLink})})};
 }finally{raw.fill(0);}
}
function malformed(){throw new V3TransactionError('V3_PATIENT_DECISION_RESULT_INVALID');}
function receipt(row,e){
 if(!uuid.test(row?.consent_id??'')||row.ceremony_id!==e.ceremonyId||row.content_version!==1
  ||!uuid.test(row.event_id??'')||row.state!==(e.command.decision==='APPROVE'?'ACTIVE':'REJECTED')
  ||row.identity_link_approved!==e.command.identityLink.approved||!Buffer.isBuffer(row.evidence_digest)||row.evidence_digest.length!==32
  ||!Number.isSafeInteger(new Date(row.decided_at).getTime()))malformed();
 return Object.freeze({consentId:row.consent_id,contentVersion:1,eventId:row.event_id,eventSequence:2,state:row.state,
  identityLinkApproved:row.identity_link_approved,decidedAt:new Date(row.decided_at).toISOString(),evidenceDigest:row.evidence_digest.toString('hex')});
}
/** Initial durable artifact only. Not AuthorizationDecision, Grant or clinical access. */
export class V3PatientConsentDecisionService {
 constructor({transactions,hmacKey,clausePolicy}={}){
  assertPatientApprovalTransactions(transactions);
  if(!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)throw new V3TransactionError('V3_PATIENT_DECISION_CONFIGURATION_INVALID');
  exact(clausePolicy,['clauseVersion','clauseText']);
  if(typeof clausePolicy.clauseVersion!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(clausePolicy.clauseVersion)
   ||typeof clausePolicy.clauseText!=='string'||clausePolicy.clauseText.includes('\0')||Buffer.byteLength(clausePolicy.clauseText)<1
   ||Buffer.byteLength(clausePolicy.clauseText)>8192)throw new V3TransactionError('V3_PATIENT_DECISION_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,key:Buffer.from(hmacKey),policy:Object.freeze({...clausePolicy})});
 }
 async decide(binding,idempotencyKey,body){
  const e=envelope(binding,body),state=privateState.get(this);
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey))invalid();
  if(!state?.key)throw new V3TransactionError('V3_PATIENT_DECISION_PROVIDER_UNAVAILABLE');
  const scope=[binding.tenantId,binding.hospitalId,binding.actorId,binding.patientRefId,'CONSENT_DECIDE'];
  const hash=(domain,value)=>createHmac('sha256',state.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HPV3-PATIENT-DECISION-KEY',idempotencyKey),requestDigest=hash('HPV3-PATIENT-DECISION-COMMAND',
   [e.ceremonyId,e.nonceDigest.toString('hex'),e.command]);
  const preparationLock=createHash('sha256').update(JSON.stringify(['HPV3-PATIENT-PREPARATION-DECISION',
   binding.tenantId,binding.hospitalId,e.command.preparationId])).digest();
  const result=await state.transactions.run(binding,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[preparationLock.readBigInt64BE().toString()]);
   const projection=await selectPatientApprovalProjection(tx,binding,e.command.preparationId,1,state.policy);
   if(projection.denied)return projection;
   assertLivePatientApprovalProjection(tx,binding,projection);
   const p=projection.selection,assurance=patientApprovalTransactionAssurance(tx,binding);
   const parserProjection=Object.fromEntries(['preparationId','sessionId','expectedSessionVersion','patientRefId','ownerTenantId',
    'sourceHospitalId','targetHospitalId','state','evidenceStatus','contentDigest','validFrom','validUntil'].map(k=>[k,p[k]]));
   const command=parsePatientConsentCommand(binding,e.command,parserProjection,{nowMs:projection.nowMs,
    maxReauthAgeMs:assurance.maxReauthAgeMs,linkClauseVersion:state.policy.clauseVersion});
   assertPatientConsentCommand(binding,command);
   const prior=(await tx.query(`SELECT request_digest,ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest
    FROM highpass_v3.consent_patient_decision_results WHERE tenant_id=$1 AND hospital_id=$2 AND patient_actor_id=$3
    AND patient_ref=$4 AND operation='CONSENT_DECIDE' AND key_digest=$5`,[binding.tenantId,binding.hospitalId,binding.actorId,binding.patientRefId,keyDigest])).rows;
   if(prior.length>1)malformed();
   if(prior.length){
    if(!Buffer.isBuffer(prior[0].request_digest)||prior[0].request_digest.length!==32)malformed();
    if(!timingSafeEqual(prior[0].request_digest,requestDigest))return {denied:true,reasonCode:'IDEMPOTENCY_CONFLICT'};
    return receipt(prior[0],e); // Historical proof, not re-consumption/current authority.
   }
   const ceremonies=(await tx.query(`SELECT ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,
    source_hospital_id,target_hospital_id,patient_actor_id,nonce_hash,content_digest,link_clause_version,link_clause_digest,
    issued_at,expires_at,expires_at>clock_timestamp() AS live FROM highpass_v3.consent_patient_ceremonies
    WHERE ceremony_id=$1 AND preparation_id=$2 AND patient_actor_id=$3`,[e.ceremonyId,p.preparationId,binding.actorId])).rows;
   if(ceremonies.length===0)return {denied:true,reasonCode:'CEREMONY_NOT_FOUND'};if(ceremonies.length!==1)malformed();
   const c=ceremonies[0];
   if(c.session_id!==p.sessionId||c.session_version!==1||c.patient_ref!==binding.patientRefId||c.owner_tenant_id!==binding.tenantId
    ||c.source_hospital_id!==binding.hospitalId||c.target_hospital_id!==p.targetHospitalId||c.patient_actor_id!==binding.actorId
    ||!Buffer.isBuffer(c.nonce_hash)||c.nonce_hash.length!==32||!Buffer.isBuffer(c.content_digest)||c.content_digest.length!==32
    ||!Buffer.isBuffer(c.link_clause_digest)||c.link_clause_digest.length!==32||typeof c.live!=='boolean')malformed();
   if(!timingSafeEqual(c.nonce_hash,e.nonceDigest))return {denied:true,reasonCode:'NONCE_INVALID'};
   if(c.content_digest.toString('hex')!==p.contentDigest||c.link_clause_version!==p.identityLink.clauseVersion
    ||c.link_clause_digest.toString('hex')!==p.identityLink.clauseDigest)return {denied:true,reasonCode:'CEREMONY_CONTENT_MISMATCH'};
   const expires=new Date(c.expires_at).getTime(),issued=new Date(c.issued_at).getTime();
   if(!Number.isSafeInteger(expires)||!Number.isSafeInteger(issued)||expires<=issued||expires-issued>300000)malformed();
   if(!c.live||expires<=Date.now())return {denied:true,reasonCode:'CEREMONY_EXPIRED'};
   registerPatientApprovalDeadline(tx,binding,Math.min(expires,assurance.authTimeMs+assurance.maxReauthAgeMs,v3BindingExpiry(binding)));
   const decided=(await tx.query('SELECT ceremony_id FROM highpass_v3.consent_patient_decisions WHERE preparation_id=$1',[p.preparationId])).rows;
   if(decided.length)return {denied:true,reasonCode:'PREPARATION_ALREADY_DECIDED'};
   const consentId=randomUUID(),initialEvent=randomUUID(),decisionEvent=randomUUID(),auditId=randomUUID(),trace=randomUUID().replaceAll('-','');
   const newState=command.decision==='APPROVE'?'ACTIVE':'REJECTED';
   await tx.query(`INSERT INTO highpass_v3.consent_content_versions(consent_id,content_version,preparation_id,ceremony_id,session_id,
    session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,patient_actor_id,
    purpose,valid_from,valid_until,policy_version,content_digest,resource_count,action_count,link_clause_version,link_clause_text,
    link_clause_digest,link_purpose,link_valid_from,link_valid_until,created_at)
    SELECT $1::uuid,1,p.preparation_id,c.ceremony_id,p.session_id,p.session_version,p.patient_ref,p.owner_tenant_id,p.source_hospital_id,
    p.target_tenant_id,p.target_hospital_id,c.patient_actor_id,p.purpose,p.valid_from,p.valid_until,p.policy_version,c.content_digest,
    p.resource_count,p.action_count,c.link_clause_version,c.link_clause_text,c.link_clause_digest,c.link_purpose,c.link_valid_from,c.link_valid_until,
    clock_timestamp() FROM highpass_v3.consent_preparation_requests p JOIN highpass_v3.consent_patient_ceremonies c ON c.preparation_id=p.preparation_id
    WHERE p.preparation_id=$2 AND c.ceremony_id=$3`,[consentId,p.preparationId,e.ceremonyId]);
   await tx.query(`INSERT INTO highpass_v3.consent_content_scopes SELECT $1::uuid,1,ordinal,study_instance_uid,whole_study,series_instance_uids
    FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$2`,[consentId,p.preparationId]);
   await tx.query(`INSERT INTO highpass_v3.consent_content_actions SELECT $1::uuid,1,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$2`,[consentId,p.preparationId]);
   await tx.query(`INSERT INTO highpass_v3.consent_state_events(event_id,consent_id,content_version,event_sequence,ceremony_id,preparation_id,
    session_id,patient_ref,tenant_id,hospital_id,patient_actor_id,from_state,state,action,audit_session_id,trace_id,occurred_at)
    SELECT $2::uuid,consent_id,content_version,1,ceremony_id,preparation_id,session_id,patient_ref,owner_tenant_id,source_hospital_id,
     patient_actor_id,NULL::text,'PENDING','CONTENT_RECORDED',$4::uuid,$5::text,created_at FROM highpass_v3.consent_content_versions WHERE consent_id=$1
    UNION ALL SELECT $3::uuid,consent_id,content_version,2,ceremony_id,preparation_id,session_id,patient_ref,owner_tenant_id,source_hospital_id,
     patient_actor_id,'PENDING',$6::text,'PATIENT_DECIDED',$4::uuid,$5::text,created_at FROM highpass_v3.consent_content_versions WHERE consent_id=$1`,
   [consentId,initialEvent,decisionEvent,auditId,trace,newState]);
   await tx.query(`INSERT INTO highpass_v3.consent_decision_audit(event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,
    patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
    SELECT event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at
    FROM highpass_v3.consent_state_events WHERE consent_id=$1 AND content_version=1`,[consentId]);
   const rows=(await tx.query(`INSERT INTO highpass_v3.consent_patient_decisions(ceremony_id,preparation_id,consent_id,content_version,session_id,
    patient_ref,tenant_id,hospital_id,patient_actor_id,nonce_proof_digest,decision,identity_link_approved,event_id,state,decided_at,
    assurance_kind,reauthenticated_at,max_reauth_age_ms,evidence_digest)
    SELECT ceremony_id,preparation_id,consent_id,content_version,session_id,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id,
     $3::bytea,$4::text,$5::boolean,$2::uuid,$6::text,created_at,'SIGNED_SYNTHETIC_REAUTH_ONLY',to_timestamp($7::double precision/1000),$8::integer,
     highpass_v3.patient_decision_evidence_digest(ceremony_id,consent_id,content_version,$4::text,$5::boolean,created_at,
      to_timestamp($7::double precision/1000),$8::integer) FROM highpass_v3.consent_content_versions WHERE consent_id=$1 AND content_version=1
    RETURNING ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest`,
   [consentId,decisionEvent,e.nonceDigest,command.decision,command.identityLink.approved,newState,assurance.authTimeMs,assurance.maxReauthAgeMs])).rows;
   if(rows.length!==1)malformed();const response=receipt(rows[0],e);
   await tx.query(`INSERT INTO highpass_v3.consent_patient_decision_results(tenant_id,hospital_id,patient_actor_id,patient_ref,operation,
    key_digest,request_digest,ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest)
    SELECT tenant_id,hospital_id,patient_actor_id,patient_ref,'CONSENT_DECIDE',$2::bytea,$3::bytea,ceremony_id,consent_id,content_version,
    event_id,state,identity_link_approved,decided_at,evidence_digest FROM highpass_v3.consent_patient_decisions WHERE ceremony_id=$1`,
   [e.ceremonyId,keyDigest,requestDigest]);
   assertPatientConsentCommand(binding,command);assertLivePatientApprovalProjection(tx,binding,projection);
   return response;
  });
  if(result.denied)throw new AuthError(['PREPARATION_NOT_FOUND','CEREMONY_NOT_FOUND'].includes(result.reasonCode)?404:409,
   `V3_PATIENT_DECISION_${result.reasonCode}`);
  return result;
 }
 dispose(){const s=privateState.get(this);s?.key?.fill(0);if(s)s.key=null;}
}
