import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {V3ExchangeExpiryService} from '../../src/v3-exchange-expiry-service.js';
import {seedPatientDecisionParent} from './patient-decision-parent-fixture.js';

export async function checkPatientExpiryContention({admin,app,binding,record,preparationId,sessionId,issuance,make,body,counts,assertion,exercise}){
 const actor=randomUUID(),password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 await assertion('multisession expiry PG: separate registered maintenance capability without patient authority',async()=>{
  await admin.query("INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,service_purpose) VALUES($1,$2,$3,'INTERNAL_SERVICE',ARRAY['exchange:expire'],'SESSION_EXPIRY')",[actor,record.tenantId,record.hospitalId]);
  await admin.query(`CREATE ROLE hp_patient_expiry_test LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
   GRANT hp_v3_expiry_policy TO hp_patient_expiry_test;GRANT USAGE ON SCHEMA highpass_v3 TO hp_patient_expiry_test;
   GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_patient_expiry_test;
   GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_patient_expiry_test;
   GRANT SELECT(tenant_id,hospital_id,status) ON highpass_v3.hospitals TO hp_patient_expiry_test;
   GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_patient_expiry_test;
   GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,state,version,valid_until,updated_at) ON highpass_v3.exchange_sessions TO hp_patient_expiry_test;
   GRANT UPDATE(state,version,updated_at) ON highpass_v3.exchange_sessions TO hp_patient_expiry_test;
   GRANT SELECT(event_id,session_id,actor_id,from_state,to_state,from_version,to_version,occurred_at) ON highpass_v3.exchange_state_events TO hp_patient_expiry_test;
   GRANT SELECT(event_id,kind) ON highpass_v3.exchange_cascade_outbox TO hp_patient_expiry_test;
   GRANT INSERT ON highpass_v3.exchange_state_events,highpass_v3.exchange_cascade_outbox,highpass_v3.exchange_audit_outbox TO hp_patient_expiry_test;
   GRANT EXECUTE ON FUNCTION highpass_v3.valid_exchange_actions(text[]),highpass_v3.exchange_expirer(uuid,uuid),
    highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),highpass_v3.exchange_directory_caller() TO hp_patient_expiry_test;`);
 });
 const pool=new Pool({...app.options,user:'hp_patient_expiry_test',password,max:2,application_name:'hp-patient-expiry-fixture'});pool.on('error',()=>{});
 const identity={...record,actorId:actor,patientRefId:undefined,issuer:'synthetic-patient-expiry',subject:'SYNTH-SESSION-EXPIRY',authHospitalId:'SYNTH-A',role:'INTERNAL_SERVICE',scopes:['exchange:expire'],servicePurpose:'SESSION_EXPIRY',status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:identity.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[identity]});
 const resolve=()=>{
  const claims={iss:identity.issuer,aud:'synthetic-v3',sub:identity.subject,role:identity.role,hospitalId:identity.authHospitalId,scope:'exchange:expire',exp:Math.floor(Date.now()/1000)+180};
  const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'exchange:expire',allowedRoles:['INTERNAL_SERVICE']});
 };
 const worker=new V3ExchangeExpiryService({transactions:new V3TenantTransaction({pool,deadlineMs:8000})});
 const seed=()=>seedPatientDecisionParent({admin,binding,record,preparationId,sessionId,issuance,lifetimeSeconds:3});
 try{
  await assertion('multisession expiry PG: maintenance pool is nonowner and has no clinical or approval membership',async()=>{
   const r=(await pool.query(`SELECT r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS expiry,
    pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AS clinical,pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER') AS approval,
    has_table_privilege(current_user,'highpass_v3.consent_content_versions','INSERT') AS consent_insert FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
   assert.deepEqual(r,{rolsuper:false,rolbypassrls:false,expiry:true,clinical:false,approval:false,consent_insert:false});
  });
  await assertion('multisession expiry PG: SKIP LOCKED processes second expired Session then drains first after approval rollback',async()=>{
   const cases=await Promise.all([seed(),seed()]),before=await counts();let release,enter,timer,entryTimer,pending;
   const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{enter=r;});
   const d=make(async(q,c)=>{
    const out=await c.query(q);
    if(q.text.startsWith('INSERT INTO highpass_v3.consent_patient_decision_results')){
     enter();try{await Promise.race([gate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_EXPIRY_HOLD_TIMEOUT')),4500);})]);}finally{clearTimeout(timer);}
    }return out;
   });
   try{
    pending=d.decide(binding(),`synthetic-expiry-decision-${randomUUID()}`,body(cases[0])).then(value=>({value}),error=>({code:error.code}));
    try{await Promise.race([ready,new Promise((_,reject)=>{entryTimer=setTimeout(()=>reject(Error('FIXTURE_EXPIRY_ENTRY_TIMEOUT')),1500);})]);}finally{clearTimeout(entryTimer);}
    await admin.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.08)',[new Date(Math.max(...cases.map(c=>new Date(c.parentUntil).getTime())))]);
    await assert.rejects(()=>admin.query('SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR UPDATE NOWAIT',[cases[0].sessionId]),e=>e.code==='55P03');
    const first=await worker.expireBatch(resolve(),{limit:100});
    assert(first.receipts.some(r=>r.sessionId===cases[1].sessionId));assert(!first.receipts.some(r=>r.sessionId===cases[0].sessionId));
    release();assert.equal((await pending).code,'V3_PATIENT_CONSENT_EXPIRED');
    const second=await worker.expireBatch(resolve(),{limit:100});assert(second.receipts.some(r=>r.sessionId===cases[0].sessionId));
    assert.equal(await counts(),before);
    const rows=(await admin.query(`SELECT session_id,state,version,(SELECT count(*)::integer FROM highpass_v3.exchange_state_events e WHERE e.session_id=s.session_id AND e.to_state='EXPIRED' AND e.actor_id=$2) AS events,
     (SELECT count(*)::integer FROM highpass_v3.exchange_audit_outbox a JOIN highpass_v3.exchange_state_events e USING(event_id)
      WHERE e.session_id=s.session_id AND e.to_state='EXPIRED' AND a.actor_id=$2 AND a.action='SESSION_EXPIRED') AS audits,
     (SELECT count(*)::integer FROM highpass_v3.exchange_cascade_outbox o JOIN highpass_v3.exchange_state_events e USING(event_id)
      WHERE e.session_id=s.session_id AND e.to_state='EXPIRED' AND o.kind='EXPIRY_REQUESTED') AS cascades
     FROM highpass_v3.exchange_sessions s WHERE session_id=ANY($1::uuid[])`,[cases.map(c=>c.sessionId),actor])).rows;
    assert.equal(rows.length,2);assert(rows.every(r=>r.state==='EXPIRED'&&r.version===2&&r.events===1&&r.audits===1&&r.cascades===1));
    assert.equal((await worker.expireBatch(resolve(),{limit:100})).processed,0);
   }finally{release();if(pending)await pending;d.dispose();}
  });
  if(exercise)await exercise({worker,expiryBinding:resolve,actor});
 }finally{await worker.close();await pool.end();}
}
