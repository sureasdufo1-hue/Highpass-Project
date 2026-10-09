import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

// Full immutable parent assembly in a disposable DB, never runtime credentials.
export async function seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance,lifetimeSeconds=3}){
 if(!Number.isInteger(lifetimeSeconds)||lifetimeSeconds<3||lifetimeSeconds>120)throw Error('FIXTURE_PARENT_LIFETIME_INVALID');
 const key=()=>`synthetic-parent-${randomUUID()}`;
  const sid=randomUUID(),pid=randomUUID(),creation=randomUUID(),sa=randomUUID(),pe=randomUUID(),pa=randomUUID(),client=await admin.connect();
  try{
   await client.query('BEGIN');
   await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),
    set_config('app.actor_id',(SELECT actor_id::text FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$3),true)`,[record.tenantId,record.hospitalId,preparationId]);
   await client.query(`INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
    requester_id,purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
    SELECT $2,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,initiation_type,
    clock_timestamp()+$4::integer*interval '1 second',resource_snapshot_digest,resource_count,$3,'synthetic_decision_parent',requested_actions
    FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sessionId,sid,sa,lifetimeSeconds]);
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
    statement_timestamp()+interval '50 milliseconds',(SELECT valid_until-interval '100 milliseconds' FROM highpass_v3.exchange_sessions WHERE session_id=$3),
    policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,$4,$5,'synthetic_decision_parent'
    FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[preparationId,pid,sid,pe,pa]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1',[preparationId,pid]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_actions SELECT $2,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1',[preparationId,pid]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox SELECT creation_event_id,owner_tenant_id,source_hospital_id,actor_id,
    session_id,session_version,preparation_id,audit_session_id,trace_id,'PREPARATION_CREATED','ALLOW','PENDING_UNVERIFIED',created_at
    FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_results SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',
    $2,$3,preparation_id,session_id,session_version,state,evidence_status,created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid,randomBytes(32),randomBytes(32)]);
   await client.query('COMMIT');
   const parentUntil=(await client.query('SELECT valid_until FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sid])).rows[0].valid_until;
   return {...await issuance.issue(binding(),key(),{preparationId:pid,expectedSessionVersion:1}),preparationId:pid,sessionId:sid,parentUntil};
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
}
export async function checkPatientDecisionParents({admin,binding,record,preparationId,sessionId,issuance,body,make,counts,service,assertion}){
 const key=()=>`synthetic-parent-${randomUUID()}`;
 const seed=()=>seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance});
 const waitParent=async(client,c)=>{
  const remaining=Number((await client.query('SELECT extract(epoch FROM ($1::timestamptz-clock_timestamp())) AS remaining',[c.parentUntil])).rows[0].remaining);
  assert(remaining<3.2);
  await client.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.08)',[c.parentUntil]);
 };
 await assertion('decision parent PG: parent expiry denies original receipt and new decision',async()=>{
  const c=await seed(),k=key();assert.equal((await service.decide(binding(),k,body(c))).state,'ACTIVE');
  const before=await counts();await waitParent(admin,c);
  for(const requestKey of [k,key()])await assert.rejects(()=>service.decide(binding(),requestKey,body(c)),e=>e.code==='V3_PATIENT_DECISION_SESSION_EXPIRED');
  assert.equal(await counts(),before);
 });
 for(const atCommit of [false,true]){
  await assertion(`decision parent PG: coupled preparation parent challenge expiry ${atCommit?'during COMMIT':'after INSERT'} rolls back`,async()=>{
   const c=await seed(),before=await counts();let reached=false,sqlState;
   const fault=make(async(q,client)=>{
    if(atCommit&&q.text==='COMMIT'){
     reached=true;await waitParent(client,c);
     try{return await client.query(q);}catch(error){sqlState=error.code;throw error;}
    }
    const out=await client.query(q);
    if(!atCommit&&q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){reached=true;await waitParent(client,c);}
    return out;
   });
   try{await assert.rejects(()=>fault.decide(binding(),key(),body(c)),e=>e.code===(atCommit?'V3_COMMIT_OUTCOME_UNKNOWN':'V3_PATIENT_CONSENT_EXPIRED'));}
   finally{fault.dispose();}
   assert.equal(reached,true);if(atCommit)assert.equal(sqlState,'23514');assert.equal(await counts(),before);
  });
 }
}
