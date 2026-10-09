import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Actual owned-fixture changes, not synthetic return values for policy queries.
export async function checkPatientDecisionMutations({admin,binding,record,targetHospitalId,challenge,body,make,counts,service,assertion}){
 const key=()=>`synthetic-mutation-${randomUUID()}`;
 const witness=async(blockerPid)=>{
  const end=Date.now()+1200;
  while(Date.now()<end){
   const observed=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
    WHERE application_name='hp-patient-projection-fixture' AND wait_event_type='Lock'
    AND $1::integer=ANY(pg_blocking_pids(pid))) AS witnessed`,[blockerPid])).rows[0].witnessed;
   if(observed)return;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('ACTUAL_MUTATION_WAIT_NOT_WITNESSED');
 };
 for(const [label,mutation,restore,id,deny] of [
  ['target stop',"UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",
   "UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",targetHospitalId,'V3_PATIENT_DECISION_TARGET_UNAVAILABLE'],
  ['reference deletion','UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',
   'UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',record.patientRefId,'V3_PATIENT_DECISION_SOURCE_REF_UNAVAILABLE']]){
  for(const commit of [false,true]){
   await assertion(`decision mutation PG: witnessed ${label} ${commit?'COMMIT denies':'ROLLBACK admits'} new decision`,async()=>{
    const c=await challenge(),before=await counts(),locker=await admin.connect();let pending;
    try{
     await locker.query('BEGIN');const pid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     await locker.query(mutation,[id]);
     pending=service.decide(binding(),key(),body(c)).then(value=>({value}),error=>({code:error.code}));
     await witness(pid);await locker.query(commit?'COMMIT':'ROLLBACK');
     const out=await pending;
     if(commit){assert.equal(out.code,deny);assert.equal(await counts(),before);}
     else{assert.equal(out.value?.state,'ACTIVE');assert.equal(out.code,undefined);}
    }finally{
     await locker.query('ROLLBACK').catch(()=>{});locker.release();if(pending)await pending;
     // Fixture-only recovery. No runtime data is accessed or restored.
     if(commit)await admin.query(restore,[id]);
    }
   });
  }
 }
 for(const [label,mutation,restore,id,deny] of [
  ['target stop',"UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",
   "UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",targetHospitalId,'V3_PATIENT_DECISION_TARGET_UNAVAILABLE'],
  ['reference deletion','UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',
   'UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',record.patientRefId,'V3_PATIENT_DECISION_SOURCE_REF_UNAVAILABLE']]){
  await assertion(`decision mutation PG: approval first holds lock against ${label} then recovery denies`,async()=>{
   const c=await challenge(),requestKey=key();let releaseBarrier,enteredBarrier,blockerPid,approval,mutationWork;
   const release=new Promise(resolve=>{releaseBarrier=resolve;}),entered=new Promise(resolve=>{enteredBarrier=resolve;});
   const fault=make(async(q,client)=>{
    const out=await client.query(q);
    if(q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){
     blockerPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;enteredBarrier();
     let timer;
     try{await Promise.race([release,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_BARRIER_TIMEOUT')),1500);})]);}
     finally{clearTimeout(timer);}
    }
    return out;
   });
   const changer=await admin.connect();let entryTimer;
   try{
    approval=fault.decide(binding(),requestKey,body(c)).then(value=>({value}),error=>({code:error.code}));
    await Promise.race([entered,new Promise((_,reject)=>{entryTimer=setTimeout(()=>reject(Error('FIXTURE_ENTRY_TIMEOUT')),1500);})]);
    clearTimeout(entryTimer);
    const waiterPid=(await changer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    mutationWork=changer.query(mutation,[id]).then(()=>({committed:true}),error=>({code:error.code}));
    const end=Date.now()+1000;let observed=false;
    while(Date.now()<end){
     observed=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer
      AND wait_event_type='Lock' AND $2::integer=ANY(pg_blocking_pids(pid))) AS witnessed`,[waiterPid,blockerPid])).rows[0].witnessed;
     if(observed)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(observed,true);releaseBarrier();
    const out=await approval;assert.equal(out.value?.state,'ACTIVE');assert.equal((await mutationWork).committed,true);
    const before=await counts();
    // Same private provider/HMAC key: this is exact original receipt recovery,
    // not a different provider returning an accidental idempotency miss.
    await assert.rejects(()=>fault.decide(binding(),requestKey,body(c)),e=>e.code===deny);
    assert.equal(await counts(),before);
   }finally{
    clearTimeout(entryTimer);releaseBarrier();if(approval)await approval;if(mutationWork)await mutationWork;
    changer.release();fault.dispose();await admin.query(restore,[id]);
   }
  });
 }
 await assertion('decision mutation PG: SQL COMMIT independently rejects private reauth expiry',async()=>{
  const c=await challenge(),now=Math.floor(Date.now()/1000),b=binding({auth_time:now}),before=await counts();let sqlState,committing=false;
  const until=new Date(now*1000+3000).toISOString();
  const fault=make(async(q,client)=>{
   if(q.text==='COMMIT'){
    committing=true;
    await client.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.08)',[until]);
    try{return await client.query(q);}catch(error){sqlState=error.code;throw error;}
   }
   return client.query(q);
  },{maxReauthAgeMs:3000});
  try{await assert.rejects(()=>fault.decide(b,key(),body(c)),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}
  finally{fault.dispose();}
  assert.equal(committing,true);assert.equal(sqlState,'23514');assert.equal(await counts(),before);
 });
}
