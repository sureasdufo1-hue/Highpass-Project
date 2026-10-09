import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {createPatientApprovalTransactions} from '../../src/v3-patient-approval-projection.js';
import {checkReverseInstitutionRaces} from './patient-multisession-fixture.js';
import {checkWithdrawalIsolation} from './withdrawal-isolation-fixture.js';

// Registered synthetic identities and real limited-role transactions; owned DB only.
export async function checkPatientDecisionIsolation({admin,app,binding,record,preparationId,sessionId,issuance,body,make,counts,service,original,assertion}){
 const tables=['consent_content_versions','consent_content_scopes','consent_content_actions','consent_state_events',
  'consent_decision_audit','consent_patient_decisions','consent_patient_decision_results'];
 const key=()=>`synthetic-isolation-${randomUUID()}`;
 const secret=randomBytes(32).toString('hex'),identities=[];
 const doctor=(await admin.query('SELECT actor_id FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[preparationId])).rows[0].actor_id;
 await assertion('decision isolation PG: register actual synthetic patients and owned reference tuples',async()=>{
 for(const foreign of [false,true]){
  const r={...record,actorId:randomUUID(),patientRefId:randomUUID(),issuer:'synthetic-isolation',
   subject:foreign?'SYNTH-FOREIGN-PATIENT':'SYNTH-SAME-HOSPITAL-PATIENT',authHospitalId:foreign?'SYNTH-C':'SYNTH-A',
   role:'PATIENT',scopes:['consent:approve'],status:'ACTIVE',foreign};
  if(foreign){
   r.tenantId=randomUUID();r.hospitalId=randomUUID();r.creator=randomUUID();
   await admin.query("INSERT INTO highpass_v3.tenants(tenant_id,code,display_name,status) VALUES($1,'SYNTH-C','SYNTHETIC C','ACTIVE')",[r.tenantId]);
   await admin.query("INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES($1,$2,'C')",[r.hospitalId,r.tenantId]);
   await admin.query("INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes) VALUES($1,$2,$3,'HOSPITAL_ADMIN',ARRAY['exchange:create','consent:write','mapping:write'])",[r.creator,r.tenantId,r.hospitalId]);
  }else r.creator=doctor;
  await admin.query('INSERT INTO highpass_v3.patient_refs(patient_ref,owner_tenant_id,owner_hospital_id,registered_by) VALUES($1,$2,$3,$4)',[r.patientRefId,r.tenantId,r.hospitalId,r.creator]);
  await admin.query('INSERT INTO highpass_v3.patient_ref_registrations SELECT patient_ref,owner_tenant_id,owner_hospital_id,registered_by FROM highpass_v3.patient_refs WHERE patient_ref=$1',[r.patientRefId]);
  await admin.query("INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,patient_ref) VALUES($1,$2,$3,'PATIENT',ARRAY['consent:approve'],$4)",[r.actorId,r.tenantId,r.hospitalId,r.patientRefId]);
  identities.push(r);
 }
 });
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:'synthetic-isolation',JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:identities});
 const resolve=(r,overrides={})=>{
  const claims={iss:r.issuer,aud:'synthetic-v3',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'consent:approve',
   patientId:r.subject,exp:Math.floor(Date.now()/1000)+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],
   highpass_test_assurance:true,auth_time:Math.floor(Date.now()/1000),...overrides};
  const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'consent:approve',allowedRoles:['PATIENT']});
 };
 const factory=createPatientApprovalTransactions({pool:app,maxReauthAgeMs:300000});
 await assertion('decision isolation PG: actual signed registered bindings agree with persisted patient tuples',async()=>{
  for(const r of identities){const b=resolve(r);assert.equal(b.actorId,r.actorId);assert.equal(b.patientRefId,r.patientRefId);
   await factory.run(b,async tx=>assert.equal((await tx.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1',[r.patientRefId])).rowCount,1));}
 });
 const read=(b,id)=>factory.run(b,async tx=>(await tx.query('SELECT '+tables.map(t=>`(SELECT count(*)::integer FROM highpass_v3.${t} WHERE consent_id=$1) AS ${t}`).join(','),[id])).rows[0]);
 const seed=async(r,target={},approvalBinding)=>{
  const sid=randomUUID(),pid=randomUUID(),event=randomUUID(),audit=randomUUID(),pe=randomUUID(),pa=randomUUID(),client=await admin.connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[r.tenantId,r.hospitalId,r.creator]);
   const targetTenant=target.targetTenant??(r.foreign?record.tenantId:(await client.query('SELECT target_tenant_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0].target_tenant_id);
   const targetHospital=target.targetHospital??(r.foreign?record.hospitalId:(await client.query('SELECT target_hospital_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0].target_hospital_id);
   await client.query(`INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
    requester_id,purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
    SELECT $2,$3,$4,$5,$6,$7,$8,purpose,initiation_type,clock_timestamp()+interval '120 seconds',resource_snapshot_digest,resource_count,$9,'synthetic_isolation_parent',requested_actions
    FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sessionId,sid,r.patientRefId,r.tenantId,r.hospitalId,targetTenant,targetHospital,r.creator,audit]);
   await client.query(`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
    SELECT $2,session_id,owner_tenant_id,source_hospital_id,requester_id,audit_session_id,trace_id,'SESSION_CREATED','ALLOW','SESSION_REQUESTED',1 FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,event]);
   await client.query(`INSERT INTO highpass_v3.exchange_creation_context SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,
    initiation_type,target_tenant_id,target_hospital_id,$2,audit_session_id,trace_id,'SESSION_CREATED' FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,event]);
   await client.query(`INSERT INTO highpass_v3.exchange_session_participants SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,'SOURCE','ACTIVE' FROM highpass_v3.exchange_sessions WHERE session_id=$1
    UNION ALL SELECT session_id,patient_ref,target_tenant_id,target_hospital_id,'DESTINATION','INVITED' FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid]);
   await client.query('INSERT INTO highpass_v3.exchange_resource_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1',[sessionId,sid]);
   await client.query(`INSERT INTO highpass_v3.exchange_write_results SELECT owner_tenant_id,source_hospital_id,requester_id,'SESSION_CREATE',$2,$3,session_id,'REQUESTED',1,created_at FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[sid,randomBytes(32),randomBytes(32)]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
    actor_id,purpose,valid_from,valid_until,policy_version,submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
    SELECT $2,s.session_id,1,s.patient_ref,s.owner_tenant_id,s.source_hospital_id,s.target_tenant_id,s.target_hospital_id,s.requester_id,p.purpose,
    clock_timestamp()+interval '50 milliseconds',s.valid_until-interval '100 milliseconds',p.policy_version,p.submitted_evidence_commitment,p.resource_snapshot_digest,
    p.resource_count,p.action_count,$4,$5,'synthetic_isolation_parent' FROM highpass_v3.consent_preparation_requests p CROSS JOIN highpass_v3.exchange_sessions s
    WHERE p.preparation_id=$1 AND s.session_id=$3`,[preparationId,pid,sid,pe,pa]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_scopes SELECT $2,ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=$1',[preparationId,pid]);
   await client.query('INSERT INTO highpass_v3.consent_preparation_actions SELECT $2,ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1',[preparationId,pid]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_audit_outbox SELECT creation_event_id,owner_tenant_id,source_hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,'PREPARATION_CREATED','ALLOW','PENDING_UNVERIFIED',created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid]);
   await client.query(`INSERT INTO highpass_v3.consent_preparation_results SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',$2,$3,preparation_id,session_id,session_version,state,evidence_status,created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[pid,randomBytes(32),randomBytes(32)]);
   await client.query('COMMIT');
   return {...await issuance.issue(approvalBinding??resolve(r),key(),{preparationId:pid,expectedSessionVersion:1}),preparationId:pid};
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
 };
 for(const r of identities){
  await assertion(`decision isolation PG: registered ${r.foreign?'foreign tenant':'same hospital other patient'} own positive and cross-read denied`,async()=>{
   const c=await seed(r),out=await service.decide(resolve(r),key(),body(c));assert.equal(out.state,'ACTIVE');r.receipt=out;r.challenge=c;
   assert(Object.values(await read(resolve(r),out.consentId)).every(n=>n>0));
   assert(Object.values(await read(binding(),original.out.consentId)).every(n=>n>0));
   assert(Object.values(await read(resolve(r),original.out.consentId)).every(n=>n===0));
   assert(Object.values(await read(binding(),out.consentId)).every(n=>n===0));
  });
  await assertion(`decision isolation PG: registered ${r.foreign?'foreign tenant':'same hospital other patient'} nonce and original key cannot confer authority`,async()=>{
   const before=await counts();
   for(const k of [original.k,key()])await assert.rejects(()=>service.decide(resolve(r),k,body(original.c)),e=>e.code==='V3_PATIENT_DECISION_PREPARATION_NOT_FOUND');
   assert.equal(await counts(),before);
  });
  await assertion(`decision isolation PG: registered ${r.foreign?'foreign tenant':'same hospital other patient'} seven direct copied INSERTs blocked by RLS`,async()=>{
   const before=await counts();
   for(const table of tables){
    const row=(await admin.query(`SELECT to_jsonb(t) AS row FROM highpass_v3.${table} t WHERE consent_id=$1 LIMIT 1`,[original.out.consentId])).rows[0].row;
    let sqlState;
    await assert.rejects(()=>factory.run(resolve(r),tx=>tx.query(`INSERT INTO highpass_v3.${table} SELECT (jsonb_populate_record(NULL::highpass_v3.${table},$1::jsonb)).*`,[JSON.stringify(row)]).catch(e=>{sqlState=e.code;throw e;})),e=>e.code==='V3_DATABASE_UNAVAILABLE');
    assert.equal(sqlState,'42501');assert.equal(await counts(),before);
   }
  });
  await assertion(`decision isolation PG: registered ${r.foreign?'foreign tenant':'same hospital other patient'} copied binding and missing signed scope rejected`,async()=>{
   const before=await counts();
   await assert.rejects(()=>service.decide({...resolve(r)},key(),body(original.c)),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
   assert.throws(()=>resolve(r,{scope:'consent:write'}),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
   assert.equal(await counts(),before);
  });
 }
 await assertion('decision isolation PG: registered foreign patients cannot read each other artifacts',async()=>{
  for(let i=0;i<2;i++)assert(Object.values(await read(resolve(identities[i]),identities[1-i].receipt.consentId)).every(n=>n===0));
 });
 for(const [label,prefix,needle,replacement,value,atCommit] of [
  ['foreign actor root','consent_content_versions','c.patient_actor_id',' $4::uuid',record.actorId,false],
  ['foreign patient root','consent_content_versions','p.patient_ref',' $4::uuid',record.patientRefId,false],
  ['foreign tenant root','consent_content_versions','p.owner_tenant_id',' $4::uuid',record.tenantId,false],
  ['foreign audit actor','consent_decision_audit','patient_actor_id,audit_session_id,trace_id,action,occurred_at\n    FROM','$2::uuid,audit_session_id,trace_id,action,occurred_at\n    FROM',record.actorId,false],
  ['swapped audit correlation','consent_decision_audit','audit_session_id,trace_id,action,occurred_at\n    FROM','$2::uuid,trace_id,action,occurred_at\n    FROM',randomUUID(),true]
 ]){
  await assertion(`decision isolation PG: substituted ${label} fails atomically`,async()=>{
   const r=identities[1],c=await seed(r),before=await counts();let reached=false,sqlState;
   const fault=make(async(q,client)=>{
    let query=q;
    if(q.text.startsWith(`INSERT INTO highpass_v3.${prefix}`)){
     assert(q.text.includes(needle));reached=true;query={...q,text:q.text.replace(needle,replacement),values:[...q.values,value]};
    }
    try{return await client.query(query);}catch(e){if(typeof e.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code))sqlState=e.code;throw e;}
   });
   try{await assert.rejects(()=>fault.decide(resolve(r),key(),body(c)),e=>e.code===(atCommit?'V3_COMMIT_OUTCOME_UNKNOWN':'V3_DATABASE_UNAVAILABLE'));}
   finally{fault.dispose();}
   assert.equal(reached,true);assert.equal(sqlState,atCommit?'23503':'42501');assert.equal(await counts(),before);
  });
 }
 await assertion('decision isolation PG: registered source and invited destination administrators have no evidence access',async()=>{
  // Direct hostile SQL context, not a public request-controlled capability.
  // Both administrators actually exist in the persisted principal registry.
  const client=await app.connect();
  try{
   for(const r of [{tenantId:record.tenantId,hospitalId:record.hospitalId,actorId:doctor},
    {tenantId:identities[1].tenantId,hospitalId:identities[1].hospitalId,actorId:identities[1].creator}]){
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[r.tenantId,r.hospitalId,r.actorId]);
    const row=(await client.query('SELECT '+tables.map(t=>`(SELECT count(*)::integer FROM highpass_v3.${t}) AS ${t}`).join(','))).rows[0];
    assert(Object.values(row).every(n=>n===0));await client.query('ROLLBACK');
   }
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
 });
 await checkWithdrawalIsolation({admin,base:app.options,record,doctor,identities,seed,resolve:r=>r===null?binding():resolve(r),decision:service,body,assertion});
 await checkReverseInstitutionRaces({admin,seed,identities,resolve,make,body,counts,assertion});
}
