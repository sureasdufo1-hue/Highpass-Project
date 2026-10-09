import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {createPatientWithdrawalTransactions} from '../../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../../src/v3-patient-consent-withdraw-service.js';

// Only an owned disposable DB. Institution/ref mutations are administrative SQL
// fixtures, not claims that an organizational suspension API was implemented.
export async function checkWithdrawalInstitutionRaces({admin,app,record,binding,seed,decision,body,cancelProvider,cancel,assertion}){
 const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),hmacKey=randomBytes(32),providers=[];
 await admin.query(`ALTER ROLE hp_lifecycle_patient_test PASSWORD '${password}'`);
 const pool=new Pool({...app.options,user:'hp_lifecycle_patient_test',password,max:2,application_name:'hp-withdrawal-institution-races'});pool.on('error',()=>{});
 const identity={...record,issuer:'synthetic-withdraw-institution',subject:'SYNTH-WITHDRAW-PATIENT',authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:withdraw']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const patient=()=>{
  const now=Math.floor(Date.now()/1000),claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,role:'PATIENT',hospitalId:'SYNTH-A',scope:'consent:withdraw',
   patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:now};
  const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'consent:withdraw',allowedRoles:['PATIENT']});
 };
 const key=()=>`synthetic-withdraw-race-${randomUUID()}`;
 const selector=c=>({consentId:c.receipt.consentId,contentVersion:1,expectedEventSequence:2});
 const consent=async()=>{const c=await seed();return {...c,receipt:await decision.decide(binding(),key(),body(c))};};
 const make=intercept=>{
  const wrapped={async connect(){const c=await pool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:d=>c.release(d),
   query:q=>intercept?intercept(q,c):c.query(q)};}};
  const s=new V3PatientConsentWithdrawalService({transactions:createPatientWithdrawalTransactions({pool:wrapped,maxReauthAgeMs:300000}),hmacKey});providers.push(s);return s;
 };
 const run=(s,c,k=key())=>s.withdraw(patient(),k,selector(c));
 const count=async c=>Number((await admin.query('SELECT count(*) FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1',[c.receipt.consentId])).rows[0].count);
 const observe=p=>p.then(value=>({value}),error=>({code:error.code}));
 const witness=async(waiter,blocker)=>{
  const end=Date.now()+1000;while(Date.now()<end){
   const seen=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer AND wait_event_type='Lock'
    AND $2::integer=ANY(pg_blocking_pids(pid))) AS seen`,[waiter,blocker])).rows[0].seen;
   if(seen)return;await new Promise(r=>setTimeout(r,20));
  }assert.fail('WITHDRAWAL_LOCK_WAIT_NOT_WITNESSED');
 };
 const pidReady=async read=>{const end=Date.now()+600;while(!read()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert(Number.isInteger(read()));};
 const barrier=()=>{
  let release,enter;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
  const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WITHDRAWAL_FIXTURE_BARRIER_TIMEOUT')),2500);})]);}finally{clearTimeout(timer);}};
  return {release,enter,wait:()=>bounded(ready),hold:()=>bounded(gate)};
 };
 const changes=[
  {name:'source hospital suspension',stop:"UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",restore:"UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",id:record.hospitalId,code:'V3_DB_PRINCIPAL_INACTIVE'},
  {name:'patient principal suspension',stop:"UPDATE highpass_v3.principal_bindings SET status='SUSPENDED' WHERE actor_id=$1",restore:"UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",id:record.actorId,code:'V3_DB_PRINCIPAL_INACTIVE'},
  {name:'own reference deletion',stop:'UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',restore:'UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',id:record.patientRefId,code:'V3_WITHDRAW_CONSENT_RESOURCE_UNAVAILABLE'}
 ];
 try{
  await assertion('withdraw institution PG: actual parent cancel does not prevent own withdrawal or original retry',async()=>{
   const c=await consent(),s=make(),k=key(),before=JSON.stringify((await admin.query('SELECT * FROM highpass_v3.consent_patient_decision_results WHERE consent_id=$1',[c.receipt.consentId])).rows);
   assert.equal((await cancel(cancelProvider(),c)).state,'CANCELLED');
   const result=await run(s,c,k);assert.equal(result.state,'WITHDRAWN');assert.deepEqual(await run(s,c,k),result);
   assert.equal((await admin.query('SELECT state FROM highpass_v3.exchange_sessions WHERE session_id=$1',[c.sessionId])).rows[0].state,'CANCELLED');
   assert.equal(JSON.stringify((await admin.query('SELECT * FROM highpass_v3.consent_patient_decision_results WHERE consent_id=$1',[c.receipt.consentId])).rows),before);
  });
  await assertion('withdraw institution PG: target suspension does not prevent own withdrawal or original retry',async()=>{
   const c=await consent(),s=make(),k=key(),target=(await admin.query('SELECT target_hospital_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[c.sessionId])).rows[0].target_hospital_id;
   await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[target]);
   try{const result=await run(s,c,k);assert.equal(result.state,'WITHDRAWN');assert.deepEqual(await run(s,c,k),result);}
   finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[target]);}
  });
  for(const change of changes)for(const withdrawalFirst of [false,true])await assertion(`withdraw institution PG: ${change.name}, ${withdrawalFirst?'withdrawal first':'mutation first'}, witnessed two-way lock`,async()=>{
   const c=await consent(),owner=await admin.connect(),latch=barrier();let patientPid,withdrawal,mutation;
   const s=make(async(q,client)=>{
    if(q.text==='BEGIN')patientPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const result=await client.query(q);
    if(withdrawalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_lifecycle_cascade')){latch.enter();await latch.hold();}
    return result;
   });
   try{
    await owner.query('BEGIN');const ownerPid=(await owner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    if(withdrawalFirst){
     withdrawal=observe(run(s,c));await latch.wait();mutation=observe(owner.query(change.stop,[change.id]));
     await witness(ownerPid,patientPid);latch.release();assert.equal((await withdrawal).value?.state,'WITHDRAWN');
     assert.equal((await mutation).code,undefined);await owner.query('COMMIT');assert.equal(await count(c),1);
     await assert.rejects(()=>run(s,c),e=>e.code===change.code);
    }else{
     await owner.query(change.stop,[change.id]);withdrawal=observe(run(s,c));await pidReady(()=>patientPid);
     await witness(patientPid,ownerPid);await owner.query('COMMIT');assert.equal((await withdrawal).code,change.code);assert.equal(await count(c),0);
    }
   }finally{
    latch.release();await owner.query('ROLLBACK').catch(()=>{});if(withdrawal)await withdrawal;if(mutation)await mutation;
    await owner.query(change.restore,[change.id]);owner.release();
   }
  });
 }finally{for(const s of providers)s.dispose();hmacKey.fill(0);await pool.end();}
}
