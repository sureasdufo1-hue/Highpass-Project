import {randomUUID,X509Certificate,createPrivateKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer as httpServer,request as httpRequest} from 'node:http';
import {createServer as httpsServer,request as httpsRequest,Server as HttpsServer} from 'node:https';
import {once} from 'node:events';
import {createV3PendingHttpHandler} from '../../src/v3-pending-http-handler.js';

async function waitFor(condition,timeoutMs=2000){
 const until=Date.now()+timeoutMs;while(Date.now()<until){if(await condition())return true;await new Promise(r=>setTimeout(r,20));}return false;
}
// Actual handler + registry + service + NONOWNER PG, on owned loopback ports only.
export async function checkPendingHttp({admin,registry,service,issueToken,parent,request,binding,check}){
 const count=async()=>Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_requests WHERE session_id=$1',[parent.sessionId])).rows[0].n);
 const audits=async()=>Number((await admin.query('SELECT count(*)::int n FROM highpass_v3.consent_preparation_audit_outbox')).rows[0].n);
 const body=()=>({...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()});
 const handler=createV3PendingHttpHandler({registry,service,bodyDeadlineMs:200});
 const servers=[],inflight=new Set();let aborted=0;
 function listener(req,res){
  if(req.url==='/fixture-health'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ready":true}');return;}
  req.once('aborted',()=>{aborted++;});const work=handler(req,res);inflight.add(work);void work.finally(()=>inflight.delete(work));
 }
 async function start(secure=false){
  let server;
  if(secure){
   const cert=readFileSync('tmp/certs/edge/localhost.crt'),key=readFileSync('tmp/certs/edge/localhost.key'),ca=readFileSync('tmp/certs/mtls/ca.crt');
   const leaf=new X509Certificate(cert),root=new X509Certificate(ca),now=Date.now();
   check('pending HTTPS uses valid existing development CA/server certificate and matching key',leaf.verify(root.publicKey)&&leaf.checkPrivateKey(createPrivateKey(key))
    &&Date.parse(leaf.validFrom)<=now&&now<Date.parse(leaf.validTo)&&Date.parse(root.validFrom)<=now&&now<Date.parse(root.validTo)&&leaf.checkHost('localhost')==='localhost');
   server=httpsServer({cert,key,minVersion:'TLSv1.2',handshakeTimeout:3000},listener);
  }else server=httpServer(listener);
  server.requestTimeout=5000;server.headersTimeout=3000;server.setTimeout(12000,socket=>socket.destroy());
  servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');return server;
 }
 function send(server,command,key,options={}){return new Promise((resolve,reject)=>{
  const secure=server instanceof HttpsServer,headers={'content-type':'application/json','idempotency-key':key,'if-match':'"1"',
   'x-audit-session-id':randomUUID(),authorization:`Bearer ${issueToken()}`,...options.headers};
  for(const h of options.omit??[])delete headers[h];
  const req=(secure?httpsRequest:httpRequest)({hostname:'127.0.0.1',port:server.address().port,method:options.method??'POST',
   path:options.path??`/api/v3/exchange-sessions/${parent.sessionId}/consent-preparations`,agent:false,headers,
   ...(secure?{ca:readFileSync('tmp/certs/mtls/ca.crt'),servername:'localhost'}:{}),...options.tls},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.once('end',()=>{clearTimeout(timer);req.destroy();try{
     resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(Error('SYNTHETIC_RESPONSE_INVALID'));}});
   });
  const timer=setTimeout(()=>req.destroy(Error('SYNTHETIC_HTTP_TIMEOUT')),12000);req.once('error',e=>{clearTimeout(timer);reject(e);});
  if(options.open)req.write('{"unfinished":');else req.end(JSON.stringify(command));
 });}
 try{
  const plain=await start(),original=body(),key='synthetic.transport:real-http-001';
  const first=await send(plain,original,key),retry=await send(plain,original,key);
  check('real HTTP-to-PG creates and replays exact original minimal receipt',first.status===201&&retry.status===201&&Object.keys(first.body).length===6
   &&JSON.stringify(first.body)===JSON.stringify(retry.body)&&(await count())===1);
  check('real HTTP-to-PG stale If-Match returns412 without new staging',(await send(plain,body(),'synthetic.transport:stale-001',{headers:{'if-match':'"2"'}})).status===412&&(await count())===1);
  check('real HTTP-to-PG changed command conflicts409',(await send(plain,{...original,policyVersion:'synthetic-changed'},key)).status===409&&(await count())===1);
  const beforeAuth=await audits();
  for(const [name,options,status] of [['no authentication',{omit:['authorization']},401],['wrong subject',{headers:{authorization:`Bearer ${issueToken({subject:'synthetic-unregistered'})}`}},403],
   ['wrong scope',{headers:{authorization:`Bearer ${issueToken({scope:'exchange:read'})}`}},403]])
   check(`real preparation HTTP ${name} denies before DB callback`,(await send(plain,body(),`synthetic.transport:auth-${status}-001`,options)).status===status);
  check('pre-callback HTTP denials do not fabricate domain audit or staging',(await audits())===beforeAuth&&(await count())===1);
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='SUSPENDED' WHERE actor_id=$1",[binding.actorId]);
  try{check('real HTTP-to-PG suspended actor returns403',(await send(plain,original,key)).status===403&&(await count())===1);}
  finally{await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[binding.actorId]);}
  await admin.query('REVOKE INSERT ON highpass_v3.consent_preparation_audit_outbox FROM hp_v3_pending_app');
  try{const out=await send(plain,body(),'synthetic.transport:audit-fault-001');check('real HTTP-to-PG audit storage fault503 rolls back and hides SQL',out.status===503
   &&out.body.code==='V3_DATABASE_UNAVAILABLE'&&(await count())===1&&!JSON.stringify(out.body).includes('consent_preparation'));}
  finally{await admin.query('GRANT INSERT ON highpass_v3.consent_preparation_audit_outbox TO hp_v3_pending_app');}
  const short={...request,validFrom:new Date(Date.now()+500).toISOString(),validUntil:new Date(Date.now()+1500).toISOString()},shortKey='synthetic.transport:expired-001';
  check('real HTTP-to-PG short preparation initially creates201',(await send(plain,short,shortKey)).status===201);
  check('real HTTP-to-PG expired receipt retries deny404',await waitFor(()=>Date.now()>Date.parse(short.validUntil),2500)
   &&(await send(plain,short,shortKey)).status===404&&(await count())===2);
  const beforeInput=await audits();
  check('real HTTP incomplete body408 leaves no partial assembly',(await send(plain,body(),'synthetic.transport:timeout-001',{open:true})).status===408&&(await count())===2);
  const accepted=once(plain,'request');
  const abortReq=httpRequest({host:'127.0.0.1',port:plain.address().port,method:'POST',path:`/api/v3/exchange-sessions/${parent.sessionId}/consent-preparations`,headers:{
   authorization:`Bearer ${issueToken()}`,'content-type':'application/json','idempotency-key':'synthetic.transport:abort-001','if-match':'"1"','x-audit-session-id':randomUUID()},agent:false});
  abortReq.on('error',()=>{});abortReq.write('{"unfinished":');
  let abortTimer;try{await Promise.race([accepted,new Promise((_,reject)=>{abortTimer=setTimeout(()=>{abortReq.destroy();reject(Error('SYNTHETIC_ACCEPT_TIMEOUT'));},2000);})]);abortReq.destroy();}finally{clearTimeout(abortTimer);}
  check('actual aborted HTTP input finishes without service success or domain audit',await waitFor(()=>aborted>0&&inflight.size===0)
   &&(await count())===2&&(await audits())===beforeInput);
  check('fixture readiness remains responsive after malformed input',(await send(plain,{},'synthetic.transport:health-001',{path:'/fixture-health',method:'GET'})).status===200);
  const secure=await start(true),secureBody=body();
  check('trusted hostname HTTPS reaches actual nonowner PG with201',(await send(secure,secureBody,'synthetic.transport:https-001')).status===201&&(await count())===3);
  const beforeTls=await audits();
  for(const [name,tls,codes] of [['wrong hostname',{servername:'not-localhost.invalid'},['ERR_TLS_CERT_ALTNAME_INVALID']],
   ['wrong trust anchor',{ca:readFileSync('tmp/certs/mtls/orthanc-server.crt')},['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN']]]){
   let code;try{await send(secure,body(),'synthetic.transport:tls-deny-001',{tls});}catch(e){code=e.code;}
   check(`HTTPS ${name} is certificate DENY not connection/timeout failure`,codes.includes(code));
  }
  check('failed TLS never creates application audit or staging',(await audits())===beforeTls&&(await count())===3);
 }finally{
  for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
}
