import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID,randomBytes,createHmac,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPendingNetworkAuthority,readPendingNetworkAuditInput} from '../src/v3-pending-network-context.js';
import {appendPendingNetworkAudit} from '../src/v3-pending-network-audit.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {signIngress} from '../src/ingress.js';

function fixture(t){
 const secret=randomBytes(32),jwt=randomBytes(32).toString('hex'),r={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  issuer:'synthetic-network-audit',subject:'source',authHospitalId:'SYNTH-A',role:'HOSPITAL_ADMIN',scopes:['consent:write'],status:'ACTIVE'};
 const provider=new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:jwt});
 const registry=new V3PrincipalRegistry({provider,records:[r]});
 const data=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic',sub:r.subject,hospitalId:r.authHospitalId,role:r.role,scope:'consent:write',exp:Math.floor(Date.now()/1000)+60}]
  .map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 const correlation={auditSessionId:randomUUID(),traceId:randomUUID()},request={method:'POST',url:'/synthetic',rawHeaders:[],headers:{
  authorization:`Bearer ${data}.${createHmac('sha256',jwt).update(data).digest('base64url')}`,'x-audit-session-id':correlation.auditSessionId},
  socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({raw:new X509Certificate(readFileSync(new URL('../tmp/certs/pending-edge/pending-proxy-dev.crt',import.meta.url))).raw})}};
 const binding=registry.resolve(request,{requiredScope:'consent:write',allowedRoles:['HOSPITAL_ADMIN']}),signed=signIngress(request,'127.0.0.1',secret);
 Object.assign(request.headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
 const authority=createPendingNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret});t.after(()=>authority.dispose());authority.capture(request);
 const input=authority.auditInputForRequest(request,correlation,binding);
 return {authority,input,binding,correlation,request};
}
test('opaque audit input binds real principal and generated trace with minimal parameterized write',async t=>{
 const f=fixture(t),queries=[],id=randomUUID();
 assert.equal(JSON.stringify(f.input),'{}');assert.ok(Object.isFrozen(f.input));
 await appendPendingNetworkAudit({async query(text,values){queries.push({text,values});return {rowCount:1};}},f.binding,id,f.correlation,f.input);
 assert.equal(queries.length,1);assert.deepEqual(queries[0].values.slice(0,6),[id,f.binding.tenantId,f.binding.hospitalId,f.binding.actorId,f.correlation.auditSessionId,f.correlation.traceId]);
 assert.equal(queries[0].values[6],'127.0.0.1');assert.equal(queries[0].values[8].length,32);assert.ok(!queries[0].text.includes('authorization'));
 assert.ok(!queries[0].values.some(x=>typeof x==='string'&&x.startsWith('Bearer')));
});
test('clone plain-object wrong principal and altered correlation deny before SQL',async t=>{
 const f=fixture(t),other=fixture(t);let queries=0;const tx={query(){queries++;return {rowCount:1};}};
 for(const input of [{},structuredClone(f.input),{sourceIp:'127.0.0.1'},undefined])
  await assert.rejects(appendPendingNetworkAudit(tx,f.binding,randomUUID(),f.correlation,input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 await assert.rejects(appendPendingNetworkAudit(tx,other.binding,randomUUID(),f.correlation,f.input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 await assert.rejects(appendPendingNetworkAudit(tx,f.binding,randomUUID(),{...f.correlation,traceId:randomUUID()},f.input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 assert.throws(()=>f.authority.auditInputForRequest(f.request,{...f.correlation,traceId:randomUUID()},f.binding));assert.equal(queries,0);
});
test('network helper rejects wrong affected row count and disposal after asynchronous insert',async t=>{
 const f=fixture(t);
 for(const rowCount of [0,2,undefined])await assert.rejects(appendPendingNetworkAudit({async query(){return {rowCount};}},f.binding,randomUUID(),f.correlation,f.input),e=>e.code==='V3_PENDING_NETWORK_AUDIT_NOT_RECORDED');
 await assert.rejects(appendPendingNetworkAudit({async query(){f.authority.dispose();return {rowCount:1};}},f.binding,randomUUID(),f.correlation,f.input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
});
test('transaction commit guard rechecks opaque context after callback and rolls back on disposal',async t=>{
 const f=fixture(t),queries=[],client=Object.assign(new EventEmitter(),{async query(q){queries.push(q.text);
  if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
  if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};return {rows:[]};},release(){}});
 const runner=new V3TenantTransaction({pool:{async connect(){return client;}}});
 await assert.rejects(runner.run(f.binding,'consent:write',async()=>{f.authority.dispose();return 'not committed';},f.input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 assert.ok(queries.includes('ROLLBACK'));assert.ok(!queries.includes('COMMIT'));
});
test('audit input expiry and header mutation remain fail closed',t=>{
 const f=fixture(t),now=Date.now();t.mock.method(Date,'now',()=>now+10001);
 assert.throws(()=>readPendingNetworkAuditInput(f.input,f.binding,f.correlation),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 t.mock.method(Date,'now',()=>now);f.request.headers['x-audit-session-id']=randomUUID();
 assert.throws(()=>readPendingNetworkAuditInput(f.input,f.binding,f.correlation),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
});

test('principal lock completion cannot invoke callback after network authority is disposed',async t=>{
 const f=fixture(t),queries=[];let called=false;
 const client=Object.assign(new EventEmitter(),{async query(q){queries.push(q.text);
  if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
  if(q.text.includes('FROM highpass_v3.principal_bindings p')){f.authority.dispose();return {rows:[{}]};}return {rows:[]};},release(){}});
 await assert.rejects(new V3TenantTransaction({pool:{async connect(){return client;}}}).run(f.binding,'consent:write',async()=>{called=true;},f.input),
  e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
 assert.equal(called,false);assert.ok(queries.includes('ROLLBACK'));assert.ok(!queries.includes('COMMIT'));
});
