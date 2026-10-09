import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticPreauthObserver} from '../src/v3-preauth-security-events.js';
const mode='CAPSTONE_SYNTHETIC_ONLY';
test('preauth admission excludes forwarded metadata, raw errors and clinical identity',async()=>{
 const observer=createSyntheticPreauthObserver({mode});let event;
 const input=observer.captureTlsFailure({remoteAddress:'127.0.0.1',headers:{'x-forwarded-for':'192.0.2.2'}},
  {code:'UNRECOGNIZED',message:'secret-token /private/path'});
 assert.deepEqual(Object.keys(input),[]);
 const sink=observer.createTestSink({send:async value=>{event=value;}});
 assert.equal(await sink.record(input),'RECORDED_TEST_ONLY');
 assert.equal(event.sourceIp,'127.0.0.1');assert.equal(event.sourceKind,'IMMEDIATE_SOCKET');
 assert.equal(event.reasonCode,'UNKNOWN_TLS');assert.equal(event.result,'DENY');
 assert.equal(Object.isFrozen(event),true);
 assert.equal(JSON.stringify(event).includes('secret'),false);
 assert.deepEqual(Object.keys(event).sort(),['eventId','observedAt','scope','stage','reasonCode','result','sourceKind','sourceIp'].sort());
 await assert.rejects(sink.record({...input}),/PREAUTH_ADMISSION_REQUIRED/);
 await assert.rejects(sink.record(event),/PREAUTH_ADMISSION_REQUIRED/);
 const other=createSyntheticPreauthObserver({mode});
 await assert.rejects(sink.record(other.captureIngressFailure({})),/PREAUTH_ADMISSION_REQUIRED/);
});
test('preauth fixed classification and invalid socket cannot invent an IP',async()=>{
 const observer=createSyntheticPreauthObserver({mode});let event;
 const sink=observer.createTestSink({send:async value=>{event=value;}});
 await sink.record(observer.captureTlsFailure({remoteAddress:'forged'}, {code:'CERT_HAS_EXPIRED'}));
 assert.equal(event.sourceIp,null);assert.equal(event.reasonCode,'TLS_CERTIFICATE_EXPIRED');
 await sink.record(observer.captureTlsFailure({authorizationError:'CERT_HAS_EXPIRED'}, {code:'ERR_SSL_CERTIFICATE_VERIFY_FAILED'}));
 assert.equal(event.reasonCode,'TLS_CERTIFICATE_EXPIRED');
 await sink.record(observer.captureTlsFailure({authorizationError:'UNRECOGNIZED'}, {code:'ERR_SSL_CERTIFICATE_VERIFY_FAILED'}));
 assert.equal(event.reasonCode,'UNKNOWN_TLS');
});
test('preauth sink error and excessive event fail without granting access',async()=>{
 const observer=createSyntheticPreauthObserver({mode});const input=observer.captureHumanAuthFailure({});
 assert.equal(await observer.createTestSink({send:async()=>{throw Error('secret');}}).record(input),'NOT_RECORDED');
 let calls=0;assert.equal(await observer.createTestSink({maxEventBytes:1,send:async()=>{calls++;}}).record(input),'NOT_RECORDED');
 assert.equal(calls,0);
 assert.throws(()=>createSyntheticPreauthObserver({mode:'PRODUCTION'}),/CONFIGURATION_REQUIRED/);
 assert.throws(()=>observer.createTestSink({send:()=>{},deadlineMs:Infinity}),/CONFIGURATION_REQUIRED/);
});
test('preauth timeout signals abort and holds capacity until ignored operation settles',async()=>{
 const observer=createSyntheticPreauthObserver({mode});const input=observer.captureMockAssuranceFailure({});
 let resolveSend;let signal;let calls=0;
 const sink=observer.createTestSink({deadlineMs:20,maxConcurrent:1,send:async(_,options)=>{
  calls++;signal=options.signal;await new Promise(resolve=>{resolveSend=resolve;});
 }});
 const pending=sink.record(input);
 assert.equal(await sink.record(input),'OVERFLOW');
 assert.equal(await pending,'TIMEOUT');assert.equal(signal.aborted,true);
 assert.equal(await sink.record(input),'OVERFLOW');assert.equal(calls,1);
 resolveSend();await new Promise(resolve=>setImmediate(resolve));
 const next=sink.record(input);await new Promise(resolve=>setImmediate(resolve));resolveSend();
 assert.equal(await next,'RECORDED_TEST_ONLY');assert.equal(calls,2);
});
