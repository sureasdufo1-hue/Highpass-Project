import test from 'node:test';
import assert from 'node:assert/strict';
import {HealthHelperRag, AFP_SOURCE, retrieveHelperEvidence, validateHelperOutput} from '../src/health-helper-rag.js';
import {createAzureHelperModel} from '../src/health-helper-azure.js';
import {retrieveHealthEducationEvidence} from '../src/health-helper-education-retrieval.js';
import {testOnlyClearedCorpus} from './helpers/health-helper-corpus.js';
import {createSyntheticHccProvenanceAnswer} from '../src/health-helper-synthetic-hcc-provenance.js';
import {HCC_PATIENT_ID,HCC_PATIENT_SUBJECT} from '../src/capstone-hcc-catalog.js';
const patient={role:'PATIENT',subject:'synthetic-account',patientId:'synthetic-patient'};
const answer={answer:'AFP는 간질환의 경과를 살피는 혈액검사입니다. 검사기관의 참고범위를 확인하세요.',sourceIds:[AFP_SOURCE.id],questions:['다른 검사와 함께 어떻게 이해하면 되나요?']};
test('KDCA default source guidance never calls a model or enables derivative chunks',async()=>{
  let calls=0;const logs=[];
  const service=new HealthHelperRag({audit:async row=>logs.push(row),model:{generate:()=>{calls++;throw new Error('unexpected');}}});
  for(const question of ['AFP','AST','ALT','GGT','간기능 정상 범위']){
    const result=await service.ask(patient,{question});
    assert.equal(result.status,'SOURCE_GUIDANCE');assert.equal(result.generationUsed,false);
    assert.equal(result.questionOrigin,'PROJECT_TEMPLATE');assert.equal(result.recordContext,'NOT_CONNECTED');
    assert.ok(result.sources.every(source=>source.useMode==='LINK_ONLY' && !Object.hasOwn(source,'text')));
    assert.match(result.sources[0].url,/^https:\/\/health\.kdca\.go\.kr\//);
    assert.equal(logs.at(-1).reasonCode,'HELPER_SOURCE_GUIDANCE');
  }
  assert.equal(calls,0);
});
test('KDCA guide denies injected overrides and clinical requests; unknown topics abstain',async()=>{
  const service=new HealthHelperRag({audit:async()=>{}});
  await assert.rejects(service.ask(patient,{question:'AFP',mode:'GENERATION'}),{code:'HELPER_INPUT_INVALID'});
  assert.equal((await service.ask(patient,{question:'AFP 진단해줘'})).status,'REFUSED');
  assert.equal((await service.ask(patient,{question:'BMI'})).status,'INSUFFICIENT_EVIDENCE');
  const afp=await service.ask(patient,{question:'AFP'});
  assert.match(afp.sources[0].contextNote,/전용 설명.*아닙니다/u);
});
test('KDCA guidance audit failure returns no success and never transmits user text',async()=>{
  const logs=[];const service=new HealthHelperRag({audit:async row=>logs.push(row)});
  await service.ask(patient,{question:'홍길동 AFP 수치 999'});
  assert.doesNotMatch(JSON.stringify(logs),/홍길동|999|question|answer/);
  const broken=new HealthHelperRag({audit:async()=>{throw new Error('audit outage');}});
  await assert.rejects(broken.ask(patient,{question:'AFP'}),/audit outage/);
});
function fixture(options={}){const logs=[];const calls=[];return {logs,calls,service:new HealthHelperRag({mode:'GENERATION',corpus:testOnlyClearedCorpus(),audit:async row=>logs.push(row),model:{generate:async input=>{calls.push(input);return structuredClone(answer);}},...options})};}
test('grounded AFP generation uses canonical topic, not original text or identity',async()=>{
  const {service,calls,logs}=fixture();const result=await service.ask(patient,{question:'홍길동 AFP는 어떤 검사인가요?'});
  assert.equal(result.status,'GENERATED');assert.equal(result.recordContext,'NOT_CONNECTED');assert.equal(result.sources[0].url,AFP_SOURCE.url);
  assert.doesNotMatch(JSON.stringify(calls),/홍길동|synthetic-account|synthetic-patient/);
  assert.doesNotMatch(JSON.stringify(logs),/홍길동|어떤 검사|"answer"/);
  assert.deepEqual(logs.at(-1).helperMetadata.sourceIds,[AFP_SOURCE.id]);
});
test('wrong role and missing identity denied without model call',async()=>{
  for(const principal of [null,{...patient,role:'DOCTOR'},{...patient,patientId:null}]){
    const f=fixture();await assert.rejects(f.service.ask(principal,{question:'AFP'}),{code:'HELPER_PATIENT_REQUIRED'});assert.equal(f.calls.length,0);
  }
});
test('client records, unknown fields, malformed and overlong input rejected',async()=>{
  for(const body of [null,[],{}, {question:'AFP',patientId:'other'}, {question:'AFP',record:{value:90}}, {question:'가'.repeat(601)}]){
    const f=fixture();await assert.rejects(f.service.ask(patient,body),{code:'HELPER_INPUT_INVALID'});assert.equal(f.calls.length,0);
  }
});
test('unsupported evidence abstains without generation',async()=>{
  const f=fixture();assert.equal((await f.service.ask(patient,{question:'콜레스테롤 설명'})).status,'INSUFFICIENT_EVIDENCE');assert.equal(f.calls.length,0);
});
test('production corpus blocks generation while every medical source remains unreviewed',async()=>{
  let calls=0;const logs=[];
  const service=new HealthHelperRag({mode:'GENERATION',audit:async row=>logs.push(row),model:{generate:async()=>{calls++;return structuredClone(answer);}}});
  for(const question of ['AFP 설명','간기능 검사 설명','복부 CT 준비','혈청 크레아티닌 설명']){
    const result=await service.ask(patient,{question});
    assert.equal(result.status,'INSUFFICIENT_EVIDENCE',question);
    assert.deepEqual(result.sources,[],question);
    assert.equal(result.recordContext,'NOT_CONNECTED',question);
    assert.equal(logs.at(-1).reasonCode,'HELPER_EVIDENCE_INSUFFICIENT',question);
  }
  assert.equal(calls,0,'unassigned evidence must never reach the model');
});
test('draft educational retrieval candidates are not connected to patient-service generation',async()=>{
  const question='간 효소 AST 다른 검사와 함께 보는 이유는 무엇인가요?';
  const candidate=retrieveHealthEducationEvidence(question);
  assert.equal(candidate.status,'CANDIDATE');
  assert.equal(candidate.evidence[0].chunk_id,'liver-ast-purpose');
  assert.equal(candidate.serviceEligible,false);
  let calls=0;const logs=[];
  const service=new HealthHelperRag({mode:'GENERATION',audit:async row=>logs.push(row),
    model:{generate:async()=>{calls++;return structuredClone(answer);}}});
  const result=await service.ask(patient,{question});
  assert.equal(result.status,'INSUFFICIENT_EVIDENCE');
  assert.equal(result.recordContext,'NOT_CONNECTED');
  assert.equal(logs.at(-1).reasonCode,'HELPER_EVIDENCE_INSUFFICIENT');
  assert.equal(calls,0,'draft education evidence must not reach the patient-service model');
});
test('clinical request is a policy response, not AI-generated success',async()=>{
  const f=fixture();assert.equal((await f.service.ask(patient,{question:'AFP로 암인지 진단해줘'})).status,'REFUSED');assert.equal(f.calls.length,0);
});
test('synthetic HCC composite question returns fixture provenance only for committed scenario patient',async()=>{
  const hccPatient={role:'PATIENT',subject:HCC_PATIENT_SUBJECT,patientId:HCC_PATIENT_ID};
  const question='홍길동 56세 건강검진 결과와 AFP, 간 초음파, 간암 시나리오는 어떤 관계가 있나요?';
  assert.equal(createSyntheticHccProvenanceAnswer({principal:hccPatient,question,enabled:false,catalogCommitted:true}),null);
  assert.equal(createSyntheticHccProvenanceAnswer({principal:hccPatient,question,enabled:true,catalogCommitted:false}),null);
  const logs=[];let calls=0;
  const scenario=({principal,question:input})=>createSyntheticHccProvenanceAnswer({principal,question:input,enabled:true,catalogCommitted:true});
  const service=new HealthHelperRag({mode:'GENERATION',corpus:{version:'empty-test',sources:[],chunks:[]},audit:async row=>logs.push(row),syntheticScenario:scenario,
    model:{generate:async()=>{calls++;return structuredClone(answer);}}});
  const result=await service.ask(hccPatient,{question});
  assert.equal(result.status,'SYNTHETIC_SCENARIO');assert.equal(result.recordContext,'SYNTHETIC_SCENARIO_ONLY');
  assert.equal(result.generationUsed,false);assert.equal(result.clinicalUse,false);assert.deepEqual(result.sources,[]);
  assert.equal(result.scenarioEvidence.recordIds.length,7);
  assert.equal(result.scenarioEvidence.records.length,7);
  assert.deepEqual(result.scenarioEvidence.records[0],{id:'demo-2026-10-08-CHECKUP',kind:'CHECKUP',date:'2026-10-08'});
  assert.equal(result.scenarioEvidence.records.filter(record=>record.kind==='AFP').length,3);
  assert.equal(result.scenarioEvidence.records.filter(record=>record.kind==='ULTRASOUND').length,3);
  assert.equal(result.scenarioEvidence.presentationId,'HONG_GILDONG_SYNTHETIC_56');
  assert.equal(result.scenarioEvidence.diagnosisOrigin,'PRESENTATION_SETUP');
  assert.match(result.answer,/간 관련 건강검진 항목\(2026-10-08\): 간 효소 AST 32 U\/L, 간 효소 ALT 35 U\/L, 간 효소 γ-GTP 48 U\/L, C형간염 항체 음성/u);
  assert.match(result.answer,/2025-10-08 6\.2 ng\/mL → 2026-04-08 8\.4 ng\/mL → 2026-10-08 24\.6 ng\/mL/u);
  assert.match(result.answer,/2025-10-08, 2026-04-08, 2026-10-08의 세 기록이 같은 합성 예시 이미지를/u);
  assert.match(result.answer,/이 설정은 건강검진 수치, AFP 값 또는 초음파 이미지에서 도출한 것이 아닙니다/u);
  assert.match(result.answer,/6\.2 ng\/mL.*8\.4 ng\/mL.*24\.6 ng\/mL/u);
  assert.match(result.answer,/실제 촬영 영상이나 판독문은 아닙니다/u);
  assert.equal(calls,0);assert.equal(logs.at(-1).reasonCode,'HELPER_SYNTHETIC_SCENARIO_PROVENANCE');
  assert.doesNotMatch(JSON.stringify(logs),/홍길동|24\.6|question|answer/);

  const ordinaryPatient={...patient};
  const ordinary=await service.ask(ordinaryPatient,{question});
  assert.notEqual(ordinary.status,'SYNTHETIC_SCENARIO');assert.equal(ordinary.recordContext,'NOT_CONNECTED');
  assert.doesNotMatch(JSON.stringify(ordinary),/24\.6|홍길동/u);
  const clinical=await service.ask(hccPatient,{question:'AFP와 간 초음파가 간암 진단 근거인가요?'});
  assert.equal(clinical.status,'REFUSED');assert.equal(calls,0);
});
test('missing deployment is explicit 503, no fake answer',async()=>{
  const f=fixture({model:null});await assert.rejects(f.service.ask(patient,{question:'AFP 설명'}),{statusCode:503,code:'HELPER_MODEL_NOT_CONFIGURED'});
});
test('unknown citations, HTML, numeric advice and extra fields rejected',()=>{
  const corpus=testOnlyClearedCorpus();const evidence=retrieveHelperEvidence('AFP',corpus);
  for(const output of [{...answer,sourceIds:['invented']},{...answer,answer:'<script>bad</script>'},{...answer,answer:'약을 10 mg 복용하세요'},{...answer,url:'https://bad.example'},{...answer,questions:[]}]){
    assert.throws(()=>validateHelperOutput(output,evidence,corpus),{code:'HELPER_OUTPUT_REJECTED'});
  }
});
test('bounded timeout is a failure with no generated answer',async()=>{
  const f=fixture({model:{generate:()=>new Promise(()=>{})},timeoutMs:10});
  await assert.rejects(f.service.ask(patient,{question:'AFP'}),{code:'HELPER_MODEL_TIMEOUT'});
  assert.equal(f.logs.at(-1).result,'FAIL');assert.equal(f.service.active.size,0);
});
test('audit outage prevents model call',async()=>{
  const f=fixture({audit:async()=>{throw new Error('audit outage');}});
  await assert.rejects(f.service.ask(patient,{question:'AFP'}));assert.equal(f.calls.length,0);
});
test('per-user budget limits calls and resets after fixed window',async()=>{
  let now=0;const f=fixture({now:()=>now});for(let i=0;i<5;i++)await f.service.ask(patient,{question:'AFP'});
  await assert.rejects(f.service.ask(patient,{question:'AFP'}),{code:'HELPER_RATE_LIMITED'});
  now=60001;await f.service.ask(patient,{question:'AFP'});assert.equal(f.calls.length,6);
});
test('Azure adapter disabled by default, unsafe endpoint rejected',()=>{
  assert.equal(createAzureHelperModel({}),null);
  for(const endpoint of ['http://resource.openai.azure.com','https://evil.example','https://resource.openai.azure.com/path','https://resource.openai.azure.com/?key=x']){
    assert.throws(()=>createAzureHelperModel({HIPASS_HEALTH_HELPER_MODEL:'azure',AZURE_OPENAI_ENDPOINT:endpoint,AZURE_OPENAI_DEPLOYMENT:'demo',AZURE_OPENAI_API_KEY:'test-only'}),/CONFIGURATION_INVALID/);
  }
});
test('Azure REST contract with test double; rejects truncated completion',async()=>{
  let sent;const env={HIPASS_HEALTH_HELPER_MODEL:'azure',AZURE_OPENAI_ENDPOINT:'https://test-only.openai.azure.com/',AZURE_OPENAI_DEPLOYMENT:'test-model',AZURE_OPENAI_API_KEY:'test-only'};
  const model=createAzureHelperModel(env,async(url,options)=>{sent={url:String(url),...options};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));});
  assert.deepEqual(await model.generate({topic:'AFP',evidence:retrieveHelperEvidence('AFP'),signal:new AbortController().signal}),answer);
  assert.match(sent.url,/\/openai\/v1\/chat\/completions$/);assert.equal(sent.redirect,'error');assert.equal(JSON.parse(sent.body).response_format.json_schema.strict,true);
  const broken=createAzureHelperModel(env,async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer)}}]})));
  await assert.rejects(broken.generate({topic:'AFP',evidence:[],signal:new AbortController().signal}),{code:'HELPER_OUTPUT_REJECTED'});
});
