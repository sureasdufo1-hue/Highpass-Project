import {randomUUID} from 'node:crypto';
import {V3PrincipalRegistry} from './v3-principal-registry.js';
import {v3ConsentPendingPolicy} from './v3-consent-pending-contract.js';
import {createV3PendingHttpHandler} from './v3-pending-http-handler.js';
import {createPendingNetworkAuthority} from './v3-pending-network-context.js';
import {sendProblem} from './http-utils.js';
import {assertStrictPendingNetworkService} from './v3-pending-service.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';

export {PENDING_PROXY_SAN} from './v3-pending-network-context.js';
/** Capstone only, injection-only. Mock assurance is NEVER real IdP MFA. */
export function createV3PendingCapstoneEdge({mode,registry,service,ingressSecret,bodyDeadlineMs=5000,maxBytes,preauthObserver}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!(registry instanceof V3PrincipalRegistry)||!Buffer.isBuffer(ingressSecret)||ingressSecret.length!==32)
  throw Error('V3_PENDING_EDGE_CONFIGURATION_REQUIRED');
 assertStrictPendingNetworkService(service);
 if(preauthObserver!==undefined)assertPreauthEdgeObserver(preauthObserver);
 const networkAuthority=createPendingNetworkAuthority({mode,ingressSecret});
 let handler;try{handler=createV3PendingHttpHandler({registry,service,networkAuthority,bodyDeadlineMs,...(maxBytes===undefined?{}:{maxBytes})});}
 catch(error){networkAuthority.dispose();throw error;}
 let disposed=false;
 const observe=(request,stage)=>{if(preauthObserver)void preauthObserver.observe(request,stage).catch(()=>{});};
 const deny=(request,response,code)=>{
  if(response.destroyed||response.writableEnded)return;
  response.setHeader('connection','close');response.once('finish',()=>request.destroy());
  sendProblem(response,{type:'about:blank',title:'Request could not be completed',status:403,code,traceId:randomUUID()});
 };
 const handle=async(request,response)=>{
  if(disposed){deny(request,response,'V3_PENDING_EDGE_UNAVAILABLE');return;}
  try{networkAuthority.capture(request);}
  catch{observe(request,'INGRESS');deny(request,response,'V3_PENDING_EDGE_DENIED');return;}
  try{registry.resolve(request,v3ConsentPendingPolicy);}
  catch{observe(request,'HUMAN_AUTH');deny(request,response,'V3_PENDING_EDGE_DENIED');return;}
  try{
   // Extract claims ONLY AFTER the existing registry verifies this exact JWT.
   const token=request.headers.authorization.slice(7).trim();
   const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
   if(claims.acr!=='urn:highpass:capstone:mock-mfa'||claims.highpass_test_assurance!==true||!Array.isArray(claims.amr)
    ||claims.amr.length!==3||new Set(claims.amr).size!==3||!['pwd','otp','mfa'].every(x=>claims.amr.includes(x))){
    observe(request,'MOCK_ASSURANCE');deny(request,response,'V3_PENDING_MOCK_ASSURANCE_REQUIRED');return;
   }
  }catch{observe(request,'MOCK_ASSURANCE');deny(request,response,'V3_PENDING_EDGE_DENIED');return;}
  return handler(request,response);
 };
 return Object.freeze({handle,dispose(){disposed=true;networkAuthority.dispose();}});
}
