import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {selectPendingSourceProjection,guardPendingPool} from '../src/v3-pending-projection.js';

function fixture(options={}){
 const secret=randomBytes(32),record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  role:'HOSPITAL_ADMIN',issuer:'synthetic-pending-projection',subject:'synthetic-source',authHospitalId:'SYNTH-A',scopes:['consent:write'],status:'ACTIVE'};
 const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-v3',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
  scope:'consent:write',exp:Math.floor(Date.now()/1000)+60}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret.toString('hex')}),records:[record]});
 const token=`${input}.${createHmac('sha256',secret.toString('hex')).update(input).digest('base64url')}`;
 const binding=registry.resolve({headers:{authorization:`Bearer ${token}`}},{requiredScope:'consent:write',allowedRoles:['HOSPITAL_ADMIN']});
 const resources=[{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.1']}];
 const row={session_id:randomUUID(),patient_ref:randomUUID(),owner_tenant_id:record.tenantId,source_hospital_id:record.hospitalId,
  target_tenant_id:randomUUID(),target_hospital_id:randomUUID(),requester_id:record.actorId,purpose:'TREATMENT',state:'REQUESTED',version:1,
  live:true,valid_from:new Date(1000),valid_until:new Date(100000),resource_count:1,requested_actions:['study:view'],
  resource_snapshot_digest:createHash('sha256').update(JSON.stringify(resources)).digest(),...options.row};
 const queries=[];
 const tx={async query(text,values=[]){queries.push({text,values});
  if(options.fault)throw Error('SYNTHETIC_STORAGE_ERROR');
  if(text.includes('AS pending,'))return {rows:[{pending:true,clinical:false,expiry:false,...options.role}]};
  if(text.includes('AS live FROM'))return {rows:options.missing?[]:[row]};
  if(text.startsWith('SELECT patient_ref'))return {rows:options.refMissing?[]:[{patient_ref:row.patient_ref}]};
  if(text.startsWith('SELECT session_id FROM highpass_v3.exchange_session_participants'))return {rows:options.participantMissing?[]:[{}]};
  if(text.startsWith('SELECT h.hospital_id'))return {rows:options.targetMissing?[]:[{hospital_id:row.target_hospital_id}]};
  if(text.startsWith('SELECT study_instance_uid'))return {rows:[{study_instance_uid:'1.2.3',whole_study:false,series_instance_uids:['1.2.3.1']}]};
  if(text.startsWith('SELECT floor'))return {rows:[{now_ms:String(options.now??2000)}]};
  return {rows:[]};
 }};
 return {binding,tx,row,queries,resources};
}
test('pending projection is scoped same-tx lock sequence with canonical immutable selection',async()=>{
 const f=fixture(),out=await selectPendingSourceProjection(f.tx,f.binding,f.row.session_id,1);
 assert.equal(out.denied,false);assert.deepEqual(out.selection.resources,f.resources);assert.equal(out.nowMs,2000);
 assert.equal(out.selection.version,1);assert.ok(Object.isFrozen(out.selection.resources[0].seriesInstanceUids));
 assert.ok(!('targetTenantId' in out.selection)&&!('actorId' in out.selection));
 const first=f.queries.find(q=>q.text.includes('AS live FROM'));assert.ok(first.text.includes('FOR SHARE'));
 assert.deepEqual(first.values,[f.row.session_id,f.binding.tenantId,f.binding.hospitalId]);
 const config=f.queries.find(q=>q.text.includes("set_config('app.pending_target_hospital'"));
 assert.deepEqual(config.values,[f.row.target_hospital_id,f.row.target_tenant_id]);
 assert.ok(f.queries.find(q=>q.text.startsWith('SELECT h.hospital_id')).text.includes('FOR SHARE OF h,t'));
 assert.ok(!f.queries.some(q=>q.text.includes('patient_mappings')||q.text.includes('INSERT')));
});
test('missing expired stale terminal ref participant and target produce safe internal denial only',async()=>{
 for(const [options,reason,version] of [[{missing:true},'SESSION_NOT_FOUND',1],[{row:{live:false}},'SESSION_EXPIRED',1],
  [{},'VERSION_MISMATCH',2],[{row:{state:'CANCELLED'}},'SESSION_TERMINAL',1],[{refMissing:true},'SOURCE_REF_UNAVAILABLE',1],
  [{participantMissing:true},'SOURCE_REF_UNAVAILABLE',1],[{targetMissing:true},'TARGET_UNAVAILABLE',1],[{now:100000},'SESSION_EXPIRED',1]]){
  const f=fixture(options);assert.deepEqual(await selectPendingSourceProjection(f.tx,f.binding,f.row.session_id,version),{denied:true,reasonCode:reason});
 }
});
test('mixed policy roles and malformed persisted hash clock or actions cannot return projection',async()=>{
 for(const options of [{role:{clinical:true}},{role:{expiry:true}},{role:{pending:false}},
  {row:{resource_snapshot_digest:randomBytes(32)}},{row:{resource_count:2}},
  {row:{requested_actions:[]}},{now:'Infinity'},{row:{valid_until:new Date(NaN)}}]){
  const f=fixture(options);await assert.rejects(selectPendingSourceProjection(f.tx,f.binding,f.row.session_id,1),
   e=>['V3_PENDING_DATABASE_ROLE_UNSAFE','V3_PENDING_PROJECTION_INVALID'].includes(e.code));
 }
});
test('unbranded binding and malformed client selector cannot query',async()=>{
 const f=fixture();await assert.rejects(selectPendingSourceProjection(f.tx,{...f.binding},f.row.session_id,1),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 for(const [id,version]of [['foreign-id',1],[f.row.session_id,0],[f.row.session_id,'1']])
  await assert.rejects(selectPendingSourceProjection(f.tx,f.binding,id,version),e=>e.code==='V3_CONSENT_PENDING_INVALID');
 assert.equal(f.queries.length,0);
});
test('pending pool rejects mixed membership before any registry RLS query',async()=>{
 for(const [row,code]of [[{pending:true,clinical:true,expiry:false},'V3_PENDING_DATABASE_ROLE_UNSAFE'],
  [null,'V3_DATABASE_UNAVAILABLE']]){
  const seen=[];let destroyed=false;
  const client={async query(q){seen.push(q);if(!row)throw Error('SYNTHETIC-SECRET');return {rows:[row]};},release(v){destroyed=v;}};
  await assert.rejects(guardPendingPool({async connect(){return client;}}).connect(),e=>e.code===code&&!e.message.includes('SECRET'));
  assert.equal(destroyed,true);assert.equal(seen.length,1);assert.equal(seen[0].query_timeout,3000);
 }
 const client={async query(){return {rows:[{pending:true,clinical:false,expiry:false}]};},release(){throw Error('MUST NOT RELEASE');}};
 assert.equal(await guardPendingPool({async connect(){return client;}}).connect(),client);
});
