import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied=new Set(['SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED','IDEMPOTENCY_CONFLICT','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH','SESSION_TERMINAL','CANCEL_NOT_SUPPORTED']);
export function exchangeCorrelation(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).some(k=>!['auditSessionId','traceId'].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
  throw new AuthError(422,'V3_SESSION_REQUEST_INVALID');
 const {auditSessionId=randomUUID(),traceId=randomUUID()}=value;
 if(typeof auditSessionId!=='string'||!UUID.test(auditSessionId)||typeof traceId!=='string'||! /^[A-Za-z0-9_-]{16,64}$/.test(traceId))
  throw new AuthError(422,'V3_SESSION_REQUEST_INVALID');
 return {auditSessionId,traceId};
}
export async function appendExchangeAudit(tx,binding,event){
 v3BindingExpiry(binding);
 const allowed=new Set(['auditSessionId','traceId','sessionId','action','reasonCode','sessionVersion','eventId']);
 if(!event||typeof event!=='object'||Array.isArray(event)||![Object.prototype,null].includes(Object.getPrototypeOf(event))
  ||Reflect.ownKeys(event).some(k=>!allowed.has(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(event,k),'value')))
  throw new AuthError(422,'V3_SESSION_AUDIT_INVALID');
 const {action,reasonCode,sessionId=null,sessionVersion=sessionId?1:null,eventId=action==='SESSION_CREATED'?sessionId:randomUUID()}=event;
 const context=exchangeCorrelation({auditSessionId:event.auditSessionId,traceId:event.traceId});
 if(sessionId!==null&&(typeof sessionId!=='string'||!UUID.test(sessionId))
  ||typeof eventId!=='string'||!UUID.test(eventId)||sessionId&&( !Number.isSafeInteger(sessionVersion)||sessionVersion<1||sessionVersion>2147483647)
  ||sessionId===null&&sessionVersion!==null||action==='SESSION_CREATED'&&(eventId!==sessionId||sessionVersion!==1)
  ||!(action==='SESSION_CREATED'&&reasonCode==='SESSION_REQUESTED'&&sessionId
   ||action==='SESSION_READ'&&reasonCode==='METADATA_READ'&&sessionId
   ||action==='SESSION_CANCELLED'&&sessionId&&sessionVersion===2&&['PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL'].includes(reasonCode)
   ||action==='SESSION_EXPIRED'&&sessionId&&sessionVersion===2&&reasonCode==='SESSION_EXPIRED'
   ||action==='SESSION_DENIED'&&denied.has(reasonCode)))throw new AuthError(422,'V3_SESSION_AUDIT_INVALID');
 await tx.query(`INSERT INTO highpass_v3.exchange_audit_outbox
 (event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[eventId,sessionId,binding.tenantId,binding.hospitalId,binding.actorId,
  context.auditSessionId,context.traceId,action,action==='SESSION_DENIED'?'DENY':'ALLOW',reasonCode,sessionVersion]);
 return eventId;
}
