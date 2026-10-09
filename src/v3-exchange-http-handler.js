import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {V3PrincipalRegistry} from './v3-principal-registry.js';
import {V3ExchangeSessionService} from './v3-exchange-session-service.js';
import {V3ExchangeReadService,v3ExchangeReadPolicy} from './v3-exchange-read-service.js';
import {V3ExchangeCancelService} from './v3-exchange-cancel-service.js';
import {v3ExchangeCancelPolicy} from './v3-exchange-cancel-contract.js';
import {v3ExchangeCreatePolicy} from './v3-exchange-session-contract.js';
import {RequestBodyError,sendJson,sendProblem} from './http-utils.js';
import {assertIdentityNetworkAuthority} from './v3-identity-network-context.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACE=/^[A-Za-z0-9_-]{16,64}$/,KEY=/^[A-Za-z0-9._:-]{16,128}$/;
export const SESSION_BODY_MAX_BYTES=4*1024*1024;
// JSON.parse validates grammar; this bounded second pass rejects duplicate decoded
// object keys, including escaped aliases, at every nesting level.
export function parseSessionJson(text){
  try{
    const result=JSON.parse(text);let pos=0;
    const whitespace=()=>{while(/\s/.test(text[pos]??'')&&pos<text.length)pos++;};
    const string=()=>{const start=pos++;while(pos<text.length){const char=text[pos++];if(char==='\\')pos++;else if(char==='"')break;}return JSON.parse(text.slice(start,pos));};
    const value=depth=>{
      if(depth>32)throw new Error();whitespace();const char=text[pos];
      if(char==='"'){string();return;}
      if(char==='{'||char==='['){pos++;whitespace();const end=char==='{'?'}':']',keys=new Set();
        if(text[pos]===end){pos++;return;}
        while(pos<text.length){
          if(char==='{'){whitespace();const key=string();if(keys.has(key))throw new Error();keys.add(key);whitespace();pos++;}
          value(depth+1);whitespace();if(text[pos++]===end)return;whitespace();
        }
      }else{while(pos<text.length&&!/[\s,}\]]/.test(text[pos]))pos++;}
    };
    value(0);
    if(!result||typeof result!=='object'||Array.isArray(result))throw new Error();
    return result;
  }catch{throw new RequestBodyError(422,'V3_BODY_INVALID');}
}

export function readV3SessionBody(request,{deadlineMs=5000,maxBytes=SESSION_BODY_MAX_BYTES}={}){
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<10||deadlineMs>5000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>SESSION_BODY_MAX_BYTES)
    throw new Error('V3_BODY_CONFIGURATION_INVALID');
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);
      request.off('data',data);request.off('end',end);request.off('aborted',aborted);request.off('error',failed);
      if(error){request.pause();reject(error);}else resolve(value);};
    const data=chunk=>{const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;
      if(size>maxBytes)finish(new RequestBodyError(413,'V3_BODY_TOO_LARGE'));else chunks.push(bytes);};
    const end=()=>{try{finish(null,parseSessionJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}
      catch{finish(new RequestBodyError(422,'V3_BODY_INVALID'));}};
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

function validateHeaders(request,create){
  const sensitive=new Set(['authorization','idempotency-key','x-audit-session-id','x-trace-id','content-type','content-encoding','content-length','transfer-encoding','if-match']);
  const seen=new Set();for(let i=0;i<(request.rawHeaders?.length??0);i+=2){const name=request.rawHeaders[i].toLowerCase();
    if(sensitive.has(name)&&seen.has(name))throw new AuthError(422,'V3_DUPLICATE_HEADER');seen.add(name);}
  const h=request.headers;
  if(h['x-trace-id']!==undefined&&(typeof h['x-trace-id']!=='string'||!TRACE.test(h['x-trace-id']))
    ||h['x-audit-session-id']!==undefined&&(typeof h['x-audit-session-id']!=='string'||!UUID.test(h['x-audit-session-id'])))
    throw new AuthError(422,'V3_SESSION_HEADERS_INVALID');
  if(!create){if(h['transfer-encoding']!==undefined||h['content-length']!==undefined&&h['content-length']!=='0')throw new AuthError(422,'V3_GET_BODY_NOT_ALLOWED');return;}
  if(typeof h['idempotency-key']!=='string'||!KEY.test(h['idempotency-key'])||typeof h['x-audit-session-id']!=='string')
    throw new AuthError(422,'V3_SESSION_HEADERS_INVALID');
  if(h['content-encoding']!==undefined&&h['content-encoding']!=='identity')throw new AuthError(415,'V3_CONTENT_ENCODING_UNSUPPORTED');
  if(typeof h['content-type']!=='string'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(h['content-type']))throw new AuthError(415,'V3_CONTENT_TYPE_UNSUPPORTED');
}

/** Injection-only; runtime HTTPS/ingress/DPoP activation is a separate gate. */
export function createV3ExchangeHttpHandler({registry,createService,readService,cancelService,bodyDeadlineMs=5000,networkAuthority,preauthObserver}={}){
  if(!(registry instanceof V3PrincipalRegistry)||!(createService instanceof V3ExchangeSessionService)||!(readService instanceof V3ExchangeReadService)
    ||cancelService!==undefined&&!(cancelService instanceof V3ExchangeCancelService)
    ||!Number.isSafeInteger(bodyDeadlineMs)||bodyDeadlineMs<10||bodyDeadlineMs>5000)throw new Error('V3_SESSION_HTTP_CONFIGURATION_REQUIRED');
  const strict=createService.requireNetworkAudit;
  if(strict!==readService.requireNetworkAudit||strict&&cancelService!==undefined
    ||!strict&&networkAuthority!==undefined)throw new Error('V3_SESSION_HTTP_NETWORK_CONFIGURATION_REQUIRED');
  if(strict)assertIdentityNetworkAuthority(networkAuthority);
  if(preauthObserver!==undefined)assertPreauthEdgeObserver(preauthObserver);
  return async function(request,response){
    const incoming=request.headers['x-trace-id'],traceId=typeof incoming==='string'&&TRACE.test(incoming)?incoming:randomUUID();
    try{
      // Validate raw origin-form rather than normalize dot segments/encoded paths.
      const raw=request.url,create=raw==='/api/v3/exchange-sessions';
      if(typeof raw!=='string'||!raw.startsWith('/')||raw.includes('?'))throw new AuthError(422,'V3_QUERY_NOT_ALLOWED');
      const match=raw.match(/^\/api\/v3\/exchange-sessions\/([0-9a-f-]{36})$/i);
      const cancel=raw.match(/^\/api\/v3\/exchange-sessions\/([0-9a-f-]{36})\/cancel$/i);
      if(!create&&!match&&!cancel)throw new AuthError(404,'V3_ROUTE_NOT_FOUND');
      const method=create||cancel?'POST':'GET';if(request.method!==method){response.setHeader('allow',method);throw new AuthError(405,'V3_METHOD_NOT_ALLOWED');}
      if(cancel&&!cancelService)throw new AuthError(503,'V3_SESSION_CANCEL_UNAVAILABLE');
      validateHeaders(request,!!(create||cancel));
      if(strict)networkAuthority.readForRequest(request);
      let binding;try{binding=registry.resolve(request,cancel?v3ExchangeCancelPolicy:create?v3ExchangeCreatePolicy:v3ExchangeReadPolicy);}
      catch(error){if(preauthObserver)void preauthObserver.observe(request,'HUMAN_AUTH').catch(()=>{});throw error;}
      const options={auditSessionId:request.headers['x-audit-session-id']??randomUUID(),traceId};
      const network=strict?{input:networkAuthority.auditInputForRequest(request,options,binding)}:undefined;
      const result=cancel?await cancelService.cancel(binding,request.headers['idempotency-key'],cancel[1],request.headers['if-match'],await readV3SessionBody(request,{deadlineMs:bodyDeadlineMs,maxBytes:4096}),options)
        :create?await createService.create(binding,request.headers['idempotency-key'],await readV3SessionBody(request,{deadlineMs:bodyDeadlineMs}),options,network)
        :await readService.get(binding,match[1],options,network);
      if(response.destroyed||response.writableEnded)return;
      sendJson(response,create?201:200,result);
    }catch(error){
      if(response.destroyed||response.writableEnded)return;
      const known=error instanceof AuthError||error instanceof V3TransactionError||error instanceof RequestBodyError;
      const status=known?error.statusCode:503;
      response.setHeader('connection','close');response.once('finish',()=>request.destroy());
      sendProblem(response,{type:'about:blank',title:status===404?'Resource not found':'Request could not be completed',status,
        code:known?error.code:'V3_SERVICE_UNAVAILABLE',traceId});
    }
  };
}
