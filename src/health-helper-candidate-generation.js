import {educationPayload,validateEducationOutput} from './health-helper-medlineplus.js';

const modelFailure=reasonCode=>Object.assign(new Error('CANDIDATE_MODEL_FAILED'),{reasonCode});

// This transport is for the isolated translation candidate preview only.
// It accepts retrieved evidence, not patient records or the raw user question.
export async function generateCandidateAnswer(retrieval,{fetchImpl=fetch,signal=AbortSignal.timeout(120000),requireModelVersion=false}={}){
  const payload=educationPayload(retrieval);
  let response;
  try{
    response=await fetchImpl('http://127.0.0.1:11434/api/chat',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(payload),signal,redirect:'error',
    });
  }catch{
    throw modelFailure(signal?.aborted
      ?signal.reason?.name==='TimeoutError'?'MODEL_TIMEOUT':'MODEL_ABORTED'
      :'MODEL_CONNECTION_FAILED');
  }
  if(!response.ok)throw modelFailure('MODEL_HTTP_ERROR');
  if(!response.body)throw modelFailure('MODEL_RESPONSE_EMPTY');
  let text='',bytes=0;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  try{
    for await(const part of response.body){
      bytes+=part.byteLength;
      if(bytes>65536)throw modelFailure('MODEL_RESPONSE_TOO_LARGE');
      text+=decoder.decode(part,{stream:true});
    }
    text+=decoder.decode();
  }catch(error){
    if(error?.reasonCode==='MODEL_RESPONSE_TOO_LARGE')throw error;
    throw modelFailure(signal?.aborted
      ?signal.reason?.name==='TimeoutError'?'MODEL_TIMEOUT':'MODEL_ABORTED'
      :'MODEL_RESPONSE_READ_FAILED');
  }
  let result;
  try{result=JSON.parse(text);}catch{throw modelFailure('MODEL_RESPONSE_JSON_INVALID');}
  if(result?.done!==true||result.done_reason!=='stop'||typeof result.message?.content!=='string')
    throw modelFailure('MODEL_RESPONSE_INCOMPLETE');
  let value;
  try{value=JSON.parse(result.message.content);}catch{throw modelFailure('MODEL_OUTPUT_JSON_INVALID');}
  const version=typeof result.modelVersion==='string'&&/^[a-f0-9]{64}$/.test(result.modelVersion)?result.modelVersion:null;
  if(requireModelVersion&&!version)throw modelFailure('MODEL_VERSION_UNVERIFIED');
  const answer=validateEducationOutput(value,retrieval);
  return version?{...answer,modelVersion:version}:answer;
}
