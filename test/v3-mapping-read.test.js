import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3MappingReadService,v3MappingReadPolicy} from '../src/v3-mapping-read-service.js';
import {createV3MappingReadHandler} from '../src/v3-mapping-read-handler.js';

function fixture({found=true,auditFailure=false}={}){
  const secret=randomBytes(32).toString('hex'),actorId=randomUUID(),tenantId=randomUUID(),hospitalId=randomUUID(),mappingId=randomUUID();
  const record={actorId,tenantId,hospitalId,issuer:'synthetic-read',subject:'synthetic-admin',authHospitalId:'SYNTHETIC-A',role:'HOSPITAL_ADMIN',scopes:['mapping:read'],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
    scope:'mapping:read',exp:Math.floor(Date.now()/1000)+60}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const request={headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`},method:'GET',url:`/api/v3/patient-mappings/${mappingId}`};
  const bound=registry.resolve(request,v3MappingReadPolicy),queries=[];
  const client={async query(query){
    queries.push(query);
    if(query.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
    if(query.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
    if(query.text.includes('SELECT mapping_id,patient_ref'))return {rows:found?[{mapping_id:mappingId,tenant_id:tenantId,hospital_id:hospitalId,patient_ref:randomUUID(),
      status:'UNVERIFIED',version:1,created_at:new Date(0),updated_at:new Date(0),verified_at:null,protected_local_ref:'SYNTHETIC-HIDDEN',local_ref_digest:'SYNTHETIC-HIDDEN'}]:[]};
    if(auditFailure&&query.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'))throw new Error('SYNTHETIC-DB-PRIVATE');
    return {rows:[]};
  },release(){}};
  const service=new V3MappingReadService({transactions:new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:8000})});
  return {registry,request,bound,mappingId,queries,service};
}
test('Mapping GET has exact response whitelist and scoped locking SQL without protected columns',async()=>{
  const f=fixture(),metadata=await f.service.get(f.bound,f.mappingId);
  assert.deepEqual(Object.keys(metadata),['mappingId','patientRefId','tenantId','hospitalId','state','version','createdAt','updatedAt']);
  assert.ok(!JSON.stringify(metadata).includes('SYNTHETIC-HIDDEN'));
  const select=f.queries.find(query=>query.text.includes('SELECT mapping_id,patient_ref'));
  assert.deepEqual(select.values,[f.mappingId,f.bound.tenantId,f.bound.hospitalId]);
  assert.ok(select.text.includes('FOR SHARE'));assert.ok(!select.text.includes('protected_local_ref'));assert.ok(!select.text.includes('local_ref_digest'));
  assert.equal(f.queries.at(-1).text,'COMMIT');
});
test('missing/foreign Mapping commits DENY audit before uniform 404',async()=>{
  const f=fixture({found:false});
  await assert.rejects(f.service.get(f.bound,f.mappingId),error=>error.statusCode===404&&error.code==='V3_MAPPING_NOT_FOUND');
  const audit=f.queries.find(query=>query.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'));
  assert.equal(audit.values[4],null);assert.equal(audit.values[8],'DENY');assert.equal(audit.values[9],'MAPPING_NOT_FOUND');
  assert.equal(f.queries.at(-1).text,'COMMIT');assert.ok(!f.queries.some(query=>query.text==='ROLLBACK'));
});
test('Mapping GET fails closed on audit fault and rolls back; malformed fields cannot query',async()=>{
  const f=fixture({auditFailure:true});
  await assert.rejects(f.service.get(f.bound,f.mappingId),error=>error.statusCode===503&&error.code==='V3_DATABASE_UNAVAILABLE');
  assert.equal(f.queries.at(-1).text,'ROLLBACK');
  const count=f.queries.length;
  await assert.rejects(f.service.get(f.bound,'invalid'),error=>error.code==='V3_MAPPING_REQUEST_INVALID');
  await assert.rejects(f.service.get(f.bound,f.mappingId,'bad'),error=>error.code==='V3_MAPPING_REQUEST_INVALID');
  await assert.rejects(f.service.get({...f.bound,role:'PATIENT'},f.mappingId),error=>error.code==='V3_ROLE_NOT_ALLOWED');
  assert.equal(f.queries.length,count);
});
test('Mapping GET handler emits safe Problem and refuses token URL; no private DB diagnostics',async()=>{
  const f=fixture({auditFailure:true});const handler=createV3MappingReadHandler(f);
  function response(){return {headers:{},setHeader(name,value){this.headers[name]=value;},writeHead(status,headers){this.status=status;this.headers={...this.headers,...headers};},end(body){this.body=JSON.parse(body);}};}
  const failed=response();await handler(f.request,failed);
  assert.equal(failed.status,503);assert.equal(failed.body.code,'V3_DATABASE_UNAVAILABLE');assert.ok(!JSON.stringify(failed.body).includes('SYNTHETIC-DB-PRIVATE'));
  const count=f.queries.length,query=response();await handler({...f.request,url:`${f.request.url}?token=SYNTHETIC-HIDDEN`},query);
  assert.equal(query.status,422);assert.equal(query.body.code,'V3_QUERY_NOT_ALLOWED');assert.equal(f.queries.length,count);
  assert.ok(!JSON.stringify(query.body).includes('SYNTHETIC-HIDDEN'));
});
test('metadata service requires bounded transaction budget and explicitly configured dependencies',()=>{
  assert.throws(()=>new V3MappingReadService());
  assert.throws(()=>createV3MappingReadHandler());
  assert.throws(()=>new V3MappingReadService({transactions:new V3TenantTransaction({pool:{connect(){}}})}));
});
