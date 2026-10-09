import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { TestProvider } from '../src/auth.js';
import { V3PrincipalRegistry } from '../src/v3-principal-registry.js';
import { V3TenantTransaction } from '../src/v3-tenant-transaction.js';
import { V3IdentityIdempotency } from '../src/v3-identity-idempotency.js';
import { V3IdentifierProtection } from '../src/v3-identifier-protection.js';
import { V3MappingReadService } from '../src/v3-mapping-read-service.js';
import { V3MappingWriteService } from '../src/v3-mapping-write-service.js';
import { createV3IdentityCapstoneEdge } from '../src/v3-identity-secure-edge.js';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';

test('identity secure edge requires opt-in, fixed-size secret and real services', () => {
  for (const options of [undefined, {mode:'production'}, {mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(31)},
    {mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(32)}]) assert.throws(() => createV3IdentityCapstoneEdge(options));
});

test('identity secure edge rejects plaintext and forged socket before SQL, including disposal', async () => {
  let connections=0;
  const transactions=new V3TenantTransaction({pool:{connect:async()=>{connections++;throw Error('PRIVATE_ERROR');}},deadlineMs:8000});
  const protection=new V3IdentifierProtection({encryptionKeys:new Map([['test',randomBytes(32)]]),activeKeyId:'test',lookupKey:randomBytes(32)});
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:'test',JWT_AUDIENCE:'test',TEST_JWT_SECRET:randomBytes(32).toString('hex')}),records:[]});
  const idempotency=new V3IdentityIdempotency({transactions,hmacKey:randomBytes(32),requireNetworkAudit:true});
  const captured=[],pending=[];
  const observerFactory=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
  const preauthObserver=observerFactory.createEdgeObserver({sink:observerFactory.createTestSink({deadlineMs:1000,
    send:event=>{captured.push(event);return new Promise(resolve=>pending.push(resolve));}})});
  const edge=createV3IdentityCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(32),registry,
    readService:new V3MappingReadService({transactions,requireNetworkAudit:true}),writeService:new V3MappingWriteService({idempotency,protection}),preauthObserver});
  const observerConfig={mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(32),registry,
    readService:new V3MappingReadService({transactions,requireNetworkAudit:true}),writeService:new V3MappingWriteService({idempotency,protection})};
  assert.throws(()=>createV3IdentityCapstoneEdge({...observerConfig,preauthObserver:{observe:async()=>{}}}),/PREAUTH_EDGE_OBSERVER_REQUIRED/);
  assert.throws(()=>createV3IdentityCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(32),registry,
    readService:new V3MappingReadService({transactions}),writeService:new V3MappingWriteService({idempotency,protection})}),/STRICT_SERVICES_REQUIRED/);
  const server=createServer((req,res)=>void edge.handle(req,res));
  server.setTimeout(2000,socket=>socket.destroy());server.listen(0,'127.0.0.1');await once(server,'listening');
  const call=()=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path:'/api/v3/patient-mappings/reconcile',timeout:2000},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body,cache:res.headers['cache-control']}));
    });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TEST_TIMEOUT')));req.end();
  });
  try {
    const denied=await call();assert.equal(denied.status,403);assert.equal(denied.cache,'no-store');assert.ok(!denied.body.includes('PRIVATE_ERROR'));
    assert.equal(captured.length,1);assert.equal(preauthObserver.observations().length,0);
    assert.equal(captured[0].stage,'INGRESS');assert.equal(captured[0].sourceIp,'127.0.0.1');
    assert.equal(captured[0].sourceKind,'IMMEDIATE_SOCKET');assert.ok(!('actorId' in captured[0]));
    let status;const response={destroyed:false,writableEnded:false,setHeader(){},once(){},writeHead(value){status=value;},end(){this.writableEnded=true;}};
    await edge.handle({rawHeaders:[],socket:{encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3'},destroy(){}},response);
    assert.equal(status,403);edge.dispose();assert.equal((await call()).status,403);assert.equal(connections,0);
    assert.equal(captured.length,2); // Disposed edge cannot mint a new event.
    for(const resolve of pending)resolve();
    const until=Date.now()+250;while(preauthObserver.observations().length<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(preauthObserver.observations().length,2);
    preauthObserver.dispose();assert.throws(()=>createV3IdentityCapstoneEdge({...observerConfig,preauthObserver}),/PREAUTH_EDGE_OBSERVER_REQUIRED/);
  } finally {for(const resolve of pending)resolve();preauthObserver.dispose();edge.dispose();idempotency.dispose();protection.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
