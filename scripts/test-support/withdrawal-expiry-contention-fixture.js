import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPatientWithdrawalTransactions} from '../../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../../src/v3-patient-consent-withdraw-service.js';

// Actual signed patient service versus registered nonowner SQL maintenance writer.
// This is deliberately NOT a private CONSENT_EXPIRY worker implementation.
export async function checkWithdrawalExpiryContention({admin,patientPool,expiryPool,patientBinding,record,worker,consent,operation,assertion}){
 const key=randomBytes(32),providers=[];
 const make=intercept=>{
  const pool={async connect(){const c=await patientPool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:d=>c.release(d),
   query:q=>intercept?intercept(q,c):c.query(q)};}};
  const s=new V3PatientConsentWithdrawalService({transactions:createPatientWithdrawalTransactions({pool,maxReauthAgeMs:300000}),hmacKey:key});providers.push(s);return s;
 };
 const run=(s,c,k=`synthetic-withdraw-expiry-${randomUUID()}`)=>s.withdraw(patientBinding(),k,{consentId:c.consentId,contentVersion:1,expectedEventSequence:2});
 const observe=p=>p.then(value=>({value}),error=>({code:error.code}));
 const waitExpiry=c=>admin.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM (valid_until-clock_timestamp())))+0.03) FROM highpass_v3.consent_content_versions WHERE consent_id=$1',[c.consentId]);
 const witness=async(waiter,blocker)=>{
  const end=Date.now()+1000;while(Date.now()<end){
   if((await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer AND wait_event_type='Lock'
    AND $2::integer=ANY(pg_blocking_pids(pid))) AS seen`,[waiter,blocker])).rows[0].seen)return;
   await new Promise(r=>setTimeout(r,20));
  }assert.fail('WITHDRAW_EXPIRY_LOCK_NOT_WITNESSED');
 };
 const pidReady=async read=>{const end=Date.now()+600;while(!read()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert(Number.isInteger(read()));};
 const barrier=()=>{
  let release,enter;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
  const bounded=async p=>{let t;try{return await Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('WITHDRAW_EXPIRY_BARRIER_TIMEOUT')),4500);})]);}finally{clearTimeout(t);}};
  return {release,enter,hold:()=>bounded(gate),wait:()=>bounded(ready)};
 };
 const terminal=async c=>(await admin.query('SELECT state,actor_id,subject_actor_id,effective_at=valid_until AS deadline FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1',[c.consentId])).rows;
 const initial=async c=>JSON.stringify((await admin.query('SELECT to_jsonb(r) FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[c.consentId])).rows);
 const expiryRead=async(c,actor=worker,source=record.hospitalId)=>{
  const client=await expiryPool.connect();try{
   await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenantId,source,actor]);
   const row=(await client.query(`SELECT
    (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1) AS events,
    (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_audit WHERE consent_id=$1) AS audit,
    (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_results WHERE event_id IN (SELECT event_id FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1)) AS results,
    (SELECT count(*)::integer FROM highpass_v3.consent_lifecycle_cascade WHERE event_id IN (SELECT event_id FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1)) AS cascade`,[c.consentId])).rows[0];
   await client.query('COMMIT');return row;
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
 };
 try{
  await assertion('withdraw expiry SQL fixture PG: source maintenance sees patient terminal but not patient audit results cascade; actor/source spoofs deny',async()=>{
   const c=await consent(),s=make();await run(s,c);
   assert.deepEqual(await expiryRead(c),{events:1,audit:0,results:0,cascade:0});
   for(const [actor,source] of [[record.actorId,record.hospitalId],[worker,randomUUID()]])assert.deepEqual(await expiryRead(c,actor,source),{events:0,audit:0,results:0,cascade:0});
  });
  await assertion('withdraw expiry SQL fixture PG: observing patient terminal cannot write patient event audit result or cascade',async()=>{
   const c=await consent(),s=make(),receipt=await run(s,c);
   for(const table of ['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade']){
    const row=(await admin.query(`SELECT to_jsonb(r) AS row FROM highpass_v3.${table} r WHERE event_id=$1`,[receipt.eventId])).rows[0].row;
    const client=await expiryPool.connect();try{
     await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenantId,record.hospitalId,worker]);
     await assert.rejects(()=>client.query(`INSERT INTO highpass_v3.${table} SELECT (jsonb_populate_record(NULL::highpass_v3.${table},$1::jsonb)).*`,[JSON.stringify(row)]),e=>e.code==='42501');
    }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
   }
   assert.equal((await terminal(c)).length,1);
  });
  await assertion('withdraw expiry SQL fixture PG: every missing maintenance assembly rolls back and complete actual worker tuple commits',async()=>{
   const c=await consent({short:true}),before=await initial(c);await waitExpiry(c);
   for(const omit of ['audit','result','cascade']){
    await assert.rejects(()=>operation(expiryPool,c,{expiry:true,serialized:true,omit}),e=>{
     if(['23503','23514'].includes(e.code))return true;throw e;
    });
    assert.deepEqual(await terminal(c),[]);assert.equal(await initial(c),before);
   }
   assert.equal((await operation(expiryPool,c,{expiry:true,serialized:true})).actor_id,worker);
   assert.deepEqual(await expiryRead(c),{events:1,audit:1,results:1,cascade:1});
   await assert.rejects(()=>run(make(),c),e=>e.code==='V3_WITHDRAW_CONSENT_TERMINAL');
  });
  for(const withdrawalFirst of [false,true])await assertion(`withdraw expiry SQL fixture PG: witnessed ${withdrawalFirst?'withdraw admitted first rolls back at deadline then expiry':'expiry first denies withdrawal'}`,async()=>{
   const c=await consent({short:true}),before=await initial(c),latch=barrier();let patientPid,expiryPid,withdrawal,expiry;
   const s=make(async(q,client)=>{
    if(q.text==='BEGIN')patientPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const out=await client.query(q);
    if(withdrawalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_lifecycle_cascade')){latch.enter();await latch.hold();}
    return out;
   });
   const expire=()=>operation(expiryPool,c,{expiry:true,serialized:true,
    onBegin:async client=>{expiryPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;},
    beforeCommit:withdrawalFirst?undefined:async()=>{latch.enter();await latch.hold();}});
   try{
    if(withdrawalFirst){
     withdrawal=observe(run(s,c));await latch.wait();await waitExpiry(c);expiry=observe(expire());await pidReady(()=>expiryPid);
     await witness(expiryPid,patientPid);latch.release();
     const denied=await withdrawal;
     if(denied.code!=='V3_CONSENT_EXPIRED')throw Object.assign(Error('SAFE_FIXTURE_ENUM_ONLY'),{code:denied.code??'V3_FIXTURE_WITHDRAW_SUCCEEDED_AFTER_DEADLINE'});
    }else{
     await waitExpiry(c);expiry=observe(expire());await latch.wait();withdrawal=observe(run(s,c));await pidReady(()=>patientPid);
     await witness(patientPid,expiryPid);latch.release();assert.equal((await withdrawal).code,'V3_WITHDRAW_CONSENT_TERMINAL');
    }
    const expired=await expiry;
    if(expired.value?.state!=='EXPIRED')throw Object.assign(Error('SAFE_FIXTURE_ENUM_ONLY'),{code:expired.code??'V3_FIXTURE_EXPIRY_NOT_WRITTEN'});
    assert.deepEqual(await terminal(c),[{state:'EXPIRED',actor_id:worker,subject_actor_id:record.actorId,deadline:true}]);
    assert.equal(await initial(c),before);
   }finally{latch.release();if(withdrawal)await withdrawal;if(expiry)await expiry;}
  });
  await assertion('withdraw expiry SQL fixture PG: withdrawal committed before deadline prevents subsequent expiry without duplicating terminal',async()=>{
   const c=await consent({short:true}),s=make(),k=`synthetic-expiry-original-${randomUUID()}`,before=await initial(c),receipt=await run(s,c,k);
   await waitExpiry(c);assert.deepEqual(await operation(expiryPool,c,{expiry:true,serialized:true}),{alreadyTerminal:'WITHDRAWN'});
   assert.equal((await terminal(c)).length,1);assert.equal((await terminal(c))[0].actor_id,record.actorId);
   assert.deepEqual(await run(s,c,k),receipt);assert.equal(await initial(c),before);
  });
 }finally{for(const s of providers)s.dispose();key.fill(0);}
}
