import {timingSafeEqual} from 'node:crypto';
import {TestProvider} from './auth.js';
import {V3PrincipalRegistry} from './v3-principal-registry.js';
import {V3IdentifierProtection} from './v3-identifier-protection.js';
import {validateCapstoneSyntheticRegistry} from './v3-capstone-synthetic-registry.js';
import {readCapstoneAuthorityMount} from './v3-capstone-secret-pool.js';

const fail=()=>{throw Error('V3_CAPSTONE_AUTHORITY_MOUNTS_INVALID');};
export function validateCapstoneAuthorityKeys(value){
 const keys=['testAuth','ingress','idempotency','identifierEncryption','identifierLookup'];
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==[...keys,'scope','identifierKeyId'].sort().join(',')
 ||value.scope!=='CAPSTONE_SYNTHETIC_ONLY'||value.identifierKeyId!=='capstone-dev-local-ref-v1')fail();
 const decoded=keys.map(key=>{
  if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')||typeof value[key]!=='string'||!/^[a-f0-9]{64}$/.test(value[key]))fail();
  return Buffer.from(value[key],'hex');
 });
 for(let i=0;i<decoded.length;i++)for(let j=0;j<i;j++)if(timingSafeEqual(decoded[i],decoded[j]))fail();
 return decoded;
}
/** Internal operator startup dependency only; no token minting or patient approval. */
export function createCapstoneMountedAuthority({mode}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY')fail();
 const bundle=validateCapstoneSyntheticRegistry(readCapstoneAuthorityMount('registry'));
 const material=readCapstoneAuthorityMount('authority-keys');
 const [test,ingress,idempotency,encryption,lookup]=validateCapstoneAuthorityKeys(material);
 try{
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:bundle.snapshot.issuer,
   JWT_AUDIENCE:bundle.snapshot.audience,TEST_JWT_SECRET:test.toString('hex')}),records:bundle.snapshot.records});
  const protection=new V3IdentifierProtection({encryptionKeys:new Map([[material.identifierKeyId,encryption]]),activeKeyId:material.identifierKeyId,lookupKey:lookup});
  return Object.freeze({registry,protection,ingressSecret:Buffer.from(ingress),idempotencyKey:Buffer.from(idempotency),registrySha256:bundle.sha256,
   qualifier:'SYNTHETIC MOCK AUTHENTICATION ONLY — NOT REAL IDP MFA OR HUMAN APPROVAL'});
 }finally{for(const buffer of [test,ingress,idempotency,encryption,lookup])buffer.fill(0);}
}
