import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {V3ExchangeSessionService} from '../../src/v3-exchange-session-service.js';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';
import {checkPatientExpiryContention} from './patient-expiry-contention-fixture.js';

const key=()=>`synthetic-create-pending-${randomUUID()}`;
const observed=p=>p.then(value=>({value}),error=>({code:error.code}));
function barrier(){
 let release,enter,t;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
 return {release,enter,async hold(){try{await Promise.race([gate,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('FIXTURE_PARENT_HOLD_TIMEOUT')),2500);})]);}finally{clearTimeout(t);}},
 async wait(){let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_PARENT_ENTRY_TIMEOUT')),2500);})]);}finally{clearTimeout(timer);}}};
}
async function witness(admin,getPid,blocker){
 const end=Date.now()+1000;
 while(Date.now()<end){const pid=getPid();
  if(Number.isInteger(pid)&&(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer AND wait_event_type='Lock' AND $2::integer=ANY(pg_blocking_pids(pid))) AS seen",[pid,blocker])).rows[0].seen)return;
  await new Promise(r=>setTimeout(r,20));
 }assert.fail('CREATE_PENDING_LOCK_WAIT_NOT_WITNESSED');
}

export async function checkCreatePendingContention({admin,app,clinicalPool,actor,record,preparationId,sessionId,issuance,make,binding,body,counts,cancelProvider,cancel,assertion}){
 const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),hmacKey=randomBytes(32),providers=[];
 await assertion('actual parent PG: fixture-only create grants and separate pending capability',async()=>{
  await admin.query(`GRANT SELECT ON highpass_v3.exchange_write_results TO hp_patient_cancel_test;
   GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_patient_cancel_test;
   GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_patient_cancel_test;
   GRANT INSERT ON highpass_v3.exchange_sessions,highpass_v3.exchange_creation_context,highpass_v3.exchange_session_participants,
    highpass_v3.exchange_resource_scopes,highpass_v3.exchange_write_results TO hp_patient_cancel_test;
   CREATE ROLE hp_patient_pending_test LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
   GRANT hp_v3_pending_policy TO hp_patient_pending_test;GRANT USAGE ON SCHEMA highpass_v3 TO hp_patient_pending_test;
   GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_patient_pending_test;
   GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_patient_pending_test;
   GRANT SELECT(hospital_id,tenant_id,status) ON highpass_v3.hospitals TO hp_patient_pending_test;
   GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_patient_pending_test;
   GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id) ON highpass_v3.exchange_creation_context TO hp_patient_pending_test;
   GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,state,version,
    valid_from,valid_until,resource_snapshot_digest,resource_count,requested_actions) ON highpass_v3.exchange_sessions TO hp_patient_pending_test;
   GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_patient_pending_test;
   GRANT SELECT(patient_ref,owner_tenant_id,owner_hospital_id,deleted_at) ON highpass_v3.patient_refs TO hp_patient_pending_test;
   GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_patient_pending_test;
   GRANT SELECT(session_id,patient_ref,tenant_id,hospital_id,participant_role,status) ON highpass_v3.exchange_session_participants TO hp_patient_pending_test;
   GRANT SELECT(session_id,ordinal,study_instance_uid,whole_study,series_instance_uids) ON highpass_v3.exchange_resource_scopes TO hp_patient_pending_test;
   GRANT SELECT,INSERT ON highpass_v3.consent_preparation_requests,highpass_v3.consent_preparation_scopes,
    highpass_v3.consent_preparation_actions,highpass_v3.consent_preparation_audit_outbox,highpass_v3.consent_preparation_results TO hp_patient_pending_test;
   GRANT EXECUTE ON FUNCTION highpass_v3.pending_source_actor(uuid,uuid,uuid,uuid),highpass_v3.pending_directory_caller(),
    highpass_v3.clinical_principal_context(),highpass_v3.pending_actor_context(uuid,uuid,uuid),highpass_v3.pending_scope_digest(uuid),highpass_v3.valid_exchange_series(text[]) TO hp_patient_pending_test;`);
 });
 const pendingPool=new Pool({...app.options,user:'hp_patient_pending_test',password,max:2,application_name:'hp-patient-real-parent-fixture'});pendingPool.on('error',()=>{});
 const identity={...record,actorId:actor,patientRefId:undefined,issuer:'synthetic-real-parent',subject:'SYNTH-SOURCE-ADMIN',authHospitalId:'SYNTH-A',role:'HOSPITAL_ADMIN',scopes:['exchange:create','consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const resolve=scope=>{
  const claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,role:identity.role,hospitalId:identity.authHospitalId,scope,exp:Math.floor(Date.now()/1000)+180};
  const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:scope,allowedRoles:['HOSPITAL_ADMIN']});
 };
 const wrapped=(pool,intercept)=>({async connect(){const c=await pool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:d=>c.release(d),query:q=>intercept?intercept(q,c):c.query(q)};}});
 const sessions=new V3ExchangeSessionService({transactions:new V3TenantTransaction({pool:clinicalPool,deadlineMs:8000}),hmacKey,maxLifetimeMs:3600000});providers.push(sessions);
 const pending=intercept=>{const s=new V3PendingPreparationService({transactions:createPendingTransactions({pool:wrapped(pendingPool,intercept)}),hmacKey,maxLifetimeMs:3600000});providers.push(s);return s;};
 const preparer=pending();
 const template=(await admin.query('SELECT target_hospital_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0];
 const scopes=(await admin.query('SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1 ORDER BY ordinal',[sessionId])).rows;
 const resources=scopes.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
 const create=async(lifetimeMs=120000)=>{
  const k=key(),command={patientRefId:record.patientRefId,ownerTenantId:record.tenantId,sourceHospitalId:record.hospitalId,targetHospitalId:template.target_hospital_id,
   requesterId:actor,purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',validUntil:new Date(Date.now()+lifetimeMs).toISOString(),resources,requestedActions:['study:view']};
  return {parent:await sessions.create(resolve('exchange:create'),k,command),k,command};
 };
 const intent=p=>({patientRefId:p.patientRefId,sourceHospitalId:p.sourceHospitalId,targetHospitalId:p.targetHospitalId,purpose:p.purpose,allowedActions:p.requestedActions,
  resources:p.resources,state:'PENDING',validFrom:new Date(Date.now()+5000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),policyVersion:'synthetic-service-parent-v1',evidenceDigest:'SYNTHETIC_UNVERIFIED_SERVICE_PARENT_'.padEnd(64,'X')});
 const prepare=(s,p,k,r)=>s.prepare(resolve('consent:write'),k,p.sessionId,'"1"',r);
 const assembly=async()=>{
  const c=await create(),request=intent(c.parent),k=key(),p=await prepare(preparer,c.parent,k,request);
  const challenge={...await issuance.issue(binding(),key(),{preparationId:p.preparationId,expectedSessionVersion:1}),preparationId:p.preparationId};
  return {...c,p,request,pendingKey:k,challenge};
 };
 try{
  await assertion('actual parent PG: pending pool nonowner and no clinical approval expiry or consent INSERT',async()=>{
   const r=(await pendingPool.query(`SELECT r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'hp_v3_pending_policy','MEMBER') AS pending,
    pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AS clinical,pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER') AS approval,
    pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS expiry,has_table_privilege(current_user,'highpass_v3.consent_content_versions','INSERT') AS consent_insert FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
   assert.deepEqual(r,{rolsuper:false,rolbypassrls:false,pending:true,clinical:false,approval:false,expiry:false,consent_insert:false});
  });
  await assertion('actual parent PG: real create pending challenge and patient decision preserve original receipts and invited recipient',async()=>{
   const c=await assembly(),d=make();try{assert.equal((await d.decide(binding(),key(),body(c.challenge))).state,'ACTIVE');}finally{d.dispose();}
   assert.deepEqual(await sessions.create(resolve('exchange:create'),c.k,c.command),c.parent);
   assert.deepEqual(await prepare(preparer,c.parent,c.pendingKey,c.request),c.p);
   const r=(await admin.query("SELECT s.state,s.version,p.status FROM highpass_v3.exchange_sessions s JOIN highpass_v3.exchange_session_participants p USING(session_id) WHERE s.session_id=$1 AND p.participant_role='DESTINATION'",[c.parent.sessionId])).rows[0];
   assert.deepEqual(r,{state:'REQUESTED',version:1,status:'INVITED'});
  });
  await assertion('actual parent PG: fresh create and parent replay complete while patient approval holds compatible shared locks',async()=>{
   const c=await assembly(),latch=barrier();let decision;
   const d=make(async(q,client)=>{const out=await client.query(q);if(q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){latch.enter();await latch.hold();}return out;});
   try{
    decision=observed(d.decide(binding(),key(),body(c.challenge)));await latch.wait();
    const [fresh,replay]=await Promise.all([create(),sessions.create(resolve('exchange:create'),c.k,c.command)]);
    assert.notEqual(fresh.parent.sessionId,c.parent.sessionId);assert.deepEqual(replay,c.parent);latch.release();assert.equal((await decision).value?.state,'ACTIVE');
   }finally{latch.release();if(decision)await decision;d.dispose();}
  });
  for(const replay of [false,true])for(const pendingFirst of [false,true]){
   await assertion(`actual parent PG: ${replay?'pending replay':'fresh pending'} ${pendingFirst?'first then cancel':'waits on cancel first'} real locks`,async()=>{
    const c=await create(),r=intent(c.parent),k=key(),latch=barrier();if(replay)await prepare(preparer,c.parent,k,r);
    const before=(await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[c.parent.sessionId])).rows[0].n;
    let prep,cancellation,prepPid,cancelPid;
    const p=pending(async(q,client)=>{if(q.text==='BEGIN')prepPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;if(pendingFirst&&q.text==='COMMIT'){latch.enter();await latch.hold();}return client.query(q);});
    const x=cancelProvider(async(q,client)=>{if(q.text==='BEGIN')cancelPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;if(!pendingFirst&&q.text==='COMMIT'){latch.enter();await latch.hold();}return client.query(q);});
    try{
     if(pendingFirst){prep=observed(prepare(p,c.parent,k,r));await latch.wait();cancellation=observed(cancel(x,c.parent));}
     else{cancellation=observed(cancel(x,c.parent));await latch.wait();prep=observed(prepare(p,c.parent,k,r));}
     await witness(admin,()=>pendingFirst?cancelPid:prepPid,pendingFirst?prepPid:cancelPid);latch.release();
     assert.equal((await cancellation).value?.state,'CANCELLED');const result=await prep;
     if(pendingFirst)assert.equal(result.value?.state,'PENDING');else assert.equal(result.code,'V3_PENDING_VERSION_MISMATCH');
     const after=(await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[c.parent.sessionId])).rows[0].n;
     assert.equal(after,before+(!replay&&pendingFirst?1:0));
     await assert.rejects(()=>prepare(preparer,c.parent,k,r),e=>e.code==='V3_PENDING_VERSION_MISMATCH');
    }finally{latch.release();await Promise.all([prep,cancellation].filter(Boolean));p.dispose();x.dispose();}
   });
  }
  for(const pendingFirst of [false,true]){
   await assertion(`actual parent PG: target stop ${pendingFirst?'waits for PENDING commit':'commits before waiting PENDING'}`,async()=>{
    const c=await create(),r=intent(c.parent),k=key(),latch=barrier(),locker=await admin.connect();let prep,mutation,prepPid;
    const p=pending(async(q,client)=>{if(q.text==='BEGIN')prepPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;if(pendingFirst&&q.text==='COMMIT'){latch.enter();await latch.hold();}return client.query(q);});
    try{
     await locker.query('BEGIN');const lockPid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     if(pendingFirst){
      prep=observed(prepare(p,c.parent,k,r));await latch.wait();mutation=observed(locker.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[c.parent.targetHospitalId]));
      await witness(admin,()=>lockPid,prepPid);latch.release();assert.equal((await prep).value?.state,'PENDING');assert.equal((await mutation).value?.rowCount,1);await locker.query('COMMIT');
     }else{
      await locker.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[c.parent.targetHospitalId]);prep=observed(prepare(p,c.parent,k,r));
      await witness(admin,()=>prepPid,lockPid);await locker.query('COMMIT');assert.equal((await prep).code,'V3_PENDING_RESOURCE_UNAVAILABLE');
     }
     await assert.rejects(()=>prepare(preparer,c.parent,k,r),e=>e.code==='V3_PENDING_RESOURCE_UNAVAILABLE');
    }finally{latch.release();await locker.query('ROLLBACK').catch(()=>{});locker.release();await Promise.all([prep,mutation].filter(Boolean));p.dispose();await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[c.parent.targetHospitalId]);}
   });
  }
  await checkPatientExpiryContention({admin,app,binding,record,preparationId,sessionId,issuance,make,body,counts,assertion,
   async exercise({worker,expiryBinding,actor:maintenanceActor}){
    const short=async()=>{const c=await create(3000);return {...c,request:{...intent(c.parent),validFrom:new Date(Date.now()+300).toISOString(),validUntil:new Date(Date.parse(c.parent.validUntil)-100).toISOString()}};};
    const wait=async c=>admin.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.08)',[c.parent.validUntil]);
    await assertion('actual parent expiry PG: pending held COMMIT rolls back after expiry and maintenance drains skipped parent',async()=>{
     const c=await short(),latch=barrier();let prep,sqlState;
     // This scenario needs a hold longer than the 3s parent, still bounded by 8s transaction.
     let release,enter,timer;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
     const p=pending(async(q,client)=>{
      if(q.text==='COMMIT'){enter();try{await Promise.race([gate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_PENDING_EXPIRY_HOLD_TIMEOUT')),4500);})]);}finally{clearTimeout(timer);}}
      try{return await client.query(q);}catch(e){if(typeof e.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code))sqlState=e.code;throw e;}
     });
     try{
      prep=observed(prepare(p,c.parent,key(),c.request));let entryTimer;
      try{await Promise.race([ready,new Promise((_,reject)=>{entryTimer=setTimeout(()=>reject(Error('FIXTURE_PENDING_EXPIRY_ENTRY_TIMEOUT')),1500);})]);}finally{clearTimeout(entryTimer);}
      await wait(c);await assert.rejects(()=>admin.query('SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR UPDATE NOWAIT',[c.parent.sessionId]),e=>e.code==='55P03');
      assert(!(await worker.expireBatch(expiryBinding(),{limit:100})).receipts.some(r=>r.sessionId===c.parent.sessionId));
      release();assert.equal((await prep).code,'V3_COMMIT_OUTCOME_UNKNOWN');assert.equal(sqlState,'23514');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[c.parent.sessionId])).rows[0].n,0);
      assert((await worker.expireBatch(expiryBinding(),{limit:100})).receipts.some(r=>r.sessionId===c.parent.sessionId));
     }finally{release();latch.release();if(prep)await prep;p.dispose();}
    });
    await assertion('actual parent expiry PG: maintenance expired real parent denies pending receipt challenge and decision',async()=>{
     const c=await short(),k=key(),p=await prepare(preparer,c.parent,k,c.request);
     const challenge={...await issuance.issue(binding(),key(),{preparationId:p.preparationId,expectedSessionVersion:1}),preparationId:p.preparationId};
     const before=await counts();await wait(c);assert((await worker.expireBatch(expiryBinding(),{limit:100})).receipts.some(r=>r.sessionId===c.parent.sessionId));
     await assert.rejects(()=>prepare(preparer,c.parent,k,c.request),e=>e.code==='V3_PENDING_RESOURCE_UNAVAILABLE');
     const d=make();try{await assert.rejects(()=>d.decide(binding(),key(),body(challenge)),e=>e.code==='V3_PATIENT_DECISION_VERSION_MISMATCH');}finally{d.dispose();}
     await assert.rejects(()=>issuance.issue(binding(),key(),{preparationId:p.preparationId,expectedSessionVersion:1}),e=>e.code==='V3_PATIENT_CHALLENGE_VERSION_MISMATCH');
     assert.equal(await counts(),before);
     const proof=(await admin.query("SELECT count(*)::integer AS n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED' AND actor_id=$2",[c.parent.sessionId,maintenanceActor])).rows[0];assert.equal(proof.n,1);
    });
   }});
 }finally{providers.forEach(p=>p.dispose());hmacKey.fill(0);await pendingPool.end();}
}
