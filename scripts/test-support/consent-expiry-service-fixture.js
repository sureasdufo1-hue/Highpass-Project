import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {createConsentExpiryTransactions} from '../../src/v3-consent-expiry-transactions.js';
import {V3ConsentExpiryService} from '../../src/v3-consent-expiry-service.js';
import {createPatientWithdrawalTransactions} from '../../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../../src/v3-patient-consent-withdraw-service.js';

export async function checkConsentExpiryService({admin,expiryPool,patientPool,record,worker,binding,patientBinding,consent,assertion}){
 const key=randomBytes(32),services=[],fresh=()=>`synthetic-expiry-batch-${randomUUID()}`;
 const wrap=(pool,intercept)=>({async connect(){const c=await pool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:d=>c.release(d),query:q=>intercept?intercept(q,c):c.query(q)};}});
 const make=intercept=>{const s=new V3ConsentExpiryService({transactions:createConsentExpiryTransactions({pool:wrap(expiryPool,intercept)}),hmacKey:key});services.push(s);return s;};
 const run=(s,k=fresh(),limit=100)=>s.expireBatch(binding(),k,{limit});
 const waitExpiry=c=>admin.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM (valid_until-clock_timestamp())))+0.03) FROM highpass_v3.consent_content_versions WHERE consent_id=$1',[c.consentId]);
 const terminal=c=>admin.query('SELECT state,actor_id,subject_actor_id,effective_at=valid_until AS deadline FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1',[c.consentId]).then(r=>r.rows);
 const initial=c=>admin.query('SELECT to_jsonb(r) AS r FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[c.consentId]).then(r=>r.rows);
 const counts=()=>admin.query(`SELECT (SELECT count(*)::integer FROM highpass_v3.consent_expiry_batches) AS batches,
  (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_events) AS events,
  (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_audit) AS audit,
  (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_results) AS results,
  (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_cascade) AS cascade`).then(r=>r.rows[0]);
 const barrier=()=>{let release,enter;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
  const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTH_EXPIRY_BARRIER_TIMEOUT')),4500);})]);}finally{clearTimeout(timer);}};
  return {release,enter,hold:()=>bounded(gate),wait:()=>bounded(ready)};};
 const witness=async(waiter,blocker)=>{const until=Date.now()+1000;while(Date.now()<until){
  if(Number.isInteger(waiter())&&Number.isInteger(blocker())&&(await admin.query('SELECT $2::integer=ANY(pg_blocking_pids($1::integer)) AS seen',[waiter(),blocker()])).rows[0].seen)return;
  await new Promise(r=>setTimeout(r,20));
 }assert.fail('SYNTH_EXPIRY_SERVICE_LOCK_NOT_WITNESSED');};
 try{
  await assertion('consent expiry service PG: additive029 rollback then owned apply with expiry-only ledger privileges',async()=>{
   const sql=readFileSync('db/migrations/029_highpass_v3_consent_expiry_batches.sql','utf8'),c=await admin.connect();
   try{await c.query('BEGIN');await c.query(sql);await c.query('ROLLBACK');assert.equal((await c.query("SELECT to_regclass('highpass_v3.consent_expiry_batches') AS t")).rows[0].t,null);await c.query('BEGIN');await c.query(sql);await c.query('COMMIT');}
   finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
   await admin.query(`GRANT SELECT,INSERT ON highpass_v3.consent_expiry_batches TO hp_lifecycle_expiry_test;
    GRANT EXECUTE ON FUNCTION highpass_v3.consent_expiry_batch_receipts(uuid,uuid,uuid,bytea),highpass_v3.require_consent_expiry_batch() TO hp_lifecycle_expiry_test;`);
   assert.equal((await admin.query("SELECT relrowsecurity AND relforcerowsecurity AS safe FROM pg_class WHERE oid='highpass_v3.consent_expiry_batches'::regclass")).rows[0].safe,true);
  });
  const s=make();await run(s);let original;
  await assertion('consent expiry service PG: durable empty retry stays empty after later content expires',async()=>{
   const k=fresh(),empty=await run(s,k);assert.equal(empty.processed,0);
   const c=await consent({short:true}),before=await initial(c);await waitExpiry(c);
   assert.deepEqual(await run(s,k),empty);assert.deepEqual(await terminal(c),[]);assert.deepEqual(await initial(c),before);original={c,before};
  });
  await assertion('consent expiry service PG: signed batch atomically expires actual subject and preserves original approval',async()=>{
   const k=fresh(),r=await run(s,k,1);assert.equal(r.processed,1);assert.equal(r.receipts[0].consentId,original.c.consentId);
   assert.deepEqual(await terminal(original.c),[{state:'EXPIRED',actor_id:worker,subject_actor_id:record.actorId,deadline:true}]);
   assert.deepEqual(await initial(original.c),original.before);
   assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.receipts));original={...original,k,r};
  });
  await assertion('consent expiry service PG: same batch original receipt recovery and changed-limit conflict do not append',async()=>{
   const before=await counts();assert.deepEqual(await run(s,original.k,1),original.r);
   await assert.rejects(()=>run(s,original.k,2),e=>e.code==='V3_CONSENT_EXPIRY_IDEMPOTENCY_CONFLICT');assert.deepEqual(await counts(),before);
  });
  await assertion('consent expiry service PG: same-key concurrent batches commit exactly one durable result',async()=>{
   const c=await consent({short:true});await waitExpiry(c);const k=fresh(),before=await counts();
   const r=await Promise.all([run(s,k,1),run(s,k,1)]);assert.deepEqual(r[0],r[1]);assert.equal(r[0].processed,1);assert.equal((await counts()).batches,before.batches+1);
  });
  for(const table of ['consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'])await assertion(`consent expiry service PG: missing ${table} rolls back event and batch`,async()=>{
   const c=await consent({short:true});await waitExpiry(c);const before=await counts(),bad=make((q,client)=>q.text.startsWith('INSERT INTO highpass_v3.'+table)?Promise.resolve({rows:[]}):client.query(q));
   await assert.rejects(()=>run(bad,fresh(),1),e=>['V3_COMMIT_OUTCOME_UNKNOWN','V3_DATABASE_UNAVAILABLE'].includes(e.code));assert.deepEqual(await counts(),before);assert.deepEqual(await terminal(c),[]);
   await run(s,fresh(),1);
  });
  await assertion('consent expiry service PG: actual committed lost ACK recovers exact batch without new terminal',async()=>{
   const c=await consent({short:true});await waitExpiry(c);const k=fresh(),bad=make(async(q,client)=>{const r=await client.query(q);if(q.text==='COMMIT')throw Error('SYNTH_ACK_LOSS');return r;});
   await assert.rejects(()=>run(bad,k,1),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');const before=await counts(),r=await run(s,k,1);
   assert.equal(r.processed,1);assert.equal(r.receipts[0].consentId,c.consentId);assert.deepEqual(await run(s,k,1),r);assert.deepEqual(await counts(),before);
  });
  for(const withdrawalFirst of [true,false])await assertion(`consent expiry service PG: witnessed actual ${withdrawalFirst?'withdrawal first deadline rollback then expiry':'expiry first terminal denies withdrawal'}`,async()=>{
   const c=await consent({short:true}),before=await initial(c),latch=barrier();let patientPid,expiryPid,w,e;
   const patient=new V3PatientConsentWithdrawalService({transactions:createPatientWithdrawalTransactions({maxReauthAgeMs:300000,pool:wrap(patientPool,async(q,client)=>{
    if(q.text==='BEGIN')patientPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const r=await client.query(q);if(withdrawalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_lifecycle_cascade')){latch.enter();await latch.hold();}return r;
   })}),hmacKey:randomBytes(32)});
   const expiry=make(async(q,client)=>{
    if(q.text==='BEGIN')expiryPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const r=await client.query(q);if(!withdrawalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_lifecycle_cascade')){latch.enter();await latch.hold();}return r;
   });
   const observe=p=>p.then(value=>({value}),error=>({code:error.code}));
   const withdraw=()=>patient.withdraw(patientBinding(),fresh(),{consentId:c.consentId,contentVersion:1,expectedEventSequence:2});
   try{
    if(withdrawalFirst){w=observe(withdraw());await latch.wait();await waitExpiry(c);e=observe(run(expiry,fresh(),1));await witness(()=>expiryPid,()=>patientPid);latch.release();assert.equal((await w).code,'V3_CONSENT_EXPIRED');}
    else{await waitExpiry(c);e=observe(run(expiry,fresh(),1));await latch.wait();w=observe(withdraw());await witness(()=>patientPid,()=>expiryPid);latch.release();assert.equal((await w).code,'V3_WITHDRAW_CONSENT_TERMINAL');}
    const r=await e;assert.equal(r.value?.processed,1);assert.equal(r.value.receipts[0].consentId,c.consentId);assert.deepEqual(await initial(c),before);assert.equal((await terminal(c)).length,1);
   }finally{latch.release();await Promise.allSettled([w,e].filter(Boolean));patient.dispose();}
  });
 }finally{for(const s of services)s.dispose();key.fill(0);}
}
