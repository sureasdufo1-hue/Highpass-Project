import test from 'node:test';
import assert from 'node:assert/strict';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture,observeOwnedFixtureAbsence} from '../scripts/test-support/owned-postgres-start.js';

const options={name:'hp-v3-start-00000000-0000-4000-8000-000000000001',
 owner:'00000000-0000-4000-8000-000000000002',label:'highpass.validation.startup',password:'01'.repeat(32)};
const success=stdout=>({status:0,stdout,stderr:''});
function fixture(outputs){const calls=[];return {calls,docker(args,timeout){calls.push({args,timeout});return outputs.shift();}};}
const labels=JSON.stringify({[options.label]:options.owner});
test('owned fixture splits create/start and observes state without claiming readiness',()=>{
 const f=fixture([success('container-id'),success(labels),success(options.name),success('{"Running":true}')]);
 const r=startOwnedPostgresFixture({...options,...f});
 assert.equal(r.owned,true);assert.equal(r.running,true);assert.equal(Object.hasOwn(r,'ready'),false);
 assert.deepEqual(f.calls.map(c=>c.args[0]),['create','inspect','start','inspect']);
 assert(f.calls[0].args.includes('127.0.0.1::5432'));assert(f.calls.every(c=>c.timeout<=45000));
 assert(!JSON.stringify(r).includes(options.password));assert(!JSON.stringify(r).includes('container-id'));
});
test('lost create/start acknowledgements resolve same owned object, never launch a replacement',()=>{
 const timeout={status:null,error:{code:'ETIMEDOUT'},stdout:'secret raw error must not be captured'};
 const f=fixture([timeout,success(labels),timeout,success('{"Running":true}')]);
 const r=startOwnedPostgresFixture({...options,...f});
 assert.equal(r.owned,true);assert.equal(r.running,true);assert.equal(r.observations.filter(o=>o.timedOut).length,2);
 assert.equal(f.calls.filter(c=>c.args[0]==='create').length,1);
 assert(!JSON.stringify(r).includes('secret'));
});
test('foreign or unconfirmed ownership never invokes start or deletion',()=>{
 for(const observed of [success('{}'),success(JSON.stringify({[options.label]:'foreign'})),{status:1,stdout:''}]){
  const f=fixture([success('cid'),observed]);const r=startOwnedPostgresFixture({...options,...f});
  assert.equal(r.owned,false);assert.equal(r.running,false);assert.equal(f.calls.some(c=>c.args[0]==='start'),false);
  const cleanup=fixture([observed,success('some-id')]);
  assert.equal(removeOwnedPostgresFixture({...options,...cleanup}).absent,false);
  assert.equal(cleanup.calls.some(c=>c.args[0]==='rm'),false);
 }
});
test('cleanup uses confirmed owner and successful exact absence even when rm ACK is lost',()=>{
 const f=fixture([success(labels),{status:null,error:{code:'ETIMEDOUT'},stdout:''},success('')]);
 const r=removeOwnedPostgresFixture({...options,...f});assert.equal(r.owned,true);assert.equal(r.absent,true);
 assert.deepEqual(f.calls[1].args,['rm','-f','-v',options.name]);
 assert.equal(f.calls[2].args.at(-1),`name=^/${options.name}$`);
 const unavailable=fixture([success(labels),success(''),{status:1,stdout:''}]);
 assert.equal(removeOwnedPostgresFixture({...options,...unavailable}).absent,false);
});
test('disposable protocol rejects broad names labels credentials and unknown network modes',()=>{
 for(const bad of [{name:'runtime-db'},{name:'hp-v3-.*'},{owner:'unknown'},{label:'production'},
  {password:'unverified'},{mode:'host'}]){
  let called=false;assert.throws(()=>startOwnedPostgresFixture({...options,...bad,docker(){called=true;}}),/CONFIGURATION_INVALID/);
  assert.equal(called,false);
 }
});
test('late deletion is observed on same exact object, without issuing another removal',async()=>{
 const f=fixture([success('still-present'),success('')]);
 const r=await observeOwnedFixtureAbsence({...options,...f},{deadlineMs:1000,pollMs:50});
 assert.equal(r.absent,true);assert.equal(f.calls.length,2);assert(f.calls.every(c=>c.args[0]==='container'));
 assert(f.calls.every(c=>c.args.at(-1)===`name=^/${options.name}$`));
});
test('unavailable inventory cannot prove absence and observation has finite deadline',async()=>{
 const r=await observeOwnedFixtureAbsence({...options,docker:()=>({status:1,stdout:''})},{deadlineMs:50,pollMs:50});
 assert.equal(r.absent,false);assert(r.observations.length>=1);
 await assert.rejects(observeOwnedFixtureAbsence({...options,docker:()=>{}},{deadlineMs:15001}),/CONFIGURATION_INVALID/);
});
