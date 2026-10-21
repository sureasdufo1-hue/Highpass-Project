import { randomUUID } from 'node:crypto';
import {helperResultMetadata} from './helper-audit-metadata.js';
import { retrieveVisitGuidance, validateVisitQuestions, VISIT_VERSION } from './health-helper-visit.js';
import { HELPER_CORPUS, retrieveHelperEvidence, canonicalHelperTopic, isReviewedChunk,
  retrieveKdcaLinks, KDCA_LINK_INDEX_VERSION, isClearedHelperSource } from './health-helper-corpus.js';
export { CORPUS_VERSION, AFP_SOURCE, retrieveHelperEvidence } from './health-helper-corpus.js';
export class HelperError extends Error {
  constructor(statusCode, code) { super(code); this.statusCode = statusCode; this.code = code; }
}
export const helperOutputSchema = {
  type: 'object', additionalProperties: false, required: ['answer', 'sourceIds', 'questions'],
  properties: {
    answer: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
  },
};
export function validateHelperOutput(value, evidence, corpus = HELPER_CORPUS) {
  const catalog = new Map(corpus.sources.filter(isClearedHelperSource).map(source => [source.id, source]));
  const allowed = new Set(evidence.filter(chunk => chunk.contentReview === 'APPROVED' && isReviewedChunk(chunk)
    && catalog.has(chunk.sourceId)).map(chunk => chunk.sourceId));
  const safeText = (text, max) => typeof text === 'string' && text.trim().length > 0 && text.length <= max
    && !/[<>\u0000-\u001f]|https?:|www\./iu.test(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'answer,questions,sourceIds'
    || !safeText(value.answer, 1400) || !Array.isArray(value.sourceIds) || !value.sourceIds.length
    || value.sourceIds.length > 3 || value.sourceIds.some(id => !allowed.has(id))
    || !Array.isArray(value.questions) || !value.questions.length || value.questions.length > 3
    || value.questions.some(text => !safeText(text, 240))
    // This is a narrow educational pilot: no numeric thresholds, doses or personal diagnosis.
    || /\d|확진|진단됩니다|암입니다|복용하세요|처방|수술하세요/u.test(value.answer + value.questions.join(' '))) {
    throw new HelperError(502, 'HELPER_OUTPUT_REJECTED');
  }
  return { answer: value.answer.trim(), questions: [...new Set(value.questions.map(text => text.trim()))],
    sources: [...new Set(value.sourceIds)].map(id => ({ ...catalog.get(id),
      evidenceIds: evidence.filter(chunk => chunk.sourceId === id).map(chunk => chunk.id) })) };
}

export class HealthHelperRag {
  constructor({ model = null, audit, now = Date.now, timeoutMs = 15000, corpus = HELPER_CORPUS,
    mode = 'SOURCE_GUIDANCE', syntheticScenario = null, translationRag = null } = {}) {
    if (typeof audit !== 'function') throw new Error('Helper audit is required');
    this.model = model; this.audit = audit; this.now = now; this.timeoutMs = timeoutMs;
    if (!['SOURCE_GUIDANCE', 'GENERATION', 'VISIT_PREPARATION'].includes(mode)) throw new Error('Helper mode is invalid');
    this.mode = mode; // Trusted constructor configuration, never a request-field override.
    this.syntheticScenario = typeof syntheticScenario === 'function' ? syntheticScenario : null;
    this.translationRag = typeof translationRag === 'function' ? translationRag : null;
    // Trusted server configuration only; no request field or environment approval bypass.
    this.corpus = structuredClone(corpus);
    this.windows = new Map(); this.active = new Set();
  }
  async ask(principal, body) {
    const requestId = randomUUID();
    const log = async (result, reasonCode, response = {}) => this.audit({ auditSessionId: requestId,
      actorType: principal?.role ?? 'UNKNOWN', actorId: principal?.subject ?? 'unauthenticated',
      action: 'HEALTH_HELPER_REQUEST', result, reasonCode,
      helperMetadata:helperResultMetadata({...response,
        generationUsed:response.generationUsed??(result==='FAIL'||reasonCode.endsWith('_STARTED')?undefined:reasonCode.endsWith('_GENERATED')),
        generationFailureReason:response.generationFailureReason??(result==='FAIL'?reasonCode:undefined)},
        process.env.HIPASS_HEALTH_HELPER_MODEL==='ollama'?'qwen3.5:4b':null) });
    const reject = async (status, code) => { await log('FAIL', code); throw new HelperError(status, code); };
    if (principal?.role !== 'PATIENT' || !principal.patientId || !principal.subject) return reject(403, 'HELPER_PATIENT_REQUIRED');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'question'
      || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 600) return reject(422, 'HELPER_INPUT_INVALID');
    const question = body.question.trim();
    // Only a canonical topic reaches the model. Original free text and records never do.
    if (/진단|확진|(?<![가-힣])약(?:[은는이가을를도과와에]|이나|으로)?(?![가-힣])|약물|의약품|처방|복용|치료|응급|숨.*(?:차|막)|가슴.*(?:아프|통증)|암인가|암이야|암인지/u.test(question)) {
      await log('SUCCESS', 'HELPER_CLINICAL_REQUEST_REFUSED');
      return { requestId, status: 'REFUSED', answer: '진단이나 치료 판단은 제공하지 않아요. 증상과 검사 결과는 의료진에게 확인해 주세요. 긴급한 증상이 있으면 응급진료를 이용해 주세요.', sources: [], questions: [], recordContext: 'NOT_CONNECTED' };
    }
    if (this.syntheticScenario) {
      let scenario;
      try { scenario = this.syntheticScenario({ principal, question }); }
      catch { return reject(503, 'HELPER_SCENARIO_UNAVAILABLE'); }
      if (scenario) {
        await log('SUCCESS', 'HELPER_SYNTHETIC_SCENARIO_PROVENANCE');
        return { requestId, ...scenario };
      }
    }
    if (this.translationRag) {
      const now=this.now(),key=principal.subject;
      for(const [id,window] of this.windows)if(now-window.start>=60000)this.windows.delete(id);
      const entry=this.windows.get(key)??{start:now,count:0};
      if(entry.count>=5||this.active.has(key)||this.active.size>=4||(!this.windows.has(key)&&this.windows.size>=1000))
        return reject(429,'HELPER_RATE_LIMITED');
      entry.count++;this.windows.set(key,entry);this.active.add(key);
      const controller=new AbortController();let timer;
      try{
        await log('SUCCESS','HELPER_TRANSLATION_RAG_STARTED');
        const result=await Promise.race([this.translationRag(question,{signal:controller.signal}),
          new Promise((_,fail)=>{timer=setTimeout(()=>{controller.abort();fail(new HelperError(504,'HELPER_MODEL_TIMEOUT'));},this.timeoutMs);})]);
        await log('SUCCESS',result.generationUsed?'HELPER_TRANSLATION_ANSWER_GENERATED':'HELPER_TRANSLATION_EVIDENCE_DELIVERED',result);
        return {requestId,...result};
      }catch(error){const code=error instanceof HelperError?error.code:'HELPER_UNAVAILABLE';await log('FAIL',code);throw new HelperError(error.statusCode??503,code);}
      finally{clearTimeout(timer);controller.abort();this.active.delete(key);}
    }
    if (this.mode === 'SOURCE_GUIDANCE') {
      const sources = retrieveKdcaLinks(question);
      await log('SUCCESS', sources.length ? 'HELPER_SOURCE_GUIDANCE' : 'HELPER_EVIDENCE_INSUFFICIENT',{sources,corpusVersion:KDCA_LINK_INDEX_VERSION,generationUsed:false});
      return { requestId, status: sources.length ? 'SOURCE_GUIDANCE' : 'INSUFFICIENT_EVIDENCE',
        answer: sources.length
          ? '질문 주제와 관련된 질병관리청 원문을 찾았어요. 아래 자료를 직접 확인해 주세요. 이 안내는 개인 검사 결과의 해석이나 진단이 아닙니다.'
          : '이 주제에 연결할 검토된 원문 링크가 아직 없어요. 다른 검사명을 입력하거나 의료진에게 확인해 주세요.',
        sources, questions: sources.length ? ['이 자료가 제 검사에 적용되는지 확인해 주실 수 있나요?',
          '다른 검사 결과와 함께 무엇을 확인하면 좋을까요?'] : [],
        questionOrigin: 'PROJECT_TEMPLATE', recordContext: 'NOT_CONNECTED',
        corpusVersion: KDCA_LINK_INDEX_VERSION, generationUsed: false };
    }
    const visit = this.mode === 'VISIT_PREPARATION' ? retrieveVisitGuidance(question) : null;
    const evidence = this.mode === 'VISIT_PREPARATION' ? visit?.evidence ?? [] : retrieveHelperEvidence(question, this.corpus);
    if (!evidence.length) {
      await log('SUCCESS', 'HELPER_EVIDENCE_INSUFFICIENT');
      return { requestId, status: 'INSUFFICIENT_EVIDENCE', answer: '이 질문에 사용할 검토된 근거가 아직 준비되지 않았어요. 검사 결과와 궁금한 점은 의료진에게 확인해 주세요.', sources: [], questions: [], recordContext: 'NOT_CONNECTED' };
    }
    if (!this.model) return reject(503, 'HELPER_MODEL_NOT_CONFIGURED');
    const now = this.now();
    for (const [key, entry] of this.windows) if (now - entry.start >= 60000) this.windows.delete(key);
    const key = principal.subject;
    const entry = this.windows.get(key) ?? { start: now, count: 0 };
    if (entry.count >= 5 || this.active.has(key) || this.active.size >= 4 || (!this.windows.has(key) && this.windows.size >= 1000)) {
      return reject(429, 'HELPER_RATE_LIMITED');
    }
    entry.count++; this.windows.set(key, entry); this.active.add(key);
    let timer;
    const controller = new AbortController();
    try {
      await log('SUCCESS', 'HELPER_GENERATION_STARTED'); // Fail closed before any billable call.
      const generated = await Promise.race([
        Promise.resolve().then(() => this.model.generate(visit ? {...visit,signal:controller.signal} : { topic: canonicalHelperTopic(evidence), evidence, signal: controller.signal })),
        new Promise((_, rejectTimeout) => { timer = setTimeout(() => { controller.abort(); rejectTimeout(new HelperError(504, 'HELPER_MODEL_TIMEOUT')); }, this.timeoutMs); }),
      ]);
      if (visit) {
        const {modelVersion,...visitOutput}=generated??{};
        let questions;
        try { questions = validateVisitQuestions(visitOutput); } catch { throw new HelperError(502, 'HELPER_OUTPUT_REJECTED'); }
        const sources = retrieveKdcaLinks(question);
        await log('SUCCESS', 'HELPER_VISIT_QUESTIONS_GENERATED',{sources,corpusVersion:VISIT_VERSION,generationUsed:true,modelVersion});
        const answerTail = sources.some(source => source.id === 'kdca-cirrhosis-6560' && source.topics.includes('AFP'))
          ? ' 아래 질병관리청 자료는 간경변증 진료 맥락이며 AFP 전용 설명은 아닙니다.'
          : ' 아래 원문은 관련 참고자료이며 개인 기록의 해석은 의료진과 확인해 주세요.';
        return {requestId,status:'VISIT_PREPARATION',answer:`${visit.topic}에 관해 다음 진료에서 물어볼 질문을 정리했어요. 오른쪽에서 담거나 내 말로 바꿔보세요.${answerTail}`,
          questions,sources,questionOrigin:'LOCAL_QWEN',generationUsed:true,modelVersion:modelVersion??null,
          corpusVersion:VISIT_VERSION,recordContext:'NOT_CONNECTED',medicalContentGeneration:false};
      }
      const validated = validateHelperOutput(generated, evidence, this.corpus);
      await log('SUCCESS', 'HELPER_ANSWER_GENERATED',{sources:validated.sources,corpusVersion:this.corpus.version,generationUsed:true});
      return { requestId, status: 'GENERATED', ...validated, corpusVersion: this.corpus.version,
        recordContext: 'NOT_CONNECTED', disclaimer: '일반적인 검사 설명이며 개인 기록 해석·진단·처방이 아닙니다.' };
    } catch (error) {
      const code = error instanceof HelperError ? error.code : 'HELPER_MODEL_UNAVAILABLE';
      await log('FAIL', code);
      throw new HelperError(error instanceof HelperError ? error.statusCode : 503, code);
    } finally { clearTimeout(timer); controller.abort(); this.active.delete(key); }
  }
}
