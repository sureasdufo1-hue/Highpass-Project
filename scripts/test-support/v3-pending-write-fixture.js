import {randomBytes,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';
import {checkPendingAdversarial} from './v3-pending-adversarial-fixture.js';
import {checkPendingRaces} from './v3-pending-race-fixture.js';

export async function checkPendingWrite({admin,pool,binding,sessionId,check,lifecycle}){
 await admin.query(`GRANT SELECT,INSERT ON highpass_v3.consent_preparation_requests,highpass_v3.consent_preparation_scopes,
  highpass_v3.consent_preparation_actions,highpass_v3.consent_preparation_audit_outbox,highpass_v3.consent_preparation_results TO hp_v3_pending_app;
  GRANT EXECUTE ON FUNCTION highpass_v3.pending_actor_context(uuid,uuid,uuid),highpass_v3.pending_scope_digest(uuid),
   highpass_v3.valid_exchange_series(text[]) TO hp_v3_pending_app;`);
 const transactions=createPendingTransactions({pool}),key=randomBytes(32),service=new V3PendingPreparationService({transactions,hmacKey:key,maxLifetimeMs:3600000});
 const s=(await admin.query('SELECT patient_ref,source_hospital_id,target_hospital_id,purpose,requested_actions FROM highpass_v3.exchange_sessions WHERE session_id=$1',[sessionId])).rows[0];
 const rows=(await admin.query('SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1 ORDER BY ordinal',[sessionId])).rows;
 const resources=rows.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
 const request={patientRefId:s.patient_ref,sourceHospitalId:s.source_hospital_id,targetHospitalId:s.target_hospital_id,purpose:s.purpose,
  allowedActions:[s.requested_actions[0]],state:'PENDING',validFrom:new Date(Date.now()+1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),
  resources,policyVersion:'synthetic-v1',evidenceDigest:'SYNTHETIC_UNVERIFIED_EVIDENCE_'.padEnd(64,'X')};
 const count=async()=>Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[sessionId])).rows[0].n);
 const expected=async(code,fn)=>{try{await fn();return false;}catch(e){return e.code===code;}};
 const prepare=(k=request.policyVersion,body=request,version='"1"')=>service.prepare(binding,`synthetic.pending:${k}`,sessionId,version,body);
 try{
  const first=await prepare('control-001');
  check('nonowner PENDING create persists canonical assembly and minimal receipt',first.state==='PENDING'&&first.evidenceStatus==='UNVERIFIED'
   &&Object.keys(first).length===6&&(await count())===1);
  check('nonowner replay returns exact original immutable receipt',isDeepStrictEqual(first,await prepare('control-001')));
  check('same key changed payload commits safe conflict',await expected('V3_PENDING_IDEMPOTENCY_CONFLICT',()=>prepare('control-001',{...request,policyVersion:'synthetic-v2'})));
  const audit=(await admin.query("SELECT action,result,reason_code,session_id,preparation_id FROM highpass_v3.consent_preparation_audit_outbox ORDER BY occurred_at,event_id")).rows;
  check('actual created replayed and conflict audit all persist',audit.some(r=>r.action==='PREPARATION_CREATED')&&audit.some(r=>r.action==='PREPARATION_REPLAYED')
   &&audit.some(r=>r.reason_code==='IDEMPOTENCY_CONFLICT'&&r.session_id===null&&r.preparation_id===null));
  check('stale version is audited denial without extra staging',await expected('V3_PENDING_VERSION_MISMATCH',()=>prepare('stale-001',request,'"2"'))&&(await count())===1);
  check('wrong target is safe scope denial',await expected('V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID',()=>prepare('target-001',{...request,targetHospitalId:randomUUID()})));
  check('outside Study is audited denial',await expected('V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID',()=>prepare('scope-001',{...request,resources:[{studyInstanceUid:'1.2.999.1'}]})));
  check('fresh elapsed start is audited denial',await expected('V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID',()=>prepare('elapsed-fresh-001',{...request,validFrom:new Date(Date.now()-1000).toISOString()})));
  const restarted=new V3PendingPreparationService({transactions,hmacKey:key,maxLifetimeMs:3600000});
  try{check('recreated coordinator reads original ledger receipt',isDeepStrictEqual(first,await restarted.prepare(binding,'synthetic.pending:control-001',sessionId,'"1"',request)));}
  finally{restarted.dispose();}
  const deadline=Date.now()+5000;while(Date.now()<deadline&&Date.now()<Date.parse(request.validFrom))await new Promise(r=>setTimeout(r,25));
  check('started original window replay remains exact',Date.now()>=Date.parse(request.validFrom)&&isDeepStrictEqual(first,await prepare('control-001')));
  const raw=(await admin.query('SELECT to_jsonb(r)::text raw FROM highpass_v3.consent_preparation_requests r WHERE session_id=$1',[sessionId])).rows;
  check('submitted unverified evidence string never persisted in staging',raw.every(r=>!r.raw.includes(request.evidenceDigest)));
  check('parent remains REQUESTED version1 and destination INVITED',
   (await admin.query("SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1",[sessionId])).rows.every(r=>r.state==='REQUESTED'&&r.version===1)
   &&(await admin.query("SELECT status FROM highpass_v3.exchange_session_participants WHERE session_id=$1 AND participant_role='DESTINATION'",[sessionId])).rows.every(r=>r.status==='INVITED'));
  const future=()=>({...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()});
  const concurrentRequest=future();
  const both=await Promise.all([prepare('concurrent-001',concurrentRequest),prepare('concurrent-001',concurrentRequest)]);
  check('two pending PG sessions create exactly one preparation and original receipt',isDeepStrictEqual(both[0],both[1])&&(await count())===2);
  let lostAck=true;
  const ackPool={async connect(){const client=await pool.connect();return {
   async query(q){const result=await client.query(q);if(lostAck&&q.text==='COMMIT'){lostAck=false;throw new Error('SYNTHETIC_LOST_ACK');}return result;},
   on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
  };}};
  const ackService=new V3PendingPreparationService({transactions:createPendingTransactions({pool:ackPool}),hmacKey:key,maxLifetimeMs:3600000});
  const ackRequest=future();
  try{check('pending real COMMIT then lost ACK reports outcome unknown',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>ackService.prepare(binding,'synthetic.pending:lost-ack-001',sessionId,'"1"',ackRequest))&&(await count())===3);}
  finally{ackService.dispose();}
  const recovered=await prepare('lost-ack-001',ackRequest);
  check('pending lost ACK retry returns committed receipt without duplicate creation',typeof recovered.preparationId==='string'&&(await count())===3
   &&Number((await admin.query("SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox WHERE preparation_id=$1 AND action='PREPARATION_CREATED'",[recovered.preparationId])).rows[0].n)===1);
  const shortRequest={...request,validFrom:new Date(Date.now()+500).toISOString(),validUntil:new Date(Date.now()+1500).toISOString()};
  const short=await prepare('expired-retry-001',shortRequest);
  const expiryDeadline=Date.now()+3000;
  while(Date.now()<expiryDeadline&&Date.now()<=Date.parse(shortRequest.validUntil))await new Promise(r=>setTimeout(r,25));
  check('expired pending retry refuses old receipt and commits window denial',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>prepare('expired-retry-001',shortRequest))
   &&Number((await admin.query("SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox WHERE action='PREPARATION_DENIED' AND reason_code='WINDOW_DENIED'")).rows[0].n)>=1);
  check('expired retry keeps immutable original preparation without new creation',(await count())===4
   &&Number((await admin.query("SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox WHERE preparation_id=$1 AND action='PREPARATION_CREATED'",[short.preparationId])).rows[0].n)===1);
  await admin.query('REVOKE INSERT ON highpass_v3.consent_preparation_audit_outbox FROM hp_v3_pending_app');
  try{check('actual audit INSERT fault rolls back entire preparation',await expected('V3_DATABASE_UNAVAILABLE',()=>prepare('audit-fault-001',future()))&&(await count())===4);}
  finally{await admin.query('GRANT INSERT ON highpass_v3.consent_preparation_audit_outbox TO hp_v3_pending_app');}
  await admin.query('REVOKE INSERT ON highpass_v3.consent_preparation_results FROM hp_v3_pending_app');
  try{check('actual ledger INSERT fault rolls back assembly and creation audit',await expected('V3_DATABASE_UNAVAILABLE',()=>prepare('ledger-fault-001',future()))&&(await count())===4);}
  finally{await admin.query('GRANT INSERT ON highpass_v3.consent_preparation_results TO hp_v3_pending_app');}
  const beforeAudit=Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox')).rows[0].n);
  check('faulted assemblies leave no extra creation events',Number((await admin.query("SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox WHERE action='PREPARATION_CREATED'")).rows[0].n)===4&&beforeAudit>=4);
  await checkPendingAdversarial({admin,pool,binding,sessionId,request,first,key,service,transactions,check});
  await checkPendingRaces({admin,pool,binding,sessionId,request,key,service,check,lifecycle});
 }finally{service.dispose();key.fill(0);}
}
