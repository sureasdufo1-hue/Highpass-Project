import test from 'node:test';
import assert from 'node:assert/strict';
import {registerPatientPhantom} from '../scripts/lib/patient-phantom-registration.js';
import {phantomCatalog,PHANTOM_DATASET_ID} from '../src/capstone-phantom-catalog.js';
const expected=phantomCatalog('2026-10-09T00:00:00.000Z');
function fixture({writer=false,existing=false,mismatch=false,seriesMismatch=false,seriesParentMismatch=false,inactive=false,auditFault=false,commitFault=false}={}){
  const calls=[];
  return {calls,query:async(text,values)=>{
    calls.push({text,values});
    if(text.includes('pg_stat_activity'))return {rows:[{present:writer}]};
    if(text.includes('EXISTS(SELECT 1 FROM capstone_patient_accounts'))return {rows:[{present:existing}]};
    if(text.startsWith('SELECT patient_id')){const {createdAt,...patient}=expected.patient;return {rows:[patient]};}
    if(text.startsWith('SELECT status'))return {rows:[{status:inactive?'SUSPENDED':'ACTIVE'}]};
    if(text.startsWith('SELECT study_id')){const {series,...study}=expected.studies.find(s=>s.studyId===values[0]);return {rows:[{...study,patientId:mismatch?'OTHER':study.patientId}]};}
    if(text.startsWith('SELECT series_instance_uid'))return {rows:expected.studies.find(s=>s.studyInstanceUid===values[0]).series.map(s=>({...s,studyInstanceUid:seriesParentMismatch?'OTHER':values[0],bytes:String(s.bytes),instanceCount:seriesMismatch?11:s.instanceCount}))};
    if(auditFault&&text.includes('INSERT INTO audit_logs'))throw new Error('SIMULATED_AUDIT_FAILURE');
    if(commitFault&&text==='COMMIT')throw new Error('SIMULATED_CONNECTION_LOSS');
    return {rows:[]};
  }};
}
test('fixed registration preflight rolls back with no identity or audit writes',async()=>{
  const c=fixture(),r=await registerPatientPhantom(c,{datasetId:PHANTOM_DATASET_ID});
  assert.equal(r.applied,false);assert.equal(c.calls.at(-1).text,'ROLLBACK');
  assert.ok(!c.calls.some(c=>c.text.includes('INSERT')));
});
test('arbitrary dataset rejects before connecting; active writers/collisions/catalog mismatch deny',async()=>{
  const c=fixture();await assert.rejects(registerPatientPhantom(c,{datasetId:'OTHER',apply:true}),/FIXED_DATASET_REQUIRED/);assert.equal(c.calls.length,0);
  for(const option of [{writer:true},{existing:true},{mismatch:true},{seriesMismatch:true},{seriesParentMismatch:true},{inactive:true}]){
    const denied=fixture(option);await assert.rejects(registerPatientPhantom(denied,{datasetId:PHANTOM_DATASET_ID,apply:true}),/PATIENT_REGISTRATION_/);
    assert.equal(denied.calls.at(-1).text,'ROLLBACK');assert.ok(!denied.calls.some(c=>c.text.includes('INSERT')));
  }
});
test('account, two refs and existing audit chain append commit atomically using bound inputs',async()=>{
  const c=fixture(),r=await registerPatientPhantom(c,{datasetId:PHANTOM_DATASET_ID,apply:true});
  assert.equal(r.applied,true);assert.equal(c.calls.at(-1).text,'COMMIT');
  const inserts=c.calls.filter(c=>c.text.includes('INSERT'));assert.equal(inserts.length,4);
  assert.ok(inserts.every(c=>c.values?.length>0));assert.ok(!c.calls.some(c=>/DELETE|UPSERT|ON CONFLICT/.test(c.text)));
});
test('audit failure rolls back; uncertain commit requires reconciliation rather than retry success',async()=>{
  const c=fixture({auditFault:true});await assert.rejects(registerPatientPhantom(c,{datasetId:PHANTOM_DATASET_ID,apply:true}),/SIMULATED_AUDIT_FAILURE/);
  assert.equal(c.calls.at(-1).text,'ROLLBACK');assert.ok(!c.calls.some(c=>c.text==='COMMIT'));
  const uncertain=fixture({commitFault:true});await assert.rejects(registerPatientPhantom(uncertain,{datasetId:PHANTOM_DATASET_ID,apply:true}),/COMMIT_OUTCOME_UNKNOWN/);
});
