import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID=/^[0-9]+(?:\.[0-9]+)*$/;
const roles=Object.freeze(['PATIENT','DOCTOR','HOSPITAL_ADMIN']);
export const v3ExchangeCreatePolicy=Object.freeze({requiredScope:'exchange:create',allowedRoles:roles});
function invalid(){throw new AuthError(422,'V3_SESSION_REQUEST_INVALID');}
function dataObject(value,required,optional=[]){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
  const keys=Reflect.ownKeys(value),allowed=new Set([...required,...optional]);
  if(keys.some(k=>!allowed.has(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))||required.some(k=>!Object.hasOwn(value,k)))invalid();
}
function array(value,min,max){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)invalid();
  const keys=Reflect.ownKeys(value);
  if(keys.length!==value.length+1||keys.some(k=>k!=='length'&&(typeof k!=='string'||!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=value.length
    ||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))))invalid();
}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))invalid();return value.toLowerCase();}
function uid(value){if(typeof value!=='string'||value.length>64||!UID.test(value))invalid();return value;}
function expiry(value){
  if(typeof value!=='string')invalid();
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if(!match)invalid();
  const [,y,m,d,h,min,s,,offset]=match,year=Number(y),month=Number(m),day=Number(d);
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1]||Number(h)>23||Number(min)>59||Number(s)>59
    ||offset!=='Z'&&(Number(offset.slice(1,3))>23||Number(offset.slice(4))>59))invalid();
  const time=Date.parse(value);if(!Number.isSafeInteger(time))invalid();return time;
}

/** Structural/authenticated context preparation only. DB authority checks follow. */
export function parseExchangeSessionCreate(binding,request){
  v3BindingExpiry(binding);
  if(!roles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
  if(!binding.scopes.includes('exchange:create'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
  dataObject(request,['patientRefId','ownerTenantId','sourceHospitalId','targetHospitalId','requesterId','purpose','initiationType','validUntil','resources','requestedActions']);
  const patientRefId=uuid(request.patientRefId),ownerTenantId=uuid(request.ownerTenantId),sourceHospitalId=uuid(request.sourceHospitalId),
    targetHospitalId=uuid(request.targetHospitalId),requesterId=uuid(request.requesterId);
  if(ownerTenantId!==binding.tenantId||sourceHospitalId!==binding.hospitalId||requesterId!==binding.actorId)
    throw new AuthError(403,'V3_SESSION_CONTEXT_MISMATCH');
  if(sourceHospitalId===targetHospitalId)invalid();
  if(!['PATIENT_INITIATED','PROVIDER_INITIATED'].includes(request.initiationType))invalid();
  if(binding.role==='PATIENT'){
    if(request.initiationType!=='PATIENT_INITIATED'||patientRefId!==binding.patientRefId)throw new AuthError(403,'V3_SESSION_PATIENT_MISMATCH');
  }else if(request.initiationType!=='PROVIDER_INITIATED')throw new AuthError(403,'V3_SESSION_INITIATION_MISMATCH');
  if(typeof request.purpose!=='string'||request.purpose.length<2||request.purpose.length>64||! /^[A-Z][A-Z0-9_]*$/.test(request.purpose))invalid();
  const expiresAt=expiry(request.validUntil);
  const requestedActions=parseExchangeActionSelection(request.requestedActions);
  const resources=parseExchangeResourceSelection(request.resources);
  return Object.freeze({patientRefId,ownerTenantId,sourceHospitalId,targetHospitalId,requesterId,
    purpose:request.purpose,initiationType:request.initiationType,validUntil:new Date(expiresAt).toISOString(),resources,
    requestedActions});
}

/** Shared pure structural normalization; not a permission or DB authority check. */
export function parseExchangeTimestamp(value){return expiry(value);}
export function parseExchangeActionSelection(value){
  array(value,1,4);
  const actions=new Set(['study:view','study:download','study:pacs-transfer','study:mobile-export']);
  if(value.some(action=>!actions.has(action))||new Set(value).size!==value.length)invalid();
  return Object.freeze([...value].sort());
}
export function parseExchangeResourceSelection(value){
  array(value,1,100);
  const studies=new Set();
  const resources=value.map(resource=>{
    dataObject(resource,['studyInstanceUid'],['seriesInstanceUids']);
    const studyInstanceUid=uid(resource.studyInstanceUid);if(studies.has(studyInstanceUid))invalid();studies.add(studyInstanceUid);
    if(!Object.hasOwn(resource,'seriesInstanceUids'))return Object.freeze({studyInstanceUid});
    array(resource.seriesInstanceUids,1,500);
    const series=resource.seriesInstanceUids.map(uid);if(new Set(series).size!==series.length)invalid();
    return Object.freeze({studyInstanceUid,seriesInstanceUids:Object.freeze([...series].sort())});
  }).sort((a,b)=>a.studyInstanceUid<b.studyInstanceUid?-1:a.studyInstanceUid>b.studyInstanceUid?1:0);
  return Object.freeze(resources);
}

/** Fresh creation eligibility; elapsed retry commands must first resolve their ledger. */
export function prepareExchangeSessionCreate(binding,request,{nowMs,maxLifetimeMs}={}){
  const command=parseExchangeSessionCreate(binding,request);
  if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1
    ||!Number.isSafeInteger(nowMs+maxLifetimeMs))throw new AuthError(500,'V3_SESSION_POLICY_REQUIRED');
  const expiresAt=Date.parse(command.validUntil);
  if(expiresAt<=nowMs||expiresAt>nowMs+maxLifetimeMs)invalid();
  return command;
}
