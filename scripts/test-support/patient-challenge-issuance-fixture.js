import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createPatientApprovalTransactions} from '../../src/v3-patient-approval-projection.js';
import {V3PatientChallengeIssuanceService} from '../../src/v3-patient-challenge-issuance.js';

/** Called only inside the owned schema fixture, before its terminal cancellation. */
export async function checkPatientChallengeIssuance({admin,app,binding,record,preparationId,sessionId,targetHospitalId,clause,assertion}){
 const policy={clauseVersion:'synthetic-link-v1',clauseText:clause},key=randomBytes(32);
 const pgFaults=[];
 const input={preparationId,expectedSessionVersion:1};
 const freshKey=()=>`synthetic-challenge-${randomUUID()}`;
 const counts=async()=>JSON.stringify((await admin.query(`SELECT
  (SELECT count(*) FROM highpass_v3.consent_patient_ceremonies) AS ceremonies,
  (SELECT count(*) FROM highpass_v3.consent_patient_ceremony_audit) AS audits,
  (SELECT count(*) FROM highpass_v3.consent_patient_challenge_results) AS results`)).rows);
 const wrappedPool=intercept=>({async connect(){const c=await app.connect();return {
  on:(...args)=>c.on(...args),removeListener:(...args)=>c.removeListener(...args),release:destroy=>c.release(destroy),
  query:q=>intercept(q,c)
 };}});
 const faultService=intercept=>new V3PatientChallengeIssuanceService({transactions:createPatientApprovalTransactions({pool:wrappedPool(intercept),maxReauthAgeMs:300000}),hmacKey:key,clausePolicy:policy});
 const service=faultService(async(q,c)=>{try{return await c.query(q);}catch(error){
  if(typeof error.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))pgFaults.push(error.code);
  throw error;
 }});
 const safeReject=operation=>assert.rejects(operation,e=>['V3_DATABASE_UNAVAILABLE','V3_COMMIT_OUTCOME_UNKNOWN'].includes(e.code));
 let first;
 try{
  await admin.query('GRANT SELECT,INSERT ON highpass_v3.consent_patient_challenge_results TO hp_ceremony_schema_test');
  const retryKey=freshKey();
  await assertion('issuance PG: signed nonowner service commits exact challenge audit receipt',async()=>{
   try{first=await service.issue(binding(),retryKey,input);}catch(error){
    if(pgFaults.length)throw Object.assign(Error('SAFE_PG_ENUM_ONLY'),{code:pgFaults.at(-1)});throw error;
   }
   assert.equal(first.status,'ISSUED');assert.equal(Buffer.from(first.nonce,'base64url').length,32);
   const rows=(await admin.query(`SELECT c.nonce_hash,c.content_digest,c.issued_at,c.expires_at,c.reauthenticated_at,c.max_reauth_age_ms,
    c.issued_at=a.occurred_at AND c.issued_at=r.issued_at AND c.expires_at=r.expires_at AS exact,
    r.response_status FROM highpass_v3.consent_patient_ceremonies c JOIN highpass_v3.consent_patient_ceremony_audit a USING(ceremony_id)
    JOIN highpass_v3.consent_patient_challenge_results r USING(ceremony_id) WHERE c.ceremony_id=$1`,[first.ceremonyId])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].exact,true);assert.equal(rows[0].response_status,'ISSUED');
   assert.equal(rows[0].nonce_hash.toString('hex'),createHash('sha256').update(Buffer.from(first.nonce,'base64url')).digest('hex'));
   assert.equal(rows[0].content_digest.toString('hex'),first.contentDigest);
   assert(new Date(rows[0].expires_at)-new Date(rows[0].reauthenticated_at)<=rows[0].max_reauth_age_ms);
  });
  await assertion('issuance PG: same-key retry returns original metadata without raw nonce',async()=>{
   const before=await counts(),out=await service.issue(binding(),retryKey,input);
   assert.equal(out.status,'ISSUED_NONCE_UNAVAILABLE');assert.equal(out.nonceAvailable,false);
   assert.equal(out.requiresFreshChallenge,true);assert.equal(Object.hasOwn(out,'nonce'),false);
   for(const field of ['ceremonyId','contentDigest','issuedAt','expiresAt'])assert.equal(out[field],first[field]);
   assert.equal(await counts(),before);
  });
  await assertion('issuance PG: concurrent same-key callers produce one issuance and one recovery',async()=>{
   const requestKey=freshKey(),out=await Promise.all([service.issue(binding(),requestKey,input),service.issue(binding(),requestKey,input)]);
   assert.deepEqual(out.map(x=>x.status).sort(),['ISSUED','ISSUED_NONCE_UNAVAILABLE']);
   assert.equal(out[0].ceremonyId,out[1].ceremonyId);assert.equal(out.filter(x=>Object.hasOwn(x,'nonce')).length,1);
   const count=await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_patient_challenge_results WHERE ceremony_id=$1',[out[0].ceremonyId]);
   assert.equal(count.rows[0].n,1);
  });
  await assertion('issuance PG: fresh request has distinct CSPRNG nonce and ceremony',async()=>{
   const out=await service.issue(binding(),freshKey(),input);
   assert.notEqual(out.nonce,first.nonce);assert.notEqual(out.ceremonyId,first.ceremonyId);
  });
  for(const [label,prefix] of [['creation audit','INSERT INTO highpass_v3.consent_patient_ceremony_audit'],
   ['issuance receipt','INSERT INTO highpass_v3.consent_patient_challenge_results']]){
   await assertion(`issuance PG: omitted ${label} cannot commit`,async()=>{
    const before=await counts(),fault=faultService((q,c)=>q.text.startsWith(prefix)?Promise.resolve({rows:[],rowCount:0}):c.query(q));
    try{await safeReject(()=>fault.issue(binding(),freshKey(),input));}finally{fault.dispose();}
    assert.equal(await counts(),before);
   });
  }
  const administrator=(await admin.query('SELECT actor_id FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[preparationId])).rows[0].actor_id;
  for(const [label,index,replacement] of [['content digest',4,Buffer.alloc(32)],['link clause digest',7,Buffer.alloc(32)],
   ['future reauth',8,Date.now()+60000],['overlong max age',9,300001],['administrator actor',2,administrator]]){
   await assertion(`issuance PG: altered ${label} fails closed and leaves no partial rows`,async()=>{
    const before=await counts(),fault=faultService((q,c)=>{
     if(q.text.startsWith('WITH timing'))q={...q,values:q.values.map((v,i)=>i===index?replacement:v)};
     return c.query(q);
    });
    try{await safeReject(()=>fault.issue(binding(),freshKey(),input));}finally{fault.dispose();}
    assert.equal(await counts(),before);
   });
  }
  await assertion('issuance PG: reused nonce hash is rejected by actual uniqueness',async()=>{
   const nonceHash=createHash('sha256').update(Buffer.from(first.nonce,'base64url')).digest(),before=await counts();
   const fault=faultService((q,c)=>c.query(q.text.startsWith('WITH timing')?{...q,values:q.values.map((v,i)=>i===3?nonceHash:v)}:q));
   try{await safeReject(()=>fault.issue(binding(),freshKey(),input));}finally{fault.dispose();}
   assert.equal(await counts(),before);
  });
  await assertion('issuance PG: lost real COMMIT acknowledgment exposes no raw nonce and recovers receipt',async()=>{
   const requestKey=freshKey(),fault=faultService(async(q,c)=>{
    const result=await c.query(q);if(q.text==='COMMIT')throw Error('SYNTHETIC_ACK_LOSS_AFTER_REAL_COMMIT');return result;
   });
   try{await assert.rejects(()=>fault.issue(binding(),requestKey,input),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}
   finally{fault.dispose();}
   const recovered=await service.issue(binding(),requestKey,input);
   assert.equal(recovered.status,'ISSUED_NONCE_UNAVAILABLE');assert.equal(Object.hasOwn(recovered,'nonce'),false);
  });
  await assertion('issuance PG: failed commit with absent receipt can safely retry same key',async()=>{
   const requestKey=freshKey(),fault=faultService((q,c)=>q.text.startsWith('INSERT INTO highpass_v3.consent_patient_ceremony_audit')?Promise.resolve({rows:[]}):c.query(q));
   try{await safeReject(()=>fault.issue(binding(),requestKey,input));}finally{fault.dispose();}
   assert.equal((await service.issue(binding(),requestKey,input)).status,'ISSUED');
  });
  await assertion('issuance PG: private reauth/copy denied before any acquisition',async()=>{
   let acquired=0;const fault=faultService((q,c)=>c.query(q));
   const pool={async connect(){acquired++;return app.connect();}};
   const s=new V3PatientChallengeIssuanceService({transactions:createPatientApprovalTransactions({pool,maxReauthAgeMs:300000}),hmacKey:key,clausePolicy:policy});
   try{
    await assert.rejects(()=>s.issue({...binding()},freshKey(),input),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
    await assert.rejects(()=>s.issue(binding({amr:['pwd']}),freshKey(),input),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
    assert.equal(acquired,0);
   }finally{s.dispose();fault.dispose();}
  });
  await assertion('issuance PG: suspended target prevents issuance and receipt replay',async()=>{
   await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[targetHospitalId]);
   try{
    for(const requestKey of [retryKey,freshKey()])await assert.rejects(()=>service.issue(binding(),requestKey,input),e=>e.code==='V3_PATIENT_CHALLENGE_TARGET_UNAVAILABLE');
   }finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[targetHospitalId]);}
  });
  await assertion('issuance PG: Session lock timeout cannot issue or leak partial nonce',async()=>{
   const locker=await admin.connect();const before=await counts();
   try{
    await locker.query('BEGIN');await locker.query('SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR UPDATE',[sessionId]);
    await assert.rejects(()=>service.issue(binding(),freshKey(),input),e=>e.code==='V3_DATABASE_UNAVAILABLE');
   }finally{await locker.query('ROLLBACK');locker.release();}
   assert.equal(await counts(),before);
  });
  await assertion('issuance PG: owner cannot change immutable issuance receipt',async()=>{
   await assert.rejects(()=>admin.query('UPDATE highpass_v3.consent_patient_challenge_results SET response_status=response_status'),e=>e.code==='42501');
  });
  await assertion('issuance PG: administrator or absent actor cannot enumerate patient challenge receipts',async()=>{
   const client=await app.connect();
   try{
    for(const actor of [administrator,'']){
     await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenantId,record.hospitalId,actor]);
     const r=await client.query('SELECT (SELECT count(*) FROM highpass_v3.consent_patient_ceremonies)::integer AS c,(SELECT count(*) FROM highpass_v3.consent_patient_challenge_results)::integer AS r');
     assert.equal(r.rows[0].c,0);assert.equal(r.rows[0].r,0);await client.query('ROLLBACK');
    }
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
  });
  await assertion('issuance PG: no raw nonce columns and no approval or recipient activation',async()=>{
   const rows=(await admin.query(`SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='highpass_v3' AND table_name LIKE 'consent_patient_%'
      AND column_name IN ('nonce','raw_nonce','token','secret','encrypted_nonce')) AS raw_columns,
    (SELECT state='PENDING' AND evidence_status='UNVERIFIED' FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1) AS pending,
    (SELECT state='REQUESTED' AND version=1 FROM highpass_v3.exchange_sessions WHERE session_id=$2) AS requested,
    (SELECT status='INVITED' FROM highpass_v3.exchange_session_participants WHERE session_id=$2 AND participant_role='DESTINATION') AS invited`,[preparationId,sessionId])).rows;
   assert.equal(Number(rows[0].raw_columns),0);assert.equal(rows[0].pending,true);assert.equal(rows[0].requested,true);assert.equal(rows[0].invited,true);
  });
  await assertion('issuance PG: actual short parent deadline blocks new issuance and receipt recovery',async()=>{
   const sid=randomUUID(),pid=randomUUID(),creation=randomUUID(),sa=randomUUID(),pe=randomUUID(),pa=randomUUID(),client=await admin.connect();
   try{
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),
     set_config('app.actor_id',(SELECT actor_id::text FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$3),true)`,[record.tenantId,record.hospitalId,preparationId]);
    await client.query(`INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
     requester_id,purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
     SELECT $2,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,initiation_type,
     clock_timestamp()+interval '4 seconds',resource_snapshot_digest,resource_count,$3,'synthetic_parent_expiry_001',requested_actions
     FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sessionId,sid,sa]);
    await client.query(`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
     SELECT $2,session_id,owner_tenant_id,source_hospital_id,requester_id,audit_session_id,trace_id,'SESSION_CREATED','ALLOW','SESSION_REQUESTED',1
     FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,creation]);
    await client.query(`INSERT INTO highpass_v3.exchange_creation_context SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,
     initiation_type,target_tenant_id,target_hospital_id,$2,audit_session_id,trace_id,'SESSION_CREATED' FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,creation]);
    await client.query('INSERT INTO highpass_v3.exchange_session_participants SELECT $2,patient_ref,tenant_id,hospital_id,participant_role,status FROM highpass_v3.exchange_session_participants WHERE session_id=$1',[sessionId,sid]);
    await client.query('INSERT INTO highpass_v3.exchange_resource_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1',[sessionId,sid]);
    await client.query(`INSERT INTO highpass_v3.exchange_write_results SELECT owner_tenant_id,source_hospital_id,requester_id,'SESSION_CREATE',
     $2,$3,session_id,'REQUESTED',1,created_at FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,randomBytes(32),randomBytes(32)]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,
     owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,valid_from,valid_until,
     policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
     SELECT $2,$3,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,
     statement_timestamp()+interval '50 milliseconds',(SELECT valid_until-interval '500 milliseconds' FROM highpass_v3.exchange_sessions WHERE session_id=$3),
     policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,$4,$5,'synthetic_parent_expiry_001'
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[preparationId,pid,sid,pe,pa]);
    await client.query('INSERT INTO highpass_v3.consent_preparation_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1',[preparationId,pid]);
    await client.query('INSERT INTO highpass_v3.consent_preparation_actions SELECT $2,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1',[preparationId,pid]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox SELECT creation_event_id,owner_tenant_id,source_hospital_id,actor_id,
     session_id,session_version,preparation_id,audit_session_id,trace_id,'PREPARATION_CREATED','ALLOW','PENDING_UNVERIFIED',created_at
     FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid]);
    await client.query(`INSERT INTO highpass_v3.consent_preparation_results SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',
     $2,$3,preparation_id,session_id,session_version,state,evidence_status,created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid,randomBytes(32),randomBytes(32)]);
    await client.query('COMMIT');
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
   const shortInput={preparationId:pid,expectedSessionVersion:1},requestKey=freshKey();
   assert.equal((await service.issue(binding(),requestKey,shortInput)).status,'ISSUED');
   await new Promise(r=>setTimeout(r,4200));
   for(const k of [requestKey,freshKey()])await assert.rejects(()=>service.issue(binding(),k,shortInput),e=>e.code==='V3_PATIENT_CHALLENGE_SESSION_EXPIRED');
  });
  // Retain service until caller's expiry/cancellation scenarios finish; dispose explicitly.
  return {service,input,freshKey,retryKey};
 }catch(error){service.dispose();throw error;}finally{key.fill(0);}
}
