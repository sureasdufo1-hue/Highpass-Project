import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {request} from 'node:https';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3IdentifierProtection} from '../src/v3-identifier-protection.js';
import {V3IdentityIdempotency} from '../src/v3-identity-idempotency.js';
import {V3MappingReadService} from '../src/v3-mapping-read-service.js';
import {V3MappingWriteService} from '../src/v3-mapping-write-service.js';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';
import {createV3IdentityCapstoneHost} from '../src/v3-identity-capstone-host.js';
const read=name=>readFileSync(new URL('../tmp/certs/'+name,import.meta.url));

test('identity host validates TLS, binds bounded owned listener, observes real rejection and closes without readiness claim',async()=>{
 let poolCalls=0;const events=[];
 const transactions=new V3TenantTransaction({deadlineMs:8000,pool:{async connect(){poolCalls++;throw Error('PRIVATE_DB_ERROR');}}});
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:'synthetic',JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:randomBytes(32).toString('hex')}),records:[]});
 const protection=new V3IdentifierProtection({encryptionKeys:new Map([['test',randomBytes(32)]]),activeKeyId:'test',lookupKey:randomBytes(32)});
 const idempotency=new V3IdentityIdempotency({transactions,hmacKey:randomBytes(32),requireNetworkAudit:true});
 const factory=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 const preauthObserver=factory.createEdgeObserver({sink:factory.createTestSink({send:async event=>events.push(event)})});
 const config={mode:'CAPSTONE_SYNTHETIC_ONLY',registry,ingressSecret:randomBytes(32),preauthObserver,
  tls:{key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt')},
  readService:new V3MappingReadService({transactions,requireNetworkAudit:true}),writeService:new V3MappingWriteService({idempotency,protection})};
 for(const patch of [{mode:'PRODUCTION'},{port:-1},{handshakeMs:0},{stopMs:9999},{preauthObserver:{}},
  {tls:{...config.tls,key:read('identity-edge/identity-proxy-dev.key')}},
  {tls:{...config.tls,cert:read('identity-edge/identity-proxy-dev.crt'),key:read('identity-edge/identity-proxy-dev.key')}}])
  assert.throws(()=>createV3IdentityCapstoneHost({...config,...patch}));
 await assert.rejects(preauthObserver.observeTlsFailure({remoteAddress:'192.0.2.1'},{code:'CERT_HAS_EXPIRED'}),/TLS_SOCKET_REQUIRED/);
 const host=createV3IdentityCapstoneHost(config);let collision;
 try{
  assert.equal(host.state().phase,'CREATED');assert.equal(host.state().readiness,'NOT VERIFIED');
  await Promise.all([host.start(),host.start()]);assert.equal(host.state().phase,'LISTENING');
  assert.equal(host.address().host,'127.0.0.1');
  collision=createV3IdentityCapstoneHost({...config,port:host.address().port});
  await assert.rejects(collision.start(),/HOST_BIND_UNAVAILABLE/);await collision.stop();
  assert.equal(host.state().phase,'LISTENING');
  const send=()=>new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',servername:'localhost',port:host.address().port,path:'/',agent:false,
    ca:read('mtls/ca.crt'),rejectUnauthorized:true},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
   const timer=setTimeout(()=>req.destroy(Error('TEST_REQUEST_TIMEOUT')),2000);
   req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end();
  });
  await assert.rejects(send(),error=>['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ECONNRESET'].includes(error.code));
  const until=Date.now()+1000;while(events.length===0&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(events.length,1);assert.equal(events[0].stage,'TLS');assert.equal(events[0].reasonCode,'TLS_CERTIFICATE_REQUIRED');
  assert.equal(events[0].sourceIp,'127.0.0.1');assert.equal(poolCalls,0);
  await Promise.all([host.stop(),host.stop()]);assert.equal(host.state().phase,'CLOSED');assert.equal(host.address(),null);
  await assert.rejects(host.start(),/HOST_CLOSED/);
 }finally{await host.stop();await collision?.stop();preauthObserver.dispose();idempotency.dispose();protection.dispose();}
});
