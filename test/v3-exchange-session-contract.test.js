import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {prepareExchangeSessionCreate} from '../src/v3-exchange-session-contract.js';

function fixture({role='DOCTOR',scope='exchange:create'}={}){
  const secret=randomBytes(32).toString('hex'),patientRefId=randomUUID(),nowMs=Date.now();
  const record={tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),patientRefId:role==='PATIENT'?patientRefId:null,
    issuer:'synthetic-session',subject:'synthetic-requester',authHospitalId:'SYNTHETIC-A',role,scopes:[scope],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role,hospitalId:record.authHospitalId,scope,
    ...(role==='PATIENT'?{patientId:'SYNTHETIC-PATIENT'}:role==='DOCTOR'?{doctorId:'SYNTHETIC-DOCTOR'}:{}),
    exp:Math.floor(nowMs/1000)+60}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {requiredScope:scope,allowedRoles:[role]});
  const request={patientRefId,ownerTenantId:record.tenantId,sourceHospitalId:record.hospitalId,targetHospitalId:randomUUID(),requesterId:record.actorId,
    purpose:'TREATMENT',initiationType:role==='PATIENT'?'PATIENT_INITIATED':'PROVIDER_INITIATED',validUntil:new Date(nowMs+60000).toISOString(),
    resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.2','1.2.4.1']},{studyInstanceUid:'1.2.3'}],requestedActions:['study:view']};
  return {binding,request,policy:{nowMs,maxLifetimeMs:3600000}};
}
test('patient and provider session commands preserve explicit selection and are deeply immutable copies',()=>{
  for(const role of ['PATIENT','DOCTOR','HOSPITAL_ADMIN']){
    const f=fixture({role}),result=prepareExchangeSessionCreate(f.binding,f.request,f.policy);
    assert.equal(result.initiationType,f.request.initiationType);assert.equal(result.requesterId,f.binding.actorId);
    assert.deepEqual(result.resources,[{studyInstanceUid:'1.2.3'},{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.1','1.2.4.2']}]);
    assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.resources)&&Object.isFrozen(result.resources[1])&&Object.isFrozen(result.resources[1].seriesInstanceUids)&&Object.isFrozen(result.requestedActions));
    f.request.resources[0].seriesInstanceUids[0]='9.9';assert.equal(result.resources[1].seriesInstanceUids[1],'1.2.4.2');
    assert.ok(!('state' in result)&&!('consentArtifactId' in result)&&!('grantId' in result));
  }
});
test('authenticated owner/source/requester and patient/initiator cannot be spoofed',()=>{
  for(const field of ['ownerTenantId','sourceHospitalId','requesterId']){
    const f=fixture();assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,[field]:randomUUID()},f.policy),e=>e.code==='V3_SESSION_CONTEXT_MISMATCH');
  }
  const patient=fixture({role:'PATIENT'});
  for(const patch of [{patientRefId:randomUUID()},{initiationType:'PROVIDER_INITIATED'}])
    assert.throws(()=>prepareExchangeSessionCreate(patient.binding,{...patient.request,...patch},patient.policy),e=>e.code==='V3_SESSION_PATIENT_MISMATCH');
  const doctor=fixture();assert.throws(()=>prepareExchangeSessionCreate(doctor.binding,{...doctor.request,initiationType:'PATIENT_INITIATED'},doctor.policy),e=>e.code==='V3_SESSION_INITIATION_MISMATCH');
  assert.throws(()=>prepareExchangeSessionCreate({...doctor.binding},doctor.request,doctor.policy),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  for(const role of ['SECURITY_ADMIN','PLATFORM_ADMIN']){
    const f=fixture({role});assert.throws(()=>prepareExchangeSessionCreate(f.binding,f.request,f.policy),e=>e.code==='V3_ROLE_NOT_ALLOWED');
  }
  const noScope=fixture({scope:'mapping:read'});assert.throws(()=>prepareExchangeSessionCreate(noScope.binding,noScope.request,noScope.policy),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
});

test('requested actions are explicit unique immutable intentions, never implicit capabilities',()=>{
  const f=fixture();
  for(const requestedActions of [[],['study:view','study:view'],['study:admin'],[null],new Array(1)])
    assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,requestedActions},f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  const missing={...f.request};delete missing.requestedActions;
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,missing,f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  const requestedActions=['study:view','study:download'];
  const result=prepareExchangeSessionCreate(f.binding,{...f.request,requestedActions},f.policy);
  assert.deepEqual(result.requestedActions,['study:download','study:view']);
  requestedActions[0]='study:mobile-export';
  assert.deepEqual(result.requestedActions,['study:download','study:view']);
  assert.ok(Object.isFrozen(result.requestedActions));
  assert.ok(!('allowedActions' in result)&&!('grantId' in result));
});
test('exact session fields reject extra grants/state/raw IDs, missing data, accessors and prototypes',()=>{
  const f=fixture();
  for(const patch of [{state:'AUTHORIZED'},{consent:true},{token:'SYNTHETIC-PRIVATE'},{patientName:'SYNTHETIC'},{purpose:'x'},
    {sourceHospitalId:'invalid'},{targetHospitalId:f.request.sourceHospitalId},{initiationType:'OTHER'}])
    assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,...patch},f.policy),e=>e.statusCode===422);
  const missing={...f.request};delete missing.patientRefId;assert.throws(()=>prepareExchangeSessionCreate(f.binding,missing,f.policy));
  const getter={...f.request};Object.defineProperty(getter,'purpose',{get(){throw Error('MUST NOT INVOKE');}});
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,getter,f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,Object.create(f.request),f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
});
test('expiry requires finite server policy, valid calendar and bounded future interval',()=>{
  const f=fixture();
  for(const validUntil of [new Date(f.policy.nowMs).toISOString(),new Date(f.policy.nowMs+3600001).toISOString(),
    'not-a-date','2026-02-30T00:00:00Z','2026-13-01T00:00:00Z','2026-10-08T00:00:00+25:00','2026-10-08T24:00:00Z'])
    assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,validUntil},f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  for(const policy of [undefined,{}, {nowMs:f.policy.nowMs,maxLifetimeMs:Infinity},{nowMs:NaN,maxLifetimeMs:1000}])
    assert.throws(()=>prepareExchangeSessionCreate(f.binding,f.request,policy),e=>e.code==='V3_SESSION_POLICY_REQUIRED');
  const date=new Date(f.policy.nowMs+60000).toISOString().replace('Z','+00:00');
  assert.equal(prepareExchangeSessionCreate(f.binding,{...f.request,validUntil:date},f.policy).validUntil,f.request.validUntil);
});
test('scope limits reject empty/duplicate studies and series, invalid UIDs and raw/accessor fields',()=>{
  const f=fixture();
  for(const resources of [[],Array.from({length:101},(_,i)=>({studyInstanceUid:`1.2.${i}`})),
    [{studyInstanceUid:'1.2'},{studyInstanceUid:'1.2',seriesInstanceUids:['1.2.3']}],
    [{studyInstanceUid:'1.2',seriesInstanceUids:[]}],[{studyInstanceUid:'1.2',seriesInstanceUids:['1.2.3','1.2.3']}],
    [{studyInstanceUid:'1.2',seriesInstanceUids:Array.from({length:501},(_,i)=>`1.2.${i}`)}],
    [{studyInstanceUid:'1.2/',patientId:'SYNTHETIC'}],[{studyInstanceUid:'9'.repeat(65)}],
    [{studyInstanceUid:'1..2'}],[{studyInstanceUid:'1.2',seriesInstanceUids:[null]}],new Array(1)])
    assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,resources},f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  const resource={};Object.defineProperty(resource,'studyInstanceUid',{get(){throw Error('MUST NOT INVOKE');}});
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,resources:[resource]},f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
  const sparse=new Array(1);sparse[Symbol('spoof')]=true;
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,{...f.request,resources:sparse},f.policy),e=>e.code==='V3_SESSION_REQUEST_INVALID');
});
