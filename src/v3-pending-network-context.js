import {createHash,X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {performance} from 'node:perf_hooks';
import {ingressMeta} from './ingress.js';
import {AuthError} from './auth.js';
import {exchangeCorrelation} from './v3-exchange-audit.js';
import {v3BindingExpiry} from './v3-principal-registry.js';

export const PENDING_PROXY_SAN='URI:spiffe://highpass.local/dev/pending-edge-proxy';
const authorities=new WeakSet();
const auditInputs=new WeakMap();
const boundHeaders=['authorization','x-forwarded-for','x-forwarded-proto','x-hipass-ingress-time','x-hipass-ingress-signature',
 'idempotency-key','if-match','x-audit-session-id','x-trace-id','content-type','content-encoding'];
const fail=()=>{throw new AuthError(503,'V3_PENDING_NETWORK_CONTEXT_INVALID');};
const identity=binding=>{v3BindingExpiry(binding);return JSON.stringify([binding.actorId,binding.tenantId,binding.hospitalId]);};
const correlationKey=value=>{const c=exchangeCorrelation(value);return JSON.stringify([c.auditSessionId.toLowerCase(),c.traceId]);};
export function readPendingNetworkAuditInput(input,binding,correlation){
 const state=auditInputs.get(input);if(!state||state.identity!==identity(binding)
  ||correlation!==undefined&&state.correlation!==correlationKey(correlation))fail();
 return state.read();
}
const digest=request=>createHash('sha256').update(JSON.stringify([request.method,request.url,...boundHeaders.map(name=>request.headers[name])])).digest('hex');
function normalizeIp(ip){
 const version=isIP(ip);if(!version)fail();
 return version===4?ip:new URL(`https://[${ip}]/`).hostname.slice(1,-1);
}
export function assertPendingNetworkAuthority(value){if(!authorities.has(value))throw Error('V3_PENDING_NETWORK_AUTHORITY_REQUIRED');}

/** Internal trusted-server API only; capabilities cannot be serialized as authority. */
export function createPendingNetworkAuthority({mode,ingressSecret}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!Buffer.isBuffer(ingressSecret)||ingressSecret.length!==32)
  throw Error('V3_PENDING_NETWORK_CONFIGURATION_INVALID');
 let key=Buffer.from(ingressSecret),contexts=new WeakMap(),requests=new WeakMap();
 function capture(request){
  try{
   if(!key||!request||typeof request.method!=='string'||typeof request.url!=='string'||!request.headers)fail();
   const seen=new Set();for(let i=0;i<(request.rawHeaders?.length??0);i+=2){const name=request.rawHeaders[i].toLowerCase();
    if(boundHeaders.includes(name)&&seen.has(name))fail();seen.add(name);}
   const socket=request.socket;if(socket?.encrypted!==true||socket.authorized!==true)fail();
   const peer=socket.getPeerCertificate?.();if(!Buffer.isBuffer(peer?.raw))fail();
   const cert=new X509Certificate(peer.raw),now=Date.now(),end=Date.parse(cert.validTo);
   if(!Number.isSafeInteger(now)||now<Date.parse(cert.validFrom)||now>=end||!cert.subjectAltName?.split(/,\s*/).includes(PENDING_PROXY_SAN)
    ||!cert.keyUsage?.includes('1.3.6.1.5.5.7.3.2'))fail();
   const metadata=ingressMeta(request,key,now);if(!metadata.ingressTrusted)fail();
   const capability=Object.freeze(Object.create(null)),facts=Object.freeze({sourceIp:normalizeIp(metadata.ipAddress),
    ingressMode:'CAPSTONE_MTLS_SIGNED_PROXY',proxyCertificateSha256:cert.fingerprint256.replaceAll(':','').toLowerCase(),observedAt:new Date(now).toISOString()});
   const previous=requests.get(request);if(previous)contexts.delete(previous);
   contexts.set(capability,{request,socket,digest:digest(request),facts,observedMs:now,monotonicUntil:performance.now()+10000,
    expiresAt:Math.min(now+10000,Number(request.headers['x-hipass-ingress-time'])+10000,end)});
   requests.set(request,capability);return capability;
  }catch{fail();}
 }
 function read(capability,request){
  try{
   const context=contexts.get(capability),now=Date.now();
   if(!key||!context||context.request!==request||requests.get(request)!==capability||context.socket!==request.socket
    ||request.socket.encrypted!==true||request.socket.authorized!==true||now<context.observedMs||now>=context.expiresAt
    ||performance.now()>=context.monotonicUntil||digest(request)!==context.digest)fail();
   return context.facts;
  }catch{fail();}
 }
 function auditInputForRequest(request,correlation,binding){
  const cap=requests.get(request);read(cap,request);
  const c=exchangeCorrelation(correlation),key=correlationKey(c),actor=identity(binding),context=contexts.get(cap);
  if(typeof request.headers['x-audit-session-id']!=='string'||request.headers['x-audit-session-id'].toLowerCase()!==c.auditSessionId.toLowerCase()
   ||request.headers['x-trace-id']!==undefined&&request.headers['x-trace-id']!==c.traceId
   ||context.auditBinding!==undefined&&context.auditBinding!==JSON.stringify([actor,key]))fail();
  context.auditBinding=JSON.stringify([actor,key]);
  const input=Object.freeze(Object.create(null));auditInputs.set(input,{identity:actor,correlation:key,read:()=>read(cap,request)});return input;
 }
 const authority=Object.freeze({capture,read,auditInputForRequest,readForRequest(request){return read(requests.get(request),request);},
  dispose(){key?.fill(0);key=null;contexts=new WeakMap();requests=new WeakMap();}});
 authorities.add(authority);return authority;
}
