import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/postgres-store.js';
import { buildAuditLog } from '../src/services.js';
import { createPatientSelfViewPersistence } from '../src/patient-self-view-audit-adapter.js';
import { PatientSelfViewAuthorityReader } from '../src/patient-self-view-authority.js';
import { orderStoredAuditChain } from '../src/audit-chain-order.js';
import { readFileSync } from 'node:fs';

const now=1791547200000,id='11111111-1111-4111-8111-111111111111';
async function fixture(fail) {
  const input={principal:{role:'PATIENT',subject:'synthetic-phantom-account',patientId:'HP-TEST-PHANTOM-001',
    authMethod:'TEST_JWT',authMode:'TEST',issuer:'highpass-capstone-test-idp',audience:'highpass-capstone-api',expiresAtMs:now+600000},
    patientId:'HP-TEST-PHANTOM-001',studyInstanceUid:'1.2.3',seriesInstanceUid:'1.2.3.1',requestedAction:'VIEW'};
  const row={subject:input.principal.subject,patient_id:input.patientId,account_status:'ACTIVE',evidence_kind:'CAPSTONE_MOCK_IDP',
    account_revision:id,ref_id:id,version:1,ref_status:'ACTIVE',study_instance_uid:'1.2.3',series_instance_uid:'1.2.3.1',source_hospital_id:'H-A',hospital_status:'ACTIVE'};
  const authority=await new PatientSelfViewAuthorityReader({pool:{query:async()=>({rows:[row]})},enabled:true,clock:()=>now}).authorize(input);
  const grant={grantId:id,auditSessionId:id,tokenHash:'a'.repeat(64),ownershipRevision:authority.scope.ownershipRevision,
    viewingGatewayId:'hospital-b-portal',proofKeyThumbprint:'a'.repeat(43),issuedAtMs:now,expiresAtMs:now+300000};
  const store=Object.create(PostgresStore.prototype);
  store.saveQueue=Promise.resolve(); store.data={auditLogs:[]};store.persistedData={auditLogs:[]};
  let persisted=[],pending=[],releaseCommit,enteredCommit;
  const entered=new Promise(resolve=>enteredCommit=resolve);
  const gate=new Promise(resolve=>releaseCommit=resolve);
  const client={release(){},async query(config){
    if(config.text.startsWith('SELECT a.subject'))return {rows:[row]};
    if(config.text.startsWith('SELECT audit_id'))return {rows:persisted.map(r=>({audit_id:r.auditId,record_hash:r.recordHash,previous_hash:r.previousHash}))};
    if(config.text==='COMMIT') {enteredCommit();if(fail==='paused')await gate;if(fail==='commit')throw new Error('DB');persisted.push(...pending);pending=[];}
    if(config.text==='ROLLBACK')pending=[];
    return {rows:[]};
  }};
  store.saveNow=async()=>{persisted=structuredClone(store.data.auditLogs);store.persistedData=structuredClone(store.data);};
  store.insertAuditLogs=async(rows,tx)=>{assert.ok(tx);if(fail==='audit')throw new Error('DB');pending.push(...structuredClone(rows));};
  const adapter=createPatientSelfViewPersistence({store,pool:{connect:async()=>client},enabled:true,singleWriter:true,clock:()=>now});
  return {store,adapter,input,grant,entered,releaseCommit,persisted:()=>persisted};
}

test('atomic Grant audit uses existing hash format and only publishes after commit',async()=>{
  const f=await fixture();const result=await f.adapter.create(f.input,f.grant);
  assert.equal(result.auditId,f.store.data.auditLogs[0].auditId);
  assert.match(f.store.data.auditLogs[0].recordHash,/^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(f.store.data.auditLogs,f.store.persistedData.auditLogs);
  assert.deepEqual(f.store.data.auditLogs,f.persisted());
});

test('concurrent legacy audit waits for Grant commit and links to its exact hash',async()=>{
  const f=await fixture('paused'); const create=f.adapter.create(f.input,f.grant);await f.entered;
  assert.equal(f.store.data.auditLogs.length,0);
  const legacy=f.store.runAuditMutation(()=>{
    f.store.data.auditLogs.push(buildAuditLog({actorType:'PATIENT',actorId:'synthetic',action:'SYNTHETIC',result:'SUCCESS'},
      f.store.data.auditLogs.at(-1).recordHash,new Date(now).toISOString()));
  });
  f.releaseCommit();await create;await legacy;await f.store.save();
  const chain=orderStoredAuditChain(f.persisted());assert.equal(chain.length,2);
  assert.equal(chain[1].previousHash,chain[0].recordHash);
});

test('audit or COMMIT failure leaves no success record in memory or baseline',async()=>{
  for(const fail of ['audit','commit']){
    const f=await fixture(fail);await assert.rejects(f.adapter.create(f.input,f.grant));
    assert.equal(f.store.data.auditLogs.length,0);assert.equal(f.store.persistedData.auditLogs.length,0);
    assert.equal(f.persisted().length,0);
    if(fail==='commit') await assert.rejects(f.store.save(),/POSTGRES_RELOAD_REQUIRED/);
  }
});

test('adapter is disabled unless both explicit activation and single-writer assertion exist',async()=>{
  const f=await fixture();
  for(const flags of [{},{enabled:true},{singleWriter:true}]){
    const adapter=createPatientSelfViewPersistence({store:f.store,pool:{connect:async()=>{throw new Error('must not connect');}},...flags});
    await assert.rejects(adapter.create(f.input,f.grant),/AUTHORITY_PERSISTENCE_UNAVAILABLE/);
  }
});

test('audit lock capability has fixed target/search path and no PUBLIC execution',()=>{
  const ddl=readFileSync(new URL('../db/migrations/035_capstone_patient_audit_lock.sql',import.meta.url),'utf8');
  assert.match(ddl,/SECURITY DEFINER SET search_path=pg_catalog/);
  assert.match(ddl,/LOCK TABLE public\.audit_logs IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(ddl,/REVOKE ALL ON FUNCTION public\.capstone_patient_lock_audit\(\) FROM PUBLIC/);
  assert.ok(!/GRANT .* TO PUBLIC|EXECUTE format|DELETE FROM|UPDATE audit_logs|TRUNCATE public\.audit_logs/i.test(ddl));
});
