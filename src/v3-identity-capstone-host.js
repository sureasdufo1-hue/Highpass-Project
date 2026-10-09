import {createServer} from 'node:https';
import {X509Certificate,createPrivateKey} from 'node:crypto';
import {createV3IdentityCapstoneEdge} from './v3-identity-secure-edge.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';
import {assertV3IdentityReadiness} from './v3-identity-readiness.js';

/** Explicit loopback-only host lifecycle. LISTENING is not DB/deployment readiness. */
export function createV3IdentityCapstoneHost({mode,tls,preauthObserver,readiness,port=0,handshakeMs=2000,stopMs=2000,...dependencies}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!Number.isInteger(port)||port<0||port>65535
  ||!Number.isInteger(handshakeMs)||handshakeMs<50||handshakeMs>2000
  ||!Number.isInteger(stopMs)||stopMs<50||stopMs>3000||![tls?.key,tls?.cert,tls?.ca].every(Buffer.isBuffer))
  throw Error('V3_IDENTITY_HOST_CONFIGURATION_REQUIRED');
 assertPreauthEdgeObserver(preauthObserver);
 if(readiness!==undefined)assertV3IdentityReadiness(readiness);
 try{
  const leaf=new X509Certificate(tls.cert),ca=new X509Certificate(tls.ca),now=Date.now();
  if(!ca.ca||!leaf.verify(ca.publicKey)||!leaf.checkPrivateKey(createPrivateKey(tls.key))||!leaf.checkHost('localhost')
   ||!leaf.keyUsage?.includes('1.3.6.1.5.5.7.3.1')
   ||[leaf,ca].some(cert=>Date.parse(cert.validFrom)>now||Date.parse(cert.validTo)<=now))throw Error();
 }catch{throw Error('V3_IDENTITY_HOST_CERTIFICATE_INVALID');}
 const edge=createV3IdentityCapstoneEdge({mode,preauthObserver,...dependencies});
 let phase='CREATED',startPromise,stopPromise;
 const sockets=new Set();
 const server=createServer({key:tls.key,cert:tls.cert,ca:tls.ca,requestCert:true,rejectUnauthorized:true,
  minVersion:'TLSv1.2',handshakeTimeout:handshakeMs},(request,response)=>{
   void edge.handle(request,response).catch(()=>{if(!response.destroyed&&!response.writableEnded)response.destroy();});
  });
 server.requestTimeout=5000;server.headersTimeout=3000;server.setTimeout(10000,socket=>socket.destroy());
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.on('tlsClientError',(error,socket)=>{
  if(phase==='LISTENING')void preauthObserver.observeTlsFailure(socket,error).catch(()=>{});
 });
 // Retain a safe listener after bind failure; never expose native error text.
 server.on('error',()=>{});
 return Object.freeze({
  state(){return Object.freeze({phase,transport:'MTLS_REQUIRED',readiness:'NOT VERIFIED'});},
  address(){const value=server.address();return value&&typeof value==='object'?Object.freeze({host:'127.0.0.1',port:value.port}):null;},
  async checkReadiness(binding){
   if(phase!=='LISTENING'||!readiness)return {status:'NOT VERIFIED',reason:phase!=='LISTENING'?'HOST_NOT_LISTENING':'READINESS_NOT_CONFIGURED'};
   const result=await readiness.check(binding);
   return phase==='LISTENING'?result:{status:'NOT VERIFIED',reason:'HOST_STOPPED_DURING_READINESS'};
  },
  start(){
   if(phase==='LISTENING')return Promise.resolve();
   if(phase==='STARTING')return startPromise;
   if(phase!=='CREATED')return Promise.reject(Error('V3_IDENTITY_HOST_CLOSED'));
   phase='STARTING';startPromise=new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);server.off('listening',ready);server.off('error',failed);};
    const failed=()=>{cleanup();phase='FAILED';edge.dispose();server.close();reject(Error('V3_IDENTITY_HOST_BIND_UNAVAILABLE'));};
    const ready=()=>{cleanup();if(phase!=='STARTING'){server.close();reject(Error('V3_IDENTITY_HOST_CLOSED'));return;}phase='LISTENING';resolve();};
    server.once('listening',ready);server.once('error',failed);timer=setTimeout(failed,3000);
    try{server.listen(port,'127.0.0.1');}catch{failed();}
   });return startPromise;
  },
  stop(){
   if(stopPromise)return stopPromise;
   if(phase==='CLOSED')return Promise.resolve();
   phase='STOPPING';edge.dispose();
   stopPromise=new Promise((resolve,reject)=>{
    let settled=false,timer;
    const done=()=>{if(settled)return;settled=true;clearTimeout(timer);phase='CLOSED';resolve();};
    timer=setTimeout(()=>{
     for(const socket of sockets)socket.destroy();server.closeAllConnections();
     timer=setTimeout(()=>{if(settled)return;settled=true;phase='FAILED';reject(Error('V3_IDENTITY_HOST_STOP_UNVERIFIED'));},500);
    },stopMs);
    server.close(done);server.closeIdleConnections();
   });return stopPromise;
  }
 });
}
