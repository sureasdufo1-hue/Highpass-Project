import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPatientApprovalTransactions} from '../../src/v3-patient-approval-projection.js';
import {V3PatientChallengeIssuanceService} from '../../src/v3-patient-challenge-issuance.js';

// Own disposable DB only. No runtime sleep option or fabricated clock.
export async function checkPatientDecisionDeadlines({admin,app,binding,record,sessionId,targetHospitalId,policy,
 clone,challenge,body,make,counts,service,assertion}){
 const receiptPrefix='INSERT INTO highpass_v3.consent_patient_decision_results';
 const key=()=>`synthetic-deadline-${randomUUID()}`;
 const waitPast=async(client,until)=>{
  const remaining=(await client.query('SELECT extract(epoch FROM ($1::timestamptz-clock_timestamp())) AS remaining',[until])).rows[0].remaining;
  assert(Number(remaining)<3.2,'FIXTURE_DEADLINE_NOT_SHORT');
  await client.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.08)',[until]);
 };
 const shortChallenge=async()=>{
  const id=await clone(),secret=randomBytes(32);
  const issuer=new V3PatientChallengeIssuanceService({transactions:createPatientApprovalTransactions({pool:app,maxReauthAgeMs:3000}),
   hmacKey:secret,clausePolicy:policy});secret.fill(0);
  try{return {...await issuer.issue(binding(),key(),{preparationId:id,expectedSessionVersion:1}),preparationId:id};}
  finally{issuer.dispose();}
 };
 await assertion('decision deadline PG: expired challenge denies new consumption but preserves original receipt',async()=>{
  const consumed=await shortChallenge(),requestKey=key();
  const out=await service.decide(binding(),requestKey,body(consumed));
  await waitPast(admin,consumed.expiresAt);
  const before=await counts();assert.deepEqual(await service.decide(binding(),requestKey,body(consumed)),out);
  const unused=await shortChallenge();await waitPast(admin,unused.expiresAt);
  await assert.rejects(()=>service.decide(binding(),key(),body(unused)),e=>e.code==='V3_PATIENT_DECISION_CEREMONY_EXPIRED');
  assert.equal(await counts(),before);
 });
 await assertion('decision deadline PG: all INSERTs before challenge expiry still roll back before COMMIT',async()=>{
  const c=await shortChallenge(),before=await counts();let receiptInserted=false,commitAttempted=false;
  const fault=make(async(q,client)=>{
   if(q.text==='COMMIT')commitAttempted=true;
   const out=await client.query(q);
   if(q.text.startsWith(receiptPrefix)){receiptInserted=true;await waitPast(client,c.expiresAt);}
   return out;
  });
  try{await assert.rejects(()=>fault.decide(binding(),key(),body(c)),e=>e.code==='V3_PATIENT_CONSENT_EXPIRED');}
  finally{fault.dispose();}
  assert.equal(receiptInserted,true);assert.equal(commitAttempted,false);assert.equal(await counts(),before);
 });
 await assertion('decision deadline PG: private reauthentication expires after INSERT and rolls back',async()=>{
  const c=await challenge(),b=binding(),before=await counts();
  const until=new Date(Math.floor(Date.now()/1000)*1000+3000).toISOString();let receiptInserted=false,commitAttempted=false;
  const fault=make(async(q,client)=>{
   if(q.text==='COMMIT')commitAttempted=true;
   const out=await client.query(q);
   if(q.text.startsWith(receiptPrefix)){receiptInserted=true;await waitPast(client,until);}
   return out;
  },{maxReauthAgeMs:3000});
  try{await assert.rejects(()=>fault.decide(b,key(),body(c)),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');}
  finally{fault.dispose();}
  assert.equal(receiptInserted,true);assert.equal(commitAttempted,false);assert.equal(await counts(),before);
 });
 // Delay the actual COMMIT query, after the factory's final check. SQL deferred
 // assembly must independently reject expired storage, not trust a JS precheck.
 await assertion('decision deadline PG: deferred assembly rejects expiry inside actual COMMIT',async()=>{
  const c=await shortChallenge(),before=await counts();let commitAttempted=false,commitSqlState;
  const fault=make(async(q,client)=>{
   if(q.text==='COMMIT'){
    commitAttempted=true;await waitPast(client,c.expiresAt);
    try{return await client.query(q);}catch(error){commitSqlState=error.code;throw error;}
   }
   return client.query(q);
  });
  try{await assert.rejects(()=>fault.decide(binding(),key(),body(c)),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}
  finally{fault.dispose();}
  assert.equal(commitAttempted,true);assert.equal(commitSqlState,'23514');assert.equal(await counts(),before);
 });
 for(const [label,table,column,id] of [['Session','exchange_sessions','session_id',sessionId],
  ['target hospital','hospitals','hospital_id',targetHospitalId],['patient reference','patient_refs','patient_ref',record.patientRefId]]){
  await assertion(`decision deadline PG: witnessed ${label} lock wait crosses challenge deadline`,async()=>{
   const c=await shortChallenge(),before=await counts(),locker=await admin.connect();let pending;
   try{
    await locker.query('BEGIN');const lockerPid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await locker.query(`SELECT ${column} FROM highpass_v3.${table} WHERE ${column}=$1 FOR UPDATE`,[id]);
    pending=service.decide(binding(),key(),body(c)).then(value=>({value}),error=>({code:error.code}));
    const end=Date.now()+1200;let witnessed=false;
    while(Date.now()<end){
     witnessed=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name='hp-patient-projection-fixture' AND wait_event_type='Lock'
      AND $1::integer=ANY(pg_blocking_pids(pid))) AS witnessed`,[lockerPid])).rows[0].witnessed;
     if(witnessed)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(witnessed,true,'ACTUAL_LOCK_WAIT_NOT_WITNESSED');
    await waitPast(admin,c.expiresAt);await locker.query('ROLLBACK');
    const outcome=await pending;assert.equal(outcome.code,'V3_PATIENT_DECISION_CEREMONY_EXPIRED');
   }finally{await locker.query('ROLLBACK').catch(()=>{});locker.release();if(pending)await pending;}
   assert.equal(await counts(),before);
  });
 }
}
