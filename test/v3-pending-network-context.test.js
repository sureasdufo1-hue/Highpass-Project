import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createPendingNetworkAuthority,assertPendingNetworkAuthority} from '../src/v3-pending-network-context.js';
import {signIngress} from '../src/ingress.js';

const cert=new X509Certificate(readFileSync(new URL('../tmp/certs/pending-edge/pending-proxy-dev.crt',import.meta.url)));
function fixture(t,ip='127.0.0.1'){
 const secret=randomBytes(32),authority=createPendingNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret});
 t.after(()=>authority.dispose());
 const request={method:'POST',url:'/synthetic-preparation',rawHeaders:[],headers:{authorization:'Bearer SYNTHETIC-NOT-A-REAL-TOKEN',
  'idempotency-key':'synthetic.network:key-001','if-match':'"1"','x-audit-session-id':'synthetic-correlation'},
  socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({raw:cert.raw})}};
 const signed=signIngress(request,ip,secret);
 Object.assign(request.headers,{'x-forwarded-for':ip,'x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
 return {secret,authority,request};
}
const invalid=error=>error.message==='V3_PENDING_NETWORK_CONTEXT_INVALID';

test('network capability is opaque and contains only normalized trusted facts when read internally',t=>{
 const f=fixture(t,'2001:0db8:0000:0000:0000:0000:0000:0001'),cap=f.authority.capture(f.request),facts=f.authority.read(cap,f.request);
 assert.equal(JSON.stringify(cap),'{}');assert.equal(Object.getPrototypeOf(cap),null);assert.ok(Object.isFrozen(cap));
 assert.equal(facts.sourceIp,'2001:db8::1');assert.equal(facts.ingressMode,'CAPSTONE_MTLS_SIGNED_PROXY');
 assert.equal(facts.proxyCertificateSha256,cert.fingerprint256.replaceAll(':','').toLowerCase());assert.ok(Object.isFrozen(facts));
 assert.equal(Object.keys(facts).length,4);assert.ok(Number.isFinite(Date.parse(facts.observedAt)));
 assert.ok(!JSON.stringify(facts).includes('SYNTHETIC-NOT-A-REAL-TOKEN'));assert.ok(!JSON.stringify(facts).includes(f.secret.toString('hex')));
});

test('clone plain JSON foreign authority wrong request and replaced capability cannot forge provenance',t=>{
 const f=fixture(t),other=fixture(t),cap=f.authority.capture(f.request);
 for(const fake of [{},structuredClone(cap),Object.freeze({...cap}),null])assert.throws(()=>f.authority.read(fake,f.request),invalid);
 assert.throws(()=>f.authority.read(cap,{...f.request}),invalid);assert.throws(()=>other.authority.read(cap,f.request),invalid);
 const replacement=f.authority.capture(f.request);assert.throws(()=>f.authority.read(cap,f.request),invalid);assert.ok(f.authority.read(replacement,f.request));
 assert.throws(()=>assertPendingNetworkAuthority({...f.authority}));assertPendingNetworkAuthority(f.authority);
});

test('network minting rejects missing forged stale and duplicated ingress and untrusted TLS',t=>{
 for(const mutate of [r=>delete r.headers['x-hipass-ingress-signature'],r=>r.headers['x-hipass-ingress-signature']='SYNTHETIC-FORGED',
  r=>r.headers['x-hipass-ingress-time']=String(Date.now()-11000),r=>r.headers['x-forwarded-proto']='http',
  r=>r.headers['x-forwarded-for']='192.0.2.1',r=>r.rawHeaders=['Authorization','a','authorization','b'],
  r=>r.socket.authorized=false,r=>r.socket.encrypted=false,r=>r.socket.getPeerCertificate=()=>({})]){
  const f=fixture(t);mutate(f.request);assert.throws(()=>f.authority.capture(f.request),invalid);
 }
 const f=fixture(t);f.request.socket.getPeerCertificate=()=>({raw:new X509Certificate(readFileSync(new URL('../tmp/certs/mtls/gateway-client.crt',import.meta.url))).raw});
 assert.throws(()=>f.authority.capture(f.request),invalid);
});

test('post-capture request method path authorization and correlation mutation invalidate context',t=>{
 for(const mutate of [r=>r.method='GET',r=>r.url='/different',r=>r.headers.authorization='Bearer SYNTHETIC-CHANGED',
  r=>r.headers['idempotency-key']='synthetic.changed:key-001',r=>r.headers['if-match']='"2"',
  r=>r.headers['x-audit-session-id']='changed',r=>r.headers['x-trace-id']='changed',r=>r.headers['content-type']='text/plain',
  r=>r.socket={...r.socket},r=>r.socket.authorized=false]){
  const f=fixture(t),cap=f.authority.capture(f.request);mutate(f.request);assert.throws(()=>f.authority.read(cap,f.request),invalid);
 }
});

test('context rejects forward expiry backward clock and disposed authority',t=>{
 const f=fixture(t),cap=f.authority.capture(f.request),now=Date.now();
 t.mock.method(Date,'now',()=>now+10001);assert.throws(()=>f.authority.read(cap,f.request),invalid);
 t.mock.method(Date,'now',()=>now-10001);assert.throws(()=>f.authority.read(cap,f.request),invalid);
 t.mock.method(Date,'now',()=>now);assert.ok(f.authority.read(cap,f.request));
 f.authority.dispose();assert.throws(()=>f.authority.read(cap,f.request),invalid);assert.throws(()=>f.authority.capture(f.request),invalid);
});

test('authority owns copied key and rejects invalid configuration without insecure fallback',t=>{
 const f=fixture(t);f.secret.fill(0);assert.throws(()=>f.authority.readForRequest(f.request),invalid);
 const cap=f.authority.capture(f.request);assert.ok(f.authority.read(cap,f.request));
 for(const options of [{},{mode:'production',ingressSecret:randomBytes(32)},
  {mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(31)},{mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:'SYNTHETIC-SECRET'}])
  assert.throws(()=>createPendingNetworkAuthority(options));
});
