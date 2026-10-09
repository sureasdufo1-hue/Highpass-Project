import {createHmac} from 'node:crypto';
import {createCapstoneMountedAuthority} from './v3-capstone-mounted-authority.js';
import {readCapstoneAuthorityMount,readCapstoneIdentityTls,createCapstoneMountedSecretPool} from './v3-capstone-secret-pool.js';
import {createV3IdentityCapstoneRuntime} from './v3-identity-capstone-runtime.js';

/** Owns only freshly constructed pools/runtime. No migrations, enrollment or patient approvals. */
export async function startCapstoneMountedIdentityService({mode,port=9445}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!Number.isInteger(port)||port<1024||port>65535)
  throw Error('V3_MOUNTED_SERVICE_CONFIGURATION_REQUIRED');
 const pools=[];let authority,tls,runtime,stopping;
 const stop=()=>{
  if(stopping)return stopping;
  stopping=(async()=>{
   let failed=false;
   try{await runtime?.stop();}catch{failed=true;}
   let timer;
   try{
    const results=await Promise.race([Promise.allSettled(pools.map(pool=>pool.end())),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('POOL_STOP_DEADLINE')),2000);})]);
    if(results.some(result=>result.status==='rejected'))failed=true;
   }catch{failed=true;}finally{clearTimeout(timer);}
   authority?.protection.dispose();authority?.ingressSecret.fill(0);authority?.idempotencyKey.fill(0);
   for(const value of Object.values(tls??{}))value.fill(0);
   if(failed)throw Error('V3_MOUNTED_SERVICE_STOP_NOT_VERIFIED');
  })();return stopping;
 };
 try{
  authority=createCapstoneMountedAuthority({mode});tls=readCapstoneIdentityTls({mode});
  for(const role of ['hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader'])
   pools.push(createCapstoneMountedSecretPool({mode,role}));
  runtime=createV3IdentityCapstoneRuntime({mode,port,registry:authority.registry,protection:authority.protection,
   clinicalPool:pools[0],publisherPool:pools[1],readerPool:pools[2],ingressSecret:authority.ingressSecret,idempotencyKey:authority.idempotencyKey,tls});
  const snapshot=readCapstoneAuthorityMount('registry'),material=readCapstoneAuthorityMount('authority-keys');
  const record=snapshot.records.find(value=>value.subject==='synthetic-capstone-a-requester');
  if(!record)throw Error('STARTUP_BINDING_REQUIRED');
  // Ephemeral synthetic startup probe only. Never emitted, saved or used as patient consent.
  const claims={iss:snapshot.issuer,aud:snapshot.audience,sub:record.subject,role:record.role,
   hospitalId:record.authHospitalId,scope:'mapping:read',exp:Math.floor(Date.now()/1000)+30};
  const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const token=input+'.'+createHmac('sha256',material.testAuth).update(input).digest('base64url');
  const binding=authority.registry.resolve({headers:{authorization:'Bearer '+token}},{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']});
  const readiness=await runtime.start(binding);
  return Object.freeze({address:()=>runtime.address(),stop,summary:Object.freeze({status:'PASS',readiness,
   scope:'CAPSTONE_SYNTHETIC_IDENTITY_ONLY',registrySha256:authority.registrySha256,
   credentialBoundary:'SEPARATE_DB_ROLES_AND_POOLS_IN_ONE_PROCESS_NOT_PROCESS_ISOLATION'})});
 }catch{
  try{await stop();}catch{throw Error('V3_MOUNTED_SERVICE_START_AND_CLEANUP_NOT_VERIFIED');}
  throw Error('V3_MOUNTED_SERVICE_NOT_STARTED');
 }
}
