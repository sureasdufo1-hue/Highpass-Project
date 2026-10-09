import {AuthError} from './auth.js';
import {v3BindingExpiry,assertV3SyntheticPatientReauthentication} from './v3-principal-registry.js';
import {parseExchangeTimestamp} from './v3-exchange-session-contract.js';

export const v3PatientConsentCommandPolicy=Object.freeze({requiredScope:'consent:approve',allowedRoles:Object.freeze(['PATIENT'])});
const commands=new WeakMap(),uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=()=>{throw new AuthError(422,'V3_PATIENT_CONSENT_COMMAND_INVALID');};
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))
  ||Reflect.ownKeys(value).some(key=>!keys.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))invalid();
}
function uuid(value){if(typeof value!=='string'||!uuidPattern.test(value))invalid();return value.toLowerCase();}
function principal(binding){
 v3BindingExpiry(binding);
 if(binding.role!=='PATIENT')throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:approve'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
}
/** Pure command provenance, NOT persisted consent/approval/clinical authority.
 * Projection/policy arguments are internal inputs, not proven DB authority here. */
export function parsePatientConsentCommand(binding,request,projection,policy){
 principal(binding);
 exact(request,['preparationId','expectedSessionVersion','contentDigest','decision','identityLink']);
 exact(request.identityLink,['approved','clauseVersion']);
 exact(projection,['preparationId','sessionId','expectedSessionVersion','patientRefId','ownerTenantId','sourceHospitalId',
  'targetHospitalId','state','evidenceStatus','contentDigest','validFrom','validUntil']);
 try{exact(policy,['nowMs','maxReauthAgeMs','linkClauseVersion']);}catch{throw new AuthError(500,'V3_PATIENT_CONSENT_POLICY_REQUIRED');}
 if(typeof policy.linkClauseVersion!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(policy.linkClauseVersion))
  throw new AuthError(500,'V3_PATIENT_CONSENT_POLICY_REQUIRED');
 assertV3SyntheticPatientReauthentication(binding,{nowMs:policy.nowMs,maxAgeMs:policy.maxReauthAgeMs});
 const preparationId=uuid(request.preparationId),sessionId=uuid(projection.sessionId);
 if(typeof request.contentDigest!=='string'||!/^[a-f0-9]{64}$/.test(request.contentDigest)
  ||typeof projection.contentDigest!=='string'||!/^[a-f0-9]{64}$/.test(projection.contentDigest)
  ||!Number.isInteger(request.expectedSessionVersion)||request.expectedSessionVersion<1||request.expectedSessionVersion>2147483646
  ||!Number.isInteger(projection.expectedSessionVersion)||projection.expectedSessionVersion<1||projection.expectedSessionVersion>2147483646
  ||!['APPROVE','REJECT'].includes(request.decision)||typeof request.identityLink.approved!=='boolean'
  ||typeof request.identityLink.clauseVersion!=='string')invalid();
 if(uuid(projection.patientRefId)!==binding.patientRefId||uuid(projection.ownerTenantId)!==binding.tenantId
  ||uuid(projection.sourceHospitalId)!==binding.hospitalId||uuid(projection.targetHospitalId)===binding.hospitalId)
  throw new AuthError(403,'V3_PATIENT_CONSENT_CONTEXT_MISMATCH');
 if(preparationId!==uuid(projection.preparationId)||request.contentDigest!==projection.contentDigest)
  throw new AuthError(409,'V3_PATIENT_CONSENT_CONTENT_MISMATCH');
 if(request.expectedSessionVersion!==projection.expectedSessionVersion)throw new AuthError(412,'V3_PATIENT_CONSENT_VERSION_MISMATCH');
 if(projection.state!=='PENDING'||projection.evidenceStatus!=='UNVERIFIED')throw new AuthError(409,'V3_PATIENT_CONSENT_STATE_MISMATCH');
 if(request.identityLink.clauseVersion!==policy.linkClauseVersion||request.decision==='REJECT'&&request.identityLink.approved)
  throw new AuthError(422,'V3_PATIENT_CONSENT_LINK_CHOICE_INVALID');
 let from,until;try{from=parseExchangeTimestamp(projection.validFrom);until=parseExchangeTimestamp(projection.validUntil);}catch{invalid();}
 if(until<=from||until<=policy.nowMs)throw new AuthError(409,'V3_PATIENT_CONSENT_EXPIRED');
 const command=Object.freeze({kind:'PATIENT_CONSENT_COMMAND_ONLY',actorId:binding.actorId,preparationId,sessionId,
  expectedSessionVersion:request.expectedSessionVersion,contentDigest:request.contentDigest,decision:request.decision,
  identityLink:Object.freeze({...request.identityLink})});
 commands.set(command,binding);return command;
}
export function assertPatientConsentCommand(binding,command){
 principal(binding);
 if(commands.get(command)!==binding)throw new AuthError(403,'V3_PATIENT_CONSENT_COMMAND_REQUIRED');
 return command;
}
