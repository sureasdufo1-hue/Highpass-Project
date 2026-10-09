import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCapstoneRoleSecret,createCapstoneMountedSecretPool} from '../src/v3-capstone-secret-pool.js';
const role='hp_v3_app';
const data={scope:'CAPSTONE_SYNTHETIC_ONLY',database:'highpass_v3_capstone',user:role,password:'a'.repeat(64)};
const raw=JSON.stringify(data),meta={role,uid:0,gid:65532,mode:0o640,nlink:1,size:Buffer.byteLength(raw)};
test('exact role-specific protected synthetic mount shape accepted',()=>{
 assert.equal(validateCapstoneRoleSecret(raw,meta).user,role);
});
test('owner permissions hardlinks wrong roles and malformed material refused',()=>{
 for(const changed of [{uid:65532},{gid:0},{mode:0o644},{nlink:2},{role:'hipass_bootstrap'},{role:'hp_v3_identity_preauth_reader'},{size:8192}])
 assert.throws(()=>validateCapstoneRoleSecret(raw,{...meta,...changed}),/V3_MOUNTED_SECRET/);
 for(const changed of [{database:'hipass'},{scope:'PRODUCTION'},{password:'weak'},{connectionString:'postgres://x'},{ssl:{rejectUnauthorized:false}}]){
  const value=JSON.stringify({...data,...changed});
  assert.throws(()=>validateCapstoneRoleSecret(value,{...meta,size:Buffer.byteLength(value)}),/V3_MOUNTED_SECRET/);
 }
});
test('runtime cannot use admin account insecure mode or arbitrary credentials',()=>{
 for(const options of [{mode:'PRODUCTION',role},{mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hipass_bootstrap'},{}])
 assert.throws(()=>createCapstoneMountedSecretPool(options),/V3_MOUNTED_SECRET/);
});
