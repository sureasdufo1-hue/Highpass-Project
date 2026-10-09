import test from 'node:test';
import assert from 'node:assert/strict';
import {guardPatientWithdrawalPool,createPatientWithdrawalTransactions,assertPatientWithdrawalTransactions,
 selectPatientWithdrawalProjection,assertLivePatientWithdrawalProjection} from '../src/v3-patient-consent-withdraw-projection.js';

test('withdrawal factory requires private brand and finite valid configuration',()=>{
 const pool={async connect(){throw Error('NO_DATABASE_ACQUISITION');}};
 const f=createPatientWithdrawalTransactions({pool,maxReauthAgeMs:300000});
 assert.ok(Object.isFrozen(f));assert.equal(assertPatientWithdrawalTransactions(f),f);
 assert.throws(()=>assertPatientWithdrawalTransactions({...f}),e=>e.code==='V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
 for(const patch of [{maxReauthAgeMs:0},{maxReauthAgeMs:300001},{deadlineMs:10001},{deadlineMs:Infinity},{queryMs:5001}])
  assert.throws(()=>createPatientWithdrawalTransactions({pool,maxReauthAgeMs:300000,...patch}));
});
test('withdrawal unissued binding is rejected before connection acquisition',async()=>{
 let acquired=0;const f=createPatientWithdrawalTransactions({pool:{async connect(){acquired++;throw Error('UNEXPECTED');}},maxReauthAgeMs:300000});
 await assert.rejects(()=>f.run({role:'PATIENT',scopes:['consent:withdraw']},{},()=>{}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 assert.equal(acquired,0);
});
test('withdrawal fabricated transaction and projection never become private capability',async()=>{
 await assert.rejects(()=>selectPatientWithdrawalProjection({query(){}},{},{}),e=>e.code==='V3_PATIENT_WITHDRAW_TRANSACTION_REQUIRED');
 assert.throws(()=>assertLivePatientWithdrawalProjection({},{},{},{}),e=>e.code==='V3_PATIENT_WITHDRAW_TRANSACTION_REQUIRED');
});
test('withdrawal pool rejects every unsafe role bit and destroys the borrowed connection',async()=>{
 const safe={withdrawal:true,mixed:false,rolsuper:false,rolbypassrls:false,bypass:false,owner:false,schema_owner:false};
 for(const bit of Object.keys(safe)){
  let released;
  const guard=guardPatientWithdrawalPool({async connect(){return {async query(){return {rows:[{...safe,[bit]:!safe[bit]}]};},release(value){released=value;}};}});
  await assert.rejects(()=>guard.connect(),e=>e.code==='V3_PATIENT_WITHDRAW_DATABASE_ROLE_UNSAFE');assert.equal(released,true);
 }
});
test('withdrawal role-query failure returns a safe error without leaking raw diagnostics',async()=>{
 let released;
 const guard=guardPatientWithdrawalPool({async connect(){return {async query(){throw Error('SYNTHETIC_INTERNAL_QUERY_DETAIL');},release(v){released=v;}};}});
 await assert.rejects(()=>guard.connect(),e=>e.code==='V3_DATABASE_UNAVAILABLE'&&!e.message.includes('DETAIL'));assert.equal(released,true);
});
