import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {preparePatientDatabase} from '../scripts/lib/patient-database-preparation.js';
const password=()=>randomBytes(32).toString('hex');
function mock(state={role_exists:false,objects_exist:false,baseline_ready:true}){
  const calls=[];
  return {calls,query:async(text,values)=>{
    calls.push({text,values});
    if(text.includes('AS baseline_ready'))return {rows:[state]};
    if(text.includes(' AS statement'))return {rows:[{statement:'SELECT 1 /* generated DDL fixture */'}]};
    return {rows:[]};
  }};
}
test('patient database preparation defaults to rollback-only preflight',async()=>{
  const c=mock();assert.deepEqual(await preparePatientDatabase(c,{password:password()}),{status:'READY',applied:false});
  assert.equal(c.calls.at(-1).text,'ROLLBACK');
  assert.ok(!c.calls.some(c=>/CREATE TABLE|GRANT|CREATE ROLE/.test(c.text)));
});
test('existing role, partial migration and missing baseline are preserved',async()=>{
  for(const state of [{role_exists:true},{objects_exist:true},{baseline_ready:false}]){
    const c=mock({role_exists:false,objects_exist:false,baseline_ready:true,...state});
    await assert.rejects(preparePatientDatabase(c,{password:password(),apply:true}),/PATIENT_PREPARATION_/);
    assert.equal(c.calls.at(-1).text,'ROLLBACK');
  }
});
test('fresh preparation applies fixed migrations and column privileges in one transaction',async()=>{
  const c=mock();assert.equal((await preparePatientDatabase(c,{password:password(),apply:true})).migrations,4);
  assert.equal(c.calls.at(-1).text,'COMMIT');
  assert.equal(c.calls.filter(c=>c.text.includes('CREATE TABLE capstone_patient_')).length,3);
  const grants=c.calls.find(c=>c.text.startsWith('GRANT USAGE')).text;
  assert.match(grants,/UPDATE\(status,consumed_at\)/);assert.doesNotMatch(grants,/ALL PRIVILEGES|DELETE|TRUNCATE|UPDATE\(metadata\)/);
  const role=c.calls.find(c=>c.values);assert.match(role.text,/%L/);assert.equal(role.values.length,1);
});
test('invalid secret is rejected before any database access',async()=>{
  const c=mock();await assert.rejects(preparePatientDatabase(c,{password:'short',apply:true}),/SECRET_INVALID/);assert.equal(c.calls.length,0);
});
