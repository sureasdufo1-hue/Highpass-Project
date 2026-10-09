import test from 'node:test';
import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHmac } from 'node:crypto';
import { V3PrincipalRegistry,v3BindingExpiry } from '../src/v3-principal-registry.js';
import { TestProvider } from '../src/auth.js';
import { V3TenantTransaction } from '../src/v3-tenant-transaction.js';
import { appendIdentityAudit } from '../src/v3-identity-audit.js';

function bindingFixture() {
  const secret=randomBytes(32).toString('hex');
  const record={issuer:'synthetic-tx',subject:'synthetic-admin',actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
    authHospitalId:'SYNTHETIC-HOSP-A',role:'HOSPITAL_ADMIN',scopes:['mapping:write'],status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const payload={iss:record.issuer,aud:'synthetic-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
    scope:'mapping:write',exp:Math.floor(Date.now()/1000)+60};
  const input=[{alg:'HS256'},payload].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const request={headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}};
  return registry.resolve(request,{requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
}

test('identity network transaction rejects missing, invented and mixed capabilities before pool use',async()=>{
  let connections=0;
  const tx=new V3TenantTransaction({pool:{async connect(){connections++;throw Error('UNEXPECTED_POOL');}}});
  const binding=bindingFixture();
  assert.throws(()=>tx.runWithIdentityNetwork(binding,'mapping:write',async()=>{}),error=>error.code==='V3_IDENTITY_NETWORK_CONTEXT_REQUIRED');
  await assert.rejects(tx.runWithIdentityNetwork(binding,'mapping:write',async()=>{},{}),error=>error.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
  await assert.rejects(tx.run(binding,'mapping:write',async()=>{},{},{}),error=>error.code==='V3_NETWORK_CONTEXT_AMBIGUOUS');
  assert.equal(connections,0);
});
function fakePool({active=true,unsafe=false,rollbackFailure=false,connectDelay=0}={}) {
  const queries=[],releases=[];
  const client=Object.assign(new EventEmitter(),{async query(query){
    queries.push(query);
    if(query.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:unsafe,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
    if(query.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:active?[{}]:[]};
    if(query.text==='ROLLBACK' && rollbackFailure)throw new Error('private DB value');
    return {rows:[]};
  },release(destroy){releases.push(Boolean(destroy));}});
  return {queries,releases,client,async connect(){if(connectDelay)await new Promise(resolve=>setTimeout(resolve,connectDelay));return client;}};
}
test('tenant transaction binds parameters and commits only after active DB principal check',async()=>{
  const pool=fakePool(),bound=bindingFixture();
  const result=await new V3TenantTransaction({pool}).run(bound,'mapping:write',async tx=>{await tx.query('SELECT $1::text',['synthetic']);return 'done';});
  assert.equal(result,'done'); assert.deepEqual(pool.releases,[false]);
  const config=pool.queries.find(query=>query.text.includes("set_config('app.tenant_id'"));
  assert.deepEqual(config.values.slice(0,3),[bound.tenantId,bound.hospitalId,bound.actorId]);
  assert.equal(pool.queries.at(-1).text,'COMMIT'); assert.ok(pool.queries.every(query=>query.query_timeout===5000));
});
test('raw body context or expired authenticated binding cannot acquire DB connection',async()=>{
  const pool=fakePool(),bound=bindingFixture(),runner=new V3TenantTransaction({pool});
  await assert.rejects(runner.run({...bound},'mapping:write',async()=>{}),error=>error.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  const expiry=v3BindingExpiry(bound),now=Date.now;
  try {Date.now=()=>expiry; await assert.rejects(runner.run(bound,'mapping:write',async()=>{}),error=>error.code==='JWT_EXPIRED');}
  finally {Date.now=now;}
  assert.equal(pool.queries.length,0);
});
test('inactive principal never invokes operation; unsafe DB role refuses BEGIN',async()=>{
  let calls=0;
  const pool=fakePool({active:false});
  await assert.rejects(new V3TenantTransaction({pool}).run(bindingFixture(),'mapping:write',async()=>{calls++;}),error=>error.code==='V3_DB_PRINCIPAL_INACTIVE');
  assert.equal(calls,0);assert.equal(pool.queries.at(-1).text,'ROLLBACK');
  const unsafe=fakePool({unsafe:true});
  await assert.rejects(new V3TenantTransaction({pool:unsafe}).run(bindingFixture(),'mapping:write',async()=>{}),error=>error.code==='V3_DATABASE_ROLE_UNSAFE');
  assert.ok(!unsafe.queries.some(query=>query.text==='BEGIN'));
});
test('credential expiry after callback prevents COMMIT and rolls back',async()=>{
  const pool=fakePool(),bound=bindingFixture(),expiry=v3BindingExpiry(bound),now=Date.now;
  try{
    await assert.rejects(new V3TenantTransaction({pool}).run(bound,'mapping:write',async()=>{Date.now=()=>expiry;}),
      error=>error.code==='JWT_EXPIRED');
    assert.equal(pool.queries.at(-1).text,'ROLLBACK');assert.ok(!pool.queries.some(query=>query.text==='COMMIT'));
  }finally{Date.now=now;}
});
test('operation DB failures rollback safely; rollback failure destroys connection',async()=>{
  for(const rollbackFailure of [false,true]){
    const pool=fakePool({rollbackFailure});
    await assert.rejects(new V3TenantTransaction({pool}).run(bindingFixture(),'mapping:write',async()=>{throw new Error('sensitive fixture');}),
      error=>error.code==='V3_DATABASE_UNAVAILABLE' && error.message==='V3_DATABASE_UNAVAILABLE' && !('cause' in error));
    assert.deepEqual(pool.releases,[rollbackFailure]);assert.equal(pool.queries.at(-1).text,'ROLLBACK');
  }
});
test('callback timeout destroys connection and closes captured query facade',async()=>{
  const pool=fakePool();let captured;
  await assert.rejects(new V3TenantTransaction({pool,deadlineMs:60,queryMs:50}).run(bindingFixture(),'mapping:write',async tx=>{
    captured=tx;await new Promise(()=>{});
  }),error=>error.code==='V3_TRANSACTION_DEADLINE');
  assert.deepEqual(pool.releases,[true]);
  await assert.rejects(captured.query('SELECT 1'),error=>error.code==='V3_TRANSACTION_CLOSED');
});

test('owned transaction deadline wins over synchronous connection-destroy errors',async()=>{
  for(const expected of ['V3_TRANSACTION_DEADLINE','JWT_EXPIRED','V3_COMMIT_OUTCOME_UNKNOWN']){
    const pool=fakePool(),query=pool.client.query.bind(pool.client),release=pool.client.release.bind(pool.client);
    const bound=bindingFixture(),expiry=v3BindingExpiry(bound),now=Date.now;
    let rejectQuery;
    pool.client.query=async statement=>statement.text===(expected==='V3_COMMIT_OUTCOME_UNKNOWN'?'COMMIT':'SELECT_RELEASE_RACE')
      ?new Promise((_,reject)=>{rejectQuery=reject;}) :query(statement);
    pool.client.release=destroy=>{
      release(destroy);
      if(destroy){pool.client.emit('error',new Error('PRIVATE_CONNECTION_DESTROY_ERROR'));rejectQuery?.(new Error('PRIVATE_QUERY_DESTROY_ERROR'));}
    };
    try{
      await assert.rejects(new V3TenantTransaction({pool,deadlineMs:60,queryMs:50}).run(bound,'mapping:write',tx=>{
        if(expected==='JWT_EXPIRED')Date.now=()=>expiry;
        return expected==='V3_COMMIT_OUTCOME_UNKNOWN'?'done':tx.query('SELECT_RELEASE_RACE');
      }),error=>error.code===expected);
      assert.deepEqual(pool.releases,[true]);
    }finally{Date.now=now;}
  }
});
test('borrowed-client error becomes safe failure and later socket errors cannot crash process',async()=>{
  const pool=fakePool();let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const pending=new V3TenantTransaction({pool}).run(bindingFixture(),'mapping:write',async()=>{started();await new Promise(()=>{});});
  const rejected=assert.rejects(pending,error=>error.code==='V3_DATABASE_UNAVAILABLE'&&error.message==='V3_DATABASE_UNAVAILABLE');
  await ready;pool.client.emit('error',new Error('SYNTHETIC-PRIVATE-PG-ERROR'));await rejected;
  assert.deepEqual(pool.releases,[true]);
  assert.doesNotThrow(()=>pool.client.emit('error',new Error('SYNTHETIC-LATE-SOCKET-ERROR')));
  assert.deepEqual(pool.releases,[true]);
});
test('timed-out pool acquisition releases a later-arriving connection as destroyed',async()=>{
  const pool=fakePool({connectDelay:100});
  await assert.rejects(new V3TenantTransaction({pool,deadlineMs:50,queryMs:40}).run(bindingFixture(),'mapping:write',async()=>{}),error=>error.code==='V3_TRANSACTION_DEADLINE');
  await new Promise(resolve=>setTimeout(resolve,100));assert.deepEqual(pool.releases,[true]);assert.equal(pool.queries.length,0);
});
test('audit helper has fixed typed fields and binds actor/tenant from authenticated capability',async()=>{
  const pool=fakePool(),bound=bindingFixture();
  const event={mappingId:randomUUID(),auditSessionId:randomUUID(),traceId:'synthetic_trace_001',action:'MAPPING_CREATED',result:'ALLOW',
    reasonCode:'MAPPING_REGISTERED',newState:'UNVERIFIED',mappingVersion:1};
  const runner=new V3TenantTransaction({pool});
  await runner.run(bound,'mapping:write',tx=>appendIdentityAudit(tx,bound,event));
  const insert=pool.queries.find(query=>query.text.includes('INSERT INTO highpass_v3.identity_audit_outbox'));
  assert.deepEqual(insert.values.slice(1,4),[bound.tenantId,bound.hospitalId,bound.actorId]);
  const before=pool.queries.length;
  for(const extra of [{token:'synthetic'}, {reasonCode:'RAW_IDENTIFIER'}, {mappingVersion:0}, {evidenceDigest:randomBytes(31)}]){
    await assert.rejects(appendIdentityAudit({query(){throw new Error('must not query');}},bound,{...event,...extra}),error=>error.code==='V3_AUDIT_EVENT_INVALID');
  }
  assert.equal(pool.queries.length,before);
});
