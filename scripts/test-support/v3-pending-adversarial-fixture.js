import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';

async function enroll(admin,source,role,patientRefId=null){
 const record={actorId:randomUUID(),tenantId:source.tenantId,hospitalId:source.hospitalId,role,patientRefId,
  scopes:['consent:write'],status:'ACTIVE',issuer:'synthetic-pending-adversarial',subject:randomUUID(),authHospitalId:'SYNTHETIC'};
 await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref)
  VALUES($1,$2,$3,$4,$5,'ACTIVE',$6)`,[record.actorId,record.tenantId,record.hospitalId,role,record.scopes,patientRefId]);
 return bind(record);
}
function bind(record){
 const secret=randomBytes(32).toString('hex'),issuer='synthetic-pending-adversarial';
 record={...record,issuer,subject:record.subject??randomUUID(),authHospitalId:'SYNTHETIC',scopes:['consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const data=[{alg:'HS256'},{iss:issuer,aud:'synthetic',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
  scope:'consent:write',doctorId:'SYNTHETIC-DOCTOR',patientId:'SYNTHETIC-PATIENT',exp:Math.floor(Date.now()/1000)+120}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:'consent:write',allowedRoles:['PATIENT','DOCTOR','HOSPITAL_ADMIN']});
}
export async function checkPendingAdversarial({admin,pool,binding,sessionId,request,first,key,service,transactions,check}){
 const count=async()=>Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[sessionId])).rows[0].n);
 const initial=await count(),future=()=>({...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()});
 const expected=async(code,action)=>{try{await action();return false;}catch(e){return e.code===code;}};
 let ordinal=0;
 const prepare=(actor,body=future())=>service.prepare(actor,`synthetic.adversarial:${++ordinal}`,sessionId,'"1"',body);
 for(const [label,patch] of [['source hospital',{sourceHospitalId:randomUUID()}],['patient reference',{patientRefId:randomUUID()}],
  ['purpose',{purpose:'RESEARCH'}],['action',{allowedActions:['study:mobile-export']}],
  ['Series',{resources:[{studyInstanceUid:request.resources.find(r=>r.seriesInstanceUids)?.studyInstanceUid,seriesInstanceUids:['1.2.999.999']}]}]]){
  check(`actual pending ${label} expansion or mismatch commits safe denial`,await expected('V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID',()=>prepare(binding,{...future(),...patch}))&&(await count())===initial);
 }
 check('missing Session prepare commits uniform safe404',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>service.prepare(binding,
  'synthetic.adversarial:missing-001',randomUUID(),'"1"',future()))&&(await count())===initial);
 const targetTenant=(await admin.query('SELECT target_tenant_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0].target_tenant_id;
 for(const [label,id] of [['source',binding.tenantId],['target',targetTenant]]){
  await admin.query("UPDATE highpass_v3.tenants SET status='SUSPENDED' WHERE tenant_id=$1",[id]);
  try{check(`actual suspended ${label} tenant cannot prepare`,await expected(label==='source'?'V3_DB_PRINCIPAL_INACTIVE':'V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare(binding))&&(await count())===initial);}
  finally{await admin.query("UPDATE highpass_v3.tenants SET status='ACTIVE' WHERE tenant_id=$1",[id]);}
 }
 await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',[request.patientRefId]);
 try{check('actual deleted PatientRef prepare denies without staging',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare(binding))&&(await count())===initial);}
 finally{await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[request.patientRefId]);}
 // Send altered assembly to the REAL nonowner PostgreSQL connection. No mock DENY.
 for(const mode of ['scope digest','foreign patient FK','creation audit timestamp']){
  const alteredPool={async connect(){const client=await pool.connect();return {
   async query(q){let changed=q;
    if(q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_requests')){
     if(mode==='scope digest'){const values=[...q.values];values[7]=randomBytes(32);changed={...q,values};}
     if(mode==='foreign patient FK')changed={...q,text:q.text.replace('SELECT $1,session_id,version,patient_ref,','SELECT $1,session_id,version,$14::uuid,'),values:[...q.values,randomUUID()]};
    }
    if(mode==='creation audit timestamp'&&q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_audit_outbox')&&q.text.includes('THEN created_at'))
     changed={...q,text:q.text.replace('THEN created_at ELSE',"THEN created_at+interval '1 second' ELSE")};
    return client.query(changed);
   },on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
  };}};
  const altered=new V3PendingPreparationService({transactions:createPendingTransactions({pool:alteredPool}),hmacKey:key,maxLifetimeMs:3600000});
  try{check(`actual admitted assembly rejects forged ${mode}`,await expected(mode==='foreign patient FK'?'V3_DATABASE_UNAVAILABLE':'V3_COMMIT_OUTCOME_UNKNOWN',()=>altered.prepare(binding,
   `synthetic.adversarial:assembly-${++ordinal}`,sessionId,'"1"',future()))&&(await count())===initial);}
  finally{altered.dispose();}
 }
 const maintenance=randomUUID();
 await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,service_purpose)
  VALUES($1,$2,$3,'INTERNAL_SERVICE',ARRAY['exchange:expire'],'SESSION_EXPIRY')`,[maintenance,binding.tenantId,binding.hospitalId]);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[binding.tenantId,binding.hospitalId,maintenance]);
  const visible=(await client.query(`SELECT (SELECT count(*) FROM highpass_v3.consent_preparation_requests) requests,
   (SELECT count(*) FROM highpass_v3.consent_preparation_results) results,(SELECT count(*) FROM highpass_v3.consent_preparation_audit_outbox) audits`)).rows[0];
  check('maintenance context with pending SQL capability cannot read staging receipt or audit',Object.values(visible).every(n=>Number(n)===0));
 }finally{await client.query('ROLLBACK');client.release();}
 for(const table of ['consent_preparation_scopes','consent_preparation_actions']){
  await admin.query(`REVOKE INSERT ON highpass_v3.${table} FROM hp_v3_pending_app`);
  try{check(`pending actual ${table} INSERT fault rolls back all rows`,await expected('V3_DATABASE_UNAVAILABLE',()=>prepare(binding))&&(await count())===initial);}
  finally{await admin.query(`GRANT INSERT ON highpass_v3.${table} TO hp_v3_pending_app`);}
 }
 check('pending no-context pooled client cannot read staging or receipt',
  Number((await pool.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests')).rows[0].n)===0
  &&Number((await pool.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_results')).rows[0].n)===0);
 check('pending direct SQL forged audit actor is refused',await expected('V3_DATABASE_UNAVAILABLE',()=>transactions.run(binding,'consent:write',tx=>tx.query(`
  INSERT INTO highpass_v3.consent_preparation_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code)
  VALUES($1,$2,$3,$4,$5,'synthetic_forged_actor','PREPARATION_DENIED','DENY','SCOPE_DENIED')`,
  [randomUUID(),binding.tenantId,binding.hospitalId,randomUUID(),randomUUID()]))));
 check('pending admitted role cannot COMMIT an incomplete cloned request',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>transactions.run(binding,'consent:write',tx=>tx.query(`
  INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,
   target_tenant_id,target_hospital_id,actor_id,purpose,valid_from,valid_until,policy_version,submitted_evidence_commitment,resource_snapshot_digest,
   resource_count,action_count,creation_event_id,audit_session_id,trace_id)
  SELECT $1,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,actor_id,purpose,
   clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '60 seconds',policy_version,submitted_evidence_commitment,resource_snapshot_digest,
   resource_count,action_count,$2,$3,'synthetic_partial_assembly' FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$4`,
  [randomUUID(),randomUUID(),randomUUID(),first.preparationId])))&&(await count())===initial);
 check('pending direct SQL cannot append a scope to sealed preparation',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>transactions.run(binding,'consent:write',tx=>tx.query(`
  INSERT INTO highpass_v3.consent_preparation_scopes VALUES($1,99,'1.2.999.9',true,NULL)`,[first.preparationId]))));
 await admin.query('GRANT UPDATE,DELETE ON highpass_v3.consent_preparation_requests TO hp_v3_pending_app');
 try{
  const changes=await transactions.run(binding,'consent:write',async tx=>[
   (await tx.query("UPDATE highpass_v3.consent_preparation_requests SET policy_version='FORGED' WHERE preparation_id=$1",[first.preparationId])).rowCount,
   (await tx.query('DELETE FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1',[first.preparationId])).rowCount]);
  check('pending UPDATE and DELETE remain RLS denied despite temporary privileges',changes.every(n=>n===0));
 }finally{await admin.query('REVOKE UPDATE,DELETE ON highpass_v3.consent_preparation_requests FROM hp_v3_pending_app');}
 const otherDoctor=await enroll(admin,binding,'DOCTOR');
 check('other source doctor cannot prepare another requester Session',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare(otherDoctor)));
 const target=(await admin.query('SELECT target_tenant_id,target_hospital_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0];
 const foreign=await enroll(admin,{tenantId:target.target_tenant_id,hospitalId:target.target_hospital_id},'HOSPITAL_ADMIN');
 check('destination INVITED actor cannot prepare source Session',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare(foreign)));
 check('foreign actor and own-institution other actor cannot enumerate original receipt',
  (await Promise.all([foreign,otherDoctor].map(actor=>transactions.run(actor,'consent:write',tx=>tx.query(
   'SELECT preparation_id FROM highpass_v3.consent_preparation_results WHERE preparation_id=$1',[first.preparationId]))))).every(r=>r.rows.length===0));
 const patient=await enroll(admin,binding,'PATIENT',request.patientRefId);
 const patientReceipt=await prepare(patient);
 check('bound patient can stage provider Session without approving it',patientReceipt.state==='PENDING'&&patientReceipt.evidenceStatus==='UNVERIFIED');
 const otherRef=(await admin.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref<>$1 AND deleted_at IS NULL LIMIT 1',[request.patientRefId])).rows[0]?.patient_ref;
 if(!otherRef)throw Error('SYNTHETIC_OTHER_REF_REQUIRED');
 const wrongPatient=await enroll(admin,binding,'PATIENT',otherRef);
 check('wrong bound patient cannot stage another patient Session',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare(wrongPatient)));
 const original=(await admin.query('SELECT role FROM highpass_v3.principal_bindings WHERE actor_id=$1',[binding.actorId])).rows[0].role;
 await admin.query("UPDATE highpass_v3.principal_bindings SET role='DOCTOR' WHERE actor_id=$1",[binding.actorId]);
 try{
  const doctor=bind({...binding,role:'DOCTOR'}),doctorReceipt=await prepare(doctor);
  check('actual requester doctor can create PENDING without patient approval',doctorReceipt.state==='PENDING'&&doctorReceipt.evidenceStatus==='UNVERIFIED');
 }finally{await admin.query('UPDATE highpass_v3.principal_bindings SET role=$2 WHERE actor_id=$1',[binding.actorId,original]);}
 await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[patient.actorId]);
 check('revoked persisted patient denied before callback without new staging',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>prepare(patient))&&(await count())===initial+2);
}
