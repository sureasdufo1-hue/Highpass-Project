import { request as httpsRequest } from 'node:https';
import { TLSSocket } from 'node:tls';
import { X509Certificate, createPrivateKey, randomUUID } from 'node:crypto';
import { signIngress } from './ingress.js';
import { sendProblem } from './http-utils.js';
import { IDENTITY_PROXY_SAN } from './v3-identity-secure-edge.js';

const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const readRoute=new RegExp('^/api/v3/patient-mappings/'+uuid+'$');
const reviewRoute=new RegExp('^/api/v3/patient-mappings/'+uuid+'/reviews$');
const forwarded=['authorization','dpop','content-type','accept','idempotency-key','x-audit-session-id','x-trace-id'];
const singular=new Set([...forwarded,'content-length','content-encoding']);

/** Isolated capstone host composition only. Fixed loopback HTTPS backend;
 * no arbitrary upstream, listener, cloud registration or DPoP verification. */
export function createV3IdentityCapstoneProxy({mode,port,ca,cert,key,ingressSecret,deadlineMs=10000}={}) {
  if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!Number.isInteger(port)||port<1||port>65535
    ||!Number.isInteger(deadlineMs)||deadlineMs<50||deadlineMs>10000
    ||![ca,cert,key,ingressSecret].every(Buffer.isBuffer)||ingressSecret.length!==32) throw Error('V3_IDENTITY_PROXY_CONFIGURATION_REQUIRED');
  try {
    const leaf=new X509Certificate(cert),issuer=new X509Certificate(ca),now=Date.now();
    if(!leaf.verify(issuer.publicKey)||!leaf.checkPrivateKey(createPrivateKey(key))||leaf.subjectAltName!==IDENTITY_PROXY_SAN
      ||!leaf.keyUsage?.includes('1.3.6.1.5.5.7.3.2')||Date.parse(leaf.validFrom)>now||Date.parse(leaf.validTo)<=now) throw Error();
  } catch {throw Error('V3_IDENTITY_PROXY_CERTIFICATE_INVALID');}
  let state={ca:Buffer.from(ca),cert:Buffer.from(cert),key:Buffer.from(key),secret:Buffer.from(ingressSecret)};
  const jobs=new Set();
  return Object.freeze({
    handle(incoming,outgoing) {
      let upstream,timer,finished=false,bytes=0;const chunks=[];
      const cleanup=()=>{
        clearTimeout(timer);jobs.delete(cancel);incoming.off('data',data);incoming.off('end',end);
        incoming.off('error',aborted);incoming.off('aborted',aborted);outgoing.off('close',cancel);
        chunks.length=0;
      };
      const fail=(status,code)=>{
        if(finished)return;finished=true;cleanup();upstream?.destroy();incoming.pause();
        if(!outgoing.destroyed&&!outgoing.writableEnded) {
          outgoing.setHeader('connection','close');outgoing.once('finish',()=>incoming.destroy());
          sendProblem(outgoing,{type:'about:blank',title:'Request could not be completed',status,code,traceId:randomUUID()});
        }
      };
      const cancel=()=>{if(finished)return;finished=true;cleanup();upstream?.destroy();incoming.destroy();outgoing.destroy();};
      const aborted=()=>fail(400,'V3_PROXY_REQUEST_ABORTED');
      const data=chunk=>{bytes+=chunk.length;if(bytes>16384)fail(413,'V3_PROXY_BODY_TOO_LARGE');else chunks.push(chunk);};
      const end=()=>{
        if(finished)return;
        if(!state){fail(503,'V3_PROXY_UNAVAILABLE');return;}
        if(incoming.method==='GET'&&bytes){fail(422,'V3_PROXY_REQUEST_INVALID');return;}
        const headers={host:'localhost:'+port,'content-length':String(bytes)};
        for(const name of forwarded)if(typeof incoming.headers[name]==='string')headers[name]=incoming.headers[name];
        const ip=incoming.socket.remoteAddress,signed=signIngress({method:incoming.method,url:incoming.url,headers},ip,state.secret);
        Object.assign(headers,{'x-forwarded-for':ip,'x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
        upstream=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port,method:incoming.method,path:incoming.url,headers,
          ca:state.ca,cert:state.cert,key:state.key,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false},response=>{
          let size=0;const parts=[];
          response.on('data',chunk=>{size+=chunk.length;if(size>16384){response.destroy();fail(502,'V3_PROXY_RESPONSE_TOO_LARGE');}else parts.push(chunk);});
          response.on('error',()=>fail(502,'V3_PROXY_UPSTREAM_UNAVAILABLE'));
          response.on('aborted',()=>fail(502,'V3_PROXY_UPSTREAM_UNAVAILABLE'));
          response.on('end',()=>{
            if(finished)return;
            const type=String(response.headers['content-type']??'');
            if(!/^application\/(?:json|problem\+json)(?:;|$)/i.test(type)){fail(502,'V3_PROXY_METADATA_REQUIRED');return;}
            finished=true;cleanup();
            outgoing.writeHead(response.statusCode??502,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
            outgoing.end(Buffer.concat(parts));parts.length=0;
          });
        });
        upstream.on('error',()=>fail(502,'V3_PROXY_UPSTREAM_UNAVAILABLE'));upstream.end(Buffer.concat(chunks));chunks.length=0;
      };
      jobs.add(cancel);outgoing.once('close',cancel);
      timer=setTimeout(()=>fail(504,'V3_PROXY_TIMEOUT'),deadlineMs);timer.unref();
      if(!state){fail(503,'V3_PROXY_UNAVAILABLE');return;}
      if(!(incoming.socket instanceof TLSSocket)||incoming.socket.encrypted!==true||!['TLSv1.2','TLSv1.3'].includes(incoming.socket.getProtocol())){fail(403,'V3_PROXY_TLS_REQUIRED');return;}
      if(!(incoming.method==='GET'&&readRoute.test(incoming.url)||incoming.method==='POST'&&(incoming.url==='/api/v3/patient-mappings/reconcile'||reviewRoute.test(incoming.url)))){fail(404,'V3_PROXY_ROUTE_NOT_FOUND');return;}
      const seen=new Set();
      for(let i=0;i<(incoming.rawHeaders?.length??0);i+=2){const name=incoming.rawHeaders[i].toLowerCase();
        if(singular.has(name)&&seen.has(name)){fail(422,'V3_PROXY_DUPLICATE_HEADER');return;}seen.add(name);}
      if(incoming.headers['content-encoding']!==undefined&&incoming.headers['content-encoding']!=='identity'){fail(415,'V3_PROXY_CONTENT_ENCODING_UNSUPPORTED');return;}
      const length=incoming.headers['content-length'];
      if(length!==undefined&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length)))){fail(422,'V3_PROXY_REQUEST_INVALID');return;}
      if(Number(length)>16384){fail(413,'V3_PROXY_BODY_TOO_LARGE');return;}
      incoming.on('data',data);incoming.once('end',end);incoming.once('error',aborted);incoming.once('aborted',aborted);
      if(incoming.destroyed)aborted();
    },
    dispose(){for(const cancel of [...jobs])cancel();if(state){for(const bytes of Object.values(state))bytes.fill(0);state=null;}}
  });
}
