import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer,request} from 'node:https';
import {once} from 'node:events';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';
const read=name=>readFileSync(new URL(`../tmp/certs/${name}`,import.meta.url));

// Owned real TLS sockets. In-memory sinks are explicitly not durable audit.
test('actual TLS denial survives sink success error timeout overflow and health stays responsive',async()=>{
 const observer=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 let callbacks=0,currentSink;const outcomes=[];const events=[];let release;
 const server=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt'),
  requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2',handshakeTimeout:1000},(_,res)=>{callbacks++;res.end('synthetic-ready');});
 server.requestTimeout=2000;server.headersTimeout=1500;server.setTimeout(2000,socket=>socket.destroy());
 server.on('tlsClientError',(error,socket)=>{
  outcomes.push(currentSink.record(observer.captureTlsFailure(socket,error)));
 });
 function send(authenticated=false){return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:'/synthetic-health',
   ca:read('mtls/ca.crt'),rejectUnauthorized:true,agent:false,
   ...(authenticated?{cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')}:{})},res=>{
    res.resume();res.once('end',()=>{clearTimeout(timer);resolve(res.statusCode);});res.on('error',reject);
   });
  const timer=setTimeout(()=>req.destroy(Object.assign(Error('SYNTHETIC_CLIENT_TIMEOUT'),{code:'SYNTHETIC_CLIENT_TIMEOUT'})),2000);
  req.once('error',error=>{clearTimeout(timer);reject(error);});req.end();
 });}
 async function denied(){
  const count=outcomes.length,beforeCallbacks=callbacks;
  await assert.rejects(send(),error=>['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ECONNRESET'].includes(error.code));
  const deadline=Date.now()+1000;
  while(outcomes.length===count&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(outcomes.length,count+1);assert.equal(callbacks,beforeCallbacks);
  return outcomes.at(-1);
 }
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  currentSink=observer.createTestSink({send:async event=>{events.push(event);}});
  assert.equal(await denied(),'RECORDED_TEST_ONLY');
  assert.equal(events[0].result,'DENY');assert.equal(events[0].stage,'TLS');
  assert.equal(events[0].reasonCode,'TLS_CERTIFICATE_REQUIRED');
  currentSink=observer.createTestSink({send:async()=>{throw Error('synthetic sink failure');}});
  assert.equal(await denied(),'NOT_RECORDED');
  currentSink=observer.createTestSink({deadlineMs:20,maxConcurrent:1,send:async()=>new Promise(resolve=>{release=resolve;})});
  assert.equal(await denied(),'TIMEOUT');
  assert.equal(await denied(),'OVERFLOW');
  assert.equal(await send(true),200);assert.equal(callbacks,1);
 }finally{release?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
