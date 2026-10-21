const filters=['q','source','result','category','action','hospital','review','session'];
const sourceNames={app:'앱·Gateway',azure:'Key Vault',waf:'WAF',entra:'Entra'};
const fieldNames={q:'검색',source:'출처',result:'결과',category:'종류',action:'행위',hospital:'기관',review:'검토',session:'실행'};
const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
export const kstInput=value=>new Date(value+9*3600000).toISOString().slice(0,16);
export function periodRange(preset,from,until,now=Date.now()){
  const end=preset==='CUSTOM'?Date.parse(until+'+09:00'):now;
  const day=kstInput(end).slice(0,10);
  const start=preset==='CUSTOM'?Date.parse(from+'+09:00'):preset==='TODAY'?Date.parse(day+'T00:00:00+09:00'):preset==='MONTH'?Date.parse(day.slice(0,7)+'-01T00:00:00+09:00'):end-Number(preset)*3600000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end>now+1000||end-start>31*86400000)throw new Error('종료는 현재 이전, 시작은 종료 이전으로 선택해 주세요. 최대 31일입니다.');
  return {from:new Date(start).toISOString(),until:new Date(end).toISOString()};
}
export function reportScope(data){
  const q=new URLSearchParams({from:data.from,until:data.until});for(const k of filters)if(data.query[k])q.set(k,data.query[k]);return q.toString();
}
export function matchesPeriod(event,query){
  if(Date.parse(event.time)<Date.parse(query.from)||Date.parse(event.time)>Date.parse(query.until))return false;
  for(const[k,field]of Object.entries({source:'source',category:'category',action:'action',hospital:'hospitalId',session:'auditSessionId'}))if(query[k]&&event[field]!==query[k])return false;
  if(query.result&&![event.result,event.resultGroup].includes(query.result))return false;
  if(query.review&&query.review!==(event.review?.status||'UNREVIEWED'))return false;
  return !query.q||[event.action,event.result,event.reasonCode,event.hospitalId,event.category,event.eventRef,event.actorType].some(v=>String(v||'').toLocaleLowerCase('ko-KR').includes(query.q.toLocaleLowerCase('ko-KR')));
}
export function createPeriodReportPanel({root,rangeRoot,getApi,getData,onRange,getSelected,printReport,reportCsv,saveFile}){
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn)=>{const b=el('button',text,'sc-button');b.type='button';b.addEventListener('click',fn);return b;};
  let busy=true,failed=false,draft=null,snapshot=null,exporting=false,version=0;
  const title=el('div',null,'sc-period-heading');title.append(el('p','REPORT BUILDER','sc-brand'),el('h3','하루의 기록을, 한 장의 근거로'),el('p','기간과 검색 조건을 묶어 보안 흐름을 보고합니다. · 한국시간'));
  const form=el('form',null,'sc-period-form'),label=el('label','보고할 기간'),preset=el('select');for(const[v,text]of [['24','최근 24시간'],['TODAY','오늘'],['168','최근 7일'],['MONTH','이번 달'],['CUSTOM','직접 선택 (최대 31일)']])preset.add(new Option(text,v));label.append(preset);form.append(label);
  const custom=el('div',null,'sc-period-custom');custom.hidden=true;const inputs=[];
  for(const[text,value]of [['시작 일시',Date.now()-86400000],['종료 일시',Date.now()]]){const l=el('label',text+' · 한국시간'),i=el('input');i.type='datetime-local';i.required=true;i.value=kstInput(value);inputs.push(i);l.append(i);custom.append(l);}form.append(custom);
  preset.addEventListener('change',()=>{custom.hidden=preset.value!=='CUSTOM';});
  const apply=el('button','기간 적용','sc-button');apply.type='submit';const add=button('이 기간을 보고서에 담기',()=>{
    if(busy||failed||exporting||!getData())return;
    const data=getData();draft={query:structuredClone(data.query),scope:reportScope(data),count:data.total,sources:structuredClone(data.sources),events:getSelected().filter(e=>matchesPeriod(e,data.query)).slice(0,50).map(e=>({source:e.source,eventRef:e.eventRef}))};snapshot=null;status.textContent='범위를 담았습니다. 초안 생성 시 다시 조회해 집계와 상세를 고정합니다.';draw();
  });add.classList.add('sc-primary');form.append(apply,add);
  const status=el('p','선택한 기간에 수집된 기록 전체를 집계하며, 상세 근거는 최대 50건입니다.','sc-period-status');status.setAttribute('role','status');
  const card=el('div',null,'sc-period-card');root.append(title,status,card);
  if(rangeRoot){label.firstChild.textContent='조회 기간';rangeRoot.append(form);root.insertBefore(add,status);}else root.insertBefore(form,status);
  form.addEventListener('submit',async e=>{e.preventDefault();if(exporting||busy)return;try{const range=periodRange(preset.value,inputs[0].value,inputs[1].value);await onRange(range);}catch(error){status.textContent=error.message;}});
  function draw(){
    card.replaceChildren();if(!draft){card.hidden=true;return;}card.hidden=false;
    card.append(el('h4','보고서에 담긴 기간'),el('p',`${date(draft.query.from)} ~ ${date(draft.query.until)} · 한국시간`),el('p',`조회 당시 ${draft.count}건 · ${draft.events.length?'선택한 대표 이벤트 '+draft.events.length+'건':'상세는 최신 최대 50건'}`),el('p',filters.filter(k=>draft.query[k]).map(k=>`${fieldNames[k]}: ${draft.query[k]}`).join(' · ')||'검색 필터 없음'));
    const sources=el('div',null,'sc-period-sources');for(const[k,name]of Object.entries(sourceNames)){const s=draft.sources[k];if(s)sources.append(el('p',`${name} · ${s.status==='available'?'조회됨':'미수집·연결 확인 필요'} · ${s.scope||'표본 범위 확인 필요'}`));}card.append(sources);
    card.append(el('small','조회됨은 기간 전체의 수집 완전성을 뜻하지 않습니다. Key Vault·Entra는 최근 24시간 표본, WAF는 제한된 탐지 표본입니다.'));
    const actions=el('div',null,'sc-report-actions');for(const[format,text]of [['PRINT',snapshot?'고정 초안 보기 / 인쇄':'기간 보고서 초안 만들기'],['CSV','기간 CSV'],['JSON','기간 근거 JSON']]){const b=button(text,()=>exportPeriod(format));b.disabled=exporting||busy;actions.append(b);}const remove=button('기간 빼기',()=>{draft=null;snapshot=null;draw();});remove.disabled=exporting;actions.append(remove);card.append(actions);if(snapshot)card.append(el('small',`고정됨 · ${snapshot.reportId} · 집계 ${snapshot.summary.total}건 / 상세 ${snapshot.events.length}건`));
  }
  async function exportPeriod(format){
    if(exporting||busy||!draft)return;const current=version;exporting=true;add.disabled=true;apply.disabled=true;status.textContent='기간 전체 집계와 출처 범위를 확인하고 있어요.';draw();
    try{
      if(!snapshot){const generated=await getApi().postJson('/api/security/reports?'+draft.scope,{mode:'PERIOD',events:draft.events,format});if(current!==version)return;snapshot=generated;}
      const report=await getApi().postJson('/api/security/reports',{snapshotId:snapshot.reportId,format});
      if(current!==version)return;
      if(format==='PRINT')printReport(report);else if(format==='CSV')saveFile(report.reportId+'.csv',reportCsv(report),'text/csv;charset=utf-8');else saveFile(report.reportId+'.json',JSON.stringify(report,null,2),'application/json');
      status.textContent=`기간 초안 생성 완료 · ${report.summary.total}건 집계 / 상세 ${report.events.length}건. 재출력은 같은 지문의 고정본입니다.`;
    }catch{if(current===version)status.textContent='생성·출력 실패. 로그인·기간·출처를 확인하세요. 15분 경과 또는 서버 재시작으로 고정본이 만료되면 기간을 다시 담아 새 보고서를 생성하세요.';}
    finally{exporting=false;add.disabled=busy||failed;apply.disabled=busy||failed;draw();}
  }
  return {clear(){version++;draft=null;snapshot=null;busy=true;failed=true;add.disabled=true;apply.disabled=true;draw();},setLoading(value,error=false){busy=value;failed=error;add.disabled=busy||failed||exporting;apply.disabled=busy||exporting;if(error)status.textContent='조회 실패 · 이전 범위를 새 조회 결과로 담지 않습니다.';draw();}};
}
