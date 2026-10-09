import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {V3ExchangeCancelService} from '../../src/v3-exchange-cancel-service.js';
import {seedPatientDecisionParent} from './patient-decision-parent-fixture.js';
import {checkSameSourceCancelRaces} from './patient-multisession-fixture.js';
import {checkCreatePendingContention} from './patient-create-pending-fixture.js';
import {checkWithdrawalInstitutionRaces} from './withdrawal-institution-races-fixture.js';

export async function checkPatientDecisionCancelServices({admin,app,binding,record,preparationId,sessionId,issuance,body,make,counts,service,assertion}){
 const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),hmacKey=randomBytes(32),providers=[];
 const actor=(await admin.query('SELECT actor_id FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[preparationId])).rows[0].actor_id;
 await admin.query("UPDATE highpass_v3.principal_bindings SET scopes=array_append(scopes,'exchange:cancel') WHERE actor_id=$1",[actor]);
 await admin.query(`CREATE ROLE hp_patient_cancel_test LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
  GRANT hp_v3_clinical_policy TO hp_patient_cancel_test;
  GRANT USAGE ON SCHEMA highpass_v3 TO hp_patient_cancel_test;
  GRANT SELECT ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals,
   highpass_v3.patient_refs,highpass_v3.patient_ref_registrations,highpass_v3.exchange_sessions,
   highpass_v3.exchange_creation_context,highpass_v3.exchange_session_participants,highpass_v3.exchange_resource_scopes,
   highpass_v3.exchange_state_events,highpass_v3.exchange_cancel_results,highpass_v3.exchange_cascade_outbox TO hp_patient_cancel_test;
  GRANT SELECT(patient_ref,tenant_id,hospital_id,deleted_at) ON highpass_v3.patient_mappings TO hp_patient_cancel_test;
  GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_patient_cancel_test;
  GRANT UPDATE(state,version,updated_at) ON highpass_v3.exchange_sessions TO hp_patient_cancel_test;
  GRANT INSERT ON highpass_v3.exchange_state_events,highpass_v3.exchange_cancel_results,
   highpass_v3.exchange_cascade_outbox,highpass_v3.exchange_audit_outbox TO hp_patient_cancel_test;
  GRANT EXECUTE ON FUNCTION highpass_v3.clinical_principal_context(),highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),
   highpass_v3.exchange_expirer(uuid,uuid),highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),
   highpass_v3.exchange_directory_caller(),highpass_v3.valid_exchange_actions(text[]),highpass_v3.valid_exchange_series(text[]) TO hp_patient_cancel_test;`);
 const pool=new Pool({...app.options,user:'hp_patient_cancel_test',password,max:2,application_name:'hp-patient-cancel-service-fixture'});
 pool.on('error',()=>{});
 const identity={...record,actorId:actor,patientRefId:undefined,issuer:'synthetic-cancel-fixture',subject:'SYNTH-CANCEL-ADMIN',authHospitalId:'SYNTH-A',role:'HOSPITAL_ADMIN',scopes:['exchange:cancel'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const cancelBinding=()=>{
  const claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,role:identity.role,hospitalId:identity.authHospitalId,scope:'exchange:cancel',exp:Math.floor(Date.now()/1000)+180};
  const data=[{alg:'HS256'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
 };
 const key=()=>`synthetic-service-race-${randomUUID()}`;
 const seed=()=>seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance,lifetimeSeconds:120});
 const cancelProvider=(intercept,options={})=>{
  const wrapped={async connect(){const c=await pool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:d=>c.release(d),
   query:q=>intercept?intercept(q,c):c.query(q)};}};
  const out=new V3ExchangeCancelService({transactions:new V3TenantTransaction({pool:wrapped,deadlineMs:8000,queryMs:options.queryMs??5000}),hmacKey});providers.push(out);return out;
 };
 const cancel=(provider,c,k=key())=>provider.cancel(cancelBinding(),k,c.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'});
 const witness=async(waiter,blocker)=>{
  const end=Date.now()+1000;
  while(Date.now()<end){
   const seen=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer
    AND wait_event_type='Lock' AND $2::integer=ANY(pg_blocking_pids(pid))) AS witnessed`,[waiter,blocker])).rows[0].witnessed;
   if(seen)return;await new Promise(r=>setTimeout(r,20));
  }assert.fail('ACTUAL_SERVICE_LOCK_WAIT_NOT_WITNESSED');
 };
 const barrier=()=>{
  let release,enter,timer;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
  return {release,enter,ready,async hold(){try{await Promise.race([gate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_SERVICE_BARRIER_TIMEOUT')),2000);})]);}finally{clearTimeout(timer);}},
   async wait(){let t;try{await Promise.race([ready,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('FIXTURE_SERVICE_ENTRY_TIMEOUT')),2000);})]);}finally{clearTimeout(t);}}};
 };
 try{
  await assertion('decision cancel service PG: separate nonowner identities and no approval grants',async()=>{
   const r=(await pool.query(`SELECT current_user AS role,r.rolsuper,r.rolbypassrls,
    pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER') AS approval,
    has_table_privilege(current_user,'highpass_v3.consent_content_versions','INSERT') AS consent_insert
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
   assert.deepEqual(r,{role:'hp_patient_cancel_test',rolsuper:false,rolbypassrls:false,approval:false,consent_insert:false});
  });
  for(const approvalFirst of [false,true]){
   await assertion(`decision cancel service PG: actual nonowner ${approvalFirst?'approval first then cancel':'cancel first denies approval'} with witnessed locks`,async()=>{
    const c=await seed(),before=await counts(),latch=barrier();let approval,cancellation,patientPid,cancelPid;
    const decisionProvider=make(async(q,client)=>{
     if(q.text==='BEGIN')patientPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     const out=await client.query(q);
     if(approvalFirst&&q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){latch.enter();await latch.hold();}
     return out;
    });
    const cancellationProvider=cancelProvider(async(q,client)=>{
     if(q.text==='BEGIN')cancelPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     if(!approvalFirst&&q.text==='COMMIT'){latch.enter();await latch.hold();}
     return client.query(q);
    });
    const approvalKey=key();
    try{
     if(approvalFirst){
      approval=decisionProvider.decide(binding(),approvalKey,body(c)).then(value=>({value}),error=>({code:error.code}));
      await latch.wait();cancellation=cancel(cancellationProvider,c).then(value=>({value}),error=>({code:error.code}));
     }else{
      cancellation=cancel(cancellationProvider,c).then(value=>({value}),error=>({code:error.code}));
      await latch.wait();approval=decisionProvider.decide(binding(),approvalKey,body(c)).then(value=>({value}),error=>({code:error.code}));
     }
     const end=Date.now()+600;while((approvalFirst?!cancelPid:!patientPid)&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
     await witness(approvalFirst?cancelPid:patientPid,approvalFirst?patientPid:cancelPid);latch.release();
     const decided=await approval,cancelled=await cancellation;
     assert.equal(cancelled.value?.state,'CANCELLED');assert.equal(cancelled.value?.version,2);
     if(approvalFirst){
      assert.equal(decided.value?.state,'ACTIVE');const after=await counts();
      await assert.rejects(()=>decisionProvider.decide(binding(),approvalKey,body(c)),e=>e.code==='V3_PATIENT_DECISION_VERSION_MISMATCH');
      assert.equal(await counts(),after);
     }else{assert.equal(decided.code,'V3_PATIENT_DECISION_VERSION_MISMATCH');assert.equal(await counts(),before);}
     const proof=(await admin.query(`SELECT
      (SELECT count(*)::integer FROM highpass_v3.exchange_state_events WHERE session_id=$1) AS events,
      (SELECT count(*)::integer FROM highpass_v3.exchange_audit_outbox WHERE session_id=$1 AND action='SESSION_CANCELLED') AS audits,
      (SELECT count(*)::integer FROM highpass_v3.exchange_cancel_results WHERE session_id=$1) AS receipts,
      (SELECT count(*)::integer FROM highpass_v3.exchange_cascade_outbox o JOIN highpass_v3.exchange_state_events e USING(event_id) WHERE e.session_id=$1) AS cascades`,[c.sessionId])).rows[0];
     assert.deepEqual(proof,{events:1,audits:1,receipts:1,cascades:1});
    }finally{latch.release();if(approval)await approval;if(cancellation)await cancellation;decisionProvider.dispose();}
   });
  }
  await assertion('decision cancel service PG: committed cancellation lost ACK recovers one receipt and denies decision',async()=>{
   const c=await seed(),k=key(),before=await counts();
   const ack=cancelProvider(async(q,client)=>{const out=await client.query(q);if(q.text==='COMMIT')throw Error('SYNTHETIC_COMMIT_ACK_LOSS');return out;});
   await assert.rejects(()=>cancel(ack,c,k),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');
   const restarted=cancelProvider(),receipt=await cancel(restarted,c,k);
   assert.equal(receipt.state,'CANCELLED');assert.deepEqual(await cancel(restarted,c,k),receipt);
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.exchange_cancel_results WHERE session_id=$1',[c.sessionId])).rows[0].n,1);
   await assert.rejects(()=>service.decide(binding(),key(),body(c)),e=>e.code==='V3_PATIENT_DECISION_VERSION_MISMATCH');
   assert.equal(await counts(),before);
  });
  await assertion('decision cancel service PG: missing cancellation audit rolls back and patient can decide',async()=>{
   const c=await seed();
   const fault=cancelProvider((q,client)=>q.text.startsWith('INSERT INTO highpass_v3.exchange_audit_outbox')?Promise.resolve({rows:[],rowCount:0}):client.query(q));
   await assert.rejects(()=>cancel(fault,c),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');
   const original=(await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[c.sessionId])).rows[0];
   assert.deepEqual(original,{state:'REQUESTED',version:1});
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.exchange_cancel_results WHERE session_id=$1',[c.sessionId])).rows[0].n,0);
   assert.equal((await service.decide(binding(),key(),body(c))).state,'ACTIVE');
  });
  await assertion('decision cancel service PG: witnessed cancel wait times out without cancelling approval',async()=>{
   const c=await seed(),latch=barrier();let patientPid,cancelPid,approval,cancellation;
   const decisionProvider=make(async(q,client)=>{
    if(q.text==='BEGIN')patientPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const out=await client.query(q);
    if(q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){latch.enter();await latch.hold();}
    return out;
   });
   const cancellationProvider=cancelProvider(async(q,client)=>{
    if(q.text==='BEGIN')cancelPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    return client.query(q);
   },{queryMs:500});
   try{
    approval=decisionProvider.decide(binding(),key(),body(c)).then(value=>({value}),error=>({code:error.code}));
    await latch.wait();cancellation=cancel(cancellationProvider,c).then(value=>({value}),error=>({code:error.code}));
    const end=Date.now()+300;while(!cancelPid&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
    await witness(cancelPid,patientPid);assert.equal((await cancellation).code,'V3_DATABASE_UNAVAILABLE');
    latch.release();assert.equal((await approval).value?.state,'ACTIVE');
    assert.deepEqual((await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[c.sessionId])).rows[0],{state:'REQUESTED',version:1});
   }finally{latch.release();if(approval)await approval;if(cancellation)await cancellation;decisionProvider.dispose();}
  });
  await checkSameSourceCancelRaces({admin,seed,cancelProvider,cancel,make,binding,body,counts,assertion});
  await checkCreatePendingContention({admin,app,clinicalPool:pool,actor,record,preparationId,sessionId,issuance,make,binding,body,counts,cancelProvider,cancel,assertion});
  await checkWithdrawalInstitutionRaces({admin,app,record,binding,seed,decision:service,body,cancelProvider,cancel,assertion});
 }finally{for(const p of providers)p.dispose();hmacKey.fill(0);await pool.end();}
}
