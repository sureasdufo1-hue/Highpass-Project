import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateCapstoneSyntheticRegistry,buildCapstoneSyntheticRegistrySql,buildCapstoneSourceExchangeRegistry} from '../src/v3-capstone-synthetic-registry.js';
const read=()=>JSON.parse(readFileSync('config/capstone-v3-synthetic-registry-20261009.json','utf8'));
test('version2 gives only canonical A requester Session intentions; version1 remains unchanged',()=>{
 const original=read(),bundle=buildCapstoneSourceExchangeRegistry(original);
 assert.equal(original.version,1);assert.equal(original.records[0].scopes.length,2);
 assert.equal(bundle.snapshot.version,2);assert.deepEqual(bundle.snapshot.records[0].scopes,['mapping:read','mapping:write','exchange:create','exchange:read']);
 for(let i=1;i<6;i++)assert.deepEqual(bundle.snapshot.records[i],original.records[i]);
 assert.ok(Object.isFrozen(bundle.snapshot.records[0].scopes));
 assert.throws(()=>buildCapstoneSyntheticRegistrySql(bundle,{targetDatabase:'highpass_v3_capstone'}),/REGISTRY_INVALID/);
 for(const mutate of [v=>v.records[3].scopes.push('exchange:create'),v=>v.records[0].scopes.push('consent:approve'),
  v=>v.records[0].scopes.push('exchange:cancel'),v=>v.records[0].actorId='a3000000-1000-4000-8000-000000000009',v=>v.version=3]){
  const value=JSON.parse(JSON.stringify(bundle.snapshot));mutate(value);assert.throws(()=>validateCapstoneSyntheticRegistry(value));
 }
});
test('six synthetic principals with separate requester reviewer and doctor scopes',()=>{
 const bundle=validateCapstoneSyntheticRegistry(read());assert.equal(bundle.snapshot.records.length,6);
 assert.notEqual(bundle.snapshot.records[0].actorId,bundle.snapshot.records[1].actorId);
 assert.ok(Object.isFrozen(bundle.snapshot.records[0].scopes));
 const sql=buildCapstoneSyntheticRegistrySql(bundle,{targetDatabase:'highpass_v3_capstone'});
 assert.match(sql,/SYNTHETIC_REGISTRY_NOT_EMPTY/);assert.doesNotMatch(sql,/PATIENT|VERIFIED|consent|DELETE|UPDATE|PASSWORD|ON CONFLICT/);
});
test('broadened scopes patient impersonation cross-institution and identity reuse fail closed',()=>{
 for(const edit of [v=>v.records[0].scopes.push('consent:approve'),v=>v.records[0].role='PATIENT',
 v=>v.records[3].tenantId=v.records[0].tenantId,v=>v.records[1].actorId=v.records[0].actorId,
 v=>v.records[0].subject='real-person',v=>v.scope='PRODUCTION']){
  const value=read();edit(value);assert.throws(()=>validateCapstoneSyntheticRegistry(value),/V3_SYNTHETIC_REGISTRY_INVALID/);
 }
});
test('caller mutation cannot alter SQL and fake bundles legacy targets refused',()=>{
 const value=read(),bundle=validateCapstoneSyntheticRegistry(value);value.records[0].scopes.push('anything');
 assert.equal(bundle.snapshot.records[0].scopes.length,2);
 for(const targetDatabase of ['hipass','postgres',undefined])assert.throws(()=>buildCapstoneSyntheticRegistrySql(bundle,{targetDatabase}));
 assert.throws(()=>buildCapstoneSyntheticRegistrySql({...bundle},{targetDatabase:'highpass_v3_capstone'}));
});
