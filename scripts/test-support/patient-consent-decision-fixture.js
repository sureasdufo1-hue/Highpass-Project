import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPatientApprovalTransactions} from '../../src/v3-patient-approval-projection.js';
import {V3PatientConsentDecisionService} from '../../src/v3-patient-consent-decision-service.js';
import {checkPatientDecisionDeadlines} from './patient-decision-deadline-fixture.js';
import {checkPatientDecisionMutations} from './patient-decision-mutation-fixture.js';
import {checkPatientDecisionParents} from './patient-decision-parent-fixture.js';
import {checkPatientDecisionCancelServices} from './patient-decision-cancel-service-fixture.js';
import {checkPatientDecisionIsolation} from './patient-decision-isolation-fixture.js';
import {checkConsentLifecycleSchema} from './consent-lifecycle-schema-fixture.js';

// Only used by the exact-name owned disposable PostgreSQL fixture.
export async function checkPatientConsentDecisions({admin,app,binding,record,preparationId,sessionId,targetHospitalId,clause,assertion,issuance}){
 const policy={clauseVersion:'synthetic-link-v1',clauseText:clause},key=randomBytes(32),pgFaults=[];
 const tables=['consent_content_versions','consent_content_scopes','consent_content_actions','consent_state_events',
  'consent_decision_audit','consent_patient_decisions','consent_patient_decision_results'];
 const freshKey=()=>`synthetic-decision-${randomUUID()}`;
 const wrappedPool=intercept=>({async connect(){const c=await app.connect();return {
  on:(...args)=>c.on(...args),removeListener:(...args)=>c.removeListener(...args),release:destroy=>c.release(destroy),query:q=>intercept(q,c)
 };}});
 const make=(intercept,options={})=>new V3PatientConsentDecisionService({transactions:createPatientApprovalTransactions({
  pool:wrappedPool(intercept??(async(q,c)=>{try{return await c.query(q);}catch(error){
   if(typeof error.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))pgFaults.push(error.code);throw error;
  }})),maxReauthAgeMs:options.maxReauthAgeMs??300000}),hmacKey:key,clausePolicy:policy});
 const service=make();
 const counts=async()=>JSON.stringify((await admin.query('SELECT '+tables.map(t=>`(SELECT count(*) FROM highpass_v3.${t}) AS ${t}`).join(','))).rows);
 const safeReject=operation=>assert.rejects(operation,e=>['V3_DATABASE_UNAVAILABLE','V3_COMMIT_OUTCOME_UNKNOWN'].includes(e.code));
 const clone=async()=>{
  const id=randomUUID(),event=randomUUID(),audit=randomUUID(),client=await admin.connect();
  try{
   await client.query('BEGIN');
   await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),
    set_config('app.actor_id',(SELECT actor_id::text FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$3),true)`,[record.tenantId,record.hospitalId,preparationId]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,
    owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,valid_from,valid_until,
    policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
    SELECT $2::uuid,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,
    statement_timestamp()+interval '1 second',statement_timestamp()+interval '2 minutes',policy_version,
    submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,$3::uuid,$4::uuid,trace_id
    FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[preparationId,id,event,audit]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_scopes SELECT $2::uuid,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1',[preparationId,id]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_actions SELECT $2::uuid,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1',[preparationId,id]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox SELECT creation_event_id,owner_tenant_id,
    source_hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,'PREPARATION_CREATED','ALLOW',
    'PENDING_UNVERIFIED',created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[id]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_results SELECT owner_tenant_id,source_hospital_id,actor_id,
    'CONSENT_PREPARE',$2::bytea,$3::bytea,preparation_id,session_id,session_version,state,evidence_status,created_at
    FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[id,randomBytes(32),randomBytes(32)]);
   await client.query('COMMIT');return id;
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
 };
 const challenge=async(id)=>{
  const preparation=id??await clone();
  const out=await issuance.issue(binding(),`synthetic-issue-${randomUUID()}`,{preparationId:preparation,expectedSessionVersion:1});
  return {...out,preparationId:preparation};
 };
 const body=(c,decision='APPROVE',approved=false)=>({ceremonyId:c.ceremonyId,nonce:c.nonce,
  command:{preparationId:c.preparationId,expectedSessionVersion:1,contentDigest:c.contentDigest,decision,
   identityLink:{approved,clauseVersion:policy.clauseVersion}}});
 const invoke=(c,k=freshKey(),choice='APPROVE',link=false)=>service.decide(binding(),k,body(c,choice,link));
 let original;
 try{
  await admin.query('GRANT SELECT,INSERT ON '+tables.map(t=>`highpass_v3.${t}`).join(',')+' TO hp_ceremony_schema_test');
  await admin.query('GRANT EXECUTE ON FUNCTION highpass_v3.patient_decision_evidence_digest(uuid,uuid,integer,text,boolean,timestamptz,timestamptz,integer) TO hp_ceremony_schema_test');
  for(const [choice,link] of [['APPROVE',false],['APPROVE',true],['REJECT',false]]){
   await assertion(`decision PG: atomic ${choice} with independent link=${link}`,async()=>{
    const c=await challenge(),k=freshKey();let out;
    try{out=await invoke(c,k,choice,link);}catch(error){
     if(pgFaults.length)throw Object.assign(Error('SAFE_PG_ENUM_ONLY'),{code:pgFaults.at(-1)});throw error;
    }
    assert.equal(out.state,choice==='APPROVE'?'ACTIVE':'REJECTED');assert.equal(out.identityLinkApproved,link);
    assert.equal(out.contentVersion,1);assert.equal(out.eventSequence,2);assert.equal(Object.hasOwn(out,'nonce'),false);
    const rows=(await admin.query(`SELECT v.content_version,v.content_digest=c.content_digest AS exact,
     d.identity_link_approved,r.evidence_digest=d.evidence_digest AS receipt_exact,
     (SELECT count(*) FROM highpass_v3.consent_state_events e WHERE e.consent_id=v.consent_id)::integer AS events,
     (SELECT count(*) FROM highpass_v3.consent_decision_audit a WHERE a.consent_id=v.consent_id)::integer AS audits
     FROM highpass_v3.consent_content_versions v JOIN highpass_v3.consent_patient_ceremonies c USING(ceremony_id)
     JOIN highpass_v3.consent_patient_decisions d USING(consent_id,content_version)
     JOIN highpass_v3.consent_patient_decision_results r USING(consent_id,content_version) WHERE v.consent_id=$1`,[out.consentId])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].exact,true);assert.equal(rows[0].receipt_exact,true);
    assert.equal(rows[0].events,2);assert.equal(rows[0].audits,2);
    if(choice==='APPROVE'&&!link)original={c,k,out};
   });
  }
  await assertion('decision PG: original typed receipt retry creates no extra records',async()=>{
   const before=await counts();assert.deepEqual(await invoke(original.c,original.k),original.out);assert.equal(await counts(),before);
  });
  await assertion('decision PG: changed payload same key and different key replay denied',async()=>{
   const before=await counts();
   await assert.rejects(()=>invoke(original.c,original.k,'REJECT'),e=>e.code==='V3_PATIENT_DECISION_IDEMPOTENCY_CONFLICT');
   await assert.rejects(()=>invoke(original.c),e=>e.code==='V3_PATIENT_DECISION_PREPARATION_ALREADY_DECIDED');
   assert.equal(await counts(),before);
  });
  await assertion('decision PG: concurrent same key returns one exact receipt',async()=>{
   const c=await challenge(),k=freshKey(),out=await Promise.all([invoke(c,k),invoke(c,k)]);assert.deepEqual(out[0],out[1]);
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_patient_decisions WHERE ceremony_id=$1',[c.ceremonyId])).rows[0].n,1);
  });
  await assertion('decision PG: different challenges keys and choices serialize one initial decision',async()=>{
   const id=await clone(),a=await challenge(id),b=await challenge(id);
   const out=await Promise.allSettled([invoke(a,freshKey(),'APPROVE'),invoke(b,freshKey(),'REJECT')]);
   assert.equal(out.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(out.find(x=>x.status==='rejected').reason.code,'V3_PATIENT_DECISION_PREPARATION_ALREADY_DECIDED');
  });
  await assertion('decision PG: wrong nonce and displayed digest cannot consume',async()=>{
   const c=await challenge(),before=await counts();
   await assert.rejects(()=>service.decide(binding(),freshKey(),{...body(c),nonce:randomBytes(32).toString('base64url')}),e=>e.code==='V3_PATIENT_DECISION_NONCE_INVALID');
   const altered=body(c);altered.command.contentDigest='00'.repeat(32);
   await assert.rejects(()=>service.decide(binding(),freshKey(),altered),e=>e.code==='V3_PATIENT_CONSENT_CONTENT_MISMATCH');
   assert.equal(await counts(),before);
  });
  for(const [label,prefix] of [['scope','INSERT INTO highpass_v3.consent_content_scopes'],
   ['action','INSERT INTO highpass_v3.consent_content_actions'],['state events','INSERT INTO highpass_v3.consent_state_events'],
   ['audit','INSERT INTO highpass_v3.consent_decision_audit'],['receipt','INSERT INTO highpass_v3.consent_patient_decision_results']]){
   await assertion(`decision PG: missing ${label} rolls back all seven tables`,async()=>{
    const c=await challenge(),before=await counts(),fault=make((q,client)=>q.text.startsWith(prefix)?Promise.resolve({rows:[],rowCount:0}):client.query(q));
    try{await safeReject(()=>fault.decide(binding(),freshKey(),body(c)));}finally{fault.dispose();}
    assert.equal(await counts(),before);
   });
  }
  await assertion('decision PG: lost COMMIT ACK retains exact receipt without re-consumption',async()=>{
   const c=await challenge(),k=freshKey(),fault=make(async(q,client)=>{const out=await client.query(q);
    if(q.text==='COMMIT')throw Object.assign(Error('SYNTHETIC_ACK_LOSS'),{code:'ECONNRESET'});return out;});
   try{await assert.rejects(()=>fault.decide(binding(),k,body(c)),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}finally{fault.dispose();}
   const before=await counts(),out=await invoke(c,k);
   assert.equal(out.state,'ACTIVE');assert.equal(await counts(),before);
   assert.deepEqual(await invoke(c,k),out);
  });
  await assertion('decision PG: suspended target denies creation and receipt recovery',async()=>{
   const c=await challenge(),before=await counts();
   await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[targetHospitalId]);
   try{for(const [ceremony,k] of [[c,freshKey()],[original.c,original.k]])
    await assert.rejects(()=>invoke(ceremony,k),e=>e.code==='V3_PATIENT_DECISION_TARGET_UNAVAILABLE');
   }finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[targetHospitalId]);}
   assert.equal(await counts(),before);
  });
  await assertion('decision PG: immutable owner content audit and consumption cannot be changed',async()=>{
   for(const table of ['consent_content_versions','consent_decision_audit','consent_patient_decisions'])
    await assert.rejects(()=>admin.query(`DELETE FROM highpass_v3.${table}`),e=>e.code==='42501');
  });
  await assertion('decision PG: all seven immutable tables reject owner UPDATE and DELETE',async()=>{
   const before=await counts();
   for(const table of tables){
    await assert.rejects(()=>admin.query(`UPDATE highpass_v3.${table} SET content_version=content_version`),e=>e.code==='42501');
    await assert.rejects(()=>admin.query(`DELETE FROM highpass_v3.${table}`),e=>e.code==='42501');
   }
   assert.equal(await counts(),before);
  });
  await assertion('decision PG: direct limited-role RLS hides all seven tables outside own patient context',async()=>{
   const doctor=(await admin.query('SELECT actor_id FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[preparationId])).rows[0].actor_id;
   const client=await app.connect();
   const read=async(tenant,hospital,actor)=>{
    try{
     await client.query('BEGIN');
     await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)`,[tenant,hospital,actor]);
     return (await client.query('SELECT '+tables.map(t=>`(SELECT count(*)::integer FROM highpass_v3.${t}) AS ${t}`).join(','))).rows[0];
    }finally{await client.query('ROLLBACK');}
   };
   try{
    assert(Object.values(await read(record.tenantId,record.hospitalId,record.actorId)).every(n=>n>0));
    for(const context of [['','',''],[record.tenantId,record.hospitalId,doctor],
     [record.tenantId,record.hospitalId,randomUUID()],[randomUUID(),record.hospitalId,record.actorId],
     [record.tenantId,randomUUID(),record.actorId]])
     assert(Object.values(await read(...context)).every(n=>n===0));
   }finally{client.release();}
  });
  await assertion('decision PG: recorded artifact never activates Session preparation or recipient',async()=>{
   const out=(await admin.query(`SELECT
    (SELECT state='REQUESTED' AND version=1 FROM highpass_v3.exchange_sessions WHERE session_id=$1) AS requested,
    (SELECT bool_and(state='PENDING' AND evidence_status='UNVERIFIED') FROM highpass_v3.consent_preparation_requests WHERE session_id=$1) AS pending,
    (SELECT status='INVITED' FROM highpass_v3.exchange_session_participants WHERE session_id=$1 AND participant_role='DESTINATION') AS invited`,[sessionId])).rows[0];
   assert.deepEqual(out,{requested:true,pending:true,invited:true});
  });
  await checkConsentLifecycleSchema({admin,app,binding,record,preparationId,sessionId,issuance,body,service,challenge,assertion});
  await checkPatientDecisionDeadlines({admin,app,binding,record,sessionId,targetHospitalId,policy,
   clone,challenge,body,make,counts,service,assertion});
  await checkPatientDecisionMutations({admin,binding,record,targetHospitalId,challenge,body,make,counts,service,assertion});
  await checkPatientDecisionParents({admin,binding,record,preparationId,sessionId,issuance,body,make,counts,service,assertion});
  await checkPatientDecisionCancelServices({admin,app,binding,record,preparationId,sessionId,issuance,body,make,counts,service,assertion});
  await checkPatientDecisionIsolation({admin,app,binding,record,preparationId,sessionId,issuance,body,make,counts,service,original,assertion});
  return {service,original,body,counts};
 }catch(error){service.dispose();throw error;}finally{key.fill(0);}
}
