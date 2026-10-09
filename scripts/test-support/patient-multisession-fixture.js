import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Fixture-only bounded synchronization; exact backend witnesses, no query output.
const key=()=>`synthetic-multisession-${randomUUID()}`;
function barrier(){
 let release,enter,timer;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
 return {release,enter,async hold(){try{await Promise.race([gate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_MULTI_HOLD_TIMEOUT')),2500);})]);}finally{clearTimeout(timer);}},
 async wait(){let t;try{await Promise.race([ready,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('FIXTURE_MULTI_ENTRY_TIMEOUT')),2500);})]);}finally{clearTimeout(t);}}};
}
async function witness(admin,waiter,blockers){
 const end=Date.now()+1000;
 while(Date.now()<end){
  const row=(await admin.query(`SELECT wait_event_type='Lock' AS waiting,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1::integer`,[waiter])).rows[0];
  if(row?.waiting&&blockers.every(pid=>row.blockers.includes(pid)))return;
  await new Promise(r=>setTimeout(r,20));
 }assert.fail('MULTISESSION_LOCK_WAIT_NOT_WITNESSED');
}
const observed=p=>p.then(value=>({value}),error=>({code:error.code}));
async function witnessOne(admin,waiter,candidates){
 const end=Date.now()+1000;
 while(Date.now()<end){
  const row=(await admin.query(`SELECT wait_event_type='Lock' AS waiting,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1::integer`,[waiter])).rows[0];
  const found=candidates.find(pid=>row?.blockers.includes(pid));if(row?.waiting&&found!==undefined)return found;
  await new Promise(r=>setTimeout(r,20));
 }assert.fail('MULTISESSION_MEMBER_WAIT_NOT_WITNESSED');
}

export async function checkSameSourceCancelRaces({admin,seed,cancelProvider,cancel,make,binding,body,counts,assertion}){
 for(const approvalFirst of [true,false]){
  await assertion(`multisession PG: same source two ${approvalFirst?'approvals first':'cancels first'} actual service locks`,async()=>{
   const cases=await Promise.all([seed(),seed()]),latches=cases.map(()=>barrier()),pids=cases.map(()=>({})),decisions=[],cancels=[],providers=[];
   const approvalKeys=cases.map(()=>key()),before=await counts();
   try{
    for(let i=0;i<2;i++){
     const d=make(async(q,c)=>{
      if(q.text==='BEGIN')pids[i].decision=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const out=await c.query(q);if(approvalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){latches[i].enter();await latches[i].hold();}return out;
     });providers.push(d);
     const x=cancelProvider(async(q,c)=>{
      if(q.text==='BEGIN')pids[i].cancel=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      if(!approvalFirst&&q.text==='COMMIT'){latches[i].enter();await latches[i].hold();}return c.query(q);
     });providers.push(x);
     if(approvalFirst)decisions[i]=observed(d.decide(binding(),approvalKeys[i],body(cases[i])));
     else cancels[i]=observed(cancel(x,cases[i]));
    }
    await Promise.all(latches.map(b=>b.wait()));
    for(let i=0;i<2;i++){
     if(approvalFirst)cancels[i]=observed(cancel(providers[i*2+1],cases[i]));
     else decisions[i]=observed(providers[i*2].decide(binding(),approvalKeys[i],body(cases[i])));
    }
    const end=Date.now()+600;while(pids.some(p=>approvalFirst?!p.cancel:!p.decision)&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
    for(const p of pids)await witness(admin,approvalFirst?p.cancel:p.decision,[approvalFirst?p.decision:p.cancel]);
    latches.forEach(b=>b.release());const result=await Promise.all(decisions),cancelled=await Promise.all(cancels);
    assert(cancelled.every(r=>r.value?.state==='CANCELLED'&&r.value.version===2));
    if(approvalFirst){assert(result.every(r=>r.value?.state==='ACTIVE'));assert.notEqual(result[0].value.consentId,result[1].value.consentId);}
    else{assert(result.every(r=>r.code==='V3_PATIENT_DECISION_VERSION_MISMATCH'));assert.equal(await counts(),before);}
    const after=await counts();
    for(let i=0;i<2;i++)await assert.rejects(()=>providers[i*2].decide(binding(),approvalKeys[i],body(cases[i])),e=>e.code==='V3_PATIENT_DECISION_VERSION_MISMATCH');
    assert.equal(await counts(),after);
   }finally{latches.forEach(b=>b.release());await Promise.all([...decisions,...cancels].filter(Boolean));providers.forEach(p=>p.dispose());}
  });
 }
 await assertion('multisession PG: same cancel key across two Sessions serializes then safely conflicts',async()=>{
  const cases=await Promise.all([seed(),seed()]),latch=barrier(),k=key();let first,second,firstPid,secondPid;
  const a=cancelProvider(async(q,c)=>{
   if(q.text==='BEGIN')firstPid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   if(q.text==='COMMIT'){latch.enter();await latch.hold();}return c.query(q);
  }),b=cancelProvider(async(q,c)=>{if(q.text==='BEGIN')secondPid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return c.query(q);});
  try{
   first=observed(cancel(a,cases[0],k));await latch.wait();second=observed(cancel(b,cases[1],k));
   const end=Date.now()+600;while(!secondPid&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
   await witness(admin,secondPid,[firstPid]);latch.release();
   assert.equal((await first).value?.state,'CANCELLED');assert.equal((await second).code,'V3_SESSION_IDEMPOTENCY_CONFLICT');
   assert.deepEqual((await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[cases[1].sessionId])).rows[0],{state:'REQUESTED',version:1});
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.exchange_cancel_results WHERE session_id=ANY($1::uuid[])',[cases.map(c=>c.sessionId)])).rows[0].n,1);
  }finally{latch.release();await Promise.all([first,second].filter(Boolean));a.dispose();b.dispose();}
 });
}

export async function checkReverseInstitutionRaces({admin,seed,identities,resolve,make,body,counts,assertion}){
 const pair=async()=>[{r:identities[0],c:await seed(identities[0],{targetTenant:identities[1].tenantId,targetHospital:identities[1].hospitalId})},
  {r:identities[1],c:await seed(identities[1])}];
 await assertion('multisession PG: reverse A-to-C C-to-A approvals hold shared registry and target locks against stop',async()=>{
  const cases=await pair(),latches=cases.map(()=>barrier()),pids=[],providers=[],pending=[],keys=cases.map(()=>key()),locker=await admin.connect();let mutation;
  try{
   for(let i=0;i<2;i++){
    const d=make(async(q,c)=>{
     if(q.text==='BEGIN')pids[i]=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     const out=await c.query(q);if(q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){latches[i].enter();await latches[i].hold();}return out;
    });providers.push(d);pending[i]=observed(d.decide(resolve(cases[i].r),keys[i],body(cases[i].c)));
   }
   await Promise.all(latches.map(b=>b.wait()));await locker.query('BEGIN');
   const waiter=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   mutation=observed(locker.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[identities[1].hospitalId]));
   // A multixact waiter may expose only the member it currently waits for.
   // Observe one exact blocker, let it commit, then witness the remaining one.
   const first=await witnessOne(admin,waiter,pids),index=pids.indexOf(first);latches[index].release();
   assert.equal((await pending[index]).value?.state,'ACTIVE');const other=1-index;
   await witness(admin,waiter,[pids[other]]);latches[other].release();assert.equal((await pending[other]).value?.state,'ACTIVE');
   assert.equal((await mutation).value?.rowCount,1);await locker.query('COMMIT');const before=await counts();
   await assert.rejects(()=>providers[0].decide(resolve(cases[0].r),keys[0],body(cases[0].c)),e=>e.code==='V3_PATIENT_DECISION_TARGET_UNAVAILABLE');
   await assert.rejects(()=>providers[1].decide(resolve(cases[1].r),keys[1],body(cases[1].c)),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');
   assert.equal(await counts(),before);
  }finally{latches.forEach(b=>b.release());await Promise.all(pending);if(mutation)await mutation;await locker.query('ROLLBACK').catch(()=>{});locker.release();providers.forEach(p=>p.dispose());await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[identities[1].hospitalId]);}
 });
 for(const rollback of [false,true]){
  await assertion(`multisession PG: reverse approvals witness institution stop first then ${rollback?'rollback admits':'commit denies'}`,async()=>{
   const cases=await pair(),before=await counts(),locker=await admin.connect(),pids=[],providers=[],pending=[];
   try{
    await locker.query('BEGIN');const blocker=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await locker.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[identities[1].hospitalId]);
    for(let i=0;i<2;i++){
     const d=make(async(q,c)=>{if(q.text==='BEGIN')pids[i]=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return c.query(q);});providers.push(d);
     pending[i]=observed(d.decide(resolve(cases[i].r),key(),body(cases[i].c)));
    }
    const end=Date.now()+600;while(pids.filter(Number.isInteger).length<2&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
    for(const pid of pids)await witness(admin,pid,[blocker]);assert.equal(pids.filter(Number.isInteger).length,2);
    await locker.query(rollback?'ROLLBACK':'COMMIT');const result=await Promise.all(pending);
    if(rollback)assert(result.every(r=>r.value?.state==='ACTIVE'));
    else{assert.equal(result[0].code,'V3_PATIENT_DECISION_TARGET_UNAVAILABLE');assert.equal(result[1].code,'V3_DB_PRINCIPAL_INACTIVE');assert.equal(await counts(),before);}
   }finally{await locker.query('ROLLBACK').catch(()=>{});locker.release();await Promise.all(pending);providers.forEach(p=>p.dispose());await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[identities[1].hospitalId]);}
  });
 }
}
