import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {parseSessionJson,readV3SessionBody,SESSION_BODY_MAX_BYTES,createV3ExchangeHttpHandler} from '../src/v3-exchange-http-handler.js';

const request=(headers={})=>Object.assign(new PassThrough(),{headers});
test('Session JSON rejects duplicate decoded keys at every depth without ambiguous authorization',()=>{
  for(const text of ['{"purpose":"A","purpose":"B"}','{"a":1,"\\u0061":2}','{"resources":[{"studyInstanceUid":"1.2","studyInstanceUid":"1.3"}]}',
    'null','[]','{"a":',`{"a":${'['.repeat(34)}0${']'.repeat(34)}}`])
    assert.throws(()=>parseSessionJson(text),e=>e.statusCode===422);
  assert.deepEqual(parseSessionJson('{"x":[{"a":"escaped \\\" quote"},{"a":true}],"b":null}'),{x:[{a:'escaped " quote'},{a:true}],b:null});
});
test('Session reader supports canonical maximum resource selection, unlike Mapping 16KiB limit',async()=>{
  const resources=Array.from({length:100},(_,s)=>({studyInstanceUid:`1.2.${s}`,seriesInstanceUids:Array.from({length:500},(_,i)=>`${'1'.repeat(54)}.${s}.${i}`)}));
  const text=JSON.stringify({resources});assert.ok(Buffer.byteLength(text)>16384&&Buffer.byteLength(text)<SESSION_BODY_MAX_BYTES);
  const stream=request(),pending=readV3SessionBody(stream);stream.end(text);assert.deepEqual((await pending).resources,resources);
});
test('Session body rejects oversized declared/actual data, invalid UTF8 and aborted streams',async()=>{
  for(const declared of [true,false]){const stream=request(declared?{'content-length':String(SESSION_BODY_MAX_BYTES+1)}:{}),pending=readV3SessionBody(stream);
    if(!declared)stream.end(Buffer.alloc(SESSION_BODY_MAX_BYTES+1));await assert.rejects(pending,e=>e.statusCode===413);stream.destroy();}
  const invalid=request(),pending=readV3SessionBody(invalid);invalid.end(Buffer.from([0xff]));await assert.rejects(pending,e=>e.statusCode===422);
  for(const event of ['aborted','error']){const stream=request(),pending=readV3SessionBody(stream);stream.emit(event,new Error('SYNTHETIC'));await assert.rejects(pending,e=>e.statusCode===400);stream.destroy();}
});
test('Session body finite deadline removes listeners; missing dependencies/budgets reject',async()=>{
  const stream=request();await assert.rejects(readV3SessionBody(stream,{deadlineMs:20}),e=>e.statusCode===408);
  assert.equal(stream.listenerCount('data'),0);stream.destroy();assert.throws(()=>createV3ExchangeHttpHandler());
  for(const options of [{deadlineMs:Infinity},{maxBytes:SESSION_BODY_MAX_BYTES+1},{deadlineMs:0}])assert.throws(()=>readV3SessionBody(request(),options));
});
