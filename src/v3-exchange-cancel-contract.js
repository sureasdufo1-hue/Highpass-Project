import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';

export const v3ExchangeCancelPolicy=Object.freeze({requiredScope:'exchange:cancel',allowedRoles:Object.freeze(['PATIENT','DOCTOR','HOSPITAL_ADMIN'])});
export const exchangeStates=Object.freeze(['REQUESTED','IDENTITY_PENDING','CONSENT_PENDING','CONSENTED','AUTHORIZED','PREFLIGHT','READY','ACTIVE','VIEWING',
  'DOWNLOADING','TRANSFERRING','MOBILE_EXPORTING','COMPLETED','REJECTED','EXPIRED','REVOKED','FAILED','CANCELLED']);
export const exchangeTerminalStates=Object.freeze(['COMPLETED','REJECTED','EXPIRED','REVOKED','FAILED','CANCELLED']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasons=Object.freeze(['PATIENT_WITHDRAWN','REQUESTER_CANCELLED','POLICY_REVOKED','ADMINISTRATIVE_CANCEL']);
const commands=new WeakMap();
function invalid(){throw new AuthError(422,'V3_SESSION_CANCEL_INVALID');}
function principal(binding){
  v3BindingExpiry(binding);
  if(!v3ExchangeCancelPolicy.allowedRoles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
  if(!binding.scopes.includes('exchange:cancel'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
}

/** Pure command validation only; not a DB mutation, cascade or access capability. */
export function prepareExchangeSessionCancel(binding,sessionId,ifMatch,request){
  principal(binding);
  if(typeof sessionId!=='string'||!UUID.test(sessionId)||typeof ifMatch!=='string'||!/^"[1-9][0-9]*"$/.test(ifMatch))invalid();
  const expectedVersion=Number(ifMatch.slice(1,-1));
  // PostgreSQL integer version must leave room for exactly one increment.
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion>2147483646)invalid();
  if(!request||typeof request!=='object'||Array.isArray(request)||![Object.prototype,null].includes(Object.getPrototypeOf(request))
    ||!Object.hasOwn(request,'reasonCode')||Reflect.ownKeys(request).some(key=>!['reasonCode','comment'].includes(key)
      ||!Object.hasOwn(Object.getOwnPropertyDescriptor(request,key),'value')))invalid();
  if(!reasons.includes(request.reasonCode)||request.comment!==undefined&&(typeof request.comment!=='string'||request.comment.length>200||/[\u0000-\u001f\u007f]/.test(request.comment)))invalid();
  const permitted=binding.role==='PATIENT'?['PATIENT_WITHDRAWN']:binding.role==='DOCTOR'?['REQUESTER_CANCELLED']:['REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL'];
  // POLICY_REVOKED is reserved for a future verified policy/revocation workflow.
  if(!permitted.includes(request.reasonCode))throw new AuthError(403,'V3_SESSION_CANCEL_REASON_NOT_ALLOWED');
  const command=Object.freeze({sessionId:sessionId.toLowerCase(),expectedVersion,reasonCode:request.reasonCode,
    ...(request.comment!==undefined?{comment:request.comment}:{})});
  commands.set(command,binding);return command;
}

/** Apply only to a row selected/locked by the server transaction, never client JSON. */
export function validateExchangeCancellationOwnership(binding,command,row){
  principal(binding);
  if(commands.get(command)!==binding)throw new AuthError(403,'V3_SESSION_CANCEL_COMMAND_REQUIRED');
  if(!row||row.sessionId!==command.sessionId||row.ownerTenantId!==binding.tenantId||row.sourceHospitalId!==binding.hospitalId
    ||binding.role==='PATIENT'&&row.patientRefId!==binding.patientRefId||binding.role==='DOCTOR'&&row.requesterId!==binding.actorId
    ||binding.role==='HOSPITAL_ADMIN'&&command.reasonCode==='REQUESTER_CANCELLED'&&row.requesterId!==binding.actorId)
    throw new AuthError(404,'V3_SESSION_RESOURCE_UNAVAILABLE');
}
export function validateExchangeCancellation(binding,command,row,{nowMs}={}){
  validateExchangeCancellationOwnership(binding,command,row);
  if(!Number.isSafeInteger(nowMs)||nowMs<0)throw new AuthError(503,'V3_SESSION_CLOCK_UNAVAILABLE');
  if(!exchangeStates.includes(row.state)||!Number.isSafeInteger(row.version)||row.version<1||row.version>2147483646
    ||!Number.isSafeInteger(row.validUntilMs))throw new AuthError(503,'V3_SESSION_SNAPSHOT_INVALID');
  if(row.version!==command.expectedVersion)throw new AuthError(412,'V3_SESSION_VERSION_MISMATCH');
  if(exchangeTerminalStates.includes(row.state))throw new AuthError(409,'V3_SESSION_TERMINAL');
  if(row.validUntilMs<=nowMs)throw new AuthError(409,'V3_SESSION_EXPIRED');
  return Object.freeze({fromState:row.state,toState:'CANCELLED',fromVersion:row.version,toVersion:row.version+1});
}
