import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';
const mode='CAPSTONE_SYNTHETIC_ONLY';
test('reused publisher client has one safe error listener across observer factories',async()=>{
 let listeners=0,releases=0;
 const client={on(name){assert.equal(name,'error');listeners++;},release(){releases++;},getTransactionStatus(){return 'I';},
  async query(q){return q.text.includes('AS safe')?{rows:[{safe:true,permitted:true}]}:{rowCount:1};}};
 const publisherPool={async connect(){return client;}},reconciliationPool={async connect(){throw Error('UNUSED');}};
 for(let i=0;i<20;i++){
  const observer=createSyntheticPreauthObserver({mode});
  const sink=observer.createDurableSink({publisherPool,reconciliationPool});
  assert.equal(await sink.record(observer.captureIngressFailure({})),'RECORDED_DURABLE');
 }
 assert.equal(listeners,1);assert.equal(releases,20);
});
function pool(callback){let connections=0;return {get connections(){return connections;},async connect(){connections++;return {
 on(){},release(){},getTransactionStatus(){return 'I';},async query(q){if(q.text.includes('AS safe'))return {rows:[{safe:true,permitted:true}]};return callback(q);}
 };}};}
test('durable adapter rejects forged and foreign admission before any pool access',async()=>{
 const observer=createSyntheticPreauthObserver({mode});const p=pool(()=>({rowCount:1})),r=pool(()=>({rows:[]}));
 const sink=observer.createDurableSink({publisherPool:p,reconciliationPool:r});
 await assert.rejects(sink.record({}),/ADMISSION_REQUIRED/);
 await assert.rejects(sink.confirm(createSyntheticPreauthObserver({mode}).captureIngressFailure({})),/ADMISSION_REQUIRED/);
 assert.equal(p.connections+r.connections,0);
});
test('durable adapter separates duplicate confirmation matching missing and conflicting rows',async()=>{
 const observer=createSyntheticPreauthObserver({mode}),input=observer.captureIngressFailure({remoteAddress:'127.0.0.1'});
 let duplicate=false,match=true,missing=false;
 const p=pool(()=>{if(duplicate)throw Object.assign(Error('private diagnostics'),{code:'23505'});return {rowCount:1};});
 const r=pool(()=>({rows:missing?[]:[{matches:match}]}));const sink=observer.createDurableSink({publisherPool:p,reconciliationPool:r});
 assert.equal(await sink.record(input),'RECORDED_DURABLE');duplicate=true;
 assert.equal(await sink.record(input),'NOT_CONFIRMED');assert.equal(await sink.confirm(input),'RECORDED_DURABLE');
 match=false;assert.equal(await sink.confirm(input),'EVENT_CONFLICT');missing=true;
 assert.equal(await sink.confirm(input),'NOT_CONFIRMED');
});
test('durable lost acknowledgement and dispatched timeout are unknown and capacity remains held',async()=>{
 const observer=createSyntheticPreauthObserver({mode}),input=observer.captureTlsFailure({},{});
 const r=pool(()=>({rows:[]}));const failed=observer.createDurableSink({publisherPool:pool(()=>{throw Error('lost acknowledgement');}),reconciliationPool:r});
 assert.equal(await failed.record(input),'OUTCOME_UNKNOWN');
 let settle;const p=pool(()=>new Promise(resolve=>{settle=resolve;}));
 const sink=observer.createDurableSink({publisherPool:p,reconciliationPool:r,deadlineMs:20,maxConcurrent:1});
 assert.equal(await sink.record(input),'OUTCOME_UNKNOWN');assert.equal(await sink.record(input),'OVERFLOW');
 settle({rowCount:1});await new Promise(resolve=>setImmediate(resolve));
});
test('late acquisition is discarded without insertion and unsafe role cannot dispatch',async()=>{
 const observer=createSyntheticPreauthObserver({mode}),input=observer.captureHumanAuthFailure({});
 let acquire,released=false,queries=0;
 const publisherPool={connect:()=>new Promise(resolve=>{acquire=resolve;})};
 const r=pool(()=>({rows:[]}));const sink=observer.createDurableSink({publisherPool,reconciliationPool:r,deadlineMs:20,maxConcurrent:1});
 assert.equal(await sink.record(input),'NOT_RECORDED');assert.equal(await sink.record(input),'OVERFLOW');
 acquire({on(){},release(destroy){released=destroy;},query(){queries++;}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(released,true);assert.equal(queries,0);
 const unsafe={async connect(){return {on(){},release(){},getTransactionStatus(){return 'I';},async query(){return {rows:[{safe:false,permitted:true}]};}};}};
 assert.equal(await observer.createDurableSink({publisherPool:unsafe,reconciliationPool:r}).record(input),'NOT_RECORDED');
});
test('borrowed open transaction and stale admission cannot imply durable completion',async()=>{
 const observer=createSyntheticPreauthObserver({mode}),input=observer.captureIngressFailure({});
 let queries=0;
 const open={async connect(){return {on(){},release(){},getTransactionStatus(){return 'T';},async query(){queries++;}};}};
 const r=pool(()=>({rows:[]}));
 assert.equal(await observer.createDurableSink({publisherPool:open,reconciliationPool:r}).record(input),'NOT_RECORDED');
 assert.equal(queries,0);
 const p=pool(()=>({rowCount:1}));const sink=observer.createDurableSink({publisherPool:p,reconciliationPool:r});
 const originalNow=Date.now,now=originalNow();
 try{Date.now=()=>now+10001;await assert.rejects(sink.record(input),/ADMISSION_EXPIRED/);}
 finally{Date.now=originalNow;}
 assert.equal(p.connections,0);
});
