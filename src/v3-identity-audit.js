import { randomUUID } from 'node:crypto';
import { v3BindingExpiry } from './v3-principal-registry.js';
import { AuthError } from './auth.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states=new Set(['NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED']);
const actions=new Set(['MAPPING_CREATED','MAPPING_REVIEWED','MAPPING_CONFLICT','MAPPING_READ','MAPPING_DENIED','PATIENT_REF_CREATED']);
const reasons=new Set(['MAPPING_REGISTERED','MAPPING_VERIFIED','MAPPING_REVIEW_REQUIRED','MAPPING_IDENTITY_CONFLICT',
  'MAPPING_METADATA_READ','MAPPING_NOT_FOUND','MAPPING_SCOPE_DENIED','MAPPING_VERSION_CONFLICT','PATIENT_REF_REGISTERED',
  'MAPPING_SELF_REVIEW','MAPPING_REGISTRATION_REQUIRED','PATIENT_REF_NOT_FOUND','MAPPING_IDEMPOTENCY_CONFLICT','MAPPING_REPLAY_RESOURCE_UNAVAILABLE']);
const fields=new Set(['mappingId','auditSessionId','traceId','action','result','reasonCode','oldState','newState','mappingVersion','evidenceDigest','patientRefId']);

export async function appendIdentityAudit(transaction,binding,event) {
  v3BindingExpiry(binding);
  const validUuid=value=>typeof value==='string' && UUID.test(value);
  if(!event || typeof event!=='object' || Object.keys(event).some(key=>!fields.has(key))
    || !validUuid(event.auditSessionId) || typeof event.traceId!=='string' || !/^[A-Za-z0-9_-]{16,64}$/.test(event.traceId)
    || !actions.has(event.action) || !['ALLOW','DENY'].includes(event.result) || !reasons.has(event.reasonCode)
    || [event.oldState,event.newState].some(state=>state!=null && !states.has(state))
    || (event.mappingId==null ? event.mappingVersion!=null : (!validUuid(event.mappingId) || !Number.isSafeInteger(event.mappingVersion) || event.mappingVersion<1))
    || (event.patientRefId!=null && !validUuid(event.patientRefId))
    || (event.action==='PATIENT_REF_CREATED' && (!validUuid(event.patientRefId)||event.mappingId!=null
      ||event.oldState!=null||event.newState!=null||event.result!=='ALLOW'||event.reasonCode!=='PATIENT_REF_REGISTERED'))
    || (event.evidenceDigest!=null && (!Buffer.isBuffer(event.evidenceDigest) || event.evidenceDigest.length!==32))) {
    throw new AuthError(422,'V3_AUDIT_EVENT_INVALID');
  }
  const eventId=randomUUID();
  await transaction.query(`INSERT INTO highpass_v3.identity_audit_outbox
    (event_id,tenant_id,hospital_id,actor_id,mapping_id,audit_session_id,trace_id,action,result,reason_code,
     old_state,new_state,mapping_version,evidence_digest,patient_ref)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [eventId,binding.tenantId,binding.hospitalId,binding.actorId,event.mappingId??null,event.auditSessionId.toLowerCase(),
    event.traceId,event.action,event.result,event.reasonCode,event.oldState??null,event.newState??null,
    event.mappingVersion??null,event.evidenceDigest??null,event.patientRefId??null]);
  return eventId;
}
