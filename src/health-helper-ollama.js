import { request } from 'node:http';
import { validVisitInput, visitSchema } from './health-helper-visit.js';
export function createOllamaHelperModel(env = process.env) {
  if (env.HIPASS_HEALTH_HELPER_MODEL !== 'ollama') return null;
  // Only an SSH-forwarded, private filesystem socket. Never an arbitrary URL.
  if (env.HIPASS_HELPER_SOCKET !== '/run/helper/ollama.sock') throw new Error('Invalid helper socket');
  return {generate:({signal,...input}) => new Promise((resolve,reject) => {
    if (!validVisitInput(input)) return reject(new Error('Invalid visit input'));
    const req = request({socketPath:env.HIPASS_HELPER_SOCKET,path:'/visit-questions',method:'POST',signal,
      headers:{'content-type':'application/json'}}, res => {
      let data='';res.setEncoding('utf8');res.on('data', chunk => {data+=chunk;if(data.length>8192)res.destroy(new Error('Response too large'));});
      res.on('error',reject);res.on('end',()=>{try {if(res.statusCode!==200)throw new Error('Model unavailable');const result=JSON.parse(data);if(!/^[a-f0-9]{64}$/.test(result.modelVersion??''))throw Error('Model version unverified');resolve(result);}catch(e){reject(e);}});
    });req.on('error',reject);req.end(JSON.stringify(input));
  })};
}
export function ollamaVisitPayload(input) {
  if (!validVisitInput(input)) throw new Error('Invalid visit input');
  return {model:'qwen3.5:4b',stream:false,think:false,keep_alive:'30m',format:visitSchema,
    options:{num_ctx:2048,num_predict:160,temperature:0},messages:[
      {role:'system',content:'한국어 진료 질문 메모 도우미. 제공된 프로젝트 작성 지침에 따라 의료진에게 물어볼 짧은 질문 두 개만 JSON questions 배열로 작성한다. 각 질문은 한 문장, 물음표로 끝낸다. 검사 설명, 수치 판정, 진단, 치료, 추가 검사 권유는 금지한다. 예시: 이전 결과와 비교할 때 어떤 정보를 함께 확인하면 좋을까요? 다음 진료에 가져갈 기록은 무엇인가요? 선택한 검사의 어떤 점을 의료진에게 확인하면 좋을까요? 제공된 topic을 문장에 넣어도 된다.'},
      {role:'user',content:'{"topic":"AFP","intent":"UNDERSTAND"}'},
      {role:'assistant',content:'{"questions":["AFP 검사에 관해 어떤 점을 의료진에게 확인하면 좋을까요?","다음 진료에 가져갈 기록은 무엇인가요?"]}'},
      {role:'user',content:JSON.stringify(input)}]};
}
