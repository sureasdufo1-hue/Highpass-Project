import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {V3PrincipalRegistry} from './v3-principal-registry.js';
import {V3MappingWriteService} from './v3-mapping-write-service.js';
import {v3MappingWritePolicy,v3MappingReviewPolicy} from './v3-mapping-write-contract.js';
import {sendJson,sendProblem,RequestBodyError} from './http-utils.js';
import {assertIdentityNetworkAuthority} from './v3-identity-network-context.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACE=/^[A-Za-z0-9_-]{16,64}$/,KEY=/^[A-Za-z0-9._:-]{16,128}$/;
function headers(request){
  const sensitive=new Set(['authorization','idempotency-key','x-audit-session-id','x-trace-id','content-type','content-encoding','content-length']);
  const seen=new Set();
  for(let i=0;i<(request.rawHeaders?.length??0);i+=2){
    const name=request.rawHeaders[i].toLowerCase();
    if(sensitive.has(name)&&seen.has(name))throw new AuthError(422,'V3_DUPLICATE_HEADER');
    seen.add(name);
  }
  const h=request.headers;
  if(typeof h['idempotency-key']!=='string'||!KEY.test(h['idempotency-key'])
    ||typeof h['x-audit-session-id']!=='string'||!UUID.test(h['x-audit-session-id'])
    ||h['x-trace-id']!==undefined&&(typeof h['x-trace-id']!=='string'||!TRACE.test(h['x-trace-id'])))
    throw new AuthError(422,'V3_MAPPING_HEADERS_INVALID');
  if(h['content-encoding']!==undefined&&h['content-encoding']!=='identity')throw new AuthError(415,'V3_CONTENT_ENCODING_UNSUPPORTED');
  if(typeof h['content-type']!=='string'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(h['content-type']))
    throw new AuthError(415,'V3_CONTENT_TYPE_UNSUPPORTED');
}

/** Listener-based bounded reader leaves the socket available for safe errors. */
export function readV3MappingBody(request,{deadlineMs=5000,maxBytes=16384}={}){
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<10||deadlineMs>5000
    ||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16384)throw new Error('V3_BODY_CONFIGURATION_INVALID');
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,done=false;
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);
      request.off('data',data);request.off('end',end);request.off('aborted',aborted);request.off('error',failed);
      if(error){request.pause();reject(error);}else resolve(value);
    };
    const data=chunk=>{const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;
      if(size>maxBytes)finish(new RequestBodyError(413,'V3_BODY_TOO_LARGE'));else chunks.push(bytes);};
    const end=()=>{try{
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();
      finish(null,value);
    }catch{finish(new RequestBodyError(422,'V3_BODY_INVALID'));}};
    const aborted=()=>finish(new RequestBodyError(400,'V3_BODY_ABORTED'));
    const failed=()=>finish(new RequestBodyError(400,'V3_BODY_ABORTED'));
    const timer=setTimeout(()=>finish(new RequestBodyError(408,'V3_BODY_TIMEOUT')),deadlineMs);
    request.on('data',data);request.once('end',end);request.once('aborted',aborted);request.once('error',failed);
    const length=request.headers['content-length'];
    if(length!==undefined&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))finish(new RequestBodyError(422,'V3_BODY_INVALID'));
    else if(Number(length)>maxBytes)finish(new RequestBodyError(413,'V3_BODY_TOO_LARGE'));
    else if(request.destroyed)aborted();
  });
}

/** Dependency-injected only: production ingress/DPoP activation is a separate gate. */
export function createV3MappingWriteHandler({registry,service,bodyDeadlineMs=5000,networkAuthority,preauthObserver}={}){
  if(!(registry instanceof V3PrincipalRegistry)||!(service instanceof V3MappingWriteService)
    ||!Number.isSafeInteger(bodyDeadlineMs)||bodyDeadlineMs<10||bodyDeadlineMs>5000)throw new Error('V3_WRITE_CONFIGURATION_REQUIRED');
  if(networkAuthority!==undefined)assertIdentityNetworkAuthority(networkAuthority);
  if(preauthObserver!==undefined)assertPreauthEdgeObserver(preauthObserver);
  if(service.requireNetworkAudit!==(networkAuthority!==undefined))throw Error('V3_IDENTITY_NETWORK_MODE_MISMATCH');
  return async function(request,response){
    const incoming=request.headers['x-trace-id'];
    const traceId=typeof incoming==='string'&&TRACE.test(incoming)?incoming:randomUUID();
    try{
      const url=new URL(request.url,'http://local.invalid');
      const reconcile=url.pathname==='/api/v3/patient-mappings/reconcile';
      const review=url.pathname.match(/^\/api\/v3\/patient-mappings\/([^/]+)\/reviews$/);
      if(!reconcile&&!review)throw new AuthError(404,'V3_ROUTE_NOT_FOUND');
      if(request.method!=='POST'){response.setHeader('allow','POST');throw new AuthError(405,'V3_METHOD_NOT_ALLOWED');}
      if(url.search)throw new AuthError(422,'V3_QUERY_NOT_ALLOWED');
      headers(request);
      let binding;try{binding=registry.resolve(request,reconcile?v3MappingWritePolicy:v3MappingReviewPolicy);}
      catch(error){if(preauthObserver)void preauthObserver.observe(request,'HUMAN_AUTH').catch(()=>{});throw error;}
      const options={auditSessionId:request.headers['x-audit-session-id'],traceId};
      const input=networkAuthority?.auditInputForRequest(request,options,binding);
      const body=await readV3MappingBody(request,{deadlineMs:bodyDeadlineMs});
      const key=request.headers['idempotency-key'];
      const result=reconcile?await service.reconcile(binding,key,body,options,input):await service.review(binding,key,review[1],body,options,input);
      sendJson(response,reconcile?201:200,result);
    }catch(error){
      if(response.destroyed||response.writableEnded)return;
      const known=error instanceof AuthError||error instanceof V3TransactionError||error instanceof RequestBodyError;
      const status=known?error.statusCode:503;
      // Rejected/unread bodies must not remain reusable or hold a socket forever.
      response.setHeader('connection','close');
      response.once('finish',()=>request.destroy());
      sendProblem(response,{type:'about:blank',title:status===404?'Resource not found':'Request could not be completed',
        status,code:known?error.code:'V3_SERVICE_UNAVAILABLE',traceId});
    }
  };
}
