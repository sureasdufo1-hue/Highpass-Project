import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {prepareConsentExpiryBatch} from './v3-consent-expiry-command.js';
import {assertConsentExpiryTransactions,assertConsentExpiryTransaction} from './v3-consent-expiry-transactions.js';

const state=new WeakMap(),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function batchReceipt(row,limit){
 if(!uuid.test(row?.batch_id??'')||!Number.isSafeInteger(row.processed)||row.processed<0||row.processed>limit
  ||row.batch_limit!==limit||!Array.isArray(row.receipts)||row.receipts.length!==row.processed)
  throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
 const receipts=row.receipts.map(r=>{
  if(!r||!uuid.test(r.consentId??'')||!uuid.test(r.eventId??'')||r.contentVersion!==1||r.eventSequence!==3||r.state!=='EXPIRED'
   ||r.cascadeStatus!=='REQUESTED'||!/^[a-f0-9]{64}$/.test(r.evidenceDigest??'')
   ||!Number.isFinite(Date.parse(r.effectiveAt))||!Number.isFinite(Date.parse(r.recordedAt)))
   throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
  return Object.freeze({consentId:r.consentId,contentVersion:1,eventId:r.eventId,eventSequence:3,state:'EXPIRED',
   effectiveAt:r.effectiveAt,recordedAt:r.recordedAt,evidenceDigest:r.evidenceDigest,cascadeStatus:'REQUESTED'});
 });
 return Object.freeze({batchId:row.batch_id,processed:row.processed,receipts:Object.freeze(receipts)});
}

/** Internal bounded maintenance; original receipts never confer clinical authority. */
export class V3ConsentExpiryService {
 constructor({transactions,hmacKey}={}){
  assertConsentExpiryTransactions(transactions);
  if(!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)throw new V3TransactionError('V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
  state.set(this,{transactions,key:Buffer.from(hmacKey)});
 }
 async expireBatch(binding,executionKey,options={}){
  const s=state.get(this);if(!s?.key)throw new V3TransactionError('V3_CONSENT_EXPIRY_SERVICE_CLOSED');
  const command=prepareConsentExpiryBatch(binding,options);
  if(typeof executionKey!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(executionKey))throw new AuthError(422,'V3_CONSENT_EXPIRY_EXECUTION_INVALID');
  const scope=[binding.tenantId,binding.hospitalId,binding.actorId,'CONSENT_EXPIRE'];
  const hash=(domain,value)=>createHmac('sha256',s.key).update(JSON.stringify([domain,scope,value])).digest();
  const keyDigest=hash('HP-V3-CONSENT-EXPIRY-BATCH-KEY',executionKey),requestDigest=hash('HP-V3-CONSENT-EXPIRY-BATCH-REQUEST',[executionKey,command.limit]);
  return s.transactions.run(binding,command,async tx=>{
   assertConsentExpiryTransaction(tx,binding,command);
   await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
   const prior=(await tx.query(`SELECT batch_id,batch_limit,processed,receipts,request_digest FROM highpass_v3.consent_expiry_batches
    WHERE tenant_id=$1 AND hospital_id=$2 AND actor_id=$3 AND key_digest=$4`,[binding.tenantId,binding.hospitalId,binding.actorId,keyDigest])).rows;
   if(prior.length>1)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
   if(prior.length){
    if(!Buffer.isBuffer(prior[0].request_digest)||prior[0].request_digest.length!==32)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
    if(!timingSafeEqual(prior[0].request_digest,requestDigest))throw new AuthError(409,'V3_CONSENT_EXPIRY_IDEMPOTENCY_CONFLICT');
    return batchReceipt(prior[0],command.limit);
   }
   const candidates=(await tx.query(`SELECT v.consent_id,v.content_version FROM highpass_v3.consent_content_versions v
    JOIN highpass_v3.consent_state_events e USING(consent_id,content_version)
    WHERE v.owner_tenant_id=$1 AND v.source_hospital_id=$2 AND v.content_version=1
     AND e.event_sequence=2 AND e.state='ACTIVE' AND v.valid_until<=clock_timestamp()
     AND NOT EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events l WHERE l.consent_id=v.consent_id AND l.content_version=v.content_version)
    ORDER BY v.valid_until,v.consent_id LIMIT $3`,[binding.tenantId,binding.hospitalId,command.limit])).rows;
   if(candidates.length>command.limit)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
   for(const candidate of candidates){
    if(!uuid.test(candidate.consent_id??'')||candidate.content_version!==1)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
     [JSON.stringify(['HP-V3-CONSENT-LIFECYCLE',binding.tenantId,binding.hospitalId,candidate.consent_id,1])]);
    const current=(await tx.query(`SELECT v.consent_id FROM highpass_v3.consent_content_versions v
     JOIN highpass_v3.consent_state_events e USING(consent_id,content_version)
     WHERE v.consent_id=$1 AND v.content_version=1 AND v.owner_tenant_id=$2 AND v.source_hospital_id=$3
      AND e.event_sequence=2 AND e.state='ACTIVE' AND v.valid_until<=clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events l WHERE l.consent_id=v.consent_id AND l.content_version=1)`,
     [candidate.consent_id,binding.tenantId,binding.hospitalId])).rows;
    if(!current.length)continue;if(current.length!==1)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
    const eventId=randomUUID(),objectKey=hash('HP-V3-CONSENT-EXPIRY-OBJECT',[executionKey,candidate.consent_id,1]);
    const inserted=(await tx.query(`INSERT INTO highpass_v3.consent_lifecycle_events
     WITH stamp AS MATERIALIZED(SELECT clock_timestamp() AS at),payload AS
     (SELECT jsonb_build_object('event_id',$1::uuid,'consent_id',v.consent_id,'content_version',1,'event_sequence',3,
      'predecessor_id',e.event_id,'predecessor_sequence',2,'predecessor_state','ACTIVE','predecessor_at',e.occurred_at,
      'tenant_id',v.owner_tenant_id,'hospital_id',v.source_hospital_id,'patient_ref',v.patient_ref,'subject_actor_id',v.patient_actor_id,
      'actor_id',$2::uuid,'actor_role','INTERNAL_SERVICE','actor_purpose','CONSENT_EXPIRY','operation','CONSENT_EXPIRE','state','EXPIRED',
      'content_digest',v.content_digest,'valid_until',v.valid_until,'policy_version',v.policy_version,
      'effective_at',v.valid_until,'recorded_at',stamp.at,'assurance_kind','REGISTERED_SERVICE_ONLY',
      'reauthenticated_at',NULL,'max_reauth_age_ms',NULL,'audit_session_id',$3::uuid,'trace_id',$4::text,
      'reason_code','CONSENT_DEADLINE_EXPIRED','key_digest',$5::bytea,'request_digest',$6::bytea,
      'evidence_digest',decode(repeat('00',32),'hex')) AS value
      FROM highpass_v3.consent_content_versions v JOIN highpass_v3.consent_state_events e USING(consent_id,content_version),stamp
      WHERE v.consent_id=$7 AND v.content_version=1 AND e.event_sequence=2),typed AS
     (SELECT r.* FROM payload,jsonb_populate_record(NULL::highpass_v3.consent_lifecycle_events,payload.value) r)
     SELECT (r).* FROM typed t,jsonb_populate_record(NULL::highpass_v3.consent_lifecycle_events,
      to_jsonb(t)||jsonb_build_object('evidence_digest',highpass_v3.consent_lifecycle_evidence(to_jsonb(t)))) r RETURNING event_id`,
     [eventId,binding.actorId,randomUUID(),randomUUID().replaceAll('-',''),objectKey,requestDigest,candidate.consent_id])).rows;
    if(inserted.length!==1||inserted[0].event_id!==eventId)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
    await tx.query('INSERT INTO highpass_v3.consent_lifecycle_audit SELECT * FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1',[eventId]);
    await tx.query(`INSERT INTO highpass_v3.consent_lifecycle_results SELECT event_id,tenant_id,hospital_id,actor_id,operation,
     key_digest,request_digest,state,effective_at,recorded_at,evidence_digest FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1`,[eventId]);
    await tx.query('INSERT INTO highpass_v3.consent_lifecycle_cascade(event_id) VALUES($1)',[eventId]);
   }
   const batch=(await tx.query(`INSERT INTO highpass_v3.consent_expiry_batches
    (batch_id,tenant_id,hospital_id,actor_id,key_digest,request_digest,batch_limit,processed,receipts)
    SELECT $1,$2,$3,$4,$5,$6,$7,jsonb_array_length(r.receipts),r.receipts
     FROM (SELECT highpass_v3.consent_expiry_batch_receipts($2,$3,$4,$6) AS receipts) r
    RETURNING batch_id,batch_limit,processed,receipts`,[randomUUID(),binding.tenantId,binding.hospitalId,binding.actorId,keyDigest,requestDigest,command.limit])).rows;
   if(batch.length!==1)throw new V3TransactionError('V3_CONSENT_EXPIRY_RESULT_INVALID');
   return batchReceipt(batch[0],command.limit);
  });
 }
 dispose(){const s=state.get(this);s?.key?.fill(0);if(s)s.key=null;}
}
