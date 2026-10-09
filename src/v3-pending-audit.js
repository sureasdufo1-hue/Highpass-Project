import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {exchangeCorrelation} from './v3-exchange-audit.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasons=new Set(['SESSION_NOT_FOUND','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH',
 'SESSION_TERMINAL','SESSION_EXPIRED','SCOPE_DENIED','WINDOW_DENIED','IDEMPOTENCY_CONFLICT']);
function invalid(){throw new AuthError(422,'V3_CONSENT_PENDING_AUDIT_INVALID');}
// Internal repository helper ONLY: caller must commit/rollback via guarded bounded tx.
export async function appendPendingAudit(tx,binding,event){
 v3BindingExpiry(binding);
 if(!['PATIENT','DOCTOR','HOSPITAL_ADMIN'].includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:write'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
 const keys=new Set(['eventId','action','reasonCode','preparationId','sessionId','sessionVersion','auditSessionId','traceId']);
 if(!event||typeof event!=='object'||Array.isArray(event)||![Object.prototype,null].includes(Object.getPrototypeOf(event))
  ||Reflect.ownKeys(event).some(k=>!keys.has(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(event,k),'value')))invalid();
 const {eventId=randomUUID(),action,reasonCode,preparationId=null,sessionId=null,sessionVersion=null}=event;
 if(typeof eventId!=='string'||!uuid.test(eventId))invalid();
 const deny=action==='PREPARATION_DENIED';
 if(deny){if(!reasons.has(reasonCode)||preparationId!==null||sessionId!==null||sessionVersion!==null)invalid();}
 else if(!['PREPARATION_CREATED','PREPARATION_REPLAYED'].includes(action)||reasonCode!=='PENDING_UNVERIFIED'
  ||typeof preparationId!=='string'||!uuid.test(preparationId)||typeof sessionId!=='string'||!uuid.test(sessionId)||sessionVersion!==1)invalid();
 let context;try{context=exchangeCorrelation({auditSessionId:event.auditSessionId,traceId:event.traceId});}catch{invalid();}
 if(!tx||typeof tx.query!=='function')throw new V3TransactionError('V3_PENDING_TRANSACTION_REQUIRED');
 let result;
 if(deny){
  result=await tx.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox
   (event_id,tenant_id,hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,action,result,reason_code)
   VALUES($1,$2,$3,$4,NULL,NULL,NULL,$5,$6,'PREPARATION_DENIED','DENY',$7)`,
  [eventId.toLowerCase(),binding.tenantId,binding.hospitalId,binding.actorId,context.auditSessionId,context.traceId,reasonCode]);
 }else{
  result=await tx.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox
   (event_id,tenant_id,hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,action,result,reason_code,occurred_at)
   SELECT $1,owner_tenant_id,source_hospital_id,actor_id,session_id,session_version,preparation_id,$5,$6,$7,'ALLOW','PENDING_UNVERIFIED',
    CASE WHEN $7='PREPARATION_CREATED' THEN created_at ELSE statement_timestamp() END
   FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$2 AND session_id=$3 AND session_version=1
    AND actor_id=$4 AND owner_tenant_id=$8 AND source_hospital_id=$9 AND state='PENDING' AND evidence_status='UNVERIFIED'
    AND ($7<>'PREPARATION_CREATED' OR (creation_event_id=$1 AND audit_session_id=$5 AND trace_id=$6))`,
  [eventId.toLowerCase(),preparationId.toLowerCase(),sessionId.toLowerCase(),binding.actorId,context.auditSessionId,context.traceId,action,binding.tenantId,binding.hospitalId]);
 }
 if(result.rowCount!==1)throw new V3TransactionError('V3_PENDING_AUDIT_NOT_RECORDED');
 return eventId.toLowerCase();
}
