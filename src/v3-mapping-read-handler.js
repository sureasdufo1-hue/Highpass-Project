import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { V3TransactionError } from './v3-tenant-transaction.js';
import { V3PrincipalRegistry } from './v3-principal-registry.js';
import { V3MappingReadService,v3MappingReadPolicy } from './v3-mapping-read-service.js';
import { sendJson,sendProblem } from './http-utils.js';
import {assertIdentityNetworkAuthority} from './v3-identity-network-context.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';

/** Dependency-injected route; runtime activation is a separate gate. */
export function createV3MappingReadHandler({registry,service,networkAuthority,preauthObserver}={}){
  if(!(registry instanceof V3PrincipalRegistry) || !(service instanceof V3MappingReadService))throw new Error('V3_READ_CONFIGURATION_REQUIRED');
  if(networkAuthority!==undefined)assertIdentityNetworkAuthority(networkAuthority);
  if(preauthObserver!==undefined)assertPreauthEdgeObserver(preauthObserver);
  if(service.requireNetworkAudit!==(networkAuthority!==undefined))throw Error('V3_IDENTITY_NETWORK_MODE_MISMATCH');
  return async function(request,response){
    const traceId=request.headers['x-trace-id']??randomUUID();
    try{
      const url=new URL(request.url,'http://local.invalid');
      const match=url.pathname.match(/^\/api\/v3\/patient-mappings\/([^/]+)$/);
      if(!match)throw new AuthError(404,'V3_ROUTE_NOT_FOUND');
      if(request.method!=='GET'){response.setHeader('allow','GET');throw new AuthError(405,'V3_METHOD_NOT_ALLOWED');}
      if(url.search)throw new AuthError(422,'V3_QUERY_NOT_ALLOWED');
      let binding;try{binding=registry.resolve(request,v3MappingReadPolicy);}
      catch(error){if(preauthObserver)void preauthObserver.observe(request,'HUMAN_AUTH').catch(()=>{});throw error;}
      const context={auditSessionId:request.headers['x-audit-session-id']??randomUUID(),traceId};
      const network=networkAuthority?{context,input:networkAuthority.auditInputForRequest(request,context,binding)}:undefined;
      const metadata=await service.get(binding,match[1],traceId,network);
      sendJson(response,200,metadata);
    }catch(error){
      if(response.destroyed)return;
      const known=error instanceof AuthError || error instanceof V3TransactionError;
      const status=known?error.statusCode:503;
      sendProblem(response,{type:'about:blank',title:status===404?'Resource not found':'Request could not be completed',
        status,code:known?error.code:'V3_SERVICE_UNAVAILABLE',
        traceId:typeof traceId==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(traceId)?traceId:randomUUID()});
    }
  };
}
