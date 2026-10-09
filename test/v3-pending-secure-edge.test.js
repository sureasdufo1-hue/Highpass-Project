import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHmac,X509Certificate,createPrivateKey} from 'node:crypto';
import {createServer,request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPendingTransactions} from '../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../src/v3-pending-service.js';
import {createV3PendingCapstoneEdge,PENDING_PROXY_SAN} from '../src/v3-pending-secure-edge.js';
import {signIngress} from '../src/ingress.js';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';

const read=name=>readFileSync(new URL(`../tmp/certs/${name}`,import.meta.url));
// Actual TLS/registry/ingress, mocked preparation persistence: NOT PostgreSQL evidence.
async function fixture(t,preauthObserver){
 const secret=randomBytes(32),jwtSecret=randomBytes(32).toString('hex');
 const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),role:'HOSPITAL_ADMIN',
  issuer:'synthetic-secure-edge',subject:'source',authHospitalId:'SYNTH-A',scopes:['consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:jwtSecret}),records:[record]});
 const bearer=(patch={})=>{
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
   doctorId:'SYNTHETIC',scope:'consent:write',exp:Math.floor(Date.now()/1000)+60,
   acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,...patch}]
   .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return `${input}.${createHmac('sha256',jwtSecret).update(input).digest('base64url')}`;
 };
 const id=randomUUID(),receipt={preparationId:randomUUID(),sessionId:id,expectedSessionVersion:1,state:'PENDING',evidenceStatus:'UNVERIFIED',createdAt:new Date().toISOString()};
 const service=new V3PendingPreparationService({transactions:createPendingTransactions({pool:{async connect(){throw Error('NO_DB_IN_TLS_TEST');}}}),hmacKey:randomBytes(32),maxLifetimeMs:60000,requireNetworkAudit:true});
 const calls=[];service.prepare=async(...args)=>{calls.push(args);return receipt;};
 const edge=createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry,service,ingressSecret:secret,bodyDeadlineMs:200,preauthObserver});
 const server=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt'),
  requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2',handshakeTimeout:1500},(req,res)=>void edge.handle(req,res));
 server.requestTimeout=2000;server.headersTimeout=1500;server.timeout=3000;
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{edge.dispose();service.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const route=`/api/v3/exchange-sessions/${id}/consent-preparations`;
 const body={patientRefId:randomUUID(),sourceHospitalId:record.hospitalId,targetHospitalId:randomUUID(),purpose:'TREATMENT',state:'PENDING',
  allowedActions:['study:view'],resources:[{studyInstanceUid:'1.2.3'}],validFrom:new Date(Date.now()+1000).toISOString(),
  validUntil:new Date(Date.now()+30000).toISOString(),policyVersion:'synthetic-v1',evidenceDigest:'SYNTHETIC_UNVERIFIED_'.padEnd(64,'X')};
 function send(options={}){
  const headers={authorization:`Bearer ${bearer(options.claims)}`,'content-type':'application/json',
   'idempotency-key':'synthetic.secure-edge:key-001','if-match':'"1"','x-audit-session-id':randomUUID()};
  const signed=signIngress({method:'POST',url:route,headers},'127.0.0.1',secret,options.time??Date.now());
  Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,
   'x-hipass-ingress-signature':signed.signature},options.headers);
  for(const name of options.omit??[])delete headers[name];
  const client=options.client===null?{}:options.client??{key:read('pending-edge/pending-proxy-dev.key'),cert:read('pending-edge/pending-proxy-dev.crt')};
  return new Promise((resolve,reject)=>{
   const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:options.path??route,
    method:'POST',headers,ca:read('mtls/ca.crt'),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,...client},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>{
     clearTimeout(timer);req.destroy();resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks))});
    });
   });
   const timer=setTimeout(()=>req.destroy(Error('SYNTHETIC_TLS_CLIENT_TIMEOUT')),4000);
   req.on('error',error=>{clearTimeout(timer);reject(error);});req.end(JSON.stringify(body));
  });
 }
 const front=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),minVersion:'TLSv1.2',handshakeTimeout:1500},(req,res)=>{
  // Forwarded values are derived from this hop, never accepted from the browser.
  const headers={...req.headers};
  for(const name of ['x-forwarded-for','x-forwarded-proto','x-hipass-ingress-time','x-hipass-ingress-signature'])delete headers[name];
  const ip=req.socket.remoteAddress,signed=signIngress({method:req.method,url:req.url,headers},ip,secret);
  Object.assign(headers,{'x-forwarded-for':ip,'x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
  const upstream=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:req.url,method:req.method,headers,
   ca:read('mtls/ca.crt'),cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key'),
   rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  const timer=setTimeout(()=>upstream.destroy(Error('SYNTHETIC_PROXY_TIMEOUT')),3000);
  upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503);res.end('{}');}else res.destroy();});
  res.once('close',()=>{clearTimeout(timer);upstream.destroy();});req.once('aborted',()=>upstream.destroy());req.pipe(upstream);
 });
 front.requestTimeout=2000;front.headersTimeout=1500;front.timeout=3000;
 front.listen(0,'127.0.0.1');await once(front,'listening');
 t.after(async()=>{front.closeAllConnections();await new Promise(resolve=>front.close(resolve));});
 const throughProxy=(extra={})=>new Promise((resolve,reject)=>{
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:front.address().port,path:route,method:'POST',
   ca:read('mtls/ca.crt'),rejectUnauthorized:true,agent:false,headers:{authorization:`Bearer ${bearer()}`,'content-type':'application/json',
    'idempotency-key':'synthetic.secure-edge:proxy-001','if-match':'"1"','x-audit-session-id':randomUUID(),...extra}},res=>{
     const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>{
      clearTimeout(timer);req.destroy();resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))});
     });
   });
  const timer=setTimeout(()=>req.destroy(Error('SYNTHETIC_FRONT_TIMEOUT')),4000);req.on('error',e=>{clearTimeout(timer);reject(e);});req.end(JSON.stringify(body));
 });
 return {send,throughProxy,calls,receipt,edge,registry,service,secret};
}

test('dedicated development proxy certificate matches key and client role',()=>{
 const cert=new X509Certificate(read('pending-edge/pending-proxy-dev.crt')),ca=new X509Certificate(read('mtls/ca.crt'));
 assert.equal(cert.verify(ca.publicKey),true);assert.equal(cert.checkPrivateKey(createPrivateKey(read('pending-edge/pending-proxy-dev.key'))),true);
 assert.ok(cert.subjectAltName.split(/,\s*/).includes(PENDING_PROXY_SAN));assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.2'));
 assert.ok(Date.now()>=Date.parse(cert.validFrom)&&Date.now()<Date.parse(cert.validTo));
 assert.ok(Date.parse(cert.validTo)-Date.parse(cert.validFrom)<=90*86400000);
});

test('actual client mTLS plus authenticated ingress and signed mock assurance reach pending handler',async t=>{
 const f=await fixture(t),out=await f.send();assert.equal(out.status,201);assert.deepEqual(out.body,f.receipt);
 assert.equal(out.headers['cache-control'],'no-store');assert.equal(f.calls.length,1);
});

test('actual HTTPS frontend replaces spoofed ingress then authenticates its backend mTLS hop',async t=>{
 const f=await fixture(t),out=await f.throughProxy({'x-forwarded-for':'192.0.2.123','x-forwarded-proto':'http',
  'x-hipass-ingress-time':'1234567890000','x-hipass-ingress-signature':'SYNTHETIC-SPOOF'});
 assert.equal(out.status,201);assert.deepEqual(out.body,f.receipt);assert.equal(f.calls.length,1);
});

test('actual mTLS rejects no certificate untrusted certificate and expired fixture before application',async t=>{
 const f=await fixture(t);
 for(const client of [null,{cert:read('generated-fixtures/untrusted-client/untrusted-client.crt'),key:read('generated-fixtures/untrusted-client/untrusted-client.key')},
  {cert:read('bad/bad.crt'),key:read('bad/bad.key')}]){
  await assert.rejects(f.send({client}),error=>['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
   'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE','ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED','ECONNRESET','ERR_SSL_TLSV1_ALERT_ACCESS_DENIED'].includes(error.code));
 }
 assert.equal(f.calls.length,0);
});

test('trusted project Gateway client cannot impersonate dedicated preparation proxy',async t=>{
 const f=await fixture(t),out=await f.send({client:{cert:read('mtls/gateway-client.crt'),key:read('mtls/gateway-client.key')}});
 assert.equal(out.status,403);assert.equal(out.body.code,'V3_PENDING_EDGE_DENIED');assert.equal(f.calls.length,0);
});

test('missing forged stale duplicated and request-mismatched ingress fail closed',async t=>{
 const f=await fixture(t);
 for(const options of [{omit:['x-hipass-ingress-signature']},{headers:{'x-hipass-ingress-signature':'SYNTHETIC-CANARY'}},
  {time:Date.now()-11000},{headers:{'x-forwarded-for':'192.0.2.1'}},{headers:{'x-forwarded-proto':'http'}},
  {headers:{'x-hipass-ingress-time':['1234567890000','1234567890000']}},{path:'/different'},
  {headers:{authorization:`Bearer ${f.secret.toString('hex')}`}}]){
  const out=await f.send(options);assert.equal(out.status,403);assert.equal(out.body.code,'V3_PENDING_EDGE_DENIED');
  assert.ok(!JSON.stringify(out.body).includes('SYNTHETIC-CANARY'));
 }
 assert.equal(f.calls.length,0);
});

test('signed mock assurance cannot be replaced by headers single-factor duplicate or wrong claims',async t=>{
 const f=await fixture(t);
 for(const claims of [{acr:null},{highpass_test_assurance:false},{highpass_test_assurance:'true'},
  {amr:['pwd']},{amr:['pwd','otp','otp']},{amr:'pwd otp mfa'},{amr:['pwd','otp','mfa','extra']}]){
  const out=await f.send({claims,headers:{'x-mfa':'true'}});assert.equal(out.status,403);
  assert.equal(out.body.code,'V3_PENDING_MOCK_ASSURANCE_REQUIRED');
 }
 assert.equal(f.calls.length,0);
});

test('edge configuration and disposal never fall back to insecure inner handler',async t=>{
 const f=await fixture(t);
 const nonstrict=new V3PendingPreparationService({transactions:createPendingTransactions({pool:{async connect(){throw Error('NO_DB_IN_CONFIGURATION_TEST');}}}),
  hmacKey:randomBytes(32),maxLifetimeMs:60000});t.after(()=>nonstrict.dispose());
 assert.throws(()=>createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry:f.registry,service:nonstrict,ingressSecret:f.secret}),
  e=>e.code==='V3_PENDING_NETWORK_AUDIT_REQUIRED');
 for(const patch of [{mode:'production'},{ingressSecret:Buffer.alloc(31)},{registry:{}}])
  assert.throws(()=>createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry:f.registry,service:f.service,ingressSecret:f.secret,...patch}));
 f.edge.dispose();const out=await f.send();assert.equal(out.status,403);assert.equal(out.body.code,'V3_PENDING_EDGE_UNAVAILABLE');assert.equal(f.calls.length,0);
});

test('actual HTTPS denies before slow paired sink settles and preserves authentication after emitter disposal',async t=>{
 const observer=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 let release;const hanging=new Promise(resolve=>{release=resolve;});
 t.after(()=>release());
 const emitter=observer.createEdgeObserver({sink:observer.createTestSink({send:()=>hanging,deadlineMs:1000,maxConcurrent:1})});
 const f=await fixture(t,emitter);
 const denied=await f.send({omit:['x-hipass-ingress-signature']});
 assert.equal(denied.status,403);assert.equal(emitter.observations().length,0);assert.equal(f.calls.length,0);
 const second=await f.send({claims:{acr:null}});assert.equal(second.status,403);
 assert.deepEqual(emitter.observations(),[{stage:'MOCK_ASSURANCE',outcome:'OVERFLOW'}]);
 const allowed=await f.send();assert.equal(allowed.status,201);assert.equal(f.calls.length,1);
 release();const until=Date.now()+1500;
 while(emitter.observations().length<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(emitter.observations().length,2);
 assert.equal(emitter.observations().some(row=>row.stage==='INGRESS'&&row.outcome==='RECORDED_TEST_ONLY'),true);
 for(const preauthObserver of [{observe:async()=>{}},{...emitter}])
  assert.throws(()=>createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry:f.registry,service:f.service,ingressSecret:f.secret,preauthObserver}),/OBSERVER_REQUIRED/);
 emitter.dispose();
 assert.throws(()=>createV3PendingCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',registry:f.registry,service:f.service,ingressSecret:f.secret,preauthObserver:emitter}),/OBSERVER_REQUIRED/);
 const disposed=await f.send({claims:{acr:null}});assert.equal(disposed.status,403);assert.equal(f.calls.length,1);
 assert.equal(emitter.observations().at(-1).outcome,'NOT_RECORDED');
});
