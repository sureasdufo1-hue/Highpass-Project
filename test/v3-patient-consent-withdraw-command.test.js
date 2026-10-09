import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {parsePatientConsentWithdrawalCommand as parse,assertPatientConsentWithdrawalCommand as check,
 v3PatientConsentWithdrawalPolicy} from '../src/v3-patient-consent-withdraw-command.js';

// Real signed synthetic authentication and registry-issued private bindings; no DB success mocked.
function fixture({role='PATIENT',scopes=['consent:withdraw'],claims:overrides={}}={}){
 const now=Math.floor(Date.now()/1000),secret=randomBytes(32).toString('hex');
 const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID(),
  issuer:'synthetic-withdraw',subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',role,status:'ACTIVE',scopes};
 const provider=new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret});
 const registry=new V3PrincipalRegistry({provider,records:[record]});
 const claims={iss:record.issuer,aud:'synthetic-v3',sub:record.subject,role,hospitalId:'SYNTH-A',scope:scopes.join(' '),
  patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],
  highpass_test_assurance:true,auth_time:now,...overrides};
 const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:scopes[0],allowedRoles:[role]});
 return {binding,policy:{nowMs:Date.now(),maxReauthAgeMs:300000},
  request:{consentId:randomUUID(),contentVersion:1,expectedEventSequence:2}};
}
const invalid=error=>error.code==='V3_PATIENT_WITHDRAW_COMMAND_INVALID';

test('withdraw selector is immutable private provenance, not a withdrawal receipt',()=>{
 const f=fixture();f.request.consentId=f.request.consentId.toUpperCase();
 const command=parse(f.binding,f.request,f.policy);
 assert.equal(command.consentId,f.request.consentId.toLowerCase());
 assert.equal(command.kind,'PATIENT_CONSENT_WITHDRAW_COMMAND_ONLY');
 assert.equal(command.actorId,f.binding.actorId);assert.ok(Object.isFrozen(command));
 assert.equal(check(f.binding,command,f.policy),command);
 for(const key of ['state','eventId','cascadeStatus','token','scope'])assert.ok(!Object.hasOwn(command,key));
 assert.deepEqual(v3PatientConsentWithdrawalPolicy.allowedRoles,['PATIENT']);
 assert.equal(v3PatientConsentWithdrawalPolicy.requiredScope,'consent:withdraw');
});
test('withdraw copied bindings/commands and separately issued bindings are denied',()=>{
 const f=fixture(),other=fixture(),command=parse(f.binding,f.request,f.policy);
 assert.throws(()=>parse({...f.binding},f.request,f.policy),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 assert.throws(()=>check(f.binding,{...command},f.policy),e=>e.code==='V3_PATIENT_WITHDRAW_COMMAND_REQUIRED');
 assert.throws(()=>check(other.binding,command,other.policy),e=>e.code==='V3_PATIENT_WITHDRAW_COMMAND_REQUIRED');
});
test('withdraw never inherits consent approval scope or ordinary admin role',()=>{
 const approve=fixture({scopes:['consent:approve']}),admin=fixture({role:'HOSPITAL_ADMIN'});
 assert.throws(()=>parse(approve.binding,approve.request,approve.policy),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
 assert.throws(()=>parse(admin.binding,admin.request,admin.policy),e=>e.code==='V3_ROLE_NOT_ALLOWED');
});
test('withdraw rejects authority fields, symbols, inherited properties and accessors without invoking them',()=>{
 const f=fixture();let calls=0;
 for(const field of ['actorId','hospitalId','patientRefId','sessionId','state','nonce','token','scope','evidence','reauth'])
  assert.throws(()=>parse(f.binding,{...f.request,[field]:'UNTRUSTED'},f.policy),invalid);
 for(const request of [null,[],Object.create(f.request),{...f.request,[Symbol('authority')]:true}])
  assert.throws(()=>parse(f.binding,request,f.policy),invalid);
 const request={...f.request};Object.defineProperty(request,'consentId',{enumerable:true,get(){calls++;return f.request.consentId;}});
 assert.throws(()=>parse(f.binding,request,f.policy),invalid);assert.equal(calls,0);
});
test('withdraw only accepts exact initial v1/sequence2 and canonicalizable UUID',()=>{
 const f=fixture();
 for(const [field,values] of [['consentId',['not-uuid',' '+f.request.consentId,{},null]],
  ['contentVersion',[0,2,'1',true,NaN,Infinity]],['expectedEventSequence',[1,3,'2',false,NaN]]])
  for(const value of values)assert.throws(()=>parse(f.binding,{...f.request,[field]:value},f.policy),invalid);
 const request=Object.assign(Object.create(null),f.request);assert.equal(parse(f.binding,request,f.policy).consentId,f.request.consentId);
});
test('withdraw requires signed fresh synthetic reauthentication, not body claims',()=>{
 for(const claims of [{highpass_test_assurance:false},{auth_time:Math.floor(Date.now()/1000)-301},
  {auth_time:Math.floor(Date.now()/1000)+10},{amr:['pwd']}]){
  const f=fixture({claims});
  assert.throws(()=>parse(f.binding,f.request,f.policy),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
 }
});
test('withdraw policy must be exact, finite and bounded, with no accessor evaluation',()=>{
 const f=fixture();let calls=0;
 for(const policy of [undefined,{}, {...f.policy,extra:true},{...f.policy,nowMs:NaN},
  {...f.policy,maxReauthAgeMs:300001},{...f.policy,maxReauthAgeMs:0}])
  assert.throws(()=>parse(f.binding,f.request,policy));
 const policy={...f.policy};Object.defineProperty(policy,'nowMs',{enumerable:true,get(){calls++;return Date.now();}});
 assert.throws(()=>parse(f.binding,f.request,policy),e=>e.code==='V3_PATIENT_WITHDRAW_POLICY_REQUIRED');
 assert.equal(calls,0);
});
test('withdraw branded command rechecks token deadline and reauthentication age',()=>{
 const f=fixture(),command=parse(f.binding,f.request,f.policy);
 assert.throws(()=>check(f.binding,command,{...f.policy,nowMs:f.policy.nowMs+181000}),e=>e.code==='JWT_EXPIRED');
 const stale=fixture({claims:{auth_time:Math.floor(Date.now()/1000)-2}});
 const previouslyFresh=parse(stale.binding,stale.request,stale.policy);
 assert.throws(()=>check(stale.binding,previouslyFresh,{...stale.policy,maxReauthAgeMs:1000}),
  e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
});
