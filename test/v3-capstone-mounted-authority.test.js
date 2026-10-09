import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateCapstoneAuthorityKeys,createCapstoneMountedAuthority} from '../src/v3-capstone-mounted-authority.js';
const fixture=()=>({scope:'CAPSTONE_SYNTHETIC_ONLY',identifierKeyId:'capstone-dev-local-ref-v1',
 testAuth:'a'.repeat(64),ingress:'b'.repeat(64),idempotency:'c'.repeat(64),identifierEncryption:'d'.repeat(64),identifierLookup:'e'.repeat(64)});
test('five independent32-byte purposes accepted',()=>{
 const values=validateCapstoneAuthorityKeys(fixture());assert.equal(values.length,5);assert.ok(values.every(value=>value.length===32));
});
test('shared keys wrong scope unexpected keys and malformed entropy rejected',()=>{
 for(const mutate of [v=>v.ingress=v.testAuth,v=>v.identifierLookup=v.identifierEncryption,v=>v.scope='PRODUCTION',v=>v.identifierKeyId='other',v=>v.ingress='weak',v=>v.realPatient='value']){
  const value=fixture();mutate(value);assert.throws(()=>validateCapstoneAuthorityKeys(value),/AUTHORITY_MOUNTS_INVALID/);
 }
 assert.throws(()=>createCapstoneMountedAuthority({mode:'PRODUCTION'}),/AUTHORITY_MOUNTS_INVALID/);
});
