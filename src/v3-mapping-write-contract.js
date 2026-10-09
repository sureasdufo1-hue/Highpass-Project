import { AuthError } from './auth.js';
import { v3BindingExpiry } from './v3-principal-registry.js';
import { V3IdentifierProtection } from './v3-identifier-protection.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states=new Set(['NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED']);
const roles=Object.freeze(['HOSPITAL_ADMIN','SECURITY_ADMIN']);
export const v3MappingWritePolicy=Object.freeze({requiredScope:'mapping:write',allowedRoles:roles});
export const v3MappingReviewPolicy=Object.freeze({requiredScope:'mapping:review',allowedRoles:roles});
function fail(){throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');}
function exact(value,names){
  if(!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length!==names.length
    || names.some(name=>!Object.hasOwn(value,name)))fail();
  // Reject accessor properties; only JSON-like data is accepted.
  for(const name of names)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,name),'value'))fail();
}
function authorize(binding,scope){
  v3BindingExpiry(binding);
  if(!roles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
  if(!binding.scopes.includes(scope))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))fail();return value.toLowerCase();}
function digest(value){
  if(typeof value!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value))fail();
  const bytes=Buffer.from(value,'base64url');
  if(bytes.length!==32||bytes.toString('base64url')!==value)fail();
  return bytes;
}

/** Internal validated command only. Does not write, authorize identity, or emit HTTP data. */
export function prepareMappingReconcile(binding,request,protection){
  authorize(binding,'mapping:write');
  exact(request,['patientRefId','tenantId','hospitalId','protectedLocalRef','localRefDigest']);
  const context={patientRefId:uuid(request.patientRefId),tenantId:uuid(request.tenantId),hospitalId:uuid(request.hospitalId)};
  if(context.tenantId!==binding.tenantId||context.hospitalId!==binding.hospitalId)throw new AuthError(403,'V3_MAPPING_CONTEXT_MISMATCH');
  if(!(protection instanceof V3IdentifierProtection))throw new AuthError(503,'V3_IDENTIFIER_PROVIDER_UNAVAILABLE');
  let checked;
  try{checked=protection.verify(request,context);}
  catch(error){
    if(error.code==='IDENTIFIER_PROVIDER_UNAVAILABLE')throw new AuthError(503,'V3_IDENTIFIER_PROVIDER_UNAVAILABLE');
    throw new AuthError(422,'V3_IDENTIFIER_PROTECTION_INVALID');
  }
  return Object.freeze({...context,protectedLocalRef:Buffer.from(checked.protectedLocalRef),
    localRefDigest:Buffer.from(checked.localRefDigest),state:'UNVERIFIED'});
}

/** Evidence digest is a review reference, not proof that human review occurred. */
export function prepareMappingReview(binding,mappingId,request){
  authorize(binding,'mapping:review');
  exact(request,['expectedVersion','state','evidenceDigest']);
  if(!Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<1
    ||request.expectedVersion>=2147483647||!states.has(request.state))fail();
  return Object.freeze({mappingId:uuid(mappingId),expectedVersion:request.expectedVersion,
    state:request.state,evidenceDigest:digest(request.evidenceDigest)});
}
