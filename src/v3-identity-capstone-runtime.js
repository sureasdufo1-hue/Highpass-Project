import {timingSafeEqual} from 'node:crypto';
import {V3PrincipalRegistry,v3BindingExpiry} from './v3-principal-registry.js';
import {V3IdentifierProtection} from './v3-identifier-protection.js';
import {V3TenantTransaction} from './v3-tenant-transaction.js';
import {V3IdentityIdempotency} from './v3-identity-idempotency.js';
import {V3MappingReadService} from './v3-mapping-read-service.js';
import {V3MappingWriteService} from './v3-mapping-write-service.js';
import {V3IdentityReadiness} from './v3-identity-readiness.js';
import {createSyntheticPreauthObserver} from './v3-preauth-security-events.js';
import {createV3IdentityCapstoneHost} from './v3-identity-capstone-host.js';

/** Operator-owned synthetic enrollment and pools must already exist.
 * No migration, identity issuance, grants, existing-server modification or pool ownership. */
export function createV3IdentityCapstoneRuntime({mode,registry,protection,clinicalPool,publisherPool,readerPool,
 ingressSecret,idempotencyKey,tls,port=0,readinessMs=3000}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!(registry instanceof V3PrincipalRegistry)
  ||!(protection instanceof V3IdentifierProtection)||![ingressSecret,idempotencyKey].every(key=>Buffer.isBuffer(key)&&key.length===32)
  ||timingSafeEqual(ingressSecret,idempotencyKey))throw Error('V3_IDENTITY_RUNTIME_CONFIGURATION_REQUIRED');
 let readiness,idempotency,observer,host;
 const dispose=()=>{observer?.dispose();readiness?.dispose();idempotency?.dispose();};
 try{
  readiness=new V3IdentityReadiness({mode,clinicalPool,publisherPool,readerPool,deadlineMs:readinessMs});
  const transactions=new V3TenantTransaction({pool:clinicalPool,deadlineMs:8000});
  idempotency=new V3IdentityIdempotency({transactions,hmacKey:idempotencyKey,requireNetworkAudit:true});
  const readService=new V3MappingReadService({transactions,requireNetworkAudit:true});
  const writeService=new V3MappingWriteService({idempotency,protection});
  const factory=createSyntheticPreauthObserver({mode});
  observer=factory.createEdgeObserver({sink:factory.createDurableSink({publisherPool,reconciliationPool:readerPool,
   deadlineMs:1000,maxConcurrent:2})});
  host=createV3IdentityCapstoneHost({mode,registry,readService,writeService,ingressSecret,tls,port,preauthObserver:observer,readiness});
 }catch{dispose();throw Error('V3_IDENTITY_RUNTIME_CONFIGURATION_REQUIRED');}
 let phase='CREATED',startPromise,stopPromise;
 return Object.freeze({
  state(){return Object.freeze({phase,readiness:'NOT VERIFIED',scope:'CAPSTONE_SYNTHETIC_ONLY'});},
  address(){return phase==='LISTENING'?host.address():null;},
  start(binding){
   // No caller can pass a body/header-shaped identity or borrow another startup's result.
   try{v3BindingExpiry(binding);}catch{return Promise.reject(Error('V3_IDENTITY_RUNTIME_BINDING_REQUIRED'));}
   if(phase!=='CREATED')return Promise.reject(Error('V3_IDENTITY_RUNTIME_START_ALREADY_REQUESTED'));
   phase='CHECKING';
   startPromise=(async()=>{
    try{
     const result=await readiness.check(binding);
     if(phase!=='CHECKING')throw Error('V3_IDENTITY_RUNTIME_STOPPED');
     if(result.status!=='PASS')throw Error('V3_IDENTITY_RUNTIME_PREFLIGHT_FAILED');
     v3BindingExpiry(binding);
     phase='STARTING';await host.start();
     if(phase!=='STARTING')throw Error('V3_IDENTITY_RUNTIME_STOPPED');
     phase='LISTENING';return result;
    }catch{
     if(phase!=='STOPPING'&&phase!=='CLOSED')phase='FAILED';
     dispose();await host.stop();throw Error('V3_IDENTITY_RUNTIME_NOT_STARTED');
    }
   })();return startPromise;
  },
  async checkReadiness(binding){
   if(phase!=='LISTENING')return {status:'NOT VERIFIED',reason:'RUNTIME_NOT_LISTENING'};
   return host.checkReadiness(binding);
  },
  stop(){
   if(stopPromise)return stopPromise;
   phase='STOPPING';dispose();
   stopPromise=(async()=>{
    try{await host.stop();await startPromise?.catch(()=>{});phase='CLOSED';}
    catch{phase='FAILED';throw Error('V3_IDENTITY_RUNTIME_STOP_UNVERIFIED');}
   })();return stopPromise;
  }
 });
}
