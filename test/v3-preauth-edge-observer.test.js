import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticPreauthObserver,assertPreauthEdgeObserver} from '../src/v3-preauth-security-events.js';
const mode='CAPSTONE_SYNTHETIC_ONLY';
test('edge emitter requires same factory sink and rejects arbitrary/cloned/foreign pairing',()=>{
 const a=createSyntheticPreauthObserver({mode}),b=createSyntheticPreauthObserver({mode});
 const sink=a.createTestSink({send:async()=>{}});
 assert.throws(()=>a.createEdgeObserver({sink:{record:async()=> 'RECORDED_DURABLE'}}),/PAIR_REQUIRED/);
 assert.throws(()=>a.createEdgeObserver({sink:{...sink}}),/PAIR_REQUIRED/);
 assert.throws(()=>b.createEdgeObserver({sink}),/PAIR_REQUIRED/);
 const edge=a.createEdgeObserver({sink});assertPreauthEdgeObserver(edge);
 assert.throws(()=>assertPreauthEdgeObserver({...edge}),/OBSERVER_REQUIRED/);
});
test('edge emitter uses socket not forwarded facts and exposes bounded safe outcomes',async()=>{
 const a=createSyntheticPreauthObserver({mode});const events=[];
 const emitter=a.createEdgeObserver({sink:a.createTestSink({send:async event=>{events.push(event);}})});
 for(let i=0;i<20;i++)await emitter.observe({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'192.0.2.2'},body:{actorId:'forged'}},'INGRESS');
 assert.equal(events.every(e=>e.sourceIp==='127.0.0.1'&&e.reasonCode==='INGRESS_REJECTED'),true);
 assert.equal(emitter.observations().length,16);
 assert.deepEqual(Object.keys(emitter.observations()[0]).sort(),['outcome','stage']);
 await assert.rejects(emitter.observe({},'FORGED_STAGE'),/STAGE_INVALID/);
 emitter.dispose();assert.throws(()=>assertPreauthEdgeObserver(emitter),/OBSERVER_REQUIRED/);
 assert.equal(await emitter.observe({},'HUMAN_AUTH'),'NOT_RECORDED');assert.equal(events.length,20);
});
