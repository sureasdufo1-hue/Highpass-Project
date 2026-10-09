import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {seedPatientDecisionParent} from './patient-decision-parent-fixture.js';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {parsePatientConsentWithdrawalCommand} from '../../src/v3-patient-consent-withdraw-command.js';
import {createPatientWithdrawalTransactions,selectPatientWithdrawalProjection,assertLivePatientWithdrawalProjection} from '../../src/v3-patient-consent-withdraw-projection.js';
import {checkConsentWithdrawalService} from './consent-withdraw-service-fixture.js';
import {checkWithdrawalExpiryContention} from './withdrawal-expiry-contention-fixture.js';
import {checkConsentExpiryPrincipal} from './consent-expiry-principal-fixture.js';

// Direct nonowner SQL schema assertions, not a successful authenticated withdrawal service.
export async function checkConsentLifecycleSchema({admin,app,binding,record,preparationId,sessionId,issuance,body,service,challenge,assertion}){
 const migration=readFileSync('db/migrations/027_highpass_v3_consent_lifecycle.sql','utf8');
 const tables=['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'];
 const worker=randomUUID(),password=randomBytes(32).toString('hex');let patientPool,expiryPool;
 let factory;
 const secret=randomBytes(32).toString('hex'),identity={...record,issuer:'synthetic-withdrawal-projection',subject:'SYNTH-PATIENT',
  authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:withdraw']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const patientBinding=()=>{
  const now=Math.floor(Date.now()/1000),claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,hospitalId:'SYNTH-A',role:'PATIENT',
   scope:'consent:withdraw',patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:now};
  const data=[{alg:'HS256'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'consent:withdraw',allowedRoles:['PATIENT']});
 };
 const project=async(out,callback)=>{
  const b=patientBinding(),command=parsePatientConsentWithdrawalCommand(b,{consentId:out.consentId,contentVersion:1,expectedEventSequence:2},
   {nowMs:Date.now(),maxReauthAgeMs:300000});
  return factory.run(b,command,async tx=>{
   const p=await selectPatientWithdrawalProjection(tx,b,command);
   if(callback)await callback(tx,b,command,p);return p;
  });
 };
 const count=async()=>JSON.stringify((await admin.query('SELECT '+tables.map(t=>`(SELECT count(*) FROM highpass_v3.${t}) AS ${t}`).join(','))).rows);
 const context=async(c,actor=record.actorId)=>c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenantId,record.hospitalId,actor]);
 const consent=async({short=false,reject=false}={})=>{
  const c=short?await seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance}):await challenge();
  const out=await service.decide(binding(),`synthetic-lifecycle-initial-${randomUUID()}`,body(c,reject?'REJECT':'APPROVE'));
  return {...out,sessionId:c.sessionId??sessionId};
 };
 const insert=async(c,out,{expiry=false,mutate={},badEvidence=false}={})=>{
  const row=(await c.query(`SELECT v.*,v.valid_until::text AS valid_until,e.event_id AS predecessor_id,e.occurred_at::text AS predecessor_at,
   clock_timestamp()::text AS recorded_at FROM highpass_v3.consent_content_versions v
   JOIN highpass_v3.consent_state_events e USING(consent_id,content_version)
   WHERE v.consent_id=$1 AND e.event_sequence=2`,[out.consentId])).rows[0];
  assert.ok(row);
  const e={event_id:randomUUID(),consent_id:out.consentId,content_version:1,event_sequence:3,
   predecessor_id:row.predecessor_id,predecessor_sequence:2,predecessor_state:'ACTIVE',predecessor_at:row.predecessor_at,
   tenant_id:row.owner_tenant_id,hospital_id:row.source_hospital_id,patient_ref:row.patient_ref,subject_actor_id:row.patient_actor_id,
   actor_id:expiry?worker:record.actorId,actor_role:expiry?'INTERNAL_SERVICE':'PATIENT',actor_purpose:expiry?'CONSENT_EXPIRY':'PATIENT_WITHDRAWAL',
   operation:expiry?'CONSENT_EXPIRE':'CONSENT_WITHDRAW',state:expiry?'EXPIRED':'WITHDRAWN',content_digest:row.content_digest,
   valid_until:row.valid_until,policy_version:row.policy_version,effective_at:expiry?row.valid_until:row.recorded_at,recorded_at:row.recorded_at,
   assurance_kind:expiry?'REGISTERED_SERVICE_ONLY':'SIGNED_SYNTHETIC_REAUTH_ONLY',
   reauthenticated_at:expiry?null:new Date(new Date(row.recorded_at).getTime()-1000),max_reauth_age_ms:expiry?null:300000,
   audit_session_id:randomUUID(),trace_id:'synthetic_lifecycle_schema_001',reason_code:expiry?'CONSENT_DEADLINE_EXPIRED':'PATIENT_WITHDRAWN',
   key_digest:randomBytes(32),request_digest:randomBytes(32),evidence_digest:Buffer.alloc(32),...mutate};
  const columns=Object.keys(e),values=Object.values(e);
  // Evidence uses the database's typed JSON representation, not client date formatting.
  await c.query(`INSERT INTO highpass_v3.consent_lifecycle_events(${columns.join(',')}) SELECT `+
   columns.map(k=>k==='evidence_digest'&&!badEvidence?'highpass_v3.consent_lifecycle_evidence(to_jsonb(r))':`r.${k}`).join(',')+
   ` FROM jsonb_populate_record(NULL::highpass_v3.consent_lifecycle_events,$1::jsonb) r`,
   [JSON.stringify(Object.fromEntries(columns.map((key,i)=>[key,Buffer.isBuffer(values[i])?'\\x'+values[i].toString('hex'):values[i]])))]);
  return e;
 };
 const operation=async(pool,out,options={})=>{
  const c=await pool.connect();let phase='BEGIN';
  try{
   await c.query('BEGIN');await context(c,options.actor??(options.expiry?worker:record.actorId));
   if(options.serialized){
    // Exercise the generic-plan boundary deterministically, not only after
    // PostgreSQL happens to switch a reused function from custom to generic.
    await c.query("SET LOCAL plan_cache_mode = 'force_generic_plan'");
    if(options.onBegin)await options.onBegin(c);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
     [JSON.stringify(['HP-V3-CONSENT-LIFECYCLE',record.tenantId,record.hospitalId,out.consentId,1])]);
    const terminal=(await c.query('SELECT state FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1',[out.consentId])).rows;
    if(terminal.length){await c.query('COMMIT');return {alreadyTerminal:terminal[0].state};}
   }
   phase='EVENT';const e=await insert(c,out,options);
   if(options.omit!=='audit'){
    phase='AUDIT';
    const columns=Object.keys(e);
    await c.query(`INSERT INTO highpass_v3.consent_lifecycle_audit(${columns.join(',')}) SELECT `+
     columns.map(k=>k==='trace_id'&&options.auditMutate?"'synthetic_wrong_audit_trace'":k).join(',')+
     ' FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1',[e.event_id]);
   }
   phase='RESULT';if(options.omit!=='result')await c.query(`INSERT INTO highpass_v3.consent_lifecycle_results SELECT event_id,tenant_id,hospital_id,actor_id,
    operation,key_digest,request_digest,state,effective_at,recorded_at,evidence_digest FROM highpass_v3.consent_lifecycle_events WHERE event_id=$1`,[e.event_id]);
   phase='CASCADE';if(options.omit!=='cascade')await c.query('INSERT INTO highpass_v3.consent_lifecycle_cascade(event_id) VALUES($1)',[e.event_id]);
   if(options.beforeCommit)await options.beforeCommit(c);
   phase='COMMIT';await c.query('COMMIT');return e;
  }catch(error){
   if(options.serialized&&error.code==='42501'){
    const known=['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade','patient_refs'];
    const table=known.includes(error.table)?error.table.toUpperCase():known.find(t=>new RegExp(`\\b${t}\\b`).test(error.message??''))?.toUpperCase()??'UNKNOWN_TABLE';
    const category=error.message==='IDENTITY_AUDIT_APPEND_ONLY'?'IMMUTABLE':error.message?.includes('row-level security')?'RLS':error.message?.includes('permission denied for function')?'FUNCTION':'PERMISSION';
    throw Object.assign(Error('SAFE_FIXTURE_PHASE_ONLY'),{code:`V3_FIXTURE_EXPIRY_${phase}_${category}_${table}`});
   }
   throw error;
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
 };
 try{
  await assertion('lifecycle 027: migration rollback removes tables roles and constraint changes',async()=>{
   const c=await admin.connect();try{await c.query('BEGIN');await c.query(migration);await c.query('ROLLBACK');}finally{c.release();}
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM pg_roles WHERE rolname IN ('hp_v3_consent_withdraw_policy','hp_v3_consent_expiry_policy')")).rows[0].n,0);
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='highpass_v3' AND c.relname LIKE 'consent_lifecycle_%'")).rows[0].n,0);
  });
  await assertion('lifecycle 027: apply only owned DB and separate nonadmin NOLOGIN roles',async()=>{
   await admin.query('BEGIN');try{await admin.query(migration);await admin.query('COMMIT');}catch(e){await admin.query('ROLLBACK');throw e;}
   const r=(await admin.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('hp_v3_consent_withdraw_policy','hp_v3_consent_expiry_policy')")).rows;
   assert.equal(r.length,2);assert.ok(r.every(x=>!x.rolcanlogin&&!x.rolsuper&&!x.rolbypassrls&&!x.rolcreatedb&&!x.rolcreaterole));
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='highpass_v3' AND c.relname=ANY($1) AND c.relrowsecurity AND c.relforcerowsecurity",[tables])).rows[0].n,4);
  });
  await admin.query("UPDATE highpass_v3.principal_bindings SET scopes=array_append(scopes,'consent:withdraw') WHERE actor_id=$1",[record.actorId]);
  await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,status,service_purpose)
   VALUES($1,$2,$3,'INTERNAL_SERVICE',ARRAY['consent:expire'],'ACTIVE','CONSENT_EXPIRY')`,[worker,record.tenantId,record.hospitalId]);
  for(const [name,capability] of [['hp_lifecycle_patient_test','hp_v3_consent_withdraw_policy'],['hp_lifecycle_expiry_test','hp_v3_consent_expiry_policy']]){
   await admin.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; GRANT ${capability} TO ${name};
    GRANT USAGE ON SCHEMA highpass_v3 TO ${name}; GRANT SELECT ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals,
    highpass_v3.consent_content_versions,highpass_v3.consent_state_events TO ${name};
    GRANT SELECT,INSERT ON ${tables.map(t=>'highpass_v3.'+t).join(',')} TO ${name};
    GRANT EXECUTE ON FUNCTION highpass_v3.consent_lifecycle_context(uuid,uuid,uuid,text),highpass_v3.consent_lifecycle_evidence(jsonb) TO ${name};`);
  }
  await admin.query('GRANT SELECT ON highpass_v3.patient_refs TO hp_lifecycle_patient_test; GRANT EXECUTE ON FUNCTION highpass_v3.clinical_principal_context() TO hp_lifecycle_patient_test');
  await admin.query(`GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_lifecycle_patient_test;
   GRANT UPDATE(actor_id) ON highpass_v3.principal_bindings TO hp_lifecycle_patient_test;
   GRANT UPDATE(tenant_id) ON highpass_v3.tenants TO hp_lifecycle_patient_test;
   GRANT UPDATE(hospital_id) ON highpass_v3.hospitals TO hp_lifecycle_patient_test;`);
  patientPool=new Pool({...app.options,user:'hp_lifecycle_patient_test',password,max:2});
  expiryPool=new Pool({...app.options,user:'hp_lifecycle_expiry_test',password,max:2});
  patientPool.on('error',()=>{});expiryPool.on('error',()=>{});
  factory=createPatientWithdrawalTransactions({pool:patientPool,maxReauthAgeMs:300000});
  await assertion('withdrawal projection PG: actual private signed binding and same live transaction; copies and closed brands deny',async()=>{
   const out=await consent();let saved;
   const p=await project(out,(tx,b,c,p)=>{
    saved={tx,b,c,p};assert.equal(p.denied,false);assert.equal(assertLivePatientWithdrawalProjection(tx,b,c,p),p);
    assert.throws(()=>assertLivePatientWithdrawalProjection(tx,b,c,{...p}),x=>x.code==='V3_PATIENT_WITHDRAW_PROJECTION_REQUIRED');
   });
   assert.ok(Object.isFrozen(p));assert.throws(()=>assertLivePatientWithdrawalProjection(saved.tx,saved.b,saved.c,p),x=>x.code==='V3_PATIENT_WITHDRAW_TRANSACTION_REQUIRED');
   assert.deepEqual(await project({consentId:randomUUID()}),{denied:true,reasonCode:'CONSENT_RESOURCE_UNAVAILABLE'});
  });
  await assertion('lifecycle 027: nonowner role membership never inherits approval clinical or Session expiry',async()=>{
   for(const [pool,capability] of [[patientPool,'hp_v3_consent_withdraw_policy'],[expiryPool,'hp_v3_consent_expiry_policy']]){
    const r=(await pool.query(`SELECT NOT rolsuper AND NOT rolbypassrls AS safe,
     pg_has_role(current_user,$1,'MEMBER') AS own,
     pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER') OR pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER')
      OR pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS mixed FROM pg_roles WHERE rolname=current_user`,[capability])).rows[0];
    assert.deepEqual(r,{safe:true,own:true,mixed:false});
   }
  });
  await assertion('lifecycle 027: own nonowner withdrawal atomically preserves initial receipt and events',async()=>{
   const out=await consent(),before=(await admin.query('SELECT to_jsonb(r) AS receipt FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[out.consentId])).rows[0];
   const e=await operation(patientPool,out);
   assert.equal(e.state,'WITHDRAWN');assert.equal(e.actor_id,record.actorId);
   assert.deepEqual((await admin.query('SELECT to_jsonb(r) AS receipt FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[out.consentId])).rows[0],before);
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM highpass_v3.consent_state_events WHERE consent_id=$1',[out.consentId])).rows[0].n,2);
   await assert.rejects(()=>operation(patientPool,out),x=>x.code==='23505');
   assert.deepEqual(await project(out),{denied:true,reasonCode:'CONSENT_TERMINAL'});
  });
  for(const omit of ['audit','result','cascade'])await assertion(`lifecycle 027: missing ${omit} deferred COMMIT rolls back entire terminal assembly`,async()=>{
   const out=await consent(),before=await count();await assert.rejects(()=>operation(patientPool,out,{omit}),x=>['23514','23503'].includes(x.code));assert.equal(await count(),before);
  });
  for(const options of [{auditMutate:true},{badEvidence:true}])await assertion(`lifecycle 027: ${options.auditMutate?'swapped audit trace':'forged evidence digest'} fails COMMIT without side effects`,async()=>{
   const out=await consent(),before=await count();await assert.rejects(()=>operation(patientPool,out,options),x=>x.code==='23514');assert.equal(await count(),before);
  });
  await assertion('lifecycle 027: pool and principal capability must both match operation',async()=>{
   const out=await consent(),before=await count();
   await assert.rejects(()=>operation(expiryPool,out,{actor:record.actorId}),x=>x.code==='ERR_ASSERTION');
   await assert.rejects(()=>operation(patientPool,out,{actor:worker,expiry:true}),x=>x.code==='ERR_ASSERTION');
   assert.equal(await count(),before);
  });
  await assertion('lifecycle 027: maintenance purpose scopes cannot mix or impersonate a patient',async()=>{
   for(const [role,scopes,purpose] of [['PATIENT',['consent:expire'],null],['INTERNAL_SERVICE',['exchange:expire'],'CONSENT_EXPIRY'],
    ['INTERNAL_SERVICE',['consent:expire','exchange:expire'],'CONSENT_EXPIRY']])
    await assert.rejects(()=>admin.query('UPDATE highpass_v3.principal_bindings SET role=$2,scopes=$3,service_purpose=$4 WHERE actor_id=$1',
     [record.actorId,role,scopes,purpose]),x=>x.code==='23514');
  });
  await assertion('lifecycle 027: parent cancellation does not block own live withdrawal',async()=>{
   const c=await seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance,lifetimeSeconds:120});
   const out=await service.decide(binding(),`synthetic-lifecycle-parent-${randomUUID()}`,body(c)),client=await admin.connect();
   const event=randomUUID(),audit=randomUUID();
   try{
    await client.query('BEGIN');
    const actor=(await client.query('SELECT requester_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[c.sessionId])).rows[0].requester_id;
    await client.query("UPDATE highpass_v3.principal_bindings SET scopes=array_append(scopes,'exchange:cancel') WHERE actor_id=$1",[actor]);
    await context(client,actor);
    await client.query("UPDATE highpass_v3.exchange_sessions SET state='CANCELLED',version=2,updated_at=clock_timestamp() WHERE session_id=$1",[c.sessionId]);
    await client.query(`INSERT INTO highpass_v3.exchange_state_events(event_id,session_id,patient_ref,tenant_id,hospital_id,requester_id,actor_id,
     from_state,to_state,from_version,to_version,reason_code,audit_session_id,trace_id,occurred_at)
     SELECT $2,session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,$3,'REQUESTED','CANCELLED',1,2,
     'ADMINISTRATIVE_CANCEL',$4,'synthetic_lifecycle_cancel',updated_at FROM highpass_v3.exchange_sessions WHERE session_id=$1`,[c.sessionId,event,actor,audit]);
    await client.query(`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,
     trace_id,action,result,reason_code,session_version) VALUES($1,$2,$3,$4,$5,$6,'synthetic_lifecycle_cancel','SESSION_CANCELLED','ALLOW','ADMINISTRATIVE_CANCEL',2)`,
     [event,c.sessionId,record.tenantId,record.hospitalId,actor,audit]);
    await client.query('INSERT INTO highpass_v3.exchange_cascade_outbox(event_id) VALUES($1)',[event]);
    await client.query('INSERT INTO highpass_v3.exchange_cancel_results(tenant_id,hospital_id,actor_id,key_digest,request_digest,event_id,session_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
     [record.tenantId,record.hospitalId,actor,randomBytes(32),randomBytes(32),event,c.sessionId]);
    await client.query('COMMIT');
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
   assert.equal((await project(out)).denied,false);
   assert.equal((await operation(patientPool,out)).state,'WITHDRAWN');
  });
  for(const [label,mutate,code] of [['sequence',{event_sequence:4},'23514'],['subject',{patient_ref:randomUUID()},'42501'],
   ['source',{hospital_id:randomUUID()},'42501'],['actor',{actor_id:worker},'42501'],['role',{actor_role:'HOSPITAL_ADMIN'},'23514'],
   ['purpose',{actor_purpose:'SESSION_EXPIRY'},'23514'],['predecessor',{predecessor_id:randomUUID()},'23503'],
   ['future-time',{recorded_at:new Date(Date.now()+60000),effective_at:new Date(Date.now()+60000)},'23514']])
   await assertion(`lifecycle 027: wrong ${label} rejected without terminal side effects`,async()=>{
    const out=await consent(),before=await count();await assert.rejects(()=>operation(patientPool,out,{mutate}),x=>x.code===code);assert.equal(await count(),before);
   });
  await assertion('lifecycle 027: REJECTED predecessor cannot become WITHDRAWN',async()=>{
   const out=await consent({reject:true}),before=await count();await assert.rejects(()=>operation(patientPool,out),x=>x.code==='23503');assert.equal(await count(),before);
  });
  await assertion('lifecycle 027: target stop does not block own live withdrawal',async()=>{
   const out=await consent(),target=(await admin.query('SELECT target_hospital_id FROM highpass_v3.consent_content_versions WHERE consent_id=$1',[out.consentId])).rows[0].target_hospital_id;
   await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[target]);
   try{assert.equal((await project(out)).denied,false);assert.equal((await operation(patientPool,out)).state,'WITHDRAWN');}finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[target]);}
  });
  for(const failure of ['source','ref'])await assertion(`lifecycle 027: ${failure} unavailable never produces withdrawal success`,async()=>{
   const out=await consent(),before=await count();
   if(failure==='source')await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[record.hospitalId]);
   else await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',[record.patientRefId]);
   try{
    if(failure==='source')await assert.rejects(()=>project(out),x=>x.code==='V3_DB_PRINCIPAL_INACTIVE');
    else assert.deepEqual(await project(out),{denied:true,reasonCode:'CONSENT_RESOURCE_UNAVAILABLE'});
    await assert.rejects(()=>operation(patientPool,out),x=>failure==='source'?x.code==='ERR_ASSERTION':x.code==='23514');
   }
   finally{if(failure==='source')await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[record.hospitalId]);
    else await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[record.patientRefId]);}
   assert.equal(await count(),before);
  });
  await assertion('lifecycle 027: real maintenance actor expires past deadline; patient cannot withdraw expired content',async()=>{
   const out=await consent({short:true}),until=(await admin.query('SELECT valid_until FROM highpass_v3.consent_content_versions WHERE consent_id=$1',[out.consentId])).rows[0].valid_until;
   await admin.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.03)',[until]);
   const before=await count();await assert.rejects(()=>operation(patientPool,out),x=>x.code==='23514');assert.equal(await count(),before);
   assert.deepEqual(await project(out),{denied:true,reasonCode:'CONSENT_EXPIRED'});
   const e=await operation(expiryPool,out,{expiry:true});assert.equal(e.actor_id,worker);assert.equal(e.subject_actor_id,record.actorId);
   assert.equal(e.state,'EXPIRED');assert.equal(new Date(e.effective_at).getTime(),until.getTime());
   assert.deepEqual(await project(out),{denied:true,reasonCode:'CONSENT_TERMINAL'});
  });
  await assertion('lifecycle 027: all terminal tables reject owner mutation',async()=>{
   const before=await count();for(const t of tables){await assert.rejects(()=>admin.query(`UPDATE highpass_v3.${t} SET event_id=event_id`),x=>x.code==='42501');
    await assert.rejects(()=>admin.query(`DELETE FROM highpass_v3.${t}`),x=>x.code==='42501');}assert.equal(await count(),before);
  });
  await checkConsentWithdrawalService({admin,patientPool,expiryPool,patientBinding,record,consent,operation,assertion});
  await checkWithdrawalExpiryContention({admin,patientPool,expiryPool,patientBinding,record,worker,consent,operation,assertion});
  await checkConsentExpiryPrincipal({admin,expiryPool,patientPool,patientBinding,consent,record,worker,assertion});
 }finally{await patientPool?.end();await expiryPool?.end();}
}
