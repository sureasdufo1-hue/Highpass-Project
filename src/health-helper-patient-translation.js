import {request} from 'node:http';
import {loadUploadedCorpus} from './medlineplus-upload-corpus.js';
import {loadSchoolDemoMedicalTestAddendum,retrieveSchoolDemoCandidateEvidence} from './health-helper-school-demo-medical-tests.js';
import {generateCandidateAnswer} from './health-helper-candidate-generation.js';
import {sourceGuidanceFromEvidence} from './health-helper-medlineplus.js';
import {refinePatientMedicalKorean} from './health-helper-korean-refinement.js';
import {matchScreeningGlossary} from './health-helper-glossary-interceptor.js';

// Patient copy is separate from internal review metadata and evidence gates.
function patientPresentation(result){
 const refinedAnswer = typeof result.answer === 'string'
  ? refinePatientMedicalKorean(result.answer)
  : result.answer;

 return {...result,
  ...(result.status==='SOURCE_GUIDANCE'?{answer:'이 질문에 대해 충분히 확인된 설명을 제공하기 어려워요. 아래 관련 원문 자료를 참고하고, 개인 검사 결과는 의료진과 확인해 주세요.'}:{answer:refinedAnswer}),
  sources:result.sources.map(source=>({...source,reviewNote:source.contextNote,
   ...(source.excerpt?{excerpt:refinePatientMedicalKorean(source.excerpt)}:{}),
   contextNote:'MedlinePlus 원문을 한국어로 옮긴 참고 자료입니다. 개인 검사 결과는 의료진과 확인해 주세요.'})),
  ...(Array.isArray(result.claimEvidence)?{claimEvidence:result.claimEvidence.map(item=>({
   ...item,
   text:refinePatientMedicalKorean(item.text),
   quote:refinePatientMedicalKorean(item.quote),
  }))}:{})};
}

// Existing private SSH-forwarded socket; no browser model endpoint or credentials.
export function patientTranslationFetch(env=process.env){
 if(env.HIPASS_HEALTH_HELPER_MODEL!=='ollama'||env.HIPASS_HELPER_SOCKET!=='/run/helper/ollama.sock')
  throw Error('HELPER_TRANSLATION_TRANSPORT_UNAVAILABLE');
 const sendOnce=({body,signal})=>new Promise((resolve,reject)=>{
  const req=request({socketPath:env.HIPASS_HELPER_SOCKET,path:'/translation-selection',method:'POST',signal,
   headers:{'content-type':'application/json'}},res=>{
    const parts=[];let bytes=0;
    res.on('data',part=>{bytes+=part.length;if(bytes>65536)res.destroy(Error('HELPER_OUTPUT_TOO_LARGE'));else parts.push(part);});
    res.on('error',reject);res.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:res.statusCode})));
   });req.on('error',reject);req.end(body);
 });
 return async(_url,{body,signal})=>{
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
   if(signal?.aborted)break;
   try{
    const res=await sendOnce({body,signal});
    if((res.status===429||res.status===503)&&attempt<2&&!signal?.aborted){
     await new Promise(r=>setTimeout(r,400*(attempt+1)));
     continue;
    }
    return res;
   }catch(err){
    lastError=err;
    if(attempt<2&&!signal?.aborted){
     await new Promise(r=>setTimeout(r,400*(attempt+1)));
     continue;
    }
    throw err;
   }
  }
  if(lastError)throw lastError;
  throw Error('HELPER_TRANSLATION_UNAVAILABLE');
 };
}

export async function createPatientTranslationRag({env=process.env,generateAnswer,enableGlossaryInterceptor=true}={}){
 if(env.HIPASS_HEALTH_HELPER_TRANSLATION_RAG!=='school-demo')return null;
 if(env.HIPASS_CAPSTONE_MAIN_SCENARIO!=='HCC')throw Error('HELPER_TRANSLATION_DEMO_PROFILE_REQUIRED');
 const base=await loadUploadedCorpus(new URL('../data/medlineplus-upload-ko-20261012-v3/',import.meta.url),{includeQaHolds:true});
 const supplement=await loadSchoolDemoMedicalTestAddendum();
 const corpus={...base,chunks:[...base.chunks,...supplement.chunks],held:[...base.held,...supplement.held],
  heldDocuments:[...base.heldDocuments,...supplement.held]};
 const generate=generateAnswer??((retrieval,{signal})=>generateCandidateAnswer(retrieval,{signal,fetchImpl:patientTranslationFetch(env),requireModelVersion:true}));
 const metadata={corpusVersion:base.version,medicalTestsVersion:supplement.version,
  profile:'SCHOOL_DEMO_TRANSLATION_RAG',clinicalUse:false,recordContext:'NOT_CONNECTED'};
 return async(question,{signal})=>{
  if(enableGlossaryInterceptor && env.HIPASS_HEALTH_HELPER_GLOSSARY_INTERCEPTOR!=='false'){
   const glossaryMatch=matchScreeningGlossary(question);
   if(glossaryMatch){
    return patientPresentation({...metadata,...glossaryMatch.response,
     responseMode:'SCREENING_GLOSSARY_INTERCEPT',questionOrigin:'PROJECT_TEMPLATE'});
   }
  }
  const retrieval=retrieveSchoolDemoCandidateEvidence(question,corpus,supplement);
  if(retrieval.status!=='CANDIDATE')return {...metadata,status:retrieval.status,generationUsed:false,sources:[],questions:[],
   answer:retrieval.status==='PERSONAL_INPUT_NOT_SUPPORTED'?'개인 검사 수치와 증상 해석은 지원하지 않아요. 검사 이름이나 일반적인 목적을 질문해 주세요.':
    retrieval.status==='REFUSED'?(
      /운동|식단|음식|식품|영양|다이어트|예방|방지/u.test(question)?'특정 질환의 치료법이나 운동·예방 권고는 제공하지 않아요. 건강 관리와 운동 방법은 담당 의료진과 상담해 주세요.':
      /(?:(?<![가-힣])약(?:[은는이가을를도과와에]|이나|으로)?(?![가-힣])|약물|의약품|처방|복용|투여|용량)/u.test(question)?'약물의 처방이나 복약 용량에 대한 안내는 제공하지 않아요. 복용 관련 상담은 의료진 또는 약사와 확인해 주세요.':
      /진단|확진|판정|암인가|암이야|암인지/u.test(question)?'검사 수치나 증상으로 질환을 진단하거나 확정할 수는 없어요. 정확한 진단은 담당 의료진에게 문의해 주세요.':
      '진단이나 치료·처방 판단은 제공하지 않아요. 증상과 검사 결과는 의료진에게 확인해 주세요.'
     ):'이 질문에 답할 번역 근거를 찾지 못했어요. 검사 이름과 궁금한 내용을 구체적으로 적어 주세요.'};
  let modelFailureReason=null;
  if(!retrieval.extractiveOnly){
   retrieval.claimEvidenceRequired=true;
   try{return patientPresentation({...await generate(retrieval,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])}),...metadata,generationUsed:true,questionOrigin:'LOCAL_QWEN'});}catch(err){
    if(signal?.aborted)throw Error('HELPER_TRANSLATION_ABORTED');
    modelFailureReason=err?.reasonCode??(err?.name==='TimeoutError'?'MODEL_TIMEOUT':'GENERATION_FAILED');
   }
  }
  const guidance=sourceGuidanceFromEvidence(retrieval);
  const excerpts=guidance.sources.map(source=>source.excerpt).filter(text=>typeof text==='string'&&text.trim());
  const listContext=guidance.sources.some(source=>source.listContexts?.length>0);
  return patientPresentation({...guidance,...metadata,generationUsed:false,
   ...(modelFailureReason?{generationFailureReason:modelFailureReason}:{}),
   ...(excerpts.length?{status:'RETRIEVED',answer:excerpts.join('\n\n')}:{}),
   ...(listContext?{answer:'질문에 해당하는 한국어 번역 목록을 출처와 함께 표시합니다.'}:{}),
   responseMode:'TRANSLATION_RETRIEVAL',questionOrigin:'PROJECT_TEMPLATE'});
 };
}
