const groups = ['허용·성공', '거부·실패', '기타·경보'];
const palette = ['#207f76', '#bb4e38', '#566a9b'];
const reviewLabels = { REVIEWED:'검토 완료', INVESTIGATING:'조사 중', ACTION_REQUIRED:'조치 필요', FALSE_POSITIVE:'오탐 판단', UNREVIEWED:'검토 전' };
const sourceLabel = source => source === 'APP' ? '앱·Gateway' : source === 'AZURE_KEYVAULT' ? 'Azure Key Vault' : source === 'WAF' ? '웹 방화벽 · WAF' : source === 'ENTRA' ? 'Microsoft Entra' : '출처 미확인';
const dateLabel = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '미작성';
const node = (tag, text, className) => { const element = document.createElement(tag); if(text != null) element.textContent = text; if(className) element.className = className; return element; };
const svgNode = (tag, attrs) => { const element=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const[key,value] of Object.entries(attrs)) element.setAttribute(key,String(value)); return element; };

export function summarizeSecurityReport(report) {
  if(report.mode==='PERIOD'&&report.summary){const s=structuredClone(report.summary);return {...s,outcomes:s.outcomes.map((o,i)=>({...o,color:palette[i],percent:s.total?Math.round(o.count/s.total*1000)/10:0}))};}
  const events = report.events || [];
  const counts = new Map(groups.map(group=>[group,0])), reasons = new Map(), sources = new Map(), hours = new Map();
  for(const event of events) {
    const group=groups.includes(event.resultGroup)?event.resultGroup:'기타·경보';counts.set(group,counts.get(group)+1);
    sources.set(event.source,(sources.get(event.source)||0)+1);
    if(group==='거부·실패') reasons.set(event.reasonCode||'미제공',(reasons.get(event.reasonCode||'미제공')||0)+1);
    const timestamp=Date.parse(event.time);if(Number.isFinite(timestamp)){const hour=new Date(Math.floor(timestamp/3600000)*3600000).toISOString();hours.set(hour,(hours.get(hour)||0)+1);}
  }
  return { total:events.length, denied:counts.get('거부·실패'), reviewed:events.filter(event=>event.review?.status).length,
    unreviewed:events.filter(event=>!event.review?.status).length,
    outcomes:groups.map((label,index)=>({label,count:counts.get(label),color:palette[index],percent:events.length?Math.round(counts.get(label)/events.length*1000)/10:0})),
    reasons:[...reasons].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count),
    sources:[...sources].map(([label,count])=>({label,count})),
    hours:[...hours].sort(([a],[b])=>a.localeCompare(b)).map(([label,count])=>({label,count})) };
}

function metric(label,value,copy){const card=node('div',null,'sr-metric');card.append(node('span',label),node('strong',String(value)),node('small',copy));return card;}
function section(title,copy){const element=node('section',null,'sr-section');element.append(node('h2',title));if(copy)element.append(node('p',copy,'sr-caption'));return element;}
function table(headers,rows,className='sr-table'){
  const element=node('table',null,className),head=node('thead'),heading=node('tr');for(const text of headers){const th=node('th',text);th.scope='col';heading.append(th);}head.append(heading);element.append(head);const body=node('tbody');for(const row of rows){const tr=node('tr');for(const cell of row)tr.append(node('td',cell));body.append(tr);}element.append(body);return element;
}
function ringChart(stats){
  const wrap=node('div',null,'sr-ring-wrap');const svg=svgNode('svg',{viewBox:'0 0 150 150',role:'img','aria-label':stats.outcomes.map(item=>`${item.label} ${item.count}건 ${item.percent}%`).join(',')});
  const circumference=2*Math.PI*54;svg.append(svgNode('circle',{cx:75,cy:75,r:54,fill:'none',stroke:'#e5ebef','stroke-width':17}));let offset=0;
  for(const item of stats.outcomes){const length=stats.total?item.count/stats.total*circumference:0;svg.append(svgNode('circle',{cx:75,cy:75,r:54,fill:'none',stroke:item.color,'stroke-width':17,'stroke-dasharray':`${length} ${circumference-length}`,'stroke-dashoffset':-offset,transform:'rotate(-90 75 75)'}));offset+=length;}
  const total=svgNode('text',{x:75,y:73,'text-anchor':'middle','font-size':27,'font-weight':700,fill:'#173753'});total.textContent=String(stats.total);const label=svgNode('text',{x:75,y:95,'text-anchor':'middle','font-size':12,fill:'#516778'});label.textContent='집계 이벤트';svg.append(total,label);wrap.append(svg);
  wrap.append(table(['결과','건수','비율'],stats.outcomes.map(item=>[item.label,`${item.count}건`,`${item.percent}%`]),'sr-legend-table'));return wrap;
}
function bars(items,label){
  const svg=svgNode('svg',{viewBox:`0 0 480 ${Math.max(60,items.length*44)}`,role:'img','aria-label':items.map(item=>`${label(item.label)} ${item.count}건`).join(',')});const max=Math.max(1,...items.map(item=>item.count));
  for(const[itemIndex,item]of items.entries()){
    const title=svgNode('text',{x:0,y:itemIndex*44+16,'font-size':13,fill:'#213c55'});const fullLabel=String(label(item.label));title.textContent=fullLabel.length>44?fullLabel.slice(0,43)+'…':fullLabel;svg.append(title);
    svg.append(svgNode('rect',{x:0,y:itemIndex*44+24,width:410,height:8,rx:2,fill:'#edf0f3'}),svgNode('rect',{x:0,y:itemIndex*44+24,width:Math.max(1,item.count/max*410),height:8,rx:2,fill:'#bb4e38'}));
    const count=svgNode('text',{x:472,y:itemIndex*44+31,'text-anchor':'end','font-size':13,'font-weight':700,fill:'#173753'});count.textContent=`${item.count}건`;svg.append(count);
  }return svg;
}
function trendChart(items){
  const svg=svgNode('svg',{viewBox:'0 0 650 150',role:'img','aria-label':items.map(item=>`${dateLabel(item.label)} ${item.count}건`).join(',')});const peak=Math.max(1,...items.map(item=>item.count));
  const step=620/items.length;svg.append(svgNode('line',{x1:15,y1:112,x2:635,y2:112,stroke:'#a4b3c2'}));
  for(const[index,item]of items.entries()) {const height=item.count/peak*75,x=15+index*step;svg.append(svgNode('rect',{x:x+step*.2,y:112-height,width:step*.6,height,fill:'#356aa7',rx:2}));const count=svgNode('text',{x:x+step*.5,y:104-height,'text-anchor':'middle','font-size':11,fill:'#213c55'});count.textContent=String(item.count);svg.append(count);
    if(items.length<=8 || index===0 || index===items.length-1){const label=svgNode('text',{x:x+step*.5,y:133,'text-anchor':'middle','font-size':10,fill:'#516778'});label.textContent=items.length>1&&Date.parse(items[1].label)-Date.parse(items[0].label)>=86400000?new Date(item.label).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}):new Date(item.label).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});svg.append(label);}}
  return svg;
}

export function showSecurityReport(report,{actionLabel=value=>value,reasonLabel=value=>value,reasonDescription=()=>''}={}){
  const period=report.mode==='PERIOD',basis=period?'기간·필터 일치 수집 이벤트':'선택 이벤트';
  let stylesheet=document.querySelector('link[data-security-report-style]');if(!stylesheet){stylesheet=node('link');stylesheet.rel='stylesheet';stylesheet.href='/ui/security-report.css';stylesheet.dataset.securityReportStyle='true';document.head.append(stylesheet);}
  const stats=summarizeSecurityReport(report),dialog=node('dialog',null,'sr-dialog');dialog.setAttribute('aria-label','보안 사건 보고서 미리보기');
  const tools=node('nav',null,'sr-tools');tools.setAttribute('aria-label','보고서 출력');const print=node('button','PDF로 저장 / 인쇄'),close=node('button','닫기');print.type=close.type='button';print.addEventListener('click',()=>window.print());close.addEventListener('click',()=>dialog.close());tools.append(node('span',`A4 세로 · ${basis} 기준`),print,close);dialog.append(tools);
  print.disabled=!stylesheet.sheet;stylesheet.addEventListener('load',()=>{print.disabled=false;},{once:true});stylesheet.addEventListener('error',()=>{print.disabled=true;const error=node('p','출력 양식을 불러오지 못했습니다. 페이지를 새로 불러와 다시 생성해 주세요.');error.setAttribute('role','alert');tools.append(error);},{once:true});
  const cover=node('article',null,'sr-sheet sr-cover'),header=node('header',null,'sr-header'),brand=node('div');brand.append(node('p','Medi Q 보안 관제실','sr-brand'),node('h1',period?'기간별 보안 검토 보고서':'보안 사건 검토 보고서'),node('p',period?'기간의 흐름을 집계하고, 주요 사건의 근거를 남깁니다.':'선택한 기록에서 상황을 읽고, 검토 근거를 남깁니다.','sr-subtitle'));header.append(brand,node('span','검토 전 초안','sr-draft'));cover.append(header);
  const meta=node('dl',null,'sr-meta');for(const[label,value]of [['보고서 번호',report.reportId],['생성 시각',dateLabel(report.generatedAt)],['조회 기간',`${dateLabel(report.scope.from)} ~ ${dateLabel(report.scope.until)}`],['생성 주체',report.generatedBy||'미확인']])meta.append(node('dt',label),node('dd',value));cover.append(meta);
  if(period){const scope=section('보고 범위',`한국시간 · 집계 ${stats.total}건 / 상세 수록 ${report.events.length}건 · ${report.scope.detailSelection==='MANUAL'?'선택한 대표 이벤트':'최신 최대 50건'}`);scope.append(node('p',Object.entries(report.scope.filters).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' · ')||'검색 필터 없음'));scope.append(node('small','출처별 수집 상태와 제한은 부록에 표시합니다. 미수집은 0건 또는 무사고를 의미하지 않습니다.'));cover.append(scope);}
  const metrics=node('div',null,'sr-metrics');metrics.append(metric(period?'기간 집계 이벤트':'선택한 이벤트',stats.total,'그래프의 공통 기준'),metric('거부·실패',stats.denied,'집계 이벤트 중 발생 건수'),metric('검토 기록 있음',stats.reviewed,`검토 기록 없는 이벤트 ${stats.unreviewed}건`));cover.append(metrics);
  const summary=section('확인된 사실',null);summary.append(node('p',`${basis} ${stats.total}개 중 거부·실패 ${stats.denied}건, 허용·성공 ${stats.outcomes[0].count}건이 확인됩니다. 출처는 ${stats.sources.map(item=>`${sourceLabel(item.label)} ${item.count}건`).join(', ')}입니다.`));if(stats.denied)summary.append(node('p',`가장 많이 기록된 거부·실패 사유는 ‘${reasonLabel(stats.reasons[0].label)}’ (${stats.reasons[0].count}건)입니다.`));cover.append(summary);
  const notices=[];if(report.events.some(event=>event.source==='AZURE_KEYVAULT'))notices.push('Azure Key Vault는 최근 24시간 최신 최대 100건 중 수집한 기록입니다. 전체 Azure 작업 비율이 아닙니다.');if(stats.unreviewed)notices.push(`${basis} ${stats.unreviewed}건에 검토 기록이 없습니다.`);if(notices.length){const box=node('aside',null,'sr-notice');for(const text of notices)box.append(node('p',text));cover.append(box);}
  const charts=node('div',null,'sr-charts'),outcomes=section(period?'기간 집계 결과':'선택 이벤트 결과',`분모: ${basis} ${stats.total}건`);outcomes.append(stats.total>=3?ringChart(stats):table(['결과','건수','비율'],stats.outcomes.map(item=>[item.label,`${item.count}건`,`${item.percent}%`])));charts.append(outcomes);
  const reasons=section('거부·실패 사유',`${basis} 중 상위 5개 사유`);if(stats.reasons.length){reasons.append(bars(stats.reasons.slice(0,5),reasonLabel));if(stats.reasons.length>5)reasons.append(node('p','일부 상위 사유만 표시했습니다. 전체 사건·원인을 의미하지 않습니다.','sr-caption'));}else reasons.append(node('p','집계한 기록에는 거부·실패가 없습니다.','sr-empty'));charts.append(reasons);cover.append(charts);
  if(stats.hours.length>1){const trend=section('발생 시간대',`${basis} · ${stats.bucketHours===24?'24시간':'시간'} 단위 집계 · 막대 위 숫자는 건수`);trend.append(trendChart(stats.hours));cover.append(trend);}
  cover.append(node('footer',`그래프는 ${basis}의 관측 결과이며 공격 여부나 원인을 자동 판정하지 않습니다.`,'sr-sheet-footer'));dialog.append(cover);
  const evidence=node('article',null,'sr-sheet sr-evidence'),flow=section('시간순 사건 기록','시간순 정렬이며 동일한 감사 세션이 없는 기록의 인과 관계를 추정하지 않습니다.');
  const timeline=node('ol',null,'sr-timeline');for(const[eventIndex,event]of report.events.entries()){const row=node('li');row.dataset.result=event.resultGroup;row.append(node('span',String(eventIndex+1).padStart(2,'0'),'sr-sequence'),node('time',dateLabel(event.time)),node('strong',actionLabel(event.action)),node('span',`${event.resultGroup||event.result} · ${sourceLabel(event.source)}`));timeline.append(row);}flow.append(timeline);evidence.append(flow);
  const review=section('검토 기록과 후속 확인','기존 이벤트에 저장된 검토 기록을 표시합니다. 추가 작성 칸은 아직 저장된 검토가 아닙니다.');
  const guideRows=stats.reasons.filter(item=>reasonDescription(item.label)).map(item=>[reasonLabel(item.label),reasonDescription(item.label)]);
  if(guideRows.length){const guides=section('거부 사유 해설','코드별 참고 설명입니다. 개별 사건의 원인이나 공격 여부를 확정하는 판단은 아닙니다.');guides.append(table(['사유·코드','의미와 확인할 조치'],guideRows));evidence.append(guides);}
  const reviewed=report.events.filter(event=>event.review);if(reviewed.length)review.append(table(['이벤트','검토자·검토일','상태·운영 메모'],reviewed.map(event=>[actionLabel(event.action),`${event.review.actorId||'미작성'} / ${dateLabel(event.review.recordedAt)}`,`${reviewLabels[event.review.status]||'미확인'} · ${event.review.note||'메모 미작성'}`])));else review.append(node('p','저장된 검토 기록 없음 · 검토자, 검토일, 판정 미작성','sr-empty'));
  const form=node('div',null,'sr-review-fields');for(const label of ['검토 의견','조치 내용','후속 확인 사항']){const field=node('div');field.append(node('strong',label),node('p','미작성'));form.append(field);}const sign=node('div',null,'sr-sign');for(const label of ['검토자','검토일','판정'])sign.append(node('span',`${label}: 미작성`));form.append(sign);review.append(form);evidence.append(review);dialog.append(evidence);
  const appendix=node('article',null,'sr-sheet sr-appendix'),details=section('상세 근거 목록',`${report.events.length}건 · 원본 로그를 수정하지 않은 조회 결과`);details.append(table(['시각·출처','행위·결과','사유·기관','이벤트 참조'],report.events.map(event=>[`${dateLabel(event.time)} / ${sourceLabel(event.source)}`,`${actionLabel(event.action)} / ${event.result}`,`${reasonLabel(event.reasonCode)} / ${event.hospitalId||'미확인'}`,event.eventRef])));appendix.append(details);
  const limits=section('출처·조회 범위·보고서 데이터 지문');for(const text of report.limitations||[])limits.append(node('p',text));limits.append(node('p',`Entra는 지정 앱의 로그인 표본입니다. WAF의 DETECTED는 탐지이며 차단 증명이 아닙니다. 하나의 요청에서 여러 규칙 이벤트가 발생할 수 있습니다. 이 보고서의 그래프는 ${basis} 기준입니다.`));
  if(period)limits.append(table(['출처','수집 상태','조회 한계'],Object.entries(report.scope.sources).filter(([k])=>['app','azure','waf','entra'].includes(k)).map(([k,s])=>[({app:'앱·Gateway',azure:'Key Vault',waf:'WAF',entra:'Entra'})[k],s.status==='available'?'조회됨 (완전성 보증 아님)':'미수집·연결 확인 필요',s.scope||'표본 범위 확인 필요'])));
  limits.append(node('small',`보고서 데이터 SHA-256 (PDF 파일 해시가 아님): ${report.fingerprint}`,'sr-fingerprint'));appendix.append(limits,node('footer',`${report.reportId} · 검토 전 초안`,'sr-sheet-footer'));dialog.append(appendix);
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();return dialog;
}
