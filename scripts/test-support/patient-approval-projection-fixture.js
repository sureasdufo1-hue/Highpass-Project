import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {createPatientApprovalTransactions,selectPatientApprovalProjection,assertLivePatientApprovalProjection} from '../../src/v3-patient-approval-projection.js';
import {checkPatientChallengeIssuance} from './patient-challenge-issuance-fixture.js';
import {checkPatientConsentDecisions} from './patient-consent-decision-fixture.js';

// Only called with the caller-owned disposable database. Never reads runtime credentials.
export async function checkPatientApprovalProjection({base,record,preparationId,sessionId,targetHospitalId,clause,check}){
 const admin=new Pool({...base,max:2}),password=randomBytes(32).toString('hex');
 const app=new Pool({...base,user:'hp_ceremony_schema_test',password,max:2,application_name:'hp-patient-projection-fixture'});
 admin.on('error',()=>{});app.on('error',()=>{});
 const secret=randomBytes(32).toString('hex');
 const identity={...record,issuer:'synthetic-projection-fixture',subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',
  role:'PATIENT',status:'ACTIVE',scopes:['consent:approve']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const binding=(overrides={})=>{
  const claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,role:'PATIENT',hospitalId:'SYNTH-A',
   scope:'consent:approve',patientId:'SYNTHETIC-ONLY',exp:Math.floor(Date.now()/1000)+180,
   acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:Math.floor(Date.now()/1000),...overrides};
  const data=[{alg:'HS256'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'consent:approve',allowedRoles:['PATIENT']});
 };
 const policy={clauseVersion:'synthetic-link-v1',clauseText:clause};
 const factory=createPatientApprovalTransactions({pool:app,maxReauthAgeMs:300000});
 const run=(b=binding(),version=1,id=preparationId)=>factory.run(b,tx=>selectPatientApprovalProjection(tx,b,id,version,policy));
 const assertion=async(name,operation)=>{try{await operation();check(name,true);}catch(error){
  // Only enum codes, never raw PG messages/parameters/assertion operands.
  const code=typeof error.code==='string'&&/^(?:[0-9A-Z]{5}|V3_[A-Z_]+|ERR_ASSERTION)$/.test(error.code)?error.code:'FIXTURE_ASSERTION';
  check(`${name} [${code}]`,false);throw error;
 }};
 const reject=(operation,code)=>assert.rejects(operation,e=>e.code===code);
 let challenge,decisions;
 try{
  // Ephemeral password never leaves this fixture or enters evidence.
  await admin.query(`ALTER ROLE hp_ceremony_schema_test LOGIN PASSWORD '${password}'`);
  await assertion('guarded PG: signed patient projection and live private brand',async()=>{
   const b=binding();let txSaved,out;
   const result=await factory.run(b,async tx=>{
    txSaved=tx;out=await selectPatientApprovalProjection(tx,b,preparationId,1,policy);
    assert.equal(out.denied,false);assert.equal(assertLivePatientApprovalProjection(tx,b,out),out);
    assert.throws(()=>assertLivePatientApprovalProjection(tx,b,{...out}),/PROJECTION_REQUIRED/);
    return out;
   });
   assert(Object.isFrozen(result.selection.identityLink));assert(Object.isFrozen(result.selection.resources));
   assert.equal(result.selection.state,'PENDING');assert.equal(result.selection.evidenceStatus,'UNVERIFIED');
   assert.equal(result.selection.sessionId,sessionId);
   assert.throws(()=>assertLivePatientApprovalProjection(txSaved,b,out),/TRANSACTION_REQUIRED/);
   const canonical=await admin.query(`SELECT encode(highpass_v3.patient_consent_content_digest(preparation_id,$2,
    sha256(convert_to($3,'UTF8')),'PATIENT_IDENTITY_LINK',valid_from,valid_until),'hex') AS digest
    FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[preparationId,policy.clauseVersion,clause]);
   assert.equal(result.selection.contentDigest,canonical.rows[0].digest);
  });
  await assertion('guarded PG: unknown preparation is safely hidden',async()=>assert.deepEqual(await run(binding(),1,randomUUID()),{denied:true,reasonCode:'PREPARATION_NOT_FOUND'}));
  await assertion('guarded PG: stale expected version safely denied',async()=>assert.deepEqual(await run(binding(),2),{denied:true,reasonCode:'VERSION_MISMATCH'}));
  await assertion('guarded PG: copied and unassured principals denied',async()=>{
   await reject(()=>run({...binding()}),'V3_AUTHENTICATED_BINDING_REQUIRED');
   await reject(()=>run(binding({amr:['pwd']})),'V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
  });
  await assertion('guarded PG: owner pool rejected before transaction',async()=>{
   const ownerFactory=createPatientApprovalTransactions({pool:admin,maxReauthAgeMs:300000});
   await reject(()=>ownerFactory.run(binding(),()=>{}),'V3_PATIENT_APPROVAL_DATABASE_ROLE_UNSAFE');
  });
  await assertion('guarded PG: mixed clinical capability rejected',async()=>{
   await admin.query('GRANT hp_v3_clinical_policy TO hp_ceremony_schema_test');
   try{await reject(()=>run(),'V3_PATIENT_APPROVAL_DATABASE_ROLE_UNSAFE');}
   finally{await admin.query('REVOKE hp_v3_clinical_policy FROM hp_ceremony_schema_test');}
  });
  await assertion('guarded PG: revoked principal rejected by registry',async()=>{
   await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[record.actorId]);
   try{await reject(()=>run(),'V3_DB_PRINCIPAL_INACTIVE');}
   finally{await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[record.actorId]);}
  });
  await assertion('guarded PG: suspended target denied',async()=>{
   await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[targetHospitalId]);
   try{assert.deepEqual(await run(),{denied:true,reasonCode:'TARGET_UNAVAILABLE'});}
   finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[targetHospitalId]);}
  });
  await assertion('guarded PG: final DB-clock reauth expiry rolls back',async()=>{
   const short=createPatientApprovalTransactions({pool:app,maxReauthAgeMs:2000});const b=binding();
   await reject(()=>short.run(b,async tx=>{
    assert.equal((await selectPatientApprovalProjection(tx,b,preparationId,1,policy)).denied,false);
    await tx.query('SELECT pg_sleep(2.2)');
   }),'V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
  });
  await assertion('guarded PG: Session SHARE waits on actual exclusive row lock',async()=>{
   const locker=await admin.connect();let pending;
   try{
    await locker.query('BEGIN');await locker.query('SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR UPDATE',[sessionId]);
    pending=run();pending.catch(()=>{});
    const until=Date.now()+1800;let observed=false;
    while(Date.now()<until){
     const r=await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='hp-patient-projection-fixture' AND wait_event_type='Lock') AS waiting");
     if(r.rows[0].waiting){observed=true;break;}await new Promise(r=>setTimeout(r,50));
    }
    assert(observed);await locker.query('ROLLBACK');assert.equal((await pending).denied,false);
   }finally{await locker.query('ROLLBACK').catch(()=>{});locker.release();if(pending)await pending.catch(()=>{});}
  });
  await assertion('guarded PG: read helper creates no approval or clinical side effects',async()=>{
   const r=await admin.query(`SELECT (SELECT count(*) FROM highpass_v3.consent_patient_ceremonies)=1
    AND (SELECT count(*) FROM highpass_v3.consent_patient_ceremony_audit)=1
    AND (SELECT state='PENDING' AND evidence_status='UNVERIFIED' FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1)
    AND (SELECT state='REQUESTED' AND version=1 FROM highpass_v3.exchange_sessions WHERE session_id=$2) AS unchanged`,[preparationId,sessionId]);
   assert.equal(r.rows[0].unchanged,true);
  });
  challenge=await checkPatientChallengeIssuance({admin,app,binding,record,preparationId,sessionId,targetHospitalId,clause,assertion});
  decisions=await checkPatientConsentDecisions({admin,app,binding,record,preparationId,sessionId,targetHospitalId,clause,assertion,issuance:challenge.service});
  await assertion('guarded PG: immutable short preparation expires under real DB clock',async()=>{
   const id=randomUUID(),event=randomUUID(),audit=randomUUID(),client=await admin.connect();
   try{
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),
     set_config('app.actor_id',(SELECT actor_id::text FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$3),true)`,[record.tenantId,record.hospitalId,preparationId]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,
     owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,valid_from,valid_until,
     policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
     SELECT $2,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,
     statement_timestamp()+interval '100 milliseconds',statement_timestamp()+interval '2 seconds',policy_version,
     submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,$3,$4,trace_id
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[preparationId,id,event,audit]);
    await client.query('INSERT INTO highpass_v3.consent_preparation_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1',[preparationId,id]);
    await client.query('INSERT INTO highpass_v3.consent_preparation_actions SELECT $2,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1',[preparationId,id]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox SELECT creation_event_id,owner_tenant_id,
     source_hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,'PREPARATION_CREATED','ALLOW',
     'PENDING_UNVERIFIED',created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[id]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_results SELECT owner_tenant_id,source_hospital_id,actor_id,
     'CONSENT_PREPARE',$2,$3,preparation_id,session_id,session_version,state,evidence_status,created_at
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[id,randomBytes(32),randomBytes(32)]);
    await client.query('COMMIT');
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
   assert.equal((await run(binding(),1,id)).denied,false);
   await reject(()=>challenge.service.issue(binding(),challenge.retryKey,{preparationId:id,expectedSessionVersion:1}),
    'V3_PATIENT_CHALLENGE_IDEMPOTENCY_CONFLICT');
   await new Promise(r=>setTimeout(r,2200));
   assert.deepEqual(await run(binding(),1,id),{denied:true,reasonCode:'PREPARATION_EXPIRED'});
   await reject(()=>challenge.service.issue(binding(),challenge.freshKey(),{preparationId:id,expectedSessionVersion:1}),
    'V3_PATIENT_CHALLENGE_PREPARATION_EXPIRED');
  });
  await assertion('guarded PG: witnessed audited cancellation wins against waiting decision and receipt',async()=>{
   const c=await challenge.service.issue(binding(),challenge.freshKey(),challenge.input),before=await decisions.counts();
   const event=randomUUID(),audit=randomUUID(),client=await admin.connect();let pending;
   try{
    await client.query('BEGIN');
    const actor=(await client.query('SELECT actor_id FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[preparationId])).rows[0].actor_id;
    await client.query("UPDATE highpass_v3.principal_bindings SET scopes=array_append(scopes,'exchange:cancel') WHERE actor_id=$1",[actor]);
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenantId,record.hospitalId,actor]);
    await client.query("UPDATE highpass_v3.exchange_sessions SET state='CANCELLED',version=version+1,updated_at=clock_timestamp() WHERE session_id=$1 AND version=1",[sessionId]);
    await client.query(`INSERT INTO highpass_v3.exchange_state_events(event_id,session_id,patient_ref,tenant_id,hospital_id,requester_id,actor_id,
     from_state,to_state,from_version,to_version,reason_code,audit_session_id,trace_id,occurred_at)
     SELECT $2,session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,$3,'REQUESTED','CANCELLED',1,2,
     'ADMINISTRATIVE_CANCEL',$4,'synthetic_projection_cancel',updated_at FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sessionId,event,actor,audit]);
    await client.query(`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,
     audit_session_id,trace_id,action,result,reason_code,session_version) VALUES($1,$2,$3,$4,$5,$6,
     'synthetic_projection_cancel','SESSION_CANCELLED','ALLOW','ADMINISTRATIVE_CANCEL',2)`,[event,sessionId,record.tenantId,record.hospitalId,actor,audit]);
    await client.query('INSERT INTO highpass_v3.exchange_cascade_outbox(event_id) VALUES($1)',[event]);
    await client.query(`INSERT INTO highpass_v3.exchange_cancel_results(tenant_id,hospital_id,actor_id,key_digest,request_digest,event_id,session_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[record.tenantId,record.hospitalId,actor,randomBytes(32),randomBytes(32),event,sessionId]);
    const blocker=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=decisions.service.decide(binding(),`synthetic-cancel-race-${randomUUID()}`,decisions.body(c))
     .then(value=>({value}),error=>({code:error.code}));
    const end=Date.now()+1200;let witnessed=false;
    while(Date.now()<end){
     witnessed=(await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name='hp-patient-projection-fixture' AND wait_event_type='Lock'
      AND $1::integer=ANY(pg_blocking_pids(pid))) AS witnessed`,[blocker])).rows[0].witnessed;
     if(witnessed)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(witnessed,true);
    await client.query('COMMIT');
    assert.equal((await pending).code,'V3_PATIENT_DECISION_VERSION_MISMATCH');
    assert.equal(await decisions.counts(),before);
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();if(pending)await pending;}
   assert.deepEqual(await run(),{denied:true,reasonCode:'VERSION_MISMATCH'});
   await reject(()=>challenge.service.issue(binding(),challenge.freshKey(),challenge.input),'V3_PATIENT_CHALLENGE_VERSION_MISMATCH');
   await reject(()=>decisions.service.decide(binding(),decisions.original.k,{
    ceremonyId:decisions.original.c.ceremonyId,nonce:decisions.original.c.nonce,
    command:{preparationId:decisions.original.c.preparationId,expectedSessionVersion:1,contentDigest:decisions.original.c.contentDigest,
     decision:'APPROVE',identityLink:{approved:false,clauseVersion:policy.clauseVersion}}
   }),'V3_PATIENT_DECISION_VERSION_MISMATCH');
  });
 }finally{decisions?.service.dispose();challenge?.service.dispose();await app.end();await admin.end();}
}
