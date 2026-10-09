import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {prepareExchangeSessionCancel,validateExchangeCancellation,exchangeStates,exchangeTerminalStates} from '../src/v3-exchange-cancel-contract.js';

function fixture(role='DOCTOR',scope='exchange:cancel'){
  const secret=randomBytes(32).toString('hex'),r={issuer:'synthetic-cancel',subject:'synthetic-subject',role,tenantId:randomUUID(),hospitalId:randomUUID(),
    actorId:randomUUID(),authHospitalId:'SYNTHETIC-A',patientRefId:role==='PATIENT'?randomUUID():null,scopes:[scope],status:'ACTIVE'};
  const input=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic-api',sub:r.subject,role,hospitalId:r.authHospitalId,scope,
    ...(role==='PATIENT'?{patientId:'SYNTHETIC-PATIENT'}:role==='DOCTOR'?{doctorId:'SYNTHETIC-DOCTOR'}:{}),exp:Math.floor(Date.now()/1000)+60}]
    .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[r]});
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {requiredScope:scope,allowedRoles:[role]});
  const row={sessionId:randomUUID(),ownerTenantId:r.tenantId,sourceHospitalId:r.hospitalId,patientRefId:r.patientRefId??randomUUID(),requesterId:r.actorId,
    state:'REQUESTED',version:1,validUntilMs:Date.now()+60000};
  const request={reasonCode:role==='PATIENT'?'PATIENT_WITHDRAWN':'REQUESTER_CANCELLED'};
  return {binding,row,request,policy:{nowMs:Date.now()}};
}
test('cancel command requires strong single If-Match and exact bounded fields',()=>{
  const f=fixture();
  for(const match of [undefined,'1','W/"1"','*','"01"','"0"','"1", "2"','"2147483647"','"9007199254740993"'])
    assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,match,f.request),e=>e.statusCode===422);
  for(const request of [{...f.request,state:'CANCELLED'},{...f.request,comment:'x'.repeat(201)},{...f.request,comment:'line\nbreak'},{},Object.create(f.request)])
    assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',request),e=>e.statusCode===422);
  const getter={};Object.defineProperty(getter,'reasonCode',{get(){throw Error('MUST NOT INVOKE');}});
  assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',getter),e=>e.code==='V3_SESSION_CANCEL_INVALID');
  const command=prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request);assert.ok(Object.isFrozen(command));
  assert.equal(command.expectedVersion,1);assert.ok(!('token' in command));
});
test('cancel scope/role and reason authorization fail closed',()=>{
  for(const role of ['PATIENT','DOCTOR','HOSPITAL_ADMIN']){const f=fixture(role);
    assert.doesNotThrow(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request));
    assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',{reasonCode:'POLICY_REVOKED'}),e=>e.statusCode===403);
    assert.throws(()=>prepareExchangeSessionCancel({...f.binding},f.row.sessionId,'"1"',f.request),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');}
  for(const role of ['SECURITY_ADMIN','PLATFORM_ADMIN']){const f=fixture(role);assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request),e=>e.statusCode===403);}
  const f=fixture('DOCTOR','exchange:read');assert.throws(()=>prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
});
test('locked-row cancellation checks source, patient and requester rather than client identity',()=>{
  for(const role of ['PATIENT','DOCTOR','HOSPITAL_ADMIN']){const f=fixture(role),command=prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request);
    for(const field of ['sessionId','ownerTenantId','sourceHospitalId',...(role==='PATIENT'?['patientRefId']:['requesterId'])])
      assert.throws(()=>validateExchangeCancellation(f.binding,command,{...f.row,[field]:randomUUID()},f.policy),e=>e.statusCode===404);
    assert.deepEqual(validateExchangeCancellation(f.binding,command,f.row,f.policy),{fromState:'REQUESTED',toState:'CANCELLED',fromVersion:1,toVersion:2});}
  const admin=fixture('HOSPITAL_ADMIN'),command=prepareExchangeSessionCancel(admin.binding,admin.row.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'});
  assert.doesNotThrow(()=>validateExchangeCancellation(admin.binding,command,{...admin.row,requesterId:randomUUID()},admin.policy));
});
test('all canonical states are classified; terminal, stale, expired or malformed rows cannot mutate',()=>{
  const f=fixture(),command=prepareExchangeSessionCancel(f.binding,f.row.sessionId,'"1"',f.request);
  assert.throws(()=>validateExchangeCancellation(f.binding,{...command},f.row,f.policy),e=>e.code==='V3_SESSION_CANCEL_COMMAND_REQUIRED');
  for(const state of exchangeStates){if(exchangeTerminalStates.includes(state))
    assert.throws(()=>validateExchangeCancellation(f.binding,command,{...f.row,state},f.policy),e=>e.statusCode===409);
    else assert.equal(validateExchangeCancellation(f.binding,command,{...f.row,state},f.policy).toState,'CANCELLED');}
  assert.throws(()=>validateExchangeCancellation(f.binding,command,{...f.row,version:2},f.policy),e=>e.statusCode===412);
  assert.throws(()=>validateExchangeCancellation(f.binding,command,{...f.row,validUntilMs:f.policy.nowMs},f.policy),e=>e.code==='V3_SESSION_EXPIRED');
  assert.throws(()=>validateExchangeCancellation(f.binding,command,{...f.row,state:'UNKNOWN'},f.policy),e=>e.statusCode===503);
  assert.throws(()=>validateExchangeCancellation(f.binding,command,f.row,{nowMs:Infinity}),e=>e.statusCode===503);
});
