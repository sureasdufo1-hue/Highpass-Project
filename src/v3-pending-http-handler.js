import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3PrincipalRegistry} from './v3-principal-registry.js';
import {V3PendingPreparationService} from './v3-pending-service.js';
import {v3ConsentPendingPolicy,normalizePendingConsentRequest} from './v3-consent-pending-contract.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {readV3SessionBody,SESSION_BODY_MAX_BYTES} from './v3-exchange-http-handler.js';
import {RequestBodyError,sendJson,sendProblem} from './http-utils.js';
import {assertPendingNetworkAuthority} from './v3-pending-network-context.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,TRACE=/^[A-Za-z0-9_-]{16,64}$/;
const sensitive=new Set(['authorization','idempotency-key','if-match','x-audit-session-id','x-trace-id','content-type','content-encoding','content-length','transfer-encoding']);
const codes=new Set(['V3_PENDING_HEADERS_INVALID','V3_DUPLICATE_HEADER','V3_QUERY_NOT_ALLOWED','V3_ROUTE_NOT_FOUND','V3_METHOD_NOT_ALLOWED',
 'V3_CONTENT_TYPE_INVALID','V3_CONTENT_ENCODING_INVALID','V3_CONSENT_PENDING_INVALID','V3_CONSENT_PENDING_WINDOW_INVALID',
 'V3_CONSENT_PENDING_SCOPE_OR_WINDOW_INVALID','V3_PENDING_RESOURCE_UNAVAILABLE','V3_PENDING_VERSION_MISMATCH','V3_PENDING_IDEMPOTENCY_CONFLICT',
 'V3_DATABASE_UNAVAILABLE','V3_COMMIT_OUTCOME_UNKNOWN','V3_TRANSACTION_DEADLINE','V3_DB_PRINCIPAL_INACTIVE',
 'V3_AUTHENTICATED_BINDING_REQUIRED','V3_ROLE_NOT_ALLOWED','V3_SCOPE_NOT_ALLOWED','V3_PRINCIPAL_NOT_REGISTERED','V3_HOSPITAL_BINDING_MISMATCH',
 'V3_BODY_INVALID','V3_BODY_TOO_LARGE','V3_BODY_ABORTED','V3_BODY_TIMEOUT','JWT_EXPIRED','V3_PENDING_NETWORK_CONTEXT_INVALID']);
function headers(request){
 const seen=new Set();for(let i=0;i<(request.rawHeaders?.length??0);i+=2){const name=request.rawHeaders[i].toLowerCase();
  if(sensitive.has(name)&&seen.has(name))throw new AuthError(422,'V3_DUPLICATE_HEADER');seen.add(name);}
 const h=request.headers;
 if(typeof h['idempotency-key']!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(h['idempotency-key'])
  ||typeof h['if-match']!=='string'||!/^"[1-9][0-9]{0,9}"$/.test(h['if-match'])||Number(h['if-match'].slice(1,-1))>2147483646
  ||typeof h['x-audit-session-id']!=='string'||!UUID.test(h['x-audit-session-id'])
  ||h['x-trace-id']!==undefined&&(typeof h['x-trace-id']!=='string'||!TRACE.test(h['x-trace-id'])))throw new AuthError(422,'V3_PENDING_HEADERS_INVALID');
 if(typeof h['content-type']!=='string'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(h['content-type']))throw new AuthError(415,'V3_CONTENT_TYPE_INVALID');
 if(h['content-encoding']!==undefined&&h['content-encoding']!=='identity')throw new AuthError(415,'V3_CONTENT_ENCODING_INVALID');
}
function receipt(value){
 const keys=['preparationId','sessionId','expectedSessionVersion','state','evidenceStatus','createdAt'];
 if(!value||typeof value!=='object'||Reflect.ownKeys(value).length!==keys.length
  ||keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))
  ||typeof value.preparationId!=='string'||!UUID.test(value.preparationId)||typeof value.sessionId!=='string'||!UUID.test(value.sessionId)
  ||value.expectedSessionVersion!==1||value.state!=='PENDING'||value.evidenceStatus!=='UNVERIFIED'
  ||typeof value.createdAt!=='string'||!Number.isSafeInteger(Date.parse(value.createdAt)))throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
 return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
/** Injection-only: deliberately not registered in server.js or a deployed router. */
export function createV3PendingHttpHandler({registry,service,networkAuthority,bodyDeadlineMs=5000,maxBytes=SESSION_BODY_MAX_BYTES}={}){
 if(networkAuthority!==undefined)assertPendingNetworkAuthority(networkAuthority);
 if(!(registry instanceof V3PrincipalRegistry)||!(service instanceof V3PendingPreparationService)
  ||!Number.isSafeInteger(bodyDeadlineMs)||bodyDeadlineMs<10||bodyDeadlineMs>5000
  ||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>SESSION_BODY_MAX_BYTES)throw Error('V3_PENDING_HTTP_CONFIGURATION_REQUIRED');
 return async(request,response)=>{
  const incoming=request.headers['x-trace-id'],traceId=typeof incoming==='string'&&TRACE.test(incoming)?incoming:randomUUID();
  try{
   const raw=request.url;if(typeof raw!=='string'||!raw.startsWith('/')||raw.includes('?'))throw new AuthError(422,'V3_QUERY_NOT_ALLOWED');
   const match=raw.match(/^\/api\/v3\/exchange-sessions\/([0-9a-f-]{36})\/consent-preparations$/i);
   if(!match||!UUID.test(match[1]))throw new AuthError(404,'V3_ROUTE_NOT_FOUND');
   if(request.method!=='POST'){response.setHeader('allow','POST');throw new AuthError(405,'V3_METHOD_NOT_ALLOWED');}
   headers(request);const binding=registry.resolve(request,v3ConsentPendingPolicy);
   const body=normalizePendingConsentRequest(binding,await readV3SessionBody(request,{deadlineMs:bodyDeadlineMs,maxBytes}));
   // Recheck request provenance after asynchronous body parsing, before any storage.
   // Persistence of these facts is a separate reviewed additive audit gate.
   if(networkAuthority)networkAuthority.readForRequest(request);
   const correlation={auditSessionId:request.headers['x-audit-session-id'],traceId};
   const networkInput=networkAuthority?.auditInputForRequest(request,correlation,binding);
   const result=receipt(await service.prepare(binding,request.headers['idempotency-key'],match[1],request.headers['if-match'],body,
    correlation,networkInput));
   if(result.sessionId.toLowerCase()!==match[1].toLowerCase())throw new V3TransactionError('V3_PENDING_RESULT_INVALID');
   if(!response.destroyed&&!response.writableEnded)sendJson(response,201,result);
  }catch(error){
   if(response.destroyed||response.writableEnded)return;
   const known=error instanceof AuthError||error instanceof RequestBodyError||error instanceof V3TransactionError;
   const status=known&&[400,401,403,404,405,408,409,412,413,415,422,503].includes(error.statusCode)?error.statusCode:503;
   const code=known&&codes.has(error.code)?error.code:status===401?'V3_AUTHENTICATION_FAILED':status===403?'V3_AUTHORIZATION_FAILED':'V3_SERVICE_UNAVAILABLE';
   response.setHeader('connection','close');response.once('finish',()=>request.destroy());
   sendProblem(response,{type:'about:blank',title:status===404?'Resource not found':'Request could not be completed',status,code,traceId});
  }
 };
}
