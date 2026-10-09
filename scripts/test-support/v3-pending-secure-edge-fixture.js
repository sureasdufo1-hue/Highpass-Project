import {randomUUID,randomBytes,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer,request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {createV3PendingCapstoneEdge} from '../../src/v3-pending-secure-edge.js';
import {signIngress} from '../../src/ingress.js';
import {createSyntheticPreauthObserver} from '../../src/v3-preauth-security-events.js';
import {createPreauthHttpFixture} from './v3-preauth-http-fixture.js';

// Owned actual TLS backend and nonowner PostgreSQL. No deployment activation.
export async function checkPendingSecureEdge({admin,base,registry,service,issueToken,parent,request,check}){
 const read=name=>readFileSync(`tmp/certs/${name}`),secret=randomBytes(32);
 const preauthHttp=await createPreauthHttpFixture({admin,base,check});
 let edge,server,front;
 try{
 edge=createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry,service,ingressSecret:secret,bodyDeadlineMs:200,preauthObserver:preauthHttp.edgeObserver});
 let callbacks=0;const tlsFailures=[];
 const preauthObserver=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 const preauthEvents=[],preauthOutcomes=[];
 const preauthSink=preauthObserver.createTestSink({send:async event=>{preauthEvents.push(event);}});
 server=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt'),
  requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2',handshakeTimeout:3000},(req,res)=>{callbacks++;void edge.handle(req,res);});
 server.on('tlsClientError',(error,socket)=>{
  tlsFailures.push({code:error.code,authorizationError:socket.authorizationError});
  preauthOutcomes.push(preauthSink.record(preauthObserver.captureTlsFailure(socket,error)));
 });
 server.requestTimeout=5000;server.headersTimeout=3000;server.setTimeout(12000,socket=>socket.destroy());
 front=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),minVersion:'TLSv1.2',handshakeTimeout:3000},(req,res)=>{
  if(req.url==='/synthetic-preauth-health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('{}');return;}
  const headers={...req.headers};
  for(const name of ['x-forwarded-for','x-forwarded-proto','x-hipass-ingress-time','x-hipass-ingress-signature'])delete headers[name];
  const ip=req.socket.remoteAddress,signed=signIngress({method:req.method,url:req.url,headers},ip,secret);
  Object.assign(headers,{'x-forwarded-for':ip,'x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
  const upstream=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:req.url,method:req.method,headers,
   ca:read('mtls/ca.crt'),cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key'),
   rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  let bytes=0;
  const timer=setTimeout(()=>upstream.destroy(Error('SYNTHETIC_PROXY_TIMEOUT')),10000);
  const fail=()=>{if(!res.headersSent){res.writeHead(503,{'content-type':'application/problem+json','cache-control':'no-store'});res.end('{"code":"SYNTHETIC_PROXY_UNAVAILABLE"}');}else res.destroy();};
  upstream.on('error',fail);req.on('error',()=>upstream.destroy());req.once('aborted',()=>upstream.destroy());
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>4194304){upstream.destroy();req.destroy();}});
  res.once('close',()=>{clearTimeout(timer);upstream.destroy();});req.pipe(upstream);
 });
 front.requestTimeout=5000;front.headersTimeout=3000;front.setTimeout(12000,socket=>socket.destroy());
 const route=`/api/v3/exchange-sessions/${parent.sessionId}/consent-preparations`;
 let command;
 const freshCommand=()=>({...request,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()});
 const counts=async()=>{
  const result=await admin.query('SELECT (SELECT count(*)::int FROM highpass_v3.consent_preparation_requests WHERE session_id=$1) preparations,(SELECT count(*)::int FROM highpass_v3.consent_preparation_results WHERE session_id=$1) ledger,(SELECT count(*)::int FROM highpass_v3.consent_preparation_audit_outbox) audits,(SELECT count(*)::int FROM highpass_v3.consent_preparation_network_audit) network',[parent.sessionId]);
  return result.rows[0];
 };
 function send(options={}){return new Promise((resolve,reject)=>{
  const headers={authorization:`Bearer ${issueToken({subject:options.subject,assurance:options.assurance??{acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true}})}`,
   'content-type':'application/json','idempotency-key':options.key??'synthetic.secure-edge:actual-pg-001','if-match':'"1"','x-audit-session-id':randomUUID()};
  const signed=signIngress({method:'POST',url:route,headers},'127.0.0.1',secret,options.time??Date.now());
  Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature},options.headers);
  for(const h of options.omit??[])delete headers[h];
  const client=options.frontend||options.client===null?{}:options.client??{cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')};
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:(options.frontend?front:server).address().port,path:options.path??route,method:'POST',headers,
   ca:read('mtls/ca.crt'),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,...client},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>{
     clearTimeout(timer);req.destroy();try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))});}catch{reject(Error('SYNTHETIC_RESPONSE_INVALID'));}
    });
   });
  const timer=setTimeout(()=>req.destroy(Error('SYNTHETIC_SECURE_EDGE_TIMEOUT')),12000);
  req.on('error',e=>{clearTimeout(timer);reject(e);});req.end(JSON.stringify(options.command??command));
 });}
  server.listen(0,'127.0.0.1');await once(server,'listening');
  front.listen(0,'127.0.0.1');await once(front,'listening');
  command=freshCommand();
  const before=await counts(),first=await send(),retry=await send(),after=await counts();
  check('actual dedicated mTLS ingress mock-MFA to nonowner PG creates201 and exact retry201',first.status===201&&retry.status===201
   &&Object.keys(first.body).length===6&&JSON.stringify(first.body)===JSON.stringify(retry.body)&&after.preparations===before.preparations+1&&after.network===before.network+2);
  const frontend={frontend:true,key:'synthetic.secure-edge:frontend-pg-001',command:freshCommand()},proxyFirst=await send({...frontend,headers:{
   'x-forwarded-for':'192.0.2.100','x-forwarded-proto':'http','x-hipass-ingress-time':'1234567890000','x-hipass-ingress-signature':'SYNTHETIC-SPOOF'}}),proxyRetry=await send(frontend);
  let afterProxy=await counts();
  check(`complete proxy initial HTTP status ${Number(proxyFirst.status)} is201`,proxyFirst.status===201);
  check(`complete proxy retry HTTP status ${Number(proxyRetry.status)} is201`,proxyRetry.status===201);
  check('complete actual HTTPS proxy mTLS backend nonowner PG creates and replays original receipt despite spoofed ingress',proxyFirst.status===201&&proxyRetry.status===201
   &&JSON.stringify(proxyFirst.body)===JSON.stringify(proxyRetry.body)&&afterProxy.preparations===after.preparations+1&&afterProxy.network===after.network+2);
  const leaf=new X509Certificate(read('pending-edge/pending-proxy-dev.crt'));
  const rows=(await admin.query(`SELECT host(n.source_ip) ip,encode(n.proxy_certificate_sha256,'hex') fingerprint
   FROM highpass_v3.consent_preparation_network_audit n JOIN highpass_v3.consent_preparation_audit_outbox e ON e.event_id=n.event_id
   WHERE e.preparation_id=$1`,[proxyFirst.body.preparationId])).rows;
  check('actual strict proxy stores current authoritative IP and public proxy fingerprint for create and replay',rows.length===2
   &&rows.every(row=>row.ip==='127.0.0.1'&&row.fingerprint===leaf.fingerprint256.replaceAll(':','').toLowerCase()));
  await admin.query(`REVOKE INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
   ON highpass_v3.consent_preparation_network_audit FROM hp_v3_pending_app`);
  try{
   const fault=await send({...frontend,key:'synthetic.secure-edge:network-fault-001',command:{...command,validFrom:new Date(Date.now()+2000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()}});
   check('strict network insertion fault503 rolls back preparation domain event ledger and network row',fault.status===503&&JSON.stringify(await counts())===JSON.stringify(afterProxy));
  }finally{await admin.query(`GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
   ON highpass_v3.consent_preparation_network_audit TO hp_v3_pending_app`);}
  const denied=await send({...frontend,key:'synthetic.secure-edge:domain-deny-001',headers:{'if-match':'"2"'}}),afterDenied=await counts();
  check('strict actual domain denial412 persists its paired network audit without new preparation',denied.status===412
   &&afterDenied.preparations===afterProxy.preparations&&afterDenied.audits===afterProxy.audits+1&&afterDenied.network===afterProxy.network+1);
  afterProxy=afterDenied;
  for(const [name,options] of [['missing mock assurance',{assurance:{}}],['unknown principal',{subject:'synthetic-unregistered'}],
   ['missing authorization',{omit:['authorization']}]] ){
   check(`complete proxy PG ${name} denies403`,(await send({...frontend,...options})).status===403);
   await preauthHttp.settleNext();
  }
  for(const [name,options] of [['missing ingress',{omit:['x-hipass-ingress-signature']}],['forged ingress',{headers:{'x-hipass-ingress-signature':'SYNTHETIC-FORGERY'}}],
   ['stale ingress',{time:Date.now()-11000}],['missing mock-MFA',{assurance:{}}],['single-factor mock-MFA',{assurance:{acr:'urn:highpass:capstone:mock-mfa',amr:['pwd'],highpass_test_assurance:true}}],
   ['wrong trusted certificate role',{client:{cert:read('mtls/gateway-client.crt'),key:read('mtls/gateway-client.key')}}]]){
   check(`actual secure preparation ${name} denies403 before persistence`,(await send(options)).status===403);
   await preauthHttp.settleNext();
  }
  check('actual HTTP spoofed forwarded IP denied before preparation',(await send({headers:{'x-forwarded-for':'192.0.2.123'}})).status===403);
  await preauthHttp.settleNext();
  await preauthHttp.checkRecorded();
  await preauthHttp.checkFailure(()=>send({...frontend,assurance:{}}));
  await preauthHttp.checkOutages({sendDenied:()=>send({...frontend,assurance:{}}),
   sendHealthy:()=>send({frontend:true,path:'/synthetic-preauth-health'}),domainCounts:counts});
  for(const [name,client] of [['no certificate',null],['untrusted certificate',{cert:read('generated-fixtures/untrusted-client/untrusted-client.crt'),key:read('generated-fixtures/untrusted-client/untrusted-client.key')}],
   ['expired certificate',{cert:read('bad/bad.crt'),key:read('bad/bad.key')}]] ){
   const beforeFailures=tlsFailures.length,beforeCallbacks=callbacks;
   let code;try{await send({client});}catch(e){code=e.code;}
   const until=Date.now()+2000;while(tlsFailures.length===beforeFailures&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
   check(`actual secure preparation ${name} TLS DENY not DNS/refused/timeout`,['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
    'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE','ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED','ECONNRESET','ERR_SSL_TLSV1_ALERT_ACCESS_DENIED'].includes(code));
   check(`actual secure preparation ${name} server rejects TLS without HTTP callback`,callbacks===beforeCallbacks&&tlsFailures.length>beforeFailures);
   const failure=tlsFailures.at(-1);
   check(`actual secure preparation ${name} server records certificate authentication failure`,
    ['ERR_SSL_PEER_DID_NOT_RETURN_A_CERTIFICATE','ERR_SSL_CERTIFICATE_VERIFY_FAILED'].includes(failure?.code)
    ||['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(failure?.authorizationError));
   if(name==='expired certificate')check('expired negative fixture has past validity end',Date.now()>=Date.parse(new X509Certificate(client.cert).validTo));
   const outcome=await preauthOutcomes.at(-1),event=preauthEvents.at(-1);
   check(`actual ${name} TLS event recorded test only with safe reason ${event?.reasonCode??'MISSING'}`,
    outcome==='RECORDED_TEST_ONLY'&&event?.stage==='TLS'&&event.result==='DENY'
    &&event.sourceKind==='IMMEDIATE_SOCKET'&&(event.sourceIp===null||event.sourceIp==='127.0.0.1')
    &&Object.keys(event).length===8);
  }
  const final=await counts();check('secure-edge pre-callback denials create no preparation or fabricated domain audit',JSON.stringify(final)===JSON.stringify(afterProxy));
 }finally{
  try{
   front?.closeAllConnections();if(front?.listening)await new Promise(resolve=>front.close(resolve));
   edge?.dispose();server?.closeAllConnections();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  }finally{secret.fill(0);await preauthHttp.dispose();}
 }
}
