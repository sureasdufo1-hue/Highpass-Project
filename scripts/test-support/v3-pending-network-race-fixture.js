import {randomUUID,randomBytes,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {V3PendingPreparationService} from '../../src/v3-pending-service.js';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';
import {createPendingNetworkAuthority} from '../../src/v3-pending-network-context.js';
import {signIngress} from '../../src/ingress.js';

// Actual nonowner PG/COMMIT. Socket is an explicit trusted-server test double;
// actual TLS/proxy identity is proved separately by the secure-edge fixture.
export async function checkPendingNetworkRaces({admin,pool,binding,parent,request,issueToken,check}){
 const cert=new X509Certificate(readFileSync('tmp/certs/pending-edge/pending-proxy-dev.crt')),hmacKey=randomBytes(32);
 const counts=async()=> (await admin.query(`SELECT
  (SELECT count(*)::int FROM highpass_v3.consent_preparation_requests WHERE session_id=$1) preparations,
  (SELECT count(*)::int FROM highpass_v3.consent_preparation_results WHERE session_id=$1) ledger,
  (SELECT count(*)::int FROM highpass_v3.consent_preparation_audit_outbox) audits,
  (SELECT count(*)::int FROM highpass_v3.consent_preparation_network_audit) network`,[parent.sessionId])).rows[0];
 const command=()=>({...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()});
 function context(key,ageMs=0){
  const secret=randomBytes(32),authority=createPendingNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret}),
   correlation={auditSessionId:randomUUID(),traceId:randomUUID()},req={method:'POST',url:`/api/v3/exchange-sessions/${parent.sessionId}/consent-preparations`,rawHeaders:[],
    headers:{authorization:`Bearer ${issueToken()}`,'idempotency-key':key,'if-match':'"1"','x-audit-session-id':correlation.auditSessionId},
    socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({raw:cert.raw})}};
  const signed=signIngress(req,'127.0.0.1',secret,Date.now()-ageMs);Object.assign(req.headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https',
   'x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});authority.capture(req);secret.fill(0);
  return {authority,correlation,input:authority.auditInputForRequest(req,correlation,binding),expiresMs:Number(signed.timestamp)+10000};
 }
 function intercepted(hook){return {async connect(){const client=await pool.connect();return {
  async query(q){const result=await client.query(q);await hook(q);return result;},
  on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
 };}};}
 const service=source=>new V3PendingPreparationService({transactions:createPendingTransactions({pool:source}),hmacKey,maxLifetimeMs:3600000,requireNetworkAudit:true});
 const normal=service(pool);
 const prepare=(svc,key,body,c)=>svc.prepare(binding,key,parent.sessionId,'"1"',body,c.correlation,c.input);
 try{
  const key='synthetic.network:lost-ack-001',body=command(),c=context(key);let injected=false;
  const fault=service(intercepted(q=>{if(q.text==='COMMIT'&&!injected){injected=true;throw Error('SYNTHETIC_LOST_COMMIT_ACK');}}));
  const before=await counts();let code;
  try{await prepare(fault,key,body,c);}catch(e){code=e.code;}finally{fault.dispose();c.authority.dispose();}
  check('strict actual PG commits paired network audit then lost ACK is outcome unknown',code==='V3_COMMIT_OUTCOME_UNKNOWN');
  const after=await counts(),retry=context(key);let receipt;
  try{receipt=await prepare(normal,key,body,retry);}finally{retry.authority.dispose();}
  const retried=await counts();
  check('fresh network authority retry after actual lost ACK creates no duplicate preparation or ledger',after.preparations===before.preparations+1&&after.ledger===before.ledger+1
   &&after.audits===before.audits+1&&after.network===before.network+1&&retried.preparations===after.preparations&&retried.ledger===after.ledger
   &&retried.audits===after.audits+1&&retried.network===after.network+1&&receipt.state==='PENDING');
  const sameKey='synthetic.network:concurrent-001',sameBody=command(),one=context(sameKey),two=context(sameKey),beforeConcurrent=await counts();
  try{
   const [a,b]=await Promise.all([prepare(normal,sameKey,sameBody,one),prepare(normal,sameKey,sameBody,two)]),afterConcurrent=await counts();
   check('actual strict concurrent key creates one receipt with two distinct paired network events',JSON.stringify(a)===JSON.stringify(b)
    &&afterConcurrent.preparations===beforeConcurrent.preparations+1&&afterConcurrent.ledger===beforeConcurrent.ledger+1
    &&afterConcurrent.audits===beforeConcurrent.audits+2&&afterConcurrent.network===beforeConcurrent.network+2);
  }finally{one.authority.dispose();two.authority.dispose();}
  for(const stage of ['network-insert','before-commit','principal-lock']){
   const k=`synthetic.network:${stage}-dispose-001`,ctx=context(k),beforeDispose=await counts();let done=false,networkInserted=false;
   const faultService=service(intercepted(q=>{
    if(q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_network_audit'))networkInserted=true;
    const match=stage==='network-insert'?q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_network_audit')
     :stage==='principal-lock'?q.text.includes('FROM highpass_v3.principal_bindings p'):networkInserted&&q.text.startsWith('SELECT floor(extract(epoch FROM clock_timestamp())');
    if(!done&&match){done=true;ctx.authority.dispose();}
   }));
   let failure;try{await prepare(faultService,k,command(),ctx);}catch(e){failure=e.code;}finally{faultService.dispose();ctx.authority.dispose();}
   check(`actual strict ${stage} disposal denies and rolls back all paired rows`,done&&failure==='V3_PENDING_NETWORK_CONTEXT_INVALID'
    &&JSON.stringify(await counts())===JSON.stringify(beforeDispose));
  }
  const expiryKey='synthetic.network:insert-expiry-001',expiring=context(expiryKey,7000),beforeExpiry=await counts();let inserted=false;
  const expiringService=service(intercepted(async q=>{
   if(!inserted&&q.text.startsWith('INSERT INTO highpass_v3.consent_preparation_network_audit')){
    inserted=true;const deadline=Date.now()+3500;
    while(Date.now()<=expiring.expiresMs&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    if(Date.now()<=expiring.expiresMs)throw Error('SYNTHETIC_EXPIRY_WAIT_TIMEOUT');
   }
  }));
  let expiryCode;try{await prepare(expiringService,expiryKey,command(),expiring);}catch(e){expiryCode=e.code;}finally{expiringService.dispose();expiring.authority.dispose();}
  check('actual clock expiry after network INSERT rolls back all paired rows',inserted&&expiryCode==='V3_PENDING_NETWORK_CONTEXT_INVALID'
   &&JSON.stringify(await counts())===JSON.stringify(beforeExpiry));
  for(const [name,query,parameters] of [['foreign tenant',"SELECT actor_id,tenant_id,hospital_id FROM highpass_v3.principal_bindings WHERE tenant_id<>$1 AND role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') LIMIT 1",[binding.tenantId]],
   ['expiry maintenance',"SELECT actor_id,tenant_id,hospital_id FROM highpass_v3.principal_bindings WHERE role='INTERNAL_SERVICE' AND service_purpose='SESSION_EXPIRY' LIMIT 1",[]]]){
   const record=(await admin.query(query,parameters)).rows[0];check(`strict network ${name} fixture has actual registered principal`,Boolean(record));
   const client=await pool.connect();let visible;
   try{
    await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[record.tenant_id,record.hospital_id,record.actor_id]);
    visible=Number((await client.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_network_audit')).rows[0].n);
   }finally{await client.query('ROLLBACK');client.release();}
   check(`strict network ${name} cannot read source actor audit metadata`,visible===0);
  }
 }finally{normal.dispose();hmacKey.fill(0);}
}
