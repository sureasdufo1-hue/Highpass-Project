import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {V3IdentityReadiness,assertV3IdentityReadiness} from '../src/v3-identity-readiness.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {TestProvider} from '../src/auth.js';

function verifiedBinding(){
 const secret=randomBytes(32).toString('hex'),record={issuer:'synthetic-ready',subject:'synthetic-admin',actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  role:'HOSPITAL_ADMIN',authHospitalId:'SYNTH-A',scopes:['mapping:read'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const claims={iss:record.issuer,aud:'synthetic',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,scope:'mapping:read',exp:Math.floor(Date.now()/1000)+60};
 const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 return registry.resolve({headers:{authorization:'Bearer '+input+'.'+createHmac('sha256',secret).update(input).digest('base64url')}},{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']});
}
function unsafePool(){
 const queries=[],releases=[];
 return {queries,releases,async connect(){return {on(){},getTransactionStatus:()=> 'I',release:value=>releases.push(value),async query(statement){
  queries.push(statement.text);
  if(statement.text==='SHOW transaction_read_only')return {rows:[{transaction_read_only:'on'}]};
  if(statement.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:true,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
  return {rows:[]};
 }};}};
}
test('readiness rejects unverified/cloned binding before pool access and never falls back from unsafe role',async()=>{
 const pools=[unsafePool(),unsafePool(),unsafePool()];
 const config={mode:'CAPSTONE_SYNTHETIC_ONLY',clinicalPool:pools[0],publisherPool:pools[1],readerPool:pools[2]};
 for(const patch of [{mode:'PRODUCTION'},{deadlineMs:9000},{readerPool:pools[0]}])assert.throws(()=>new V3IdentityReadiness({...config,...patch}));
 const readiness=new V3IdentityReadiness(config);assertV3IdentityReadiness(readiness);
 assert.throws(()=>assertV3IdentityReadiness({...readiness}),/READINESS_REQUIRED/);
 const binding=verifiedBinding();assert.equal((await readiness.check({...binding})).status,'FAIL');assert.equal(pools[0].queries.length,0);
 const result=await readiness.check(binding);assert.equal(result.status,'FAIL');assert.equal(result.checks.length,3);
 assert.ok(result.checks.every(row=>row.reason==='UNSAFE_DATABASE_ROLE'));
 for(const pool of pools){assert.ok(pool.queries.includes('BEGIN READ ONLY'));assert.ok(pool.queries.every(sql=>!/^(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|COMMIT)\b/.test(sql)));assert.deepEqual(pool.releases,[true]);}
 readiness.dispose();assert.equal((await readiness.check(binding)).status,'NOT VERIFIED');
});
test('readiness bounds stuck acquisition and destroys late clients without executing SQL',async()=>{
 const releases=[],queries=[];
 const pool=()=>({async connect(){await new Promise(resolve=>setTimeout(resolve,90));return {on(){},release:destroy=>releases.push(destroy),query:sql=>queries.push(sql)};}});
 const readiness=new V3IdentityReadiness({mode:'CAPSTONE_SYNTHETIC_ONLY',clinicalPool:pool(),publisherPool:pool(),readerPool:pool(),deadlineMs:50});
 const result=await readiness.check(verifiedBinding());assert.equal(result.status,'FAIL');assert.ok(result.checks.every(row=>row.reason==='READINESS_DEADLINE'));
 const until=Date.now()+500;while(releases.length<3&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(releases,[true,true,true]);assert.equal(queries.length,0);readiness.dispose();
});
