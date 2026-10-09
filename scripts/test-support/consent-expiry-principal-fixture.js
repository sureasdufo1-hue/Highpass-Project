import assert from 'node:assert/strict';
import {randomBytes,createHmac,randomUUID} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {v3ConsentExpiryPolicy,prepareConsentExpiryBatch,assertConsentExpiryBatch} from '../../src/v3-consent-expiry-command.js';
import {createConsentExpiryTransactions,assertConsentExpiryTransaction} from '../../src/v3-consent-expiry-transactions.js';
import {checkConsentExpiryService} from './consent-expiry-service-fixture.js';

// Actual signed principal/generic context and dedicated private factory evidence.
// No event expiry service or deployed scheduler is implemented by this fixture.
export async function checkConsentExpiryPrincipal({admin,expiryPool,patientPool,patientBinding,consent,record,worker,assertion}){
 const secret=randomBytes(32).toString('hex'),issuer='synthetic-consent-expiry-principal';
 const identity={...record,actorId:worker,patientRefId:null,issuer,subject:'SYNTH-CONSENT-EXPIRY',authHospitalId:'SYNTH-A',role:'INTERNAL_SERVICE',status:'ACTIVE',scopes:['consent:expire'],servicePurpose:'CONSENT_EXPIRY'};
 const provider=new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret});
 const registry=new V3PrincipalRegistry({provider,records:[identity]});
 const request=()=>{
  const data=[{alg:'HS256'},{iss:issuer,aud:'synthetic-v3',sub:identity.subject,hospitalId:'SYNTH-A',role:'INTERNAL_SERVICE',scope:'consent:expire',exp:Math.floor(Date.now()/1000)+180}]
   .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return {headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}};
 };
 const binding=(r=registry)=>r.resolve(request(),v3ConsentExpiryPolicy);
 await admin.query(`GRANT UPDATE(actor_id) ON highpass_v3.principal_bindings TO hp_lifecycle_expiry_test;
  GRANT UPDATE(tenant_id) ON highpass_v3.tenants TO hp_lifecycle_expiry_test;
  GRANT UPDATE(hospital_id) ON highpass_v3.hospitals TO hp_lifecycle_expiry_test;`);
 const tx=new V3TenantTransaction({pool:expiryPool,deadlineMs:8000,queryMs:5000});
 await assertion('consent expiry principal PG: signed registered private command matches actual source DB service actor',async()=>{
  const b=binding(),command=prepareConsentExpiryBatch(b,{limit:1});
  await tx.run(b,'consent:expire',async t=>{
   assert.equal(assertConsentExpiryBatch(b,command),command);
   const p=(await t.query('SELECT actor_id,service_purpose,role,patient_ref,scopes FROM highpass_v3.principal_bindings WHERE actor_id=$1',[worker])).rows[0];
   assert.deepEqual(p,{actor_id:worker,service_purpose:'CONSENT_EXPIRY',role:'INTERNAL_SERVICE',patient_ref:null,scopes:['consent:expire']});
  });
 });
 await assertion('consent expiry principal PG: no patient reference or approval clinical Session expiry membership is inherited',async()=>{
  const profile=(await expiryPool.query(`SELECT r.rolsuper,r.rolbypassrls,
   pg_has_role(current_user,'hp_v3_consent_expiry_policy','MEMBER') AS own,
   pg_has_role(current_user,'hp_v3_consent_withdraw_policy','MEMBER') OR pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER')
    OR pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') OR pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS mixed,
   has_table_privilege(current_user,'highpass_v3.patient_refs','SELECT') AS patient_read FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  assert.deepEqual(profile,{rolsuper:false,rolbypassrls:false,own:true,mixed:false,patient_read:false});
  const b=binding();await assert.rejects(()=>tx.run(b,'consent:expire',t=>t.query('UPDATE highpass_v3.principal_bindings SET actor_id=actor_id WHERE actor_id=$1',[worker])),e=>e.code==='V3_DATABASE_UNAVAILABLE');
 });
 await assertion('consent expiry principal PG: signed registry source or actor mismatch cannot acquire DB operation authority',async()=>{
  for(const patch of [{hospitalId:randomUUID()},{tenantId:randomUUID()},{actorId:randomUUID()}]){
   const r=new V3PrincipalRegistry({provider,records:[{...identity,...patch}]}),b=binding(r);let called=false;
   await assert.rejects(()=>tx.run(b,'consent:expire',()=>{called=true;}),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');assert.equal(called,false);
  }
 });
 await assertion('consent expiry principal PG: inactive actual service or source fails closed despite ACTIVE signed registry',async()=>{
  for(const [table,column,id] of [['principal_bindings','actor_id',worker],['hospitals','hospital_id',record.hospitalId]]){
   await admin.query(`UPDATE highpass_v3.${table} SET status='SUSPENDED' WHERE ${column}=$1`,[id]);
   try{await assert.rejects(()=>tx.run(binding(),'consent:expire',()=>assert.fail('MUST_NOT_ENTER')),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');}
   finally{await admin.query(`UPDATE highpass_v3.${table} SET status='ACTIVE' WHERE ${column}=$1`,[id]);}
  }
 });
 const factory=createConsentExpiryTransactions({pool:expiryPool});
 await assertion('consent expiry factory PG: exact signed callback brand and UTC ISO lifetime without patient reference privileges',async()=>{
  const b=binding(),command=prepareConsentExpiryBatch(b);let saved;
  await factory.run(b,command,async t=>{
   saved=t;assert.equal(assertConsentExpiryTransaction(t,b,command),t);
   assert.throws(()=>assertConsentExpiryTransaction({...t},b,command),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
   const row=(await t.query(`SELECT current_setting('TimeZone') AS zone,current_setting('DateStyle') AS style,
    has_table_privilege(current_user,'highpass_v3.patient_refs','SELECT') AS patient_read`)).rows[0];
   assert.deepEqual(row,{zone:'UTC',style:'ISO, YMD',patient_read:false});
  });
  assert.throws(()=>assertConsentExpiryTransaction(saved,b,command),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
  await assert.rejects(()=>saved.query('SELECT 1'),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
 });
 await assertion('consent expiry factory PG: foreign source principal mismatch blocks private callback',async()=>{
  for(const patch of [{hospitalId:randomUUID()},{tenantId:randomUUID()},{actorId:randomUUID()}]){
   const b=binding(new V3PrincipalRegistry({provider,records:[{...identity,...patch}]}));let called=false;
   await assert.rejects(()=>factory.run(b,prepareConsentExpiryBatch(b),()=>{called=true;}),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');assert.equal(called,false);
  }
 });
 await assertion('consent expiry factory PG: mixed withdrawal membership destroys unsafe admission and restores role',async()=>{
  await admin.query('GRANT hp_v3_consent_withdraw_policy TO hp_lifecycle_expiry_test');
  try{
   const b=binding();await assert.rejects(()=>factory.run(b,prepareConsentExpiryBatch(b),()=>assert.fail('MUST_NOT_ENTER')),e=>e.code==='V3_CONSENT_EXPIRY_DATABASE_ROLE_UNSAFE');
  }finally{await admin.query('REVOKE hp_v3_consent_withdraw_policy FROM hp_lifecycle_expiry_test');}
  const b=binding();await factory.run(b,prepareConsentExpiryBatch(b),t=>t.query('SELECT 1'));
 });
 await assertion('consent expiry factory PG: callback failure rolls back transaction advisory lock and closes brand',async()=>{
  const b=binding(),command=prepareConsentExpiryBatch(b),key=`SYNTH-EXPIRY-ROLLBACK-${randomUUID()}`;let saved;
  await assert.rejects(()=>factory.run(b,command,async t=>{
   saved=t;await t.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);throw Error('SYNTH_CALLBACK_FAULT');
  }),e=>e.code==='V3_DATABASE_UNAVAILABLE');
  assert.throws(()=>assertConsentExpiryTransaction(saved,b,command),e=>e.code==='V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
  assert.equal((await admin.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS released',[key])).rows[0].released,true);
 });
 await assertion('consent expiry factory PG: finite actual query deadline does not return callback success',async()=>{
  const limited=createConsentExpiryTransactions({pool:expiryPool,deadlineMs:300}),b=binding(),command=prepareConsentExpiryBatch(b);let saved;
  await assert.rejects(()=>limited.run(b,command,async t=>{saved=t;await t.query('SELECT pg_sleep(2)');return 'MUST_NOT_SUCCEED';}),e=>e.code==='V3_TRANSACTION_DEADLINE');
  if(saved)assert.throws(()=>assertConsentExpiryTransaction(saved,b,command),e=>['V3_TRANSACTION_DEADLINE','V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED'].includes(e.code));
  const next=binding();await factory.run(next,prepareConsentExpiryBatch(next),t=>t.query('SELECT 1'));
 });
 await checkConsentExpiryService({admin,expiryPool,patientPool,patientBinding,consent,record,worker,binding,assertion});
}
