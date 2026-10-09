import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readV3MappingBody,createV3MappingWriteHandler} from '../src/v3-mapping-write-handler.js';

function request(headers={}){const stream=new PassThrough();stream.headers=headers;return stream;}
test('bounded mapping body accepts object and strict UTF-8 but rejects invalid JSON shapes',async()=>{
  for(const text of ['{}','{"expectedVersion":1}']){
    const stream=request(),pending=readV3MappingBody(stream);stream.end(text);assert.deepEqual(await pending,JSON.parse(text));
  }
  for(const bytes of [Buffer.from('[]'),Buffer.from('null'),Buffer.from('{'),Buffer.from([0xff])]){
    const stream=request(),pending=readV3MappingBody(stream);stream.end(bytes);
    await assert.rejects(pending,e=>e.code==='V3_BODY_INVALID'&&e.statusCode===422);
    assert.equal(stream.listenerCount('data'),0);stream.destroy();
  }
});
test('declared and actual size are bounded independently',async()=>{
  for(const declared of [true,false]){
    const stream=request(declared?{'content-length':'16385'}:{}),pending=readV3MappingBody(stream);
    if(!declared)stream.write(Buffer.alloc(16385));
    await assert.rejects(pending,e=>e.statusCode===413);stream.destroy();
  }
});
test('slow, aborted and failed bodies settle and remove reader listeners',async()=>{
  const slow=request();await assert.rejects(readV3MappingBody(slow,{deadlineMs:20}),e=>e.statusCode===408);
  assert.equal(slow.listenerCount('data'),0);slow.destroy();
  for(const event of ['aborted','error']){
    const stream=request(),pending=readV3MappingBody(stream);stream.emit(event,new Error('SYNTHETIC-PRIVATE'));
    await assert.rejects(pending,e=>e.code==='V3_BODY_ABORTED');stream.destroy();
  }
});
test('mapping adapter and body reader reject missing dependencies or unbounded budgets',()=>{
  assert.throws(()=>createV3MappingWriteHandler());
  for(const options of [{deadlineMs:0},{deadlineMs:5001},{maxBytes:16385}])assert.throws(()=>readV3MappingBody(request(),options));
});
