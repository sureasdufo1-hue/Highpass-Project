import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3IdentifierProtection} from '../src/v3-identifier-protection.js';
import {V3IdentityIdempotency} from '../src/v3-identity-idempotency.js';
import {V3MappingWriteService} from '../src/v3-mapping-write-service.js';

function fixture({self=false,missing=false,auditFault=false}={}){
  const secret=randomBytes(32).toString('hex'),context={tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID()};
  const record={...context,actorId:randomUUID(),issuer:'synthetic-mapping',subject:'synthetic-reviewer',authHospitalId:'SYNTHETIC-A',
    role:'HOSPITAL_ADMIN',scopes:['mapping:write','mapping:review'],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
    scope:record.scopes.join(' '),exp:Math.floor(Date.now()/1000)+60}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {requiredScope:'mapping:review',allowedRoles:['HOSPITAL_ADMIN']});
  let row={mapping_id:randomUUID(),patient_ref:context.patientRefId,tenant_id:context.tenantId,hospital_id:context.hospitalId,
    registered_by:self?binding.actorId:randomUUID(),status:'UNVERIFIED',version:1,created_at:new Date(0),updated_at:new Date(0)};
  const queries=[];const client={async query(q){queries.push(q);
    if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
    if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
    if(q.text.includes('SELECT request_digest,response_metadata'))return {rows:[]};
    if(q.text.includes('SELECT patient_ref FROM'))return {rows:[{}]};
    if(q.text.includes('SELECT m.mapping_id'))return {rows:[{}]};
    if(q.text.includes('SELECT mapping_id,patient_ref'))return {rows:missing?[]:[row]};
    if(q.text.includes('UPDATE highpass_v3.patient_mappings')){row={...row,status:q.values[1],version:row.version+1,updated_at:new Date(1000),verified_at:q.values[1]==='VERIFIED'?new Date(1000):null};return {rows:[row]};}
    if(auditFault&&q.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'))throw new Error('SYNTHETIC-PRIVATE');
    return {rows:[]};},release(){}};
  const protection=new V3IdentifierProtection({encryptionKeys:new Map([['synthetic',randomBytes(32)]]),activeKeyId:'synthetic',lookupKey:randomBytes(32)});
  const ledger=new V3IdentityIdempotency({transactions:new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:8000}),hmacKey:randomBytes(32)});
  return {binding,queries,service:new V3MappingWriteService({idempotency:ledger,protection}),row,protection,ledger};
}
test('review increments version, writes old/new/evidence audit and returns safe metadata',async()=>{
  const f=fixture();try{
    const result=await f.service.review(f.binding,'synthetic_review_001',f.row.mapping_id,{expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')});
    assert.equal(result.version,2);assert.equal(result.state,'VERIFIED');assert.equal(result.verifiedAt,new Date(1000).toISOString());
    assert.ok(!('registeredBy' in result));assert.ok(!('protectedLocalRef' in result));
    const audit=f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'));
    assert.equal(audit.values[10],'UNVERIFIED');assert.equal(audit.values[11],'VERIFIED');assert.equal(audit.values[12],2);assert.equal(audit.values[13].length,32);
    assert.equal(f.queries.at(-1).text,'COMMIT');
  }finally{f.protection.dispose();f.ledger.dispose();}
});
test('self review and stale version commit DENY audit without mutation or ledger success',async()=>{
  for(const self of [true,false]){const f=fixture({self});try{
    await assert.rejects(f.service.review(f.binding,'synthetic_review_001',f.row.mapping_id,{expectedVersion:99,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')}),
      e=>e.code===(self?'V3_MAPPING_SELF_REVIEW':'V3_MAPPING_VERSION_CONFLICT'));
    assert.ok(f.queries.some(q=>q.text.includes('INSERT INTO highpass_v3.identity_audit_outbox')));
    assert.ok(!f.queries.some(q=>q.text.includes('UPDATE highpass_v3.patient_mappings')||q.text.includes('INSERT INTO highpass_v3.identity_write_results')));
    assert.equal(f.queries.at(-1).text,'COMMIT');
  }finally{f.protection.dispose();f.ledger.dispose();}}
});
test('missing/foreign review has same safe 404 and audit fault prevents success',async()=>{
  const missing=fixture({missing:true}),fault=fixture({auditFault:true});try{
    await assert.rejects(missing.service.review(missing.binding,'synthetic_review_001',missing.row.mapping_id,{expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')}),e=>e.code==='V3_MAPPING_NOT_FOUND'&&e.statusCode===404);
    assert.equal(missing.queries.at(-1).text,'COMMIT');
    await assert.rejects(fault.service.review(fault.binding,'synthetic_review_001',fault.row.mapping_id,{expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')}),e=>e.code==='V3_DATABASE_UNAVAILABLE');
    assert.equal(fault.queries.at(-1).text,'ROLLBACK');
  }finally{for(const f of [missing,fault]){f.protection.dispose();f.ledger.dispose();}}
});
