import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';

export const v3ConsentExpiryPolicy=Object.freeze({requiredScope:'consent:expire',allowedRoles:Object.freeze(['INTERNAL_SERVICE'])});
const commands=new WeakMap();
function authenticate(binding){
 v3BindingExpiry(binding);
 if(binding.role!=='INTERNAL_SERVICE'||binding.servicePurpose!=='CONSENT_EXPIRY')throw new AuthError(403,'V3_CONSENT_EXPIRY_SERVICE_REQUIRED');
 if(binding.patientRefId!==null||binding.scopes.length!==1||binding.scopes[0]!=='consent:expire')throw new AuthError(403,'V3_SERVICE_SCOPE_NOT_ALLOWED');
}
/** Command provenance only, not DB admission, a batch result or clinical authority. */
export function prepareConsentExpiryBatch(binding,options={}){
 authenticate(binding);
 if(!options||typeof options!=='object'||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options))
  ||Reflect.ownKeys(options).some(key=>key!=='limit'||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))
  throw new AuthError(422,'V3_CONSENT_EXPIRY_BATCH_INVALID');
 const limit=Object.hasOwn(options,'limit')?options.limit:25;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new AuthError(422,'V3_CONSENT_EXPIRY_BATCH_INVALID');
 const command=Object.freeze({kind:'CONSENT_EXPIRY_COMMAND_ONLY',actorId:binding.actorId,tenantId:binding.tenantId,hospitalId:binding.hospitalId,limit});
 commands.set(command,binding);return command;
}
export function assertConsentExpiryBatch(binding,command){
 authenticate(binding);
 if(commands.get(command)!==binding)throw new AuthError(403,'V3_CONSENT_EXPIRY_COMMAND_REQUIRED');
 return command;
}
