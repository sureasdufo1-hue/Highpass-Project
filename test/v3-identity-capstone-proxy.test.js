import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { createServer,request } from 'node:https';
import { createServer as plainServer,request as plainRequest } from 'node:http';
import { once } from 'node:events';
import { createV3IdentityCapstoneProxy } from '../src/v3-identity-capstone-proxy.js';
import { ingressMeta } from '../src/ingress.js';

const read=name=>readFileSync('tmp/certs/'+name);
const tls=()=>({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),minVersion:'TLSv1.2'});
const config=port=>({mode:'CAPSTONE_SYNTHETIC_ONLY',port,ca:read('mtls/ca.crt'),cert:read('identity-edge/identity-proxy-dev.crt'),
  key:read('identity-edge/identity-proxy-dev.key'),ingressSecret:randomBytes(32),deadlineMs:500});
test('identity proxy rejects invalid opt-in, destination, secret, deadlines and certificate roles',()=>{
  assert.throws(()=>createV3IdentityCapstoneProxy());const valid=config(12345);
  for(const extra of [{mode:'production'},{port:0},{port:'443'},{ingressSecret:randomBytes(31)},{deadlineMs:10001},
    {cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')},
    {key:read('pending-edge/pending-proxy-dev.key')},
    {cert:read('identity-edge/untrusted-dev.crt'),key:read('identity-edge/untrusted-dev.key')}])
    assert.throws(()=>createV3IdentityCapstoneProxy({...valid,...extra}));
});

test('actual identity proxy filters headers, bounds routes/body/response/deadline and disposal',async()=>{
  const observations=[];
  let admitted;const admission=new Promise(resolve=>{admitted=resolve;});
  const backend=createServer({...tls(),ca:read('mtls/ca.crt'),requestCert:true,rejectUnauthorized:true},(req,res)=>{
    observations.push({headers:req.headers,request:req});req.resume();
    if(req.headers.accept==='synthetic/dispose'){admitted();return;}
    if(req.headers.accept==='synthetic/stall')return;
    res.setHeader('content-type',req.headers.accept==='synthetic/nonjson'?'text/plain':'application/json');
    res.end(req.headers.accept==='synthetic/large'?'x'.repeat(16385):'{}');
  });backend.setTimeout(2000,socket=>socket.destroy());backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const options=config(backend.address().port),proxy=createV3IdentityCapstoneProxy(options);
  const front=createServer(tls(),(req,res)=>proxy.handle(req,res));front.setTimeout(2000,socket=>socket.destroy());
  const plain=plainServer((req,res)=>proxy.handle(req,res));plain.setTimeout(2000,socket=>socket.destroy());
  front.listen(0,'127.0.0.1');plain.listen(0,'127.0.0.1');await Promise.all([once(front,'listening'),once(plain,'listening')]);
  const route='/api/v3/patient-mappings/'+randomUUID();
  const call=({path=route,headers={},method='GET',body,plaintext=false}={})=>new Promise((resolve,reject)=>{
    const req=(plaintext?plainRequest:request)({hostname:'127.0.0.1',servername:'localhost',port:(plaintext?plain:front).address().port,
      method,path,headers,ca:read('mtls/ca.crt'),rejectUnauthorized:true,agent:false,timeout:2000},res=>{
      let text='';res.on('data',chunk=>text+=chunk);res.on('error',reject);res.on('aborted',()=>reject(Error('TEST_ABORTED')));
      res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),cache:res.headers['cache-control']});}catch(e){reject(e);}});
    });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TEST_TIMEOUT')));req.end(body);
  });
  try {
    const good=await call({headers:{authorization:'Bearer SYNTHETIC',dpop:'SYNTHETIC_PROOF','x-forwarded-for':'192.0.2.9','x-forwarded-proto':'http',
      'x-hipass-ingress-time':'1234567890000','x-hipass-ingress-signature':'SYNTHETIC_FORGED','x-user-id':'SYNTHETIC','x-hospital-id':'SYNTHETIC',
      'x-hipass-service-token':'SYNTHETIC','cookie':'SYNTHETIC','x-audit-session-id':randomUUID()}});
    assert.equal(good.status,200);assert.equal(good.cache,'no-store');
    const observed=observations[0];assert.equal(ingressMeta(observed.request,options.ingressSecret).ingressTrusted,true);
    assert.equal(observed.headers['x-forwarded-for'],'127.0.0.1');assert.equal(observed.headers.dpop,'SYNTHETIC_PROOF');
    for(const name of ['x-user-id','x-hospital-id','x-hipass-service-token','cookie'])assert.equal(observed.headers[name],undefined);
    const count=observations.length;
    for(const path of [route+'?token=SYNTHETIC',route+'/',route.replace('/patient-mappings/','/patient-mappings/%2f'),'/api/consents'])
      assert.equal((await call({path})).status,404);
    assert.equal((await call({plaintext:true})).status,403);
    assert.equal((await call({headers:['Host','localhost','Authorization','FIRST','Authorization','SECOND']})).status,422);
    assert.equal((await call({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:'x'.repeat(16385)})).status,413);
    assert.equal((await call({method:'POST',path:'/api/v3/patient-mappings/reconcile',headers:{'content-encoding':'gzip'},body:'{}'})).status,415);
    assert.equal(observations.length,count);
    assert.equal((await call({headers:{accept:'synthetic/large'}})).status,502);
    assert.equal((await call({headers:{accept:'synthetic/nonjson'}})).status,502);
    assert.equal((await call({headers:{accept:'synthetic/stall'}})).status,504);
    const waiting=call({headers:{accept:'synthetic/dispose'}}).then(()=>false,()=>true);
    let observationTimer;
    try {await Promise.race([admission,new Promise((_,reject)=>{observationTimer=setTimeout(()=>reject(Error('TEST_ADMISSION_TIMEOUT')),1000);})]);}
    finally{clearTimeout(observationTimer);}
    proxy.dispose();assert.equal(await waiting,true);
    assert.equal((await call()).status,503);
  }finally{proxy.dispose();for(const s of [front,plain,backend]){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}}
});
