import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {parseExchangeTimestamp,parseExchangeActionSelection,parseExchangeResourceSelection} from './v3-exchange-session-contract.js';

export const v3ConsentPendingPolicy=Object.freeze({requiredScope:'consent:write',allowedRoles:Object.freeze(['PATIENT','DOCTOR','HOSPITAL_ADMIN'])});
const intents=new WeakMap(),UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(){throw new AuthError(422,'V3_CONSENT_PENDING_INVALID');}
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))
  ||Reflect.ownKeys(value).some(k=>!keys.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))invalid();
}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))invalid();return value.toLowerCase();}
function shared(parse,value){try{return parse(value);}catch(error){if(error.code==='V3_SESSION_REQUEST_INVALID')invalid();throw error;}}
function principal(binding){
 v3BindingExpiry(binding);
 if(!v3ConsentPendingPolicy.allowedRoles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:write'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
}

/** Pure preparation only. selection is UNTRUSTED here; future service must reread/lock DB authority. */
export function parsePendingConsentIntent(binding,request,selection){
 request=normalizePendingConsentRequest(binding,request);
 exact(selection,['sessionId','patientRefId','ownerTenantId','sourceHospitalId','targetHospitalId','purpose','requestedActions','resources','validFrom','validUntil','version']);
 const sessionId=uuid(selection.sessionId),patientRefId=uuid(request.patientRefId),sourceHospitalId=uuid(request.sourceHospitalId),targetHospitalId=uuid(request.targetHospitalId);
 if(uuid(selection.ownerTenantId)!==binding.tenantId||sourceHospitalId!==binding.hospitalId||uuid(selection.sourceHospitalId)!==sourceHospitalId
  ||uuid(selection.patientRefId)!==patientRefId||uuid(selection.targetHospitalId)!==targetHospitalId||targetHospitalId===sourceHospitalId)
  throw new AuthError(403,'V3_CONSENT_PENDING_CONTEXT_MISMATCH');
 if(binding.role==='PATIENT'&&patientRefId!==binding.patientRefId)throw new AuthError(403,'V3_CONSENT_PENDING_PATIENT_MISMATCH');
 if(!Number.isInteger(selection.version)||selection.version<1||selection.version>2147483646)invalid();
 if(request.state!=='PENDING'||typeof request.purpose!=='string'||! /^[A-Z][A-Z0-9_]{1,63}$/.test(request.purpose))invalid();
 if(request.purpose!==selection.purpose)throw new AuthError(422,'V3_CONSENT_PENDING_SCOPE_MISMATCH');
 const allowedActions=shared(parseExchangeActionSelection,request.allowedActions),parentActions=shared(parseExchangeActionSelection,selection.requestedActions);
 const resources=shared(parseExchangeResourceSelection,request.resources),parentResources=shared(parseExchangeResourceSelection,selection.resources);
 const parent=new Map(parentResources.map(resource=>[resource.studyInstanceUid,resource]));
 if(allowedActions.some(action=>!parentActions.includes(action))||resources.some(resource=>{
  const bound=parent.get(resource.studyInstanceUid);
  return !bound||bound.seriesInstanceUids&&(!resource.seriesInstanceUids||resource.seriesInstanceUids.some(uid=>!bound.seriesInstanceUids.includes(uid)));
 }))throw new AuthError(422,'V3_CONSENT_PENDING_SCOPE_MISMATCH');
 const from=shared(parseExchangeTimestamp,request.validFrom),until=shared(parseExchangeTimestamp,request.validUntil),
  parentFrom=shared(parseExchangeTimestamp,selection.validFrom),parentUntil=shared(parseExchangeTimestamp,selection.validUntil);
 if(parentUntil<=parentFrom||until<=from||from<parentFrom||until>parentUntil)
  throw new AuthError(422,'V3_CONSENT_PENDING_WINDOW_INVALID');
 if(typeof request.policyVersion!=='string'||! /^[A-Za-z0-9._:-]{1,64}$/.test(request.policyVersion)
  ||typeof request.evidenceDigest!=='string'||! /^[A-Za-z0-9_:-]{43,128}$/.test(request.evidenceDigest))invalid();
 const intent=Object.freeze({kind:'CONSENT_PENDING_INTENT',sessionId,expectedSessionVersion:selection.version,
  patientRefId,ownerTenantId:binding.tenantId,sourceHospitalId,targetHospitalId,actorId:binding.actorId,state:'PENDING',
  purpose:request.purpose,allowedActions,resources,validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString(),
  policyVersion:request.policyVersion,unverifiedEvidenceDigest:request.evidenceDigest,evidenceStatus:'UNVERIFIED'});
 intents.set(intent,binding);return intent;
}

/** Exact structural copy for own-key ledger hashing BEFORE authoritative DB lookup. */
export function normalizePendingConsentRequest(binding,request){
 principal(binding);
 exact(request,['patientRefId','sourceHospitalId','targetHospitalId','purpose','allowedActions','state','validFrom','validUntil','resources','policyVersion','evidenceDigest']);
 const patientRefId=uuid(request.patientRefId),sourceHospitalId=uuid(request.sourceHospitalId),targetHospitalId=uuid(request.targetHospitalId);
 if(request.state!=='PENDING'||typeof request.purpose!=='string'||! /^[A-Z][A-Z0-9_]{1,63}$/.test(request.purpose)
  ||typeof request.policyVersion!=='string'||! /^[A-Za-z0-9._:-]{1,64}$/.test(request.policyVersion)
  ||typeof request.evidenceDigest!=='string'||! /^[A-Za-z0-9_:-]{43,128}$/.test(request.evidenceDigest))invalid();
 const allowedActions=shared(parseExchangeActionSelection,request.allowedActions),resources=shared(parseExchangeResourceSelection,request.resources),
  from=shared(parseExchangeTimestamp,request.validFrom),until=shared(parseExchangeTimestamp,request.validUntil);
 if(until<=from)throw new AuthError(422,'V3_CONSENT_PENDING_WINDOW_INVALID');
 return Object.freeze({patientRefId,sourceHospitalId,targetHospitalId,purpose:request.purpose,allowedActions,state:'PENDING',
  validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString(),resources,policyVersion:request.policyVersion,evidenceDigest:request.evidenceDigest});
}

/** Provenance of parser output only; NEVER checks ownership, approval or clinical authority. */
export function assertPendingConsentIntent(binding,intent){
 principal(binding);
 if(intents.get(intent)!==binding)throw new AuthError(403,'V3_CONSENT_PENDING_INTENT_REQUIRED');
 return intent;
}

/** Internal clock eligibility only. REPLAY mode must be selected from a durable ledger by the future service. */
export function validatePendingConsentIntentWindow(binding,intent,policy,mode='FRESH'){
 assertPendingConsentIntent(binding,intent);
 try{exact(policy,['nowMs','maxLifetimeMs']);}catch{throw new AuthError(500,'V3_CONSENT_PENDING_POLICY_REQUIRED');}
 const {nowMs,maxLifetimeMs}=policy;
 if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1
  ||maxLifetimeMs>86400000||!Number.isSafeInteger(nowMs+maxLifetimeMs)||!['FRESH','REPLAY'].includes(mode))
  throw new AuthError(500,'V3_CONSENT_PENDING_POLICY_REQUIRED');
 const from=Date.parse(intent.validFrom),until=Date.parse(intent.validUntil);
 if(until<=nowMs||until>nowMs+maxLifetimeMs||until-from>maxLifetimeMs||mode==='FRESH'&&from<nowMs)
  throw new AuthError(422,'V3_CONSENT_PENDING_WINDOW_INVALID');
 return intent;
}

export function preparePendingConsentIntent(binding,request,selection,policy){
 return validatePendingConsentIntentWindow(binding,parsePendingConsentIntent(binding,request,selection),policy);
}
