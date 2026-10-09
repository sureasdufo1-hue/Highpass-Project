import test from 'node:test';
import assert from 'node:assert/strict';
import {startCapstoneMountedIdentityService} from '../src/v3-capstone-mounted-service.js';
import {readCapstoneIdentityTls} from '../src/v3-capstone-secret-pool.js';

test('mounted startup cannot opt into production privileged port or forged credentials',async()=>{
 for(const config of [{},{mode:'PRODUCTION'},{mode:'CAPSTONE_SYNTHETIC_ONLY',port:443},{mode:'CAPSTONE_SYNTHETIC_ONLY',port:65536}])
  await assert.rejects(startCapstoneMountedIdentityService(config),/CONFIGURATION_REQUIRED/);
 assert.throws(()=>readCapstoneIdentityTls({mode:'PRODUCTION'}),/CONFIGURATION_INVALID/);
});
test('missing protected Linux mounts fail closed without a listening service',async(t)=>{
 // On local non-container test hosts no provisioned protected authority mounts exist.
 if(process.platform==='linux'&&process.getuid?.()===65532){t.skip('Protected container mount absence requires separate owned fixture');return;}
 await assert.rejects(startCapstoneMountedIdentityService({mode:'CAPSTONE_SYNTHETIC_ONLY'}),/NOT_STARTED/);
});
