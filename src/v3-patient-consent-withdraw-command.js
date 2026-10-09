import {AuthError} from './auth.js';
import {v3BindingExpiry,assertV3SyntheticPatientReauthentication} from './v3-principal-registry.js';

export const v3PatientConsentWithdrawalPolicy=Object.freeze({requiredScope:'consent:withdraw',allowedRoles:Object.freeze(['PATIENT'])});
const commands=new WeakMap();
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exact(value,keys,code,status=422){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))
  ||Reflect.ownKeys(value).some(key=>!keys.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))
  throw new AuthError(status,code);
}
function authenticate(binding,policy){
 const expiry=v3BindingExpiry(binding);
 if(binding.role!=='PATIENT')throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:withdraw'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
 exact(policy,['nowMs','maxReauthAgeMs'],'V3_PATIENT_WITHDRAW_POLICY_REQUIRED',500);
 assertV3SyntheticPatientReauthentication(binding,{nowMs:policy.nowMs,maxAgeMs:policy.maxReauthAgeMs});
 if(policy.nowMs>=expiry)throw new AuthError(401,'JWT_EXPIRED');
}
/** Pure selector provenance only. NOT DB ownership, live consent, withdrawal or clinical authority.
 * The future private service must verify L1/L2/L4 against locked current DB state. */
export function parsePatientConsentWithdrawalCommand(binding,request,policy){
 authenticate(binding,policy);
 exact(request,['consentId','contentVersion','expectedEventSequence'],'V3_PATIENT_WITHDRAW_COMMAND_INVALID');
 if(typeof request.consentId!=='string'||!uuidPattern.test(request.consentId)
  ||request.contentVersion!==1||request.expectedEventSequence!==2)
  throw new AuthError(422,'V3_PATIENT_WITHDRAW_COMMAND_INVALID');
 const command=Object.freeze({kind:'PATIENT_CONSENT_WITHDRAW_COMMAND_ONLY',actorId:binding.actorId,
  consentId:request.consentId.toLowerCase(),contentVersion:1,expectedEventSequence:2});
 commands.set(command,binding);return command;
}
export function assertPatientConsentWithdrawalCommand(binding,command,policy){
 authenticate(binding,policy);
 if(commands.get(command)!==binding)throw new AuthError(403,'V3_PATIENT_WITHDRAW_COMMAND_REQUIRED');
 return command;
}
