import { showSecurityReport } from './security-report.js';
import {createPeriodReportPanel} from './security-period-panel.js';
import {drawHelperRequests,drawQrLifecycle,drawProtection} from './security-detail-panels.js';
const mounted = new WeakMap();
const bad = new Set(['DENIED','FAIL','FAILED','ERROR','FAILURE']);
const names = { TOKEN_EXPIRED:'토큰 유효기간 만료', CONSENT_EXPIRED:'동의 기간 만료', CONSENT_REVOKED:'동의 철회', SCOPE_MISMATCH:'검사 범위 불일치', HOSPITAL_MISMATCH:'수신 병원 불일치', ROLE_NOT_ALLOWED:'허용되지 않은 역할', TOKEN_INVALID:'유효하지 않은 토큰', DOWNLOAD_NOT_ALLOWED:'다운로드 미허용', SECURITY_CONSOLE_DENIED:'관제실 접근 거부', SECURITY_OVERVIEW_READ:'관제 기록 조회', SECURITY_EVENTS_SEARCHED:'이벤트 검색', SECURITY_REPORT_GENERATED:'사건 보고서 생성', TOKEN_ISSUED:'접근 토큰 발급', IMAGE_VIEWED:'의료영상 열람', CONSENT_CREATED:'공유 동의 생성', CONSENT_REVOKED:'공유 동의 철회' };
const reviewNames = {UNREVIEWED:'검토 전',REVIEWED:'검토 완료',INVESTIGATING:'조사 중',ACTION_REQUIRED:'조치 필요',FALSE_POSITIVE:'오탐 판단'};
const colors = {'허용·성공':'#52c6b2','거부·실패':'#ff947e','기타·경보':'#aab9ed'};
function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
function button(text,fn,cls='sc-button'){const node=el('button',text,cls);node.type='button';node.addEventListener('click',fn);return node;}
function time(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'시각 미확인';}
export const reasonGuides = Object.freeze({
  HELPER_TRANSLATION_RAG_STARTED:{title:'근거 검색·답변 처리를 시작했어요',fact:'건강도우미가 요청 처리를 시작했습니다. 답변 완료를 의미하지 않습니다.',check:'같은 요청의 완료 또는 실패 기록을 확인하세요.'},
  HELPER_TRANSLATION_ANSWER_GENERATED:{title:'근거 기반 답변을 생성했어요',fact:'모델 생성 경로에서 결과를 반환했습니다.',check:'임상적 정확성 검증과는 구분합니다. 같은 요청의 연결 기록을 확인하세요.'},
  HELPER_TRANSLATION_EVIDENCE_DELIVERED:{title:'근거 안내를 제공했어요',fact:'모델 생성 답변 대신 근거 안내를 반환했습니다.',check:'모델 장애인지 근거 안내 정책인지 이 코드만으로 단정하지 않습니다.'},
  HELPER_CLINICAL_REQUEST_REFUSED:{title:'진단·치료 요청에 안전 안내를 제공했어요',fact:'임상 판단 요청을 거절하고 안전 안내를 정상 제공했습니다.',check:'모델 답변 생성 성공이나 시스템 장애로 합산하지 않습니다.'},
  HELPER_EVIDENCE_INSUFFICIENT:{title:'사용할 근거가 부족해요',fact:'질문에 연결할 검토된 근거를 찾지 못했습니다.',check:'지식베이스의 주제 범위와 자료 검토 상태를 확인하세요.'},
  HELPER_MODEL_TIMEOUT:{title:'응답 대기시간을 초과했어요',fact:'정해진 시간 안에 처리를 완료하지 못했습니다.',check:'SSH 통로·중계·모델 상태와 동시 요청을 확인하세요.'},
  HELPER_OUTPUT_REJECTED:{title:'생성 결과가 출력 검증을 통과하지 못했어요',fact:'출력 검증 조건을 충족하지 못한 결과입니다.',check:'검증 규칙을 확인하세요. 환자 질문·답변 원문을 관제 메모에 복사하지 마세요.'},
  HELPER_RATE_LIMITED:{title:'요청 처리 제한에 도달했어요',fact:'요청 빈도 또는 동시 처리 제한으로 요청을 거부했습니다.',check:'재시도 빈도와 동시 요청 수를 확인하세요.'},
  PHR_PATIENT_BINDING_MISMATCH:{title:'계정과 건강기록의 연결이 일치하지 않아요',fact:'요청한 건강기록이 현재 계정에 허용된 환자 기록과 연결되지 않아 차단했습니다.',check:'로그인 계정과 서버의 환자 기록 매핑을 확인하세요. 이름만으로 같은 환자라고 판단하지 않습니다.'},
  HEALTH_RECORD_PATIENT_REQUIRED:{title:'환자 전용 기록에 다른 역할로 접근했어요',fact:'환자 역할이 필요한 API에 다른 역할의 계정이 요청했습니다.',check:'계정의 서버 역할과 요청한 API를 확인하세요. 의료진은 승인된 의료진 기록 경로를 사용해야 합니다.'},
  DPOP_PROOF_REQUIRED:{title:'요청 서명 증명이 필요해요',fact:'요청에 필요한 DPoP 증명이 전달되지 않았거나 해당 경로의 입력 조건을 충족하지 못했습니다. DPoP는 요청자가 해당 키를 보유하고 있음을 서명으로 확인하는 장치입니다.',check:'요청 화면의 증명 생성과 서버까지의 전달 여부를 확인하세요. 증명 검사 단계의 거부이며 전체 영상 전달 여부는 연결된 Gateway 기록에서 확인합니다.'},
  DPOP_NONCE_REPLAYED:{title:'이미 사용한 요청 증명이 다시 들어왔어요',fact:'서명 키와 요청 식별자 조합의 재사용을 감지해 차단했습니다.',check:'브라우저의 중복 전송·재시도인지 증명 재사용 시도인지 확인하세요. 새로운 요청에는 새로운 증명이 필요합니다.'},
  KEY_RELEASE_DENIED:{title:'복호화 키 사용 승인이 거부됐어요',fact:'키 사용 승인 과정에서 조건을 충족하지 못했습니다. 이 코드만으로 구체적인 실패 원인까지 알 수는 없습니다.',check:'연결된 승인 기록의 동의 상태·병원·유효기간·사용 여부를 확인하세요. 키나 토큰 원문을 검토 메모에 넣지 마세요.'},
  TICKET_ALREADY_USED:{title:'이미 접수한 QR 티켓이에요',fact:'사용이 완료된 티켓으로 다시 접수를 요청했습니다.',check:'기존 접수 결과와 중복 클릭 여부를 먼저 확인하세요. 이 이벤트만으로 공격이라고 판단하지 않습니다.'}
});
function title(value){return reasonGuides[value]?.title||names[value]||value||'미확인';}
function reasonLabel(value){return reasonGuides[value]?`${title(value)} · ${value}`:title(value);}
function reasonExplanation(code){
  const guide=reasonGuides[code],box=el('section',null,'sc-reason-explanation');
  box.append(el('h4',title(code)),el('code',code||'사유 코드 미제공'));
  box.append(el('h5','발생 사실'),el('p',guide?.fact||'이 코드의 설명은 아직 등록되지 않았습니다. 원본 이벤트와 연결된 기록을 확인하세요.'));
  box.append(el('h5','확인할 조치'),el('p',guide?.check||'발생 경로와 서버의 거부 조건을 확인하세요.'));
  box.append(el('small','거부·실패는 공격 건수가 아닙니다. 중복 요청, 연결 오류, 보안 시험도 함께 기록될 수 있습니다.'));
  return box;
}
function saveFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function reportCsv(report){
  const quote=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/u.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['보고서 ID',report.reportId],['상태',report.status],['생성 시각',report.generatedAt],['범위 시작',report.scope.from],['범위 종료',report.scope.until],['SHA-256',report.fingerprint],['주의',...report.limitations],[],['시각','출처','행위','결과','사유','기관','이벤트 참조','검토 상태','검토 메모']];
  if(report.mode==='PERIOD')rows.splice(7,0,['보고서 유형','기간 보고서'],['시간대','Asia/Seoul'],['필터',JSON.stringify(report.scope.filters)],['집계 대상',report.summary.total],['상세 수록',report.events.length],['출처 범위',JSON.stringify(report.scope.sources)],...report.summary.outcomes.map(item=>['결과 집계',item.label,item.count]),...report.summary.hours.map(item=>['시간 집계',item.label,item.count]));
  for(const event of report.events)rows.push([event.time,event.source,event.action,event.result,event.reasonCode,event.hospitalId,event.eventRef,event.review?.status||'UNREVIEWED',event.review?.note||'']);
  return '\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
function printReport(report){
  showSecurityReport(report,{actionLabel:title,reasonLabel,reasonDescription:code=>reasonGuides[code]?`${reasonGuides[code].fact} 확인할 조치: ${reasonGuides[code].check}`:''});
}
function setConsoleView(state,view){
  state.view=view;
  for(const[key,panel]of Object.entries(state.views))panel.hidden=key!==view;
  for(const[key,tab]of Object.entries(state.tabs)){tab.setAttribute('aria-selected',String(key===view));tab.tabIndex=key===view?0:-1;}
  state.root.classList.toggle('sc-presenting',view==='dashboard'&&state.presenting===true);
  if(view==='protection')drawProtection(state.views.protection,state.api);
}
function explore(state){setConsoleView(state,'events');return load(state);}
export function renderSecurityConsole(root,api){
  let state=mounted.get(root);
  if(!state){state={api,selected:new Map(),version:0,until:null};mounted.set(root,state);build(root,state);}
  state.api=api;root.closest('[data-screen="audit"]')?.classList.add('security-console-active');
  if(api.state==='loading'){state.status.textContent='감사 자료를 연결하고 있어요.';return;}
  if(api.state!=='ready'){state.periodPanel?.clear();state.status.textContent='관제 자료를 불러오지 못했습니다. 로그인과 연결 상태를 확인해 주세요.';state.heroCount.textContent='—';state.charts.replaceChildren(el('p','집계 미확인 · 조회 실패를 0건으로 표시하지 않습니다.'));return;}
  state.overview=api.overview;state.until=null;load(state);
}
function build(root,state){
  root.replaceChildren();root.classList.add('sc-root');state.root=root;
  const hero=el('header',null,'sc-hero'),heading=el('div');heading.append(el('p','Medi Q 보안 관제실','sc-brand'),el('h2','신호를 읽고, 사건을 연결하세요.'),el('p','동의부터 영상 열람까지, 남겨진 기록을 따라갑니다.','sc-subtitle'));
  const signal=button('',()=>{state.review.value='UNREVIEWED';state.result.value='거부·실패';explore(state);state.explorer.scrollIntoView({behavior:'auto'});},'sc-signal');state.heroCount=el('strong','—');signal.append(state.heroCount,el('span','확인할 접근 거부·실패'));hero.append(heading,signal);root.append(hero);
  const nav=el('nav',null,'sc-nav');nav.setAttribute('aria-label','관제실 메뉴');const tabs=el('div',null,'sc-tabs');tabs.setAttribute('role','tablist');state.tabs={};
  for(const[key,label]of [['dashboard','상황판'],['events','이벤트 탐색기'],['helper','건강도우미 요청'],['qr','QR 생애주기'],['protection','보호 설정'],['reports','보고서']]){const tab=button(label,()=>setConsoleView(state,key));tab.id='sc-tab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','sc-panel-'+key);state.tabs[key]=tab;tabs.append(tab);}
  tabs.addEventListener('keydown',event=>{const keys=Object.keys(state.tabs),index=keys.findIndex(key=>state.tabs[key]===event.target);if(index<0||!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:keys.length-1))%keys.length;setConsoleView(state,keys[next]);state.tabs[keys[next]].focus();});
  const present=button('발표 보기',()=>{state.presenting=!state.presenting;present.textContent=state.presenting?'기본 보기':'발표 보기';present.setAttribute('aria-pressed',String(state.presenting));setConsoleView(state,'dashboard');});present.setAttribute('aria-pressed','false');nav.append(tabs,present,button('새 기록 불러오기',()=>state.api.refresh()));
  state.status=el('p','감사 자료 연결 중…','sc-status');state.status.setAttribute('role','status');root.append(nav,state.status);
  const rangeRoot=el('section',null,'sc-range');root.append(rangeRoot);
  state.sources=el('div',null,'sc-sources');state.charts=el('div',null,'sc-charts');root.append(state.sources,state.charts);
  const work=el('div',null,'sc-work');state.explorer=el('section',null,'sc-explorer');state.explorer.append(el('h3','이벤트 탐색기'));
  const form=el('form',null,'sc-search');const searchLabel=el('label','이벤트 검색');state.search=el('input');state.search.type='search';state.search.maxLength=120;state.search.placeholder='TOKEN_EXPIRED, 토큰, 병원 또는 이벤트 참조';searchLabel.append(state.search);form.append(searchLabel);
  const select=(label,options)=>{const field=el('label',label),node=el('select');for(const[value,text]of options)node.add(new Option(text,value));field.append(node);form.append(field);return node;};
  state.source=select('출처',[['','모든 출처'],['APP','앱·Gateway'],['AZURE_KEYVAULT','Azure Key Vault'],['WAF','웹 방화벽 · WAF'],['ENTRA','Microsoft Entra']]);
  state.result=select('결과',[['','모든 결과'],['허용·성공','허용·성공'],['거부·실패','거부·실패'],['기타·경보','기타·경보']]);
  state.review=select('검토 상태',[['','모든 상태'],...Object.entries(reviewNames)]);
  state.hospital=select('기관·자원',[['','모든 기관·자원']]);
  state.period={value:'24'};
  const submit=el('button','검색','sc-button sc-primary');submit.type='submit';form.append(submit,button('필터 초기화',()=>{for(const node of [state.search,state.source,state.result,state.review,state.hospital])node.value='';state.category='';state.action='';load(state);}));
  form.addEventListener('submit',event=>{event.preventDefault();state.category='';state.action='';load(state);});state.explorer.append(form);
  state.count=el('p','—','sc-count');state.list=el('div',null,'sc-events');state.pager=el('div',null,'sc-pager');state.explorer.append(state.count,state.list,state.pager);
  const side=el('aside',null,'sc-side');state.detail=el('section',null,'sc-detail');state.detail.append(el('h3','사건을 따라가 볼까요?'),el('p','이벤트를 선택하면 관련 흐름과 검토 기록을 확인할 수 있어요.'));state.basket=el('section',null,'sc-basket');side.append(state.detail,state.basket);work.append(state.explorer,side);root.append(work);drawBasket(state);
  const periodRoot=el('section',null,'sc-period-panel');work.before(periodRoot);
  state.periodPanel=createPeriodReportPanel({root:periodRoot,rangeRoot,getApi:()=>state.api,getData:()=>state.data,onRange:range=>{state.range=range;state.until=null;return load(state);},getSelected:()=>[...state.selected.values()],printReport,reportCsv,saveFile});
  const boundary=el('details',null,'sc-boundary');boundary.append(el('summary','조회 범위와 기록 연결 확인'));state.boundary=el('p','확인 전');boundary.append(state.boundary);root.append(boundary);
  const dashboard=el('section',null,'sc-dashboard'),reports=el('section',null,'sc-reports');state.metrics=el('div',null,'sc-metrics');dashboard.append(state.metrics,state.charts,state.sources,boundary);reports.append(periodRoot,state.basket);root.append(dashboard,work,reports);
  const helper=el('section',null,'sc-detail-view'),qr=el('section',null,'sc-detail-view'),protection=el('section',null,'sc-detail-view');root.append(helper,qr,protection);
  state.views={dashboard,events:work,helper,qr,protection,reports};for(const[key,panel]of Object.entries(state.views)){panel.id='sc-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','sc-tab-'+key);}
  const reportLink=button('이 기간으로 보고서 만들기',()=>setConsoleView(state,'reports'));rangeRoot.append(reportLink);setConsoleView(state,'dashboard');
}
async function load(state,page=0){
  const version=++state.version;state.loading=true;drawBasket(state);state.status.textContent='이벤트와 집계를 불러오는 중…';
  const query=new URLSearchParams({page:String(page),hours:state.period.value});if(state.until)query.set('until',state.until);
  if(state.range){query.delete('hours');query.set('from',state.range.from);query.set('until',state.range.until);}
  for(const[key,value]of Object.entries({q:state.search.value,source:state.source.value,result:state.result.value,review:state.review.value,hospital:state.hospital.value,category:state.category,action:state.action}))if(value)query.set(key,value);
  state.periodPanel?.setLoading(true);
  try{const data=await state.api.fetchJson('/api/security/events?'+query,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(version!==state.version)return;state.data=data;state.until=data.until;state.loading=false;state.status.textContent=`${time(data.from)} ~ ${time(data.until)} · 한국시간`;drawSources(state);drawCharts(state);drawEvents(state);drawBasket(state);drawHelperRequests(state.views.helper,data.helperRequests,data.helperConnection);drawQrLifecycle(state.views.qr,data.qrLifecycle);if(state.view==='protection')drawProtection(state.views.protection,state.api);state.periodPanel?.setLoading(false);}
  catch{if(version!==state.version)return;state.loading=false;drawBasket(state);state.periodPanel?.setLoading(false,true);state.status.textContent='이벤트 조회 실패 · 기존 선택 기록은 유지됩니다.';state.charts.replaceChildren(el('p','집계를 확인할 수 없습니다. 다시 불러오기를 눌러 주세요.'));state.list.replaceChildren(el('p','이벤트를 조회하지 못했습니다.'));}
}
function drawSources(state){
  const {sources}=state.data;state.sources.replaceChildren();
  const azureStatus={available:'연결됨',not_configured:'연결 미설정',permission_required:'조회 권한 확인 필요',misconfigured:'연결 설정 확인 필요',unavailable:'연결 확인 필요'};
  const items=[['앱 감사 기록','연결됨',`${sources.app.total}건 · 저장된 최근 ${state.data.query.hours}시간 기록`],['Azure Key Vault',azureStatus[sources.azure.status]||'상태 확인 필요',`${sources.azure.status==='available'?sources.azure.count+'건 · 최근 최대 100건':'이 출처의 로그는 아직 확인할 수 없습니다.'}`],['영상·Gateway',sources.gateway.count?'수집된 이벤트 있음':'선택 기간 이벤트 없음',`${sources.gateway.count}건 · 앱 감사 경로에 수집된 기록`],['웹 방화벽 · WAF',sources.waf.status==='available'?'실제 로그 연결됨':sources.waf.status==='stale'?'수집 지연':'수집 상태 확인 필요',sources.waf.status==='available'?`${sources.waf.count}개 규칙 이벤트 · ${sources.waf.denied}개 명시적 차단 기록 · 제한된 표본`:'확인되지 않은 로그를 0건으로 집계하지 않습니다.'],['Microsoft Entra',azureStatus[sources.entra.status]||'조회 확인 필요',sources.entra.status==='available'?`${sources.entra.count}개 로그인 기록 · 프로젝트 앱 한정 · 최근 최대 100개`:'원본 이벤트를 확인할 수 없습니다.']];
  for(const[label,status,copy]of items){const node=el('article');node.append(el('span',label),el('strong',status),el('small',copy));state.sources.append(node);}
  const integrity=state.overview?.applicationAudit?.integrity;state.boundary.textContent=`앱: 저장된 감사 기록의 이전 ${state.data.query.hours}시간 전체 집계. Azure: 최근 24시간 최신 최대 100건${sources.azure.truncatedPossible?' · 추가 기록이 있을 수 있음':''}. WAF: ${sources.waf.scope||'수집 미확인'} · 탐지는 차단과 다르며 하나의 요청에 여러 규칙이 기록될 수 있습니다. Entra: ${sources.entra.scope} · ${sources.entra.diagnostics} · ${sources.entra.license}. 앱 해시 연결: ${integrity?.ok?'확인됨 ('+integrity.checked+'건)': '검증 실패 또는 미확인 ('+(integrity?.reason||'근거 없음')+')'}. 해시 연결 결과는 외부 보관·로그 수집 완전성을 보증하지 않습니다.`;
}
function drawCharts(state){
  const chart=state.data.chart;state.heroCount.textContent=chart.unreviewed.toLocaleString();state.charts.replaceChildren();
  state.metrics.replaceChildren();for(const[label,value]of [['앱 이벤트',chart.total],['허용·성공',chart.results.find(item=>item.label==='허용·성공')?.count||0],['거부·실패',chart.denied],['검토 전 거부·실패',chart.unreviewed]]){const card=el('article');card.append(el('span',label),el('strong',Number(value).toLocaleString()),el('small','로그 건수'));state.metrics.append(card);}
  const panel=(heading,copy)=>{const node=el('section',null,'sc-chart');node.append(el('h3',heading),el('p',copy));state.charts.append(node);return node;};
  const outcomes=panel('접근 결과의 균형',`앱 기록 ${chart.total.toLocaleString()}건 · 선택 시점 이전 ${chart.periodHours}시간 전체`);
  const ring=el('div',null,'sc-ring-row'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('role','img');svg.setAttribute('aria-label',chart.results.map(item=>`${item.label} ${item.count}건`).join(',')||'집계된 앱 기록 없음');
  const circle=(stroke,offset,dash)=>{const c=document.createElementNS(svg.namespaceURI,'circle');for(const[k,v]of Object.entries({cx:60,cy:60,r:45,fill:'none',stroke,'stroke-width':13,'stroke-dasharray':dash,'stroke-dashoffset':offset,transform:'rotate(-90 60 60)'}))c.setAttribute(k,String(v));svg.append(c);};
  circle('#dce6ed',0,'283 0');let offset=0;for(const item of chart.results){const length=chart.total?item.count/chart.total*282.743:0;circle(colors[item.label],-offset,`${length} ${282.743-length}`);offset+=length;}
  const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x','60');text.setAttribute('y','65');text.setAttribute('text-anchor','middle');text.textContent=String(chart.total);svg.append(text);ring.append(svg);
  const legend=el('div',null,'sc-legend');for(const item of chart.results)legend.append(button(`${item.label} ${item.count}건`,()=>{state.result.value=item.label;explore(state);},'sc-legend-button'));if(!chart.total)legend.append(el('p','선택 기간에 저장된 기록이 없습니다.'));ring.append(legend);outcomes.append(ring);
  const reasons=panel('접근이 멈춘 이유',`앱 거부·실패 로그 ${chart.denied}건 · 사유를 눌러 설명과 확인할 내용을 살펴보세요.`);
  const explanation=el('div',null,'sc-reason-slot');
  const max=Math.max(1,...chart.reasons.map(item=>item.count));
  for(const item of chart.reasons){
    const row=button('',()=>{
      for(const sibling of reasons.querySelectorAll('.sc-bar-button'))sibling.setAttribute('aria-expanded','false');
      row.setAttribute('aria-expanded','true');explanation.replaceChildren(reasonExplanation(item.label));
      explanation.append(button('관련 이벤트 보기',async()=>{state.search.value=item.label;state.source.value='APP';state.result.value='거부·실패';state.review.value='';state.hospital.value='';state.category='';state.action='';await explore(state);state.explorer.scrollIntoView({behavior:'auto'});}));
      explanation.append(el('small','관련 이벤트에서 내용을 확인한 뒤 보고서에 담을 수 있습니다.'));
    },'sc-bar-button sc-reason-button');
    row.setAttribute('aria-expanded','false');
    const label=el('span');label.append(el('span',title(item.label)),el('code',item.label));
    row.append(label,el('strong',`${item.count}건 · ${chart.denied?(item.count/chart.denied*100).toFixed(1):'0.0'}%`));
    const bar=el('i');bar.style.width=(item.count/max*100)+'%';row.append(bar);reasons.append(row);
  }
  const other=Math.max(0,chart.denied-chart.reasons.reduce((sum,item)=>sum+item.count,0));
  if(other)reasons.append(el('p',`기타 사유 ${other}건 · ${(other/chart.denied*100).toFixed(1)}%`));
  if(!chart.reasons.length)reasons.append(el('p','조회 범위에 거부·실패 기록이 없습니다.'));
  reasons.append(explanation,el('small','비율은 앱 거부·실패 로그 기준입니다. 한 요청에 여러 로그가 남을 수 있습니다.'));
  const trend=panel('시간에 따라 달라지는 신호','앱 이벤트 · 시간별 전체 건수와 거부·실패 건수');const columns=el('div',null,'sc-columns');const peak=Math.max(1,...chart.hours.map(item=>item.count));for(const item of chart.hours){const col=el('div',null,'sc-column');col.title=`${time(item.time)}: 전체 ${item.count}건 / 거부·실패 ${item.denied}건`;col.setAttribute('role','img');col.setAttribute('aria-label',col.title);const all=el('i'),denied=el('b');all.style.height=(item.count/peak*100)+'%';denied.style.height=(item.denied/peak*100)+'%';col.append(all,denied);columns.append(col);}trend.append(columns,el('small',`${time(chart.hours[0].time)} ~ ${time(state.data.until)} · 파랑 전체 / 주황 거부·실패`));
  const kinds=panel('어떤 활동이 있었나요?','종류를 누르면 이벤트 목록이 좁혀집니다.');const chips=el('div',null,'sc-kind-chips');for(const item of chart.categories)chips.append(button(`${item.label} ${item.count}건`,()=>{state.category=item.label;explore(state);},'sc-chip'));kinds.append(chips);
  const waf=state.data.sources.waf,firewall=panel('웹 입구에서 발견한 신호','WAF 규칙 이벤트 표본 · 전체 접속 대비 차단률이 아닙니다.');
  if(waf.status==='available'){
    firewall.append(el('p',`탐지 ${waf.count-waf.denied}개 · 명시적 차단 ${waf.denied}개 · 수집 ${time(waf.observedAt)}`));
    const peak=Math.max(1,...waf.rules.map(item=>item.count));
    for(const item of waf.rules){const row=button('',()=>{state.source.value='WAF';state.search.value=item.label;state.category='';state.result.value='';explore(state);},'sc-bar-button');row.append(el('span',item.label),el('strong',`${item.count}개`));const bar=el('i');bar.style.width=(item.count/peak*100)+'%';row.append(bar);firewall.append(row);}
    if(!waf.count)firewall.append(el('p','수집된 표본에 선택 기간 규칙 이벤트가 없습니다.'));
  }else firewall.append(el('p','수집 지연 또는 연결 실패 · 탐지 건수 미확인'));
  const entra=state.data.sources.entra,identity=panel('로그인의 바깥쪽 근거','Microsoft Entra 원본 · 지정 앱 로그인 표본');
  if(entra.status==='available'){
    const peak=Math.max(1,...entra.results.map(item=>item.count));for(const item of entra.results){const row=button('',()=>{state.source.value='ENTRA';state.result.value=item.label;state.category='';state.search.value='';explore(state);},'sc-bar-button');row.append(el('span',item.label),el('strong',`${item.count}건`));const bar=el('i');bar.style.width=(item.count/peak*100)+'%';row.append(bar);identity.append(row);}
    if(!entra.count)identity.append(el('p','조회는 성공했지만 선택 기간의 지정 앱 로그인 기록은 없습니다. 수집 지연·진단 설정은 별도 확인이 필요합니다.'));
  }else identity.append(el('p','Entra 조회 실패 또는 미설정 · 건수 미확인'));
  identity.append(el('small',entra.diagnostics));
  const helper=chart.helper,connection=state.data.helperConnection;
  const health=panel('건강도우미 · 응답과 연결','질문 원문 없이 요청별 처리 결과와 현재 연결을 확인합니다.');health.classList.add('sc-helper-monitor');
  if(helper){
    health.append(el('p',`연결된 요청 ${helper.requestCount}건 · 로그 ${helper.logCount}건 · 요청 연결 불가 로그 ${helper.unlinked}건`));
    const counts=el('div',null,'sc-kind-chips');for(const[key,label]of [['generated','답변 생성'],['evidence','근거·시나리오 안내'],['safe','안전 안내'],['failed','처리 실패'],['unknown','종료·결과 미확인']])counts.append(el('span',`${label} ${helper.counts[key]}건`,'sc-chip'));health.append(counts);
    health.append(el('p',helper.pairedCount?`시작·종료 로그 ${helper.pairedCount}쌍 · 중앙값 ${(helper.medianMs/1000).toFixed(1)}초 · P95 ${(helper.p95Ms/1000).toFixed(1)}초`:'같은 조회 기간 내 시작·종료 로그 쌍이 없어 처리시간을 계산하지 않았습니다.'));
    health.append(el('small',`마지막 요청 기록: ${helper.lastEventAt?time(helper.lastEventAt):'선택 기간 기록 없음'} · 처리시간은 감사 로그 간 간격이며 모델 추론 시간과 다릅니다.`));
  }else health.append(el('p','건강도우미 요청 집계 미확인'));
  const labels={REACHABLE:'응답 도달',READY:'정상 응답',AVAILABLE:'모델 설치 확인',UNAVAILABLE:'연결·실행 확인 필요',NOT_CONFIGURED:'미설정',UNKNOWN:'미확인'};
  const stages=el('div',null,'sc-kind-chips');for(const[key,label]of [['transport','SSH 전달 경로'],['relay','중계 서비스'],['model','모델 API']])stages.append(el('span',`${label}: ${labels[connection?.[key]]||'미확인'}`,'sc-chip'));health.append(stages);
  health.append(el('small',`연결 확인: ${connection?.observedAt?time(connection.observedAt):'미확인'} · 최대 30초 캐시. 모델 API 확인은 생성 시험이 아닙니다. SSH 프로세스 자체 상태는 별도 확인이 필요합니다.`));
  health.append(button('건강도우미 기록 보기',()=>{state.category='건강도우미';state.search.value='';state.source.value='APP';state.result.value='';state.review.value='';state.hospital.value='';state.action='';explore(state);}));
  health.append(button('요청별 상세 보기',()=>setConsoleView(state,'helper')));
  const qr=panel('QR 티켓의 흐름','발급부터 접수·철회·거부까지 · 로그 건수');qr.classList.add('sc-qr-summary');
  for(const[key,label]of [['ISSUED','발급'],['USED','접수 사용'],['REVOKED','철회·교체'],['DENIED','거부']])qr.append(el('span',`${label} ${state.data.qrLifecycle?.counts?.[key]??0}건`,'sc-chip'));
  qr.append(button('QR 생애주기 보기',()=>setConsoleView(state,'qr')));
}
function drawEvents(state){
  const data=state.data;state.count.textContent=`검색 결과 ${data.total}건 · ${data.page+1}페이지${state.category?' · '+state.category:''}`;state.list.replaceChildren();
  const hospital=state.hospital.value;state.hospital.replaceChildren(new Option('모든 기관·자원',''));for(const value of data.facets.hospitals)state.hospital.add(new Option(value,value));state.hospital.value=hospital;
  for(const event of data.events){const row=el('article',null,'sc-event');row.dataset.result=event.resultGroup;const open=button('',()=>showDetail(state,event),'sc-event-open');open.append(el('small',`${time(event.time)} · ${event.source==='APP'?'앱':event.source==='WAF'?'웹 방화벽':event.source==='ENTRA'?'Entra':'Key Vault'}`),el('strong',event.source==='WAF'?'웹 방화벽 규칙 탐지':event.source==='ENTRA'?'Microsoft 로그인':title(event.action)),el('span',`${event.source==='WAF'?(event.result==='DENIED'?'명시적 차단 기록':'탐지 · 차단 여부 미확인'):event.resultGroup} · ${title(event.reasonCode)}`),el('small',`${event.hospitalId} · ${reviewNames[event.review?.status||'UNREVIEWED']}`));row.append(open,button(state.selected.has(event.source+':'+event.eventRef)?'담김':'＋ 보고서',()=>{toggleSelected(state,event);drawEvents(state);},'sc-add'));state.list.append(row);}
  if(!data.events.length)state.list.append(el('p','검색 조건에 맞는 이벤트가 없습니다. 필터를 초기화해 보세요.','sc-empty'));
  state.pager.replaceChildren();const prev=button('이전',()=>load(state,data.page-1)),next=button('다음',()=>load(state,data.page+1));prev.disabled=data.page===0;next.disabled=(data.page+1)*data.pageSize>=data.total;state.pager.append(prev,next);
}
function toggleSelected(state,event){const key=event.source+':'+event.eventRef;if(state.selected.has(key))state.selected.delete(key);else if(state.selected.size<50)state.selected.set(key,event);else state.status.textContent='보고서 한 건에는 최대 50개 이벤트를 담을 수 있습니다.';drawBasket(state);}
async function showDetail(state,event){
  const version=(state.detailVersion||0)+1;state.detailVersion=version;const host=state.detail;host.replaceChildren(el('h3',title(event.action)),el('p',`${time(event.time)} · ${event.resultGroup}`));const list=el('dl');for(const[label,value]of [['출처',event.source],['기관·자원',event.hospitalId],['주체 유형',event.actorType],['사유',title(event.reasonCode)],['이벤트 참조',event.eventRef],['검토',reviewNames[event.review?.status||'UNREVIEWED']]]){list.append(el('dt',label),el('dd',value));}host.append(list);if(event.review?.note)host.append(el('p','검토 메모: '+event.review.note));host.append(button('보고서에 담기 / 빼기',()=>{toggleSelected(state,event);drawEvents(state);}));
  host.append(reasonExplanation(event.reasonCode));
  if(event.auditSessionId&&event.auditSessionId!=='UNKNOWN'){
    const flow=el('ol',null,'sc-flow');host.append(el('h4','같은 실행의 연결 기록'),flow);
    try{const query=new URLSearchParams({session:event.auditSessionId,until:state.data.until,from:state.data.from});const data=await state.api.fetchJson('/api/security/events?'+query,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(version!==state.detailVersion)return;for(const related of [...data.events].reverse())flow.append(el('li',`${time(related.time)} · ${title(related.action)} · ${related.result}`));flow.append(el('li',`관련 ${data.total}건 중 최신 ${data.events.length}건 · 같은 감사 세션 기준`));}catch{if(version===state.detailVersion)flow.append(el('li','관련 흐름을 불러오지 못했습니다.'));}
  }else host.append(el('p','공통 감사 세션이 없어 다른 이벤트와 자동 연결하지 않았습니다.'));
  if(['AZURE_KEYVAULT','WAF','ENTRA'].includes(event.source)||bad.has(event.result)){
    const form=el('form',null,'sc-review');form.append(el('h4','검토 기록 남기기'));const statusLabel=el('label','검토 상태'),select=el('select');for(const[value,label]of Object.entries(reviewNames).filter(([value])=>value!=='UNREVIEWED'))select.add(new Option(label,value));statusLabel.append(select);const noteLabel=el('label','운영 메모'),note=el('input');note.maxLength=160;note.placeholder='환자 식별정보 없이 조치 내용 기록';noteLabel.append(note);const submit=el('button','검토 이력 추가','sc-button sc-primary');submit.type='submit';const feedback=el('p');feedback.setAttribute('role','status');form.append(statusLabel,noteLabel,submit,feedback);host.append(form);form.addEventListener('submit',async action=>{action.preventDefault();submit.disabled=true;try{await state.api.postJson('/api/security/reviews',{source:event.source,eventRef:event.eventRef,status:select.value,note:note.value});feedback.textContent='검토 이력을 추가했습니다.';state.api.refresh();}catch{feedback.textContent='검토를 저장하지 못했습니다. 메모의 식별정보와 이벤트 유효성을 확인해 주세요.';submit.disabled=false;}});
  }
}
function drawBasket(state){
  if(state.tabs?.reports)state.tabs.reports.textContent=`보고서 · ${state.selected.size}`;
  const host=state.basket;host.replaceChildren(el('h3',`보고서 바구니 · ${state.selected.size}`),el('p','관련 이벤트를 모아 사건의 흐름을 남겨요.'));for(const[key,event]of state.selected){const row=el('div',null,'sc-basket-item');row.append(el('span',title(event.action)),button('빼기',()=>{state.selected.delete(key);drawBasket(state);if(state.data)drawEvents(state);},'sc-text-button'));host.append(row);}if(!state.selected.size)host.append(el('p','이벤트 옆의 ＋ 보고서를 눌러 담아 주세요.'));
  const actions=el('div',null,'sc-report-actions');for(const[format,label]of [['PRINT','PDF / 인쇄'],['CSV','CSV 저장'],['JSON','근거 JSON']]){const action=button(label,()=>exportReport(state,format));action.disabled=!state.selected.size||state.exporting||state.loading;actions.append(action);}host.append(actions);state.reportStatus=el('p',state.reportMessage||'생성 문서는 검토 전 초안으로 표시됩니다.','sc-report-status');state.reportStatus.setAttribute('role','status');host.append(state.reportStatus);
}
async function exportReport(state,format){
  if(state.exporting||state.loading||!state.until||!state.selected.size)return;
  state.exporting=true;state.reportMessage='선택한 근거로 보고서를 만들고 있어요.';drawBasket(state);
  try{const query=new URLSearchParams({until:state.data.until,from:state.data.from});const report=await state.api.postJson('/api/security/reports?'+query,{events:[...state.selected.values()].map(event=>({source:event.source,eventRef:event.eventRef})),format});
    if(format==='PRINT')printReport(report);else if(format==='CSV')saveFile(report.reportId+'.csv',reportCsv(report),'text/csv;charset=utf-8');else saveFile(report.reportId+'.json',JSON.stringify(report,null,2),'application/json');state.reportMessage=`초안 생성 완료 · ${report.events.length}건 · ${report.reportId}`;
  }catch{state.reportMessage='보고서를 생성하지 못했습니다. 로그인·출처 연결 상태를 확인하고 만료된 이벤트는 다시 선택해 주세요.';}
  finally{state.exporting=false;drawBasket(state);}
}
