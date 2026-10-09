import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3ExchangeReadService,v3ExchangeReadPolicy} from '../src/v3-exchange-read-service.js';
import {appendExchangeAudit} from '../src/v3-exchange-audit.js';

function fixture({found=true,live=true,ref=true,auditFault=false,hashFault=false}={}){
 const secret=randomBytes(32).toString('hex'),id=randomUUID(),patientRef=randomUUID();
 const r={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),role:'HOSPITAL_ADMIN',issuer:'synthetic-read-session',
  subject:'synthetic-reader',authHospitalId:'SYNTHETIC-A',scopes:['exchange:read'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[r]});
 const input=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic-api',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'exchange:read',exp:Math.floor(Date.now()/1000)+60}]
 .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},v3ExchangeReadPolicy);
 const resources=[{studyInstanceUid:'1.2.3'}],row={session_id:id,patient_ref:patientRef,owner_tenant_id:r.tenantId,source_hospital_id:r.hospitalId,
 target_hospital_id:randomUUID(),requester_id:r.actorId,purpose:'TREATMENT',initiation_type:'PROVIDER_INITIATED',state:'REQUESTED',version:1,
 valid_from:new Date(0),valid_until:new Date(60000),created_at:new Date(0),updated_at:new Date(0),resource_count:1,live,
 resource_snapshot_digest:hashFault?randomBytes(32):createHash('sha256').update(JSON.stringify(resources)).digest(),requested_actions:['study:view'],private:'SYNTHETIC-PRIVATE'};
 const queries=[];const client={async query(q){queries.push(q);
  if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
  if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
  if(q.text.includes('AS live FROM'))return {rows:found?[row]:[]};
  if(q.text.startsWith('SELECT patient_ref FROM'))return {rows:ref?[{}]:[]};
  if(q.text.startsWith('SELECT study_instance_uid'))return {rows:[{study_instance_uid:'1.2.3',whole_study:true,series_instance_uids:null}]};
  if(auditFault&&q.text.includes('INSERT INTO highpass_v3.exchange_audit_outbox'))throw Error('SYNTHETIC-DB-PRIVATE');
  return {rows:[]};},release(){}};
 const transactions=new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:8000});
 const service=new V3ExchangeReadService({transactions});
 return {id,binding,queries,service,transactions};
}

test('strict Session read refuses missing or fabricated ingress before DB access',async()=>{
 const f=fixture(),service=new V3ExchangeReadService({transactions:f.transactions,requireNetworkAudit:true});
 assert.equal(service.requireNetworkAudit,true);
 for(const network of [undefined,{}, {input:Object.freeze({sourceIp:'127.0.0.1'})}])
  await assert.rejects(service.get(f.binding,f.id,{},network),e=>e.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
 await assert.rejects(f.service.get(f.binding,f.id,{},{}),e=>e.code==='V3_SESSION_NETWORK_MODE_MISMATCH');
 assert.equal(f.queries.length,0);
 assert.throws(()=>new V3ExchangeReadService({transactions:f.transactions,requireNetworkAudit:'true'}));
});
test('Session metadata is whitelisted, scoped/locked and audited before commit',async()=>{
 const f=fixture(),out=await f.service.get(f.binding,f.id);
 assert.equal(out.sessionId,f.id);assert.deepEqual(out.resources,[{studyInstanceUid:'1.2.3'}]);
 assert.ok(!('resourceSnapshotDigest' in out)&&!('private' in out)&&!JSON.stringify(out).includes('SYNTHETIC-PRIVATE'));
 const select=f.queries.find(q=>q.text.includes('AS live FROM'));assert.ok(select.text.includes('FOR SHARE'));assert.deepEqual(select.values,[f.id]);
 const audit=f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.exchange_audit_outbox'));
 assert.equal(audit.values[2],f.binding.tenantId);assert.equal(audit.values[4],f.binding.actorId);
 assert.equal(audit.values[7],'SESSION_READ');assert.equal(audit.values[9],'METADATA_READ');assert.equal(f.queries.at(-1).text,'COMMIT');
});
test('missing/expired/deleted reference Session reads commit precise DENY before uniform 404',async()=>{
 for(const [options,reason]of [[{found:false},'SESSION_NOT_FOUND'],[{live:false},'SESSION_EXPIRED'],[{ref:false},'SOURCE_REF_UNAVAILABLE']]){
  const f=fixture(options);await assert.rejects(f.service.get(f.binding,f.id),e=>e.statusCode===404&&e.code==='V3_SESSION_RESOURCE_UNAVAILABLE');
  assert.equal(f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.exchange_audit_outbox')).values[9],reason);
  assert.equal(f.queries.at(-1).text,'COMMIT');assert.ok(!f.queries.some(q=>q.text.startsWith('SELECT study_instance_uid')));
 }
});
test('audit and snapshot integrity failures rollback with safe errors, never metadata',async()=>{
 for(const [options,code]of [[{auditFault:true},'V3_DATABASE_UNAVAILABLE'],[{hashFault:true},'V3_SESSION_RESULT_INVALID']]){
  const f=fixture(options);await assert.rejects(f.service.get(f.binding,f.id),e=>e.code===code&&!e.message.includes('PRIVATE'));
  assert.equal(f.queries.at(-1).text,'ROLLBACK');
 }
});
test('malformed/unbranded read and audit input do not acquire/query DB',async()=>{
 const f=fixture();await assert.rejects(f.service.get({...f.binding},f.id),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 await assert.rejects(f.service.get(f.binding,'invalid'),e=>e.statusCode===422);
 await assert.rejects(f.service.get(f.binding,f.id,{token:'SYNTHETIC-PRIVATE'}),e=>e.statusCode===422);assert.equal(f.queries.length,0);
 for(const event of [{action:'SESSION_DENIED',reasonCode:'UNKNOWN'}, {action:'SESSION_READ',reasonCode:'METADATA_READ'},
  {action:'SESSION_DENIED',reasonCode:'SESSION_NOT_FOUND',token:'SYNTHETIC-PRIVATE'}])
  await assert.rejects(appendExchangeAudit({query(){throw Error('MUST NOT QUERY');}},f.binding,event),e=>e.statusCode===422);
 assert.throws(()=>new V3ExchangeReadService());
});
