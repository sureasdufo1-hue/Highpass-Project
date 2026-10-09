import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3PatientRefService} from '../src/v3-patient-ref-service.js';
import {appendIdentityAudit} from '../src/v3-identity-audit.js';

function fixture({scope='mapping:write',auditFailure=false}={}){
  const secret=randomBytes(32).toString('hex');
  const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),issuer:'synthetic-ref',subject:'synthetic-admin',
    authHospitalId:'SYNTHETIC-A',role:'HOSPITAL_ADMIN',scopes:['mapping:write','mapping:read'],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
    scope,exp:Math.floor(Date.now()/1000)+60}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {requiredScope:scope,allowedRoles:['HOSPITAL_ADMIN']});
  const queries=[];const client={async query(q){queries.push(q);
    if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
    if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
    if(q.text.includes('INSERT INTO highpass_v3.patient_refs'))return {rows:[{patient_ref:q.values[0],created_at:new Date(0)}]};
    if(q.text.includes('INSERT INTO highpass_v3.identity_audit_outbox')&&auditFailure)throw new Error('SYNTHETIC-PRIVATE');
    return {rows:[]};},release(){}};
  const service=new V3PatientRefService({transactions:new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:8000})});
  return {binding,queries,service};
}
test('PatientRef server UUID, ownership binding and audit commit together without mapping verification',async()=>{
  const f=fixture(),result=await f.service.register(f.binding);
  assert.deepEqual(Object.keys(result),['patientRefId','createdAt']);assert.match(result.patientRefId,/^[0-9a-f-]{36}$/);
  const insert=f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.patient_refs'));
  assert.deepEqual(insert.values,[result.patientRefId,f.binding.tenantId,f.binding.hospitalId,f.binding.actorId]);
  const audit=f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'));
  assert.equal(audit.values[7],'PATIENT_REF_CREATED');assert.equal(audit.values[14],result.patientRefId);
  assert.equal(audit.values[4],null);assert.equal(f.queries.at(-1).text,'COMMIT');
});
test('PatientRef audit failure rolls back creation and hides DB diagnostics',async()=>{
  const f=fixture({auditFailure:true});await assert.rejects(f.service.register(f.binding),e=>e.code==='V3_DATABASE_UNAVAILABLE'&&!e.message.includes('SYNTHETIC-PRIVATE'));
  assert.equal(f.queries.at(-1).text,'ROLLBACK');assert.ok(!f.queries.some(q=>q.text==='COMMIT'));
});
test('PatientRef rejects unbranded principal, missing write scope, raw fields and malformed correlation',async()=>{
  const f=fixture(),read=fixture({scope:'mapping:read'});
  await assert.rejects(f.service.register({...f.binding}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  await assert.rejects(read.service.register(read.binding),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
  const accessor={};Object.defineProperty(accessor,'traceId',{get(){throw new Error('must not evaluate');}});
  for(const options of [{localRef:'SYNTHETIC'}, {patientRefId:randomUUID()}, {auditSessionId:'bad'}, {traceId:'bad'},null,accessor,{[Symbol('extra')]:1}])
    await assert.rejects(f.service.register(f.binding,options),e=>e.statusCode===422);
  assert.equal(f.queries.length,0);assert.equal(read.queries.length,0);
});
test('PatientRef audit action requires reference and fixed creation semantics',async()=>{
  const f=fixture(),base={patientRefId:randomUUID(),auditSessionId:randomUUID(),traceId:'synthetic_ref_trace_001',action:'PATIENT_REF_CREATED',result:'ALLOW',reasonCode:'PATIENT_REF_REGISTERED'};
  for(const extra of [{patientRefId:null},{mappingId:randomUUID(),mappingVersion:1},{newState:'VERIFIED'},{result:'DENY'},{reasonCode:'MAPPING_REGISTERED'}])
    await assert.rejects(appendIdentityAudit({query(){throw new Error('must not query');}},f.binding,{...base,...extra}),e=>e.code==='V3_AUDIT_EVENT_INVALID');
});
