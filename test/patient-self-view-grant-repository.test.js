import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PatientSelfViewAuthorityReader } from '../src/patient-self-view-authority.js';
import { PatientSelfViewGrantRepository } from '../src/patient-self-view-grant-repository.js';

const id = '11111111-1111-4111-8111-111111111111';
const now = 1791547200000;
const input = { principal: { role:'PATIENT',authMethod:'TEST_JWT',authMode:'TEST',issuer:'highpass-capstone-test-idp',
  audience:'highpass-capstone-api',expiresAtMs:now+600000,subject:'synthetic-phantom-account',patientId:'HP-TEST-PHANTOM-001' },
  patientId:'HP-TEST-PHANTOM-001',studyInstanceUid:'1.2.3',seriesInstanceUid:'1.2.3.1',requestedAction:'VIEW' };
const row = {subject:input.principal.subject,patient_id:input.patientId,account_status:'ACTIVE',evidence_kind:'CAPSTONE_MOCK_IDP',
  account_revision:id,ref_id:id,version:1,ref_status:'ACTIVE',study_instance_uid:'1.2.3',series_instance_uid:'1.2.3.1',
  source_hospital_id:'H-A',hospital_status:'ACTIVE'};
async function fixture(options={}) {
  const calls=[],releases=[];
  const client=new EventEmitter();
  client.release=destroy=>releases.push(destroy);
  client.query=async config=>{
    calls.push(config);
    if(options.fail && config.text.startsWith(options.fail)) throw new Error('protected parameter must not leak');
    if(config.text.startsWith('SELECT a.subject')) return {rows:options.rows??[row]};
    return {rows:[],rowCount:1};
  };
  const scope=await new PatientSelfViewAuthorityReader({pool:{query:async()=>({rows:[row]})},enabled:true,clock:()=>now}).authorize(input);
  const grant={grantId:id,auditSessionId:id,tokenHash:'a'.repeat(64),ownershipRevision:scope.scope.ownershipRevision,
    proofKeyThumbprint:'a'.repeat(43),viewingGatewayId:'hospital-b-portal',issuedAtMs:now,expiresAtMs:now+300000};
  const repo=new PatientSelfViewGrantRepository({pool:{connect:async()=>client},enabled:options.enabled??true,
    clock:options.clock??(()=>now),deadlineMs:options.deadlineMs??10000,
    appendAudit:options.appendAudit??(async(tx,event)=>{
      await tx.query({text:'INSERT audit fixture',values:[event]});
      return {auditId:id,auditSessionId:event.auditSessionId,recordHash:'b'.repeat(64)};
    })});
  return {repo,grant,calls,releases,client};
}

test('locked authority, bound insert and transactional audit precede COMMIT; no raw token',async()=>{
  const f=await fixture(); const result=await f.repo.create(input,f.grant);
  assert.equal(result.permission,'VIEW_ONLY'); assert.equal(result.accessToken,undefined);
  const select=f.calls.find(c=>c.text.startsWith('SELECT a.subject'));
  assert.match(select.text,/FOR SHARE OF a,p,r,s,h,se/);
  assert.deepEqual(select.values,[input.principal.subject,input.patientId,'1.2.3','1.2.3.1']);
  const insert=f.calls.find(c=>c.text.startsWith('INSERT INTO capstone'));
  assert.equal(insert.values.length,14); assert.ok(!JSON.stringify(f.calls).includes('accessToken'));
  assert.ok(f.calls.findIndex(c=>c.text==='INSERT audit fixture')<f.calls.findIndex(c=>c.text==='COMMIT'));
  assert.deepEqual(f.releases,[false]);
});

test('default-off/invalid lifetime/proof/gateway reject before DB',async()=>{
  for(const change of [{expiresAtMs:now+300001},{expiresAtMs:now},{proofKeyThumbprint:'invalid'},
    {viewingGatewayId:'attacker'},{tokenHash:'raw-token'}]){
    const f=await fixture(); await assert.rejects(f.repo.create(input,{...f.grant,...change}),/AUTHORITY_PERSISTENCE_UNAVAILABLE/);
    assert.equal(f.calls.length,0);
  }
  const f=await fixture({enabled:false}); await assert.rejects(f.repo.create(input,f.grant)); assert.equal(f.calls.length,0);
});

test('ownership changes or missing rows roll back without ledger/audit insert',async()=>{
  for(const rows of [[],[{...row,version:2}],[{...row,ref_status:'DELETED'}],[{...row,account_status:'SUSPENDED'}]]){
    const f=await fixture({rows}); await assert.rejects(f.repo.create(input,f.grant));
    assert.ok(f.calls.some(c=>c.text==='ROLLBACK'));
    assert.ok(!f.calls.some(c=>c.text.startsWith('INSERT')));
  }
});

test('ledger/audit/commit failure never returns a receipt or exposes DB parameters',async()=>{
  for(const fail of ['INSERT INTO','INSERT audit','COMMIT']){
    const f=await fixture({fail});
    await assert.rejects(f.repo.create(input,f.grant),error=>error.message==='AUTHORITY_PERSISTENCE_UNAVAILABLE');
    assert.ok(f.calls.some(c=>c.text==='ROLLBACK'));
  }
  const f=await fixture({appendAudit:async()=>({auditId:id,auditSessionId:id,recordHash:'invalid'})});
  await assert.rejects(f.repo.create(input,f.grant)); assert.ok(!f.calls.some(c=>c.text==='COMMIT'));
});

test('expiry during audit aborts the transaction',async()=>{
  let clock=now;
  const f=await fixture({clock:()=>clock,appendAudit:async()=>{
    clock=now+300000; return {auditId:id,auditSessionId:id,recordHash:'b'.repeat(64)};
  }});
  await assert.rejects(f.repo.create(input,f.grant)); assert.ok(f.calls.some(c=>c.text==='ROLLBACK'));
});

test('hung audit has bounded deadline and destroys the transaction connection',async()=>{
  const f=await fixture({deadlineMs:50,appendAudit:()=>new Promise(()=>{})});
  await assert.rejects(f.repo.create(input,f.grant)); assert.deepEqual(f.releases,[true]);
  assert.ok(!f.calls.some(c=>c.text==='COMMIT'));
});

test('socket failure destroys the connection and cannot commit',async()=>{
  let f;
  f=await fixture({appendAudit:async()=>{
    f.client.emit('error',new Error('protected socket detail'));
    return {auditId:id,auditSessionId:id,recordHash:'b'.repeat(64)};
  }});
  await assert.rejects(f.repo.create(input,f.grant),/AUTHORITY_PERSISTENCE_UNAVAILABLE/);
  assert.deepEqual(f.releases,[true]); assert.ok(!f.calls.some(c=>c.text==='COMMIT'));
});
