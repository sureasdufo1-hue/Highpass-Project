import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {prepareConsentExpiryBatch,v3ConsentExpiryPolicy} from '../src/v3-consent-expiry-command.js';
import {guardConsentExpiryPool,createConsentExpiryTransactions,assertConsentExpiryTransactions,assertConsentExpiryTransaction} from '../src/v3-consent-expiry-transactions.js';

function binding(){
 const secret=randomBytes(32).toString('hex'),issuer='synthetic-expiry-factory';
 const provider=new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret});
 const registry=new V3PrincipalRegistry({provider,records:[{issuer,subject:'SYNTH-WORKER',authHospitalId:'SYNTH-A',
  actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),role:'INTERNAL_SERVICE',status:'ACTIVE',servicePurpose:'CONSENT_EXPIRY',scopes:['consent:expire']}]});
 const data=[{alg:'HS256'},{iss:issuer,aud:'synthetic-v3',sub:'SYNTH-WORKER',hospitalId:'SYNTH-A',role:'INTERNAL_SERVICE',scope:'consent:expire',exp:Math.floor(Date.now()/1000)+120}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},v3ConsentExpiryPolicy);
}
const safe={expiry:true,mixed:false,rolsuper:false,rolbypassrls:false,bypass:false,owner:false,schema_owner:false};
function poolFixture(patch={}){
 const queries=[],releases=[],client=new EventEmitter();let acquired=0;
 client.release=value=>releases.push(value);
 client.query=async ({text,values})=>{
  queries.push({text,values});
  if(patch.query)return patch.query(text,values,client);
  if(text.includes(' AS expiry,'))return {rows:[safe]};
  if(text.includes('FROM pg_roles r WHERE'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
  if(text.includes('FROM highpass_v3.principal_bindings p'))return {rows:patch.inactive?[]:[{actor_id:'synthetic'}]};
  if(text.includes(' AS now_ms'))return {rows:[{now_ms:String(Date.now())}]};
  return {rows:[]};
 };
 return {pool:{async connect(){acquired++;return client;}},queries,releases,get acquired(){return acquired;}};
}
test('expiry factory is private and rejects invalid finite configuration',()=>{
 const pool=poolFixture().pool,f=createConsentExpiryTransactions({pool});assert.equal(assertConsentExpiryTransactions(f),f);assert.ok(Object.isFrozen(f));
 assert.throws(()=>assertConsentExpiryTransactions({...f}),e=>e.code==='V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
 for(const patch of [{deadlineMs:49},{deadlineMs:10001},{deadlineMs:Infinity},{queryMs:9},{queryMs:5001}])assert.throws(()=>createConsentExpiryTransactions({pool,...patch}));
});
test('private binding command and callback required before borrowing a connection',async()=>{
 const p=poolFixture(),f=createConsentExpiryTransactions({pool:p.pool}),b=binding(),c=prepareConsentExpiryBatch(b);
 for(const [actor,command,operation] of [[{...b},c,()=>{}],[b,{...c},()=>{}],[binding(),c,()=>{}],[b,c,null]])await assert.rejects(()=>f.run(actor,command,operation));
 assert.equal(p.acquired,0);
});
test('guard destroys every unsafe missing or ambiguous capability profile',async()=>{
 for(const rows of [[],[safe,safe],...Object.keys(safe).map(k=>[{...safe,[k]:!safe[k]}]),[{...safe,mixed:undefined}]]){
  const p=poolFixture({query:async()=>({rows})});await assert.rejects(()=>guardConsentExpiryPool(p.pool).connect(),e=>e.code==='V3_CONSENT_EXPIRY_DATABASE_ROLE_UNSAFE');assert.deepEqual(p.releases,[true]);
 }
});
test('guard masks query faults and asynchronous connection errors',async()=>{
 for(const query of [async()=>{throw Error('PRIVATE_RAW_SQL_DETAIL');},async(text,values,client)=>{client.emit('error',Error('PRIVATE_SOCKET_DETAIL'));return {rows:[safe]};}]){
  const p=poolFixture({query});await assert.rejects(()=>guardConsentExpiryPool(p.pool).connect(),e=>e.code==='V3_DATABASE_UNAVAILABLE'&&!e.message.includes('DETAIL'));assert.deepEqual(p.releases,[true]);
 }
});
test('exact callback lifetime enforces provenance and UTC ISO before commit',async()=>{
 const p=poolFixture(),f=createConsentExpiryTransactions({pool:p.pool}),b=binding(),c=prepareConsentExpiryBatch(b);let saved;
 assert.equal(await f.run(b,c,async tx=>{
  saved=tx;assert.equal(assertConsentExpiryTransaction(tx,b,c),tx);
  for(const [t,actor,command] of [[{...tx},b,c],[tx,{...b},c],[tx,b,{...c}]])assert.throws(()=>assertConsentExpiryTransaction(t,actor,command),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
  await tx.query('SELECT 1');return 'CALLBACK_VALUE_NOT_RECEIPT';
 }),'CALLBACK_VALUE_NOT_RECEIPT');
 assert.throws(()=>assertConsentExpiryTransaction(saved,b,c),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
 await assert.rejects(()=>saved.query('SELECT 1'),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
 const sql=p.queries.map(q=>q.text);assert.ok(sql.indexOf("SET LOCAL TIME ZONE 'UTC'")<sql.indexOf('SELECT 1'));assert.ok(sql.includes("SET LOCAL DateStyle TO 'ISO, YMD'"));assert.equal(sql.at(-1),'COMMIT');assert.deepEqual(p.releases,[false]);
});
test('inactive persisted principal blocks callback and rolls back',async()=>{
 const p=poolFixture({inactive:true}),f=createConsentExpiryTransactions({pool:p.pool}),b=binding();let called=false;
 await assert.rejects(()=>f.run(b,prepareConsentExpiryBatch(b),()=>{called=true;}),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');
 assert.equal(called,false);assert.equal(p.queries.at(-1).text,'ROLLBACK');
});
test('callback failure rolls back and invalidates captured transaction',async()=>{
 const p=poolFixture(),f=createConsentExpiryTransactions({pool:p.pool}),b=binding(),c=prepareConsentExpiryBatch(b);let saved;
 await assert.rejects(()=>f.run(b,c,tx=>{saved=tx;throw Error('PRIVATE_CALLBACK_DETAIL');}),e=>e.code==='V3_DATABASE_UNAVAILABLE');
 assert.equal(p.queries.at(-1).text,'ROLLBACK');assert.throws(()=>assertConsentExpiryTransaction(saved,b,c));
});
test('credential expiry at callback completion never commits a result',async()=>{
 const p=poolFixture(),f=createConsentExpiryTransactions({pool:p.pool}),b=binding(),c=prepareConsentExpiryBatch(b),now=Date.now;
 try{
  await assert.rejects(()=>f.run(b,c,()=>{Date.now=()=>now()+180000;return 'NOT_SUCCESS';}),e=>e.code==='JWT_EXPIRED');
 }finally{Date.now=now;}
 assert.equal(p.queries.at(-1).text,'ROLLBACK');assert.equal(p.queries.some(q=>q.text==='COMMIT'),false);
});
test('lost COMMIT outcome is safely unknown not successful',async()=>{
 const p=poolFixture(),original=p.pool.connect;p.pool.connect=async()=>{const client=await original();const query=client.query;client.query=async q=>{if(q.text==='COMMIT')throw Error('PRIVATE_COMMIT_DETAIL');return query(q);};return client;};
 const f=createConsentExpiryTransactions({pool:p.pool}),b=binding();await assert.rejects(()=>f.run(b,prepareConsentExpiryBatch(b),()=> 'NOT_SUCCESS'),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');
});
