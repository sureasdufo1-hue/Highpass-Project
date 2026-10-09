import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3IdentityIdempotency} from '../src/v3-identity-idempotency.js';

function fixture({insertFailure=false}={}){
  const secret=randomBytes(32).toString('hex'),record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),issuer:'synthetic-ledger',
    subject:'synthetic-admin',authHospitalId:'SYNTHETIC-A',role:'HOSPITAL_ADMIN',scopes:['mapping:write'],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
    scope:'mapping:write',exp:Math.floor(Date.now()/1000)+60}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
  const queries=[];let stored;
  const client={async query(q){queries.push(q);
    if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
    if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
    if(q.text.includes('SELECT request_digest,response_metadata'))return {rows:stored?[stored]:[]};
    if(q.text.includes('SELECT patient_ref FROM'))return {rows:[{}]};
    if(q.text.includes('INSERT INTO highpass_v3.identity_write_results')){
      if(insertFailure)throw new Error('SYNTHETIC-PRIVATE-ERROR');
      stored={request_digest:Buffer.from(q.values[5]),response_metadata:JSON.parse(q.values[8])};
    }
    return {rows:[]};},release(){}};
  const ledger=new V3IdentityIdempotency({transactions:new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:8000}),hmacKey:randomBytes(32)});
  return {binding,queries,ledger,result:{patientRefId:randomUUID(),createdAt:new Date(0).toISOString()}};
}

test('strict mapping idempotency rejects missing or fabricated network input before pool acquisition',async()=>{
  const f=fixture();let connections=0;
  const strict=new V3IdentityIdempotency({transactions:new V3TenantTransaction({pool:{async connect(){connections++;throw Error('UNEXPECTED_POOL');}},deadlineMs:8000}),
    hmacKey:randomBytes(32),requireNetworkAudit:true});
  try {
    for(const network of [undefined,{input:{},context:{auditSessionId:randomUUID(),traceId:randomUUID()}}])
      await assert.rejects(strict.run(f.binding,'MAPPING_RECONCILE','synthetic_strict_key_001',{},async()=>f.result,network),e=>e.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
    await assert.rejects(strict.run(f.binding,'PATIENT_REF_REGISTER','synthetic_strict_key_001',{},async()=>f.result),e=>e.code==='V3_IDENTITY_NETWORK_OPERATION_NOT_SUPPORTED');
    await assert.rejects(f.ledger.run(f.binding,'MAPPING_RECONCILE','synthetic_strict_key_001',{},async()=>f.result,{input:{}}),e=>e.code==='V3_IDENTITY_NETWORK_MODE_MISMATCH');
    assert.equal(connections,0);assert.equal(f.queries.length,0);
  }finally{strict.dispose();f.ledger.dispose();}
});
test('same key/canonical command returns original metadata without repeating callback',async()=>{
  const f=fixture();let calls=0;
  const first=await f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{b:2,a:1},async()=>{calls++;return f.result;});
  const second=await f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{a:1,b:2},async()=>{calls++;throw new Error('must not run');});
  assert.deepEqual(first,second);assert.equal(calls,1);
  const insert=f.queries.find(q=>q.text.includes('INSERT INTO highpass_v3.identity_write_results'));
  assert.equal(insert.values[4].length,32);assert.equal(insert.values[5].length,32);
  assert.ok(!insert.values.some(v=>typeof v==='string'&&v.includes('synthetic_key_001')));
  assert.equal(f.queries.at(-1).text,'COMMIT');
});
test('different payload is 409 and ledger fault rolls back with safe diagnostic',async()=>{
  const f=fixture();await f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{},async()=>f.result);
  await assert.rejects(f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{different:true},async()=>{throw new Error('must not run');}),e=>e.statusCode===409);
  assert.equal(f.queries.at(-1).text,'ROLLBACK');
  const failure=fixture({insertFailure:true});await assert.rejects(failure.ledger.run(failure.binding,'PATIENT_REF_REGISTER','synthetic_key_002',{},async()=>failure.result),e=>e.code==='V3_DATABASE_UNAVAILABLE');
  assert.equal(failure.queries.at(-1).text,'ROLLBACK');
});
test('invalid credentials, keys, commands and disposed provider cannot query',async()=>{
  const f=fixture();
  await assert.rejects(f.ledger.run({...f.binding},'PATIENT_REF_REGISTER','synthetic_key_001',{},async()=>f.result),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  for(const [key,payload] of [['short',{}],['synthetic_key_001',{buffer:randomBytes(8)}],['synthetic_key_001',{bad:NaN}]])
    await assert.rejects(f.ledger.run(f.binding,'PATIENT_REF_REGISTER',key,payload,async()=>f.result),e=>e.statusCode===422);
  f.ledger.dispose();await assert.rejects(f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{},async()=>f.result),e=>e.code==='V3_IDEMPOTENCY_PROVIDER_UNAVAILABLE');
  assert.equal(f.queries.length,0);
});
test('safe result whitelist refuses credential/envelope fields before result storage',async()=>{
  const f=fixture();await assert.rejects(f.ledger.run(f.binding,'PATIENT_REF_REGISTER','synthetic_key_001',{},async()=>({...f.result,token:'SYNTHETIC'})),e=>e.code==='V3_IDEMPOTENCY_RESULT_INVALID');
  assert.ok(!f.queries.some(q=>q.text.includes('INSERT INTO highpass_v3.identity_write_results')));
});
