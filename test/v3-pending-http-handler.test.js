import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {PassThrough} from 'node:stream';
import {TestProvider,AuthError} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPendingTransactions} from '../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../src/v3-pending-service.js';
import {createV3PendingHttpHandler} from '../src/v3-pending-http-handler.js';
import {createPendingNetworkAuthority} from '../src/v3-pending-network-context.js';
import {signIngress} from '../src/ingress.js';
import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';

async function fixture(t){
 const secret=randomBytes(32).toString('hex'),record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  role:'HOSPITAL_ADMIN',issuer:'synthetic-transport',subject:'source',authHospitalId:'SYNTH-A',scopes:['consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const bearer=(scope='consent:write',role=record.role)=>{
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic',sub:record.subject,role,hospitalId:record.authHospitalId,doctorId:'SYNTHETIC',scope,exp:Math.floor(Date.now()/1000)+60}]
   .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return `${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`;
 };
 const id=randomUUID(),receipt={preparationId:randomUUID(),sessionId:id,expectedSessionVersion:1,state:'PENDING',evidenceStatus:'UNVERIFIED',createdAt:new Date().toISOString()};
 const service=new V3PendingPreparationService({transactions:createPendingTransactions({pool:{async connect(){throw Error('NO_REAL_DB_IN_TRANSPORT_TEST');}}}),hmacKey:randomBytes(32),maxLifetimeMs:60000});
 const calls=[];let behavior=async()=>receipt;
 // Trusted injected mock method: these tests explicitly do not prove persistence.
 service.prepare=async(...args)=>{calls.push(args);return behavior(...args);};
 const handler=createV3PendingHttpHandler({registry,service,bodyDeadlineMs:50,maxBytes:1024});
 const server=createServer((req,res)=>void handler(req,res));server.requestTimeout=2000;server.headersTimeout=1000;
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.dispose();});
 const body={patientRefId:randomUUID(),sourceHospitalId:record.hospitalId,targetHospitalId:randomUUID(),purpose:'TREATMENT',state:'PENDING',
  allowedActions:['study:view'],resources:[{studyInstanceUid:'1.2.3'}],validFrom:new Date(Date.now()+1000).toISOString(),validUntil:new Date(Date.now()+30000).toISOString(),
  policyVersion:'synthetic-v1',evidenceDigest:'SYNTHETIC_UNVERIFIED_'.padEnd(64,'X')};
 const route=`/api/v3/exchange-sessions/${id}/consent-preparations`;
 const headers={authorization:`Bearer ${bearer()}`,'idempotency-key':'synthetic.transport:key-001','if-match':'"1"',
  'x-audit-session-id':randomUUID(),'content-type':'application/json'};
 function send(options={}){return new Promise((resolve,reject)=>{
  const h={...headers,...options.headers};for(const name of options.omit??[])delete h[name];
  const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:options.path??route,method:options.method??'POST',headers:h,agent:false},response=>{
   const chunks=[];response.on('data',c=>chunks.push(c));response.on('error',reject);response.on('end',()=>{
    clearTimeout(timer);request.destroy();resolve({status:response.statusCode,headers:response.headers,body:JSON.parse(Buffer.concat(chunks).toString())});
   });
  });
  const timer=setTimeout(()=>request.destroy(Error('SYNTHETIC_CLIENT_TIMEOUT')),2500);request.on('error',e=>{clearTimeout(timer);reject(e);});
  if(options.open){request.write('{"unfinished":');return;}
  request.end(options.raw??JSON.stringify(options.body??body));
 });}
 return {registry,service,body,receipt,calls,bearer,route,headers,handler,send,setBehavior:value=>{behavior=value;}};
}
test('injection-only pending POST returns exact minimal original receipt on retry',async t=>{
 const f=await fixture(t),first=await f.send(),retry=await f.send();assert.equal(first.status,201);assert.deepEqual(first.body,f.receipt);assert.deepEqual(retry.body,first.body);
 assert.equal(first.headers['cache-control'],'no-store');assert.equal(f.calls.length,2);assert.equal(f.calls[0][0].role,'HOSPITAL_ADMIN');
 assert.equal(f.calls[0][3],'"1"');assert.ok(Object.isFrozen(f.calls[0][4]));
});
test('pending HTTP rejects unauthenticated wrong role and insufficient scope before service',async t=>{
 const f=await fixture(t);
 for(const [options,status] of [[{omit:['authorization']},401],[{headers:{authorization:`Bearer ${f.bearer('exchange:read')}`}},403],
  [{headers:{authorization:`Bearer ${f.bearer('consent:write','DOCTOR')}`}},403]])assert.equal((await f.send(options)).status,status);
 assert.equal(f.calls.length,0);
});
test('pending HTTP raw route method query and exact required headers fail closed',async t=>{
 const f=await fixture(t);
 for(const [options,status] of [[{path:f.route+'?token=SYNTHETIC-CANARY'},422],[{method:'GET'},405],[{path:f.route.replace('consent-preparations','consent-artifacts')},404],
  [{headers:{'if-match':'W/"1"'}},422],[{headers:{'if-match':'"2147483647"'}},422],[{headers:{'idempotency-key':'short'}},422],
  [{omit:['x-audit-session-id']},422],[{headers:{'x-trace-id':'SYNTHETIC-CANARY!'}},422],
  [{headers:{'idempotency-key':['synthetic.transport:key-001','synthetic.transport:key-002']}},422]]){
  const out=await f.send(options);assert.equal(out.status,status);assert.ok(!JSON.stringify(out.body).includes('SYNTHETIC-CANARY'));
  if(status===405)assert.equal(out.headers.allow,'POST');
 }
 assert.equal(f.calls.length,0);
});
test('pending HTTP strict media JSON UTF8 size and duplicate decoded keys never invoke service',async t=>{
 const f=await fixture(t);
 for(const [options,status] of [[{headers:{'content-type':'text/plain'}},415],[{headers:{'content-encoding':'gzip'}},415],
  [{raw:'null'},422],[{raw:Buffer.from([0xff])},422],[{raw:'{"purpose":"A","\\u0070urpose":"B"}'},422],
  [{raw:'{"resources":[{"studyInstanceUid":"1.2","studyInstanceUid":"1.3"}]}'},422],
  [{body:{...f.body,state:'ACTIVE'}},422],[{body:{...f.body,approved:true}},422],[{raw:'X'.repeat(1025)},413]])
  assert.equal((await f.send(options)).status,status);
 assert.equal(f.calls.length,0);
});
test('pending HTTP incomplete body times out and aborted input is not service success',async t=>{
 const f=await fixture(t);assert.equal((await f.send({open:true})).status,408);assert.equal(f.calls.length,0);
 const stream=Object.assign(new PassThrough(),{headers:f.headers,rawHeaders:[],url:f.route,method:'POST'}),result={};
 const response={destroyed:false,writableEnded:false,setHeader(){},once(){},writeHead(status){result.status=status;},end(body){result.body=JSON.parse(body);}};
 const pending=f.handler(stream,response);stream.emit('aborted');await pending;assert.equal(result.status,400);assert.equal(f.calls.length,0);stream.destroy();
});
test('pending service errors keep status and never expose unknown code SQL evidence or stack',async t=>{
 const f=await fixture(t);
 for(const [status,code] of [[404,'V3_PENDING_RESOURCE_UNAVAILABLE'],[409,'V3_PENDING_IDEMPOTENCY_CONFLICT'],[412,'V3_PENDING_VERSION_MISMATCH'],[422,'V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID']]){
  f.setBehavior(async()=>{throw new AuthError(status,code,'SYNTHETIC-SQL-SECRET');});const out=await f.send();assert.equal(out.status,status);assert.equal(out.body.code,code);assert.ok(!JSON.stringify(out.body).includes('SECRET'));
 }
 f.setBehavior(async()=>{throw Error('SYNTHETIC-SQL-SECRET');});const unknown=await f.send();assert.equal(unknown.status,503);assert.equal(unknown.body.code,'V3_SERVICE_UNAVAILABLE');
 f.setBehavior(async()=>({...f.receipt,token:'SYNTHETIC-TOKEN'}));const unexpected=await f.send();assert.equal(unexpected.status,503);assert.ok(!JSON.stringify(unexpected.body).includes('SYNTHETIC'));
 f.setBehavior(async()=>({...f.receipt,sessionId:randomUUID()}));assert.equal((await f.send()).status,503);
});
test('pending handler cannot configure missing unbranded providers or unbounded body budgets',async t=>{
 const f=await fixture(t);assert.throws(()=>createV3PendingHttpHandler());
 for(const patch of [{registry:{}},{service:{}},{networkAuthority:{}},{bodyDeadlineMs:Infinity},{maxBytes:4194305}])
  assert.throws(()=>createV3PendingHttpHandler({registry:f.registry,service:f.service,...patch}));
});

test('strict pending handler rechecks network provenance after async body before preparation',async t=>{
 const f=await fixture(t),secret=randomBytes(32),authority=createPendingNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret});
 t.after(()=>authority.dispose());
 const handler=createV3PendingHttpHandler({registry:f.registry,service:f.service,networkAuthority:authority,bodyDeadlineMs:200});
 const cert=new X509Certificate(readFileSync(new URL('../tmp/certs/pending-edge/pending-proxy-dev.crt',import.meta.url)));
 for(const invalidated of [false,true]){
  const request=Object.assign(new PassThrough(),{headers:{...f.headers},rawHeaders:[],url:f.route,method:'POST',
   socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({raw:cert.raw})}});
  const signed=signIngress(request,'127.0.0.1',secret);
  Object.assign(request.headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
  authority.capture(request);const result={},response={destroyed:false,writableEnded:false,setHeader(){},once(){},
   writeHead(status){result.status=status;},end(body){result.body=JSON.parse(body);}};
  const before=f.calls.length,pending=handler(request,response);
  if(invalidated)request.headers['x-audit-session-id']=randomUUID();
  request.end(JSON.stringify(f.body));await pending;
  assert.equal(result.status,invalidated?503:201);assert.equal(f.calls.length,before+(invalidated?0:1));request.destroy();
  assert.ok(!JSON.stringify(result.body).includes('proxyCertificateSha256'));assert.ok(!JSON.stringify(result.body).includes('sourceIp'));
 }
});
