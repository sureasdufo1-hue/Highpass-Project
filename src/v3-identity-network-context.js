import { createHash, X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { ingressMeta } from './ingress.js';
import { AuthError } from './auth.js';
import { v3BindingExpiry } from './v3-principal-registry.js';

const san='URI:spiffe://highpass.local/dev/identity-edge-proxy';
const authorities=new WeakSet(),inputs=new WeakMap();
const bound=['authorization','dpop','x-forwarded-for','x-forwarded-proto','x-hipass-ingress-time','x-hipass-ingress-signature',
  'idempotency-key','x-audit-session-id','x-trace-id','content-type','content-length','content-encoding'];
const fail=()=>{throw new AuthError(503,'V3_IDENTITY_NETWORK_CONTEXT_INVALID');};
const digest=req=>createHash('sha256').update(JSON.stringify([req.method,req.url,...bound.map(name=>req.headers[name])])).digest('hex');
function actor(binding){v3BindingExpiry(binding);return JSON.stringify([binding.actorId,binding.tenantId,binding.hospitalId]);}
function correlation(value){
  if(!value||typeof value.auditSessionId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.auditSessionId)
    ||typeof value.traceId!=='string'||! /^[A-Za-z0-9_-]{16,64}$/.test(value.traceId))fail();
  return JSON.stringify([value.auditSessionId.toLowerCase(),value.traceId]);
}
export function assertIdentityNetworkAuthority(value){if(!authorities.has(value))throw Error('V3_IDENTITY_NETWORK_AUTHORITY_REQUIRED');}
export function readIdentityNetworkAuditInput(input,binding,context){
  const value=inputs.get(input);
  if(!value||value.binding!==binding||value.actor!==actor(binding)||context!==undefined&&value.correlation!==correlation(context))fail();
  return value.read();
}

/** Internal opaque capability, not JSON, forwarded identity or a SQL credential.
 * Foundation only: services must explicitly consume/recheck it at transaction gates. */
export function createIdentityNetworkAuthority({mode,ingressSecret}={}){
  if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!Buffer.isBuffer(ingressSecret)||ingressSecret.length!==32)throw Error('V3_IDENTITY_NETWORK_CONFIGURATION_INVALID');
  let secret=Buffer.from(ingressSecret),contexts=new WeakMap(),requests=new WeakMap();
  function capture(request){
    try {
      if(!secret||typeof request?.method!=='string'||typeof request.url!=='string'||!request.headers)fail();
      const seen=new Set();for(let i=0;i<(request.rawHeaders?.length??0);i+=2){const name=request.rawHeaders[i].toLowerCase();if(bound.includes(name)&&seen.has(name))fail();seen.add(name);}
      const socket=request.socket;
      if(!(socket instanceof TLSSocket)||socket.encrypted!==true||socket.authorized!==true||socket.destroyed||!['TLSv1.2','TLSv1.3'].includes(socket.getProtocol()))fail();
      const peer=socket.getPeerCertificate();if(!Buffer.isBuffer(peer?.raw))fail();
      const cert=new X509Certificate(peer.raw),now=Date.now(),end=Date.parse(cert.validTo);
      if(now<Date.parse(cert.validFrom)||now>=end||cert.subjectAltName!==san||!cert.keyUsage?.includes('1.3.6.1.5.5.7.3.2'))fail();
      const meta=ingressMeta(request,secret,now);if(!meta.ingressTrusted||!isIP(meta.ipAddress))fail();
      const ip=isIP(meta.ipAddress)===4?meta.ipAddress:new URL('https://['+meta.ipAddress+']/').hostname.slice(1,-1);
      const cap=Object.freeze(Object.create(null)),previous=requests.get(request);if(previous)contexts.delete(previous);
      contexts.set(cap,{request,socket,digest:digest(request),observedMs:now,until:Math.min(now+10000,Number(request.headers['x-hipass-ingress-time'])+10000,end),
        monotonicUntil:performance.now()+10000,facts:Object.freeze({sourceIp:ip,ingressMode:'CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY',
          proxyCertificateSha256:cert.fingerprint256.replaceAll(':','').toLowerCase(),observedAt:new Date(now).toISOString()})});
      requests.set(request,cap);return cap;
    }catch{fail();}
  }
  function read(cap,request){
    try {
      const value=contexts.get(cap),now=Date.now();
      if(!secret||!value||value.request!==request||requests.get(request)!==cap||value.socket!==request.socket||request.socket.destroyed
        ||request.socket.authorized!==true||request.socket.encrypted!==true||now<value.observedMs||now>=value.until
        ||performance.now()>=value.monotonicUntil||digest(request)!==value.digest)fail();
      return value.facts;
    }catch{fail();}
  }
  function auditInputForRequest(request,context,binding){
    const cap=requests.get(request);read(cap,request);const identity=actor(binding),key=correlation(context),value=contexts.get(cap);
    if(request.headers['x-audit-session-id']!==undefined&&(typeof request.headers['x-audit-session-id']!=='string'||request.headers['x-audit-session-id'].toLowerCase()!==context.auditSessionId.toLowerCase())
      ||request.headers['x-trace-id']!==undefined&&request.headers['x-trace-id']!==context.traceId
      ||value.bound!==undefined&&(value.bound!==JSON.stringify([identity,key])||value.binding!==binding))fail();
    value.binding=binding;
    value.bound=JSON.stringify([identity,key]);const input=Object.freeze(Object.create(null));
    inputs.set(input,{binding,actor:identity,correlation:key,read:()=>read(cap,request)});return input;
  }
  const authority=Object.freeze({capture,read,auditInputForRequest,readForRequest(request){return read(requests.get(request),request);},
    dispose(){secret?.fill(0);secret=null;contexts=new WeakMap();requests=new WeakMap();}});
  authorities.add(authority);return authority;
}
