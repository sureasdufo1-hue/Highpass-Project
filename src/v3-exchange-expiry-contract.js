import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
export const v3ExchangeExpiryPolicy=Object.freeze({requiredScope:'exchange:expire',allowedRoles:Object.freeze(['INTERNAL_SERVICE'])});
/** Explicit source-owned service enrollment; no human impersonation or clinical scope. */
export function prepareExchangeExpiryBatch(binding,options={}){
  v3BindingExpiry(binding);
  if(binding.role!=='INTERNAL_SERVICE'||binding.servicePurpose!=='SESSION_EXPIRY')throw new AuthError(403,'V3_EXPIRY_SERVICE_REQUIRED');
  if(binding.patientRefId!==null||binding.scopes.length!==1||binding.scopes[0]!=='exchange:expire')throw new AuthError(403,'V3_SERVICE_SCOPE_NOT_ALLOWED');
  if(!options||typeof options!=='object'||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options))
    ||Reflect.ownKeys(options).some(key=>!['limit'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))
    throw new AuthError(422,'V3_EXPIRY_BATCH_INVALID');
  const limit=options.limit??25;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new AuthError(422,'V3_EXPIRY_BATCH_INVALID');
  return Object.freeze({tenantId:binding.tenantId,hospitalId:binding.hospitalId,actorId:binding.actorId,limit});
}
