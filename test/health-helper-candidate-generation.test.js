import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCandidateAnswer} from '../src/health-helper-candidate-generation.js';
import {sha256,sourceGuidanceFromEvidence} from '../src/health-helper-medlineplus.js';

function retrieval(){
 const text='CT 검사 전에 검사 준비에 관해 의료진에게 물어보세요.';
 return {status:'CANDIDATE',intent:'PREPARE',topic:'3951',focus:[],claimEvidenceRequired:true,evidence:[{
  chunk_id:'synthetic-ct-1',doc_id:'synthetic-ct',title_ko:'컴퓨터 단층촬영',text_ko:text,
  textSha256:sha256(text),source_url:'https://medlineplus.gov/ctscans.html',section_path:['준비'],
  demoIndexStatus:'PASS',contentReview:'UNASSIGNED',ai_qa_status:'PASS',unresolvedIssueCount:0,
 }]};
}
const selection={evidenceIds:['E1'],claimEvidence:[{evidenceId:'E1',sentenceIndexes:[0]}]};
const envelope=content=>JSON.stringify({done:true,done_reason:'stop',message:{content}});
const modelResponse=value=>new Response(envelope(JSON.stringify(value)));
test('patient generation requires a verified relay weights version',async()=>{
 await assert.rejects(()=>generateCandidateAnswer(retrieval(),{requireModelVersion:true,fetchImpl:async()=>modelResponse(selection)}),e=>e.reasonCode==='MODEL_VERSION_UNVERIFIED');
 const digest='a'.repeat(64);
 const output=await generateCandidateAnswer(retrieval(),{requireModelVersion:true,fetchImpl:async()=>new Response(JSON.stringify({done:true,done_reason:'stop',modelVersion:digest,message:{content:JSON.stringify(selection)}}))});
 assert.equal(output.modelVersion,digest);
});
const expectReason=(operation,reasonCode)=>assert.rejects(operation,error=>{
 assert.equal(error.reasonCode,reasonCode);
 assert.ok(['CANDIDATE_MODEL_FAILED','EDUCATION_OUTPUT_REJECTED'].includes(error.message));
 assert.deepEqual(Object.keys(error),['reasonCode']);
 return true;
});

test('candidate transport sends only retrieved evidence and derives the answer from validated selection',async()=>{
 const evidence=retrieval();
 const output=await generateCandidateAnswer({...evidence,question:'PRIVATE_RAW_QUESTION'}, {fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  assert.equal(options.redirect,'error');
  assert.doesNotMatch(options.body,/PRIVATE_RAW_QUESTION/u);
  assert.match(options.body,/CT 검사 전에/u);
  return modelResponse(selection);
 }});
 assert.equal(output.status,'GENERATED');
 assert.equal(output.answer,evidence.evidence[0].text_ko);
 assert.equal(output.sources.length,1);
 assert.equal(output.sources[0].excerpt,output.answer);
});

test('generated and fallback source cards show only the sentences allowed by retrieval',async()=>{
 const evidence=retrieval(),chunk=evidence.evidence[0];
 const selected='CT 검사 전에 검사 준비에 관해 의료진에게 물어보세요.';
 chunk.text_ko=`이 문장은 질문과 직접 관련이 없습니다. ${selected}`;
 chunk.textSha256=sha256(chunk.text_ko);chunk.allowedSentenceIndexes=[1];
 const output=await generateCandidateAnswer(evidence,{fetchImpl:async()=>modelResponse(selection)});
 assert.equal(output.answer,selected);assert.equal(output.sources[0].excerpt,selected);
 assert.equal(sourceGuidanceFromEvidence(evidence).sources[0].excerpt,selected);
 assert.throws(()=>sourceGuidanceFromEvidence({...evidence,evidence:[{...chunk,allowedSentenceIndexes:[2]}]}));
});

test('candidate transport distinguishes connection, HTTP, envelope and output failures',async()=>{
 const cases=[
  [async()=>{throw Error('secret upstream connection detail');},'MODEL_CONNECTION_FAILED'],
  [async()=>new Response('secret upstream detail',{status:503}),'MODEL_HTTP_ERROR'],
  [async()=>({ok:true,body:null}),'MODEL_RESPONSE_EMPTY'],
  [async()=>new Response('not json'),'MODEL_RESPONSE_JSON_INVALID'],
  [async()=>new Response('null'),'MODEL_RESPONSE_INCOMPLETE'],
  [async()=>new Response(JSON.stringify({done:true,done_reason:'length',message:{content:'{}'}})),'MODEL_RESPONSE_INCOMPLETE'],
  [async()=>new Response(envelope('not json')),'MODEL_OUTPUT_JSON_INVALID'],
  [async()=>modelResponse({...selection,answer:'unsupported clinical model text'}),'OUTPUT_SCHEMA'],
  [async()=>modelResponse({...selection,claimEvidence:[{evidenceId:'E1',sentenceIndexes:[9]}]}),'SENTENCE_INDEX_OUT_OF_RANGE'],
 ];
 for(const [fetchImpl,reasonCode] of cases)
  await expectReason(()=>generateCandidateAnswer(retrieval(),{fetchImpl}),reasonCode);
});

test('candidate response byte limit and strict UTF-8 apply across stream chunks',async()=>{
 let canceled=false;
 const oversized=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(32768));controller.enqueue(new Uint8Array(32769));},
  cancel(){canceled=true;},
 });
 await expectReason(()=>generateCandidateAnswer(retrieval(),{fetchImpl:async()=>new Response(oversized)}),'MODEL_RESPONSE_TOO_LARGE');
 assert.equal(canceled,true);
 await expectReason(()=>generateCandidateAnswer(retrieval(),{fetchImpl:async()=>new Response(new Uint8Array([0xff]))}),'MODEL_RESPONSE_READ_FAILED');
 const bytes=new TextEncoder().encode(JSON.stringify({done:true,done_reason:'stop',
  syntheticLabel:'한국어 분할 스트림',message:{content:JSON.stringify(selection)}}));
 const split=new ReadableStream({start(controller){
  for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();
 }});
 assert.equal((await generateCandidateAnswer(retrieval(),{fetchImpl:async()=>new Response(split)})).status,'GENERATED');
});

test('candidate timeout and client cancellation remain distinct during fetch and streaming',async()=>{
 for(const name of ['TimeoutError','AbortError']){
  const signal=AbortSignal.abort(new DOMException('private abort detail',name));
  const reasonCode=name==='TimeoutError'?'MODEL_TIMEOUT':'MODEL_ABORTED';
  await expectReason(()=>generateCandidateAnswer(retrieval(),{signal,fetchImpl:async()=>{throw signal.reason;}}),reasonCode);
  const stream=new ReadableStream({start(controller){controller.error(signal.reason);}});
  await expectReason(()=>generateCandidateAnswer(retrieval(),{signal,fetchImpl:async()=>new Response(stream)}),reasonCode);
 }
});

test('rejected model output leaves validated source guidance available, with no generated text',async()=>{
 const evidence=retrieval();
 await expectReason(()=>generateCandidateAnswer(evidence,{fetchImpl:async()=>modelResponse({...selection,answer:'unsafe answer'})}),'OUTPUT_SCHEMA');
 const fallback=sourceGuidanceFromEvidence(evidence);
 assert.equal(fallback.status,'SOURCE_GUIDANCE');
 assert.equal(fallback.generationUsed,false);
 assert.equal(fallback.sources[0].excerpt,evidence.evidence[0].text_ko);
 assert.doesNotMatch(JSON.stringify(fallback),/unsafe answer/u);
 const chunk={...evidence.evidence[0],ai_qa_status:'HOLD',sourceContentReview:'HOLD',unresolvedIssueCount:1};
 const heldFallback=sourceGuidanceFromEvidence({...evidence,evidence:[chunk]});
 assert.equal(Object.hasOwn(heldFallback.sources[0],'excerpt'),false);
 assert.equal(heldFallback.sources[0].url,chunk.source_url);
});
