import {createPendingTransactions} from '../../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';

// A fixed finite test barrier; no production sleep/retry or injected policy bypass.
function barrierPool(pool,match){
 let ready,release,timer,held=false;
 const reached=new Promise(resolve=>{ready=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 return {reached,release(){clearTimeout(timer);release();},pool:{async connect(){const client=await pool.connect();return {
  async query(q){const result=await client.query(q);
   if(!held&&match(q)){held=true;ready(client.processID);await Promise.race([gate,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('SYNTHETIC_BARRIER_TIMEOUT')),3000);
   })]);clearTimeout(timer);}
   return result;
  },on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
 };}}};
}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{
 timer=setTimeout(()=>reject(Error('SYNTHETIC_BARRIER_TIMEOUT')),3000);
})]);}finally{clearTimeout(timer);}}
async function observeLock(admin,pid){
 const deadline=Date.now()+1000;
 while(Date.now()<deadline){
  const row=(await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.wait_event_type==='Lock')return true;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 return false;
}
export async function checkPendingRaces({admin,pool,binding,sessionId,request,key,service,check,lifecycle}){
 const count=async()=>Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[sessionId])).rows[0].n);
 const expected=async(code,action)=>{try{await action();return false;}catch(e){return e.code===code;}};
 for(const [scope,hospitalId,denial] of [['source',binding.hospitalId,'V3_DB_PRINCIPAL_INACTIVE'],
  ['target',request.targetHospitalId,'V3_PENDING_RESOURCE_UNAVAILABLE']]){
  const before=await count(),hold=barrierPool(pool,q=>q.text.startsWith('SELECT h.hospital_id'));
  const pending=new V3PendingPreparationService({transactions:createPendingTransactions({pool:hold.pool}),hmacKey:key,maxLifetimeMs:3600000});
  const command={...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()};
  let updateClient,updating;
  const admission=pending.prepare(binding,`synthetic.race:${scope}-suspend-001`,sessionId,'"1"',command);admission.catch(()=>{});
  try{
   await bounded(hold.reached);updateClient=await admin.connect();
   updating=updateClient.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[hospitalId]);updating.catch(()=>{});
   check(`pending ${scope} suspension actually waits on held preparation SHARE lock`,await observeLock(admin,updateClient.processID));
   hold.release();const receipt=await admission;await updating;
   check(`pending admission serializes before ${scope} suspension`,receipt.state==='PENDING'&&(await count())===before+1);
   check(`pending replay after ${scope} suspension cannot return old ALLOW`,await expected(denial,()=>service.prepare(binding,
    `synthetic.race:${scope}-suspend-001`,sessionId,'"1"',command))&&(await count())===before+1);
  }finally{
   hold.release();await admission.catch(()=>{});await updating?.catch(()=>{});updateClient?.release();pending.dispose();
   await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[hospitalId]);
  }
 }
 const before=await count(),auditsBefore=Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox')).rows[0].n);
 const hold=barrierPool(pool,q=>q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_results'));
 const pending=new V3PendingPreparationService({transactions:createPendingTransactions({pool:hold.pool}),hmacKey:key,maxLifetimeMs:3600000});
 const command={...request,validFrom:new Date(Date.now()+500).toISOString(),validUntil:new Date(Date.now()+1500).toISOString()};
 const admission=pending.prepare(binding,'synthetic.race:work-cutoff-001',sessionId,'"1"',command);admission.catch(()=>{});
 try{
  await bounded(hold.reached);
  const deadline=Date.now()+2000;while(Date.now()<deadline&&Date.now()<=Date.parse(command.validUntil))await new Promise(resolve=>setTimeout(resolve,20));
  hold.release();check('pending work crossing fixed cutoff cannot return success',await expected('V3_CONSENT_PENDING_WINDOW_INVALID',()=>admission));
  check('cutoff failure rolls back preparation children audit and original receipt',(await count())===before
   &&Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox')).rows[0].n)===auditsBefore);
 }finally{hold.release();await admission.catch(()=>{});pending.dispose();}
 if(!lifecycle)return; // callers must report this missing coverage, not full PA-08
 const cancelHold=barrierPool(pool,q=>q.text.startsWith('SELECT h.hospital_id'));
 const cancelPending=new V3PendingPreparationService({transactions:createPendingTransactions({pool:cancelHold.pool}),hmacKey:key,maxLifetimeMs:3600000});
 const cancelCommand={...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()};
 const cancelAdmission=cancelPending.prepare(binding,'synthetic.race:cancel-001',sessionId,'"1"',cancelCommand);cancelAdmission.catch(()=>{});
 let cancellation;
 try{
  await bounded(cancelHold.reached);let attempted;const lockAttempt=new Promise(resolve=>{attempted=resolve;});
  cancellation=lifecycle.cancel(sessionId,attempted);cancellation.catch(()=>{});
  const pid=await bounded(lockAttempt);
  check('actual cancellation waits on PENDING Session SHARE lock',await observeLock(admin,pid));
  cancelHold.release();const admitted=await cancelAdmission,cancelled=await cancellation;
  check('pending receipt commits before actual cancellation state event',admitted.state==='PENDING'&&cancelled.state==='CANCELLED'&&cancelled.version===2);
  check('retry after committed cancellation cannot replay old PENDING receipt',await expected('V3_PENDING_VERSION_MISMATCH',()=>service.prepare(binding,
   'synthetic.race:cancel-001',sessionId,'"1"',cancelCommand)));
 }finally{cancelHold.release();await cancelAdmission.catch(()=>{});await cancellation?.catch(()=>{});cancelPending.dispose();}
 const expiring=await lifecycle.createExpiring();
 const expiryHold=barrierPool(pool,q=>q.text.startsWith('SELECT h.hospital_id'));
 const expiryPending=new V3PendingPreparationService({transactions:createPendingTransactions({pool:expiryHold.pool}),hmacKey:key,maxLifetimeMs:3600000});
 const expiryCommand={...request,validFrom:new Date(Date.now()+500).toISOString(),validUntil:expiring.validUntil};
 const expiryAdmission=expiryPending.prepare(binding,'synthetic.race:expiry-001',expiring.sessionId,'"1"',expiryCommand);expiryAdmission.catch(()=>{});
 try{
  await bounded(expiryHold.reached);const deadline=Date.now()+2500;
  while(Date.now()<deadline&&Date.now()<=Date.parse(expiring.validUntil))await new Promise(resolve=>setTimeout(resolve,20));
  await lifecycle.expire();
  check('actual expiry SKIP LOCKED leaves held pending Session unmodified',
   (await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[expiring.sessionId])).rows.every(r=>r.state==='REQUESTED'&&r.version===1));
  expiryHold.release();check('pending request crossing parent expiry cannot admit',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>expiryAdmission));
  const batch=await lifecycle.expire();
  check('expiry after pending rollback records actual terminal event',batch.receipts.some(r=>r.sessionId===expiring.sessionId&&r.state==='EXPIRED')
   &&Number((await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED'",[expiring.sessionId])).rows[0].n)===1);
  check('post-expiry pending request remains denied without staging',await expected('V3_PENDING_RESOURCE_UNAVAILABLE',()=>service.prepare(binding,
   'synthetic.race:expiry-after-001',expiring.sessionId,'"1"',expiryCommand))
   &&Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[expiring.sessionId])).rows[0].n)===0);
 }finally{expiryHold.release();await expiryAdmission.catch(()=>{});expiryPending.dispose();}
}
