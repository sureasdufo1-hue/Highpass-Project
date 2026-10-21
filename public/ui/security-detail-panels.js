const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const stamp=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미기록';
const yes=v=>v===true?'예':v===false?'아니요':'미기록';
function fields(rows){const dl=el('dl',null,'sc-detail-fields');for(const [k,v]of rows)dl.append(el('dt',k),el('dd',v??'미기록'));return dl;}
const stages={ISSUED:'발급',VIEWED:'조회',USED:'접수 사용',REVOKED:'철회·교체',DENIED:'접수 거부',OTHER:'기타'};
export function drawHelperRequests(root,data,connection){
 root.replaceChildren(el('h3','건강도우미 요청 상세'),el('p','요청을 펼쳐 시작부터 결과까지 확인하세요. 질문·답변 원문은 표시하지 않습니다.'));
 root.append(el('small',`기간 내 요청 ${data?.total??0}건 · 최신 최대 100건 · 연결 확인 ${stamp(connection?.observedAt)}`));
 const search=el('input');search.type='search';search.placeholder='요청 ID 또는 실패 코드 검색';search.setAttribute('aria-label','건강도우미 요청 검색');root.append(search);
 const list=el('div',null,'sc-detail-list');root.append(list);
 const draw=()=>{list.replaceChildren();for(const r of data?.rows??[]){if(![r.requestId,r.reasonCode].join(' ').toLowerCase().includes(search.value.toLowerCase()))continue;
  const card=el('details',null,'sc-request-card'),summary=el('summary');summary.append(el('strong',r.reasonCode),el('span',stamp(r.lastAt)),el('code',r.requestId));card.append(summary);
  const m=r.metadata;card.append(fields([['요청 ID',r.requestId],['시작',stamp(r.startedAt)],['종료',stamp(r.endedAt)],['감사 기록 간 소요시간',r.durationMs===null?'짝이 없어 산출 불가':`${r.durationMs} ms`],['처리 결과',r.result],['설정 모델',m?.configuredModel],['실제 모델 버전',m?.modelVersion??'확인 정보 없음'],['지식베이스 버전',m?.corpusVersion],['검사 보완자료 버전',m?.medicalTestsVersion],['실제 생성',yes(m?.generationUsed)],['비생성·대체 안내',yes(m?.fallbackUsed)],['실패 코드',m?.failureCode],['근거 개수',m?String(m.sourceCount):'미기록'],['근거 ID',m?.sourceIds?.join(', ')||'미기록']]));
  if(!m)card.append(el('p','이전 기록에는 모델·근거 메타데이터가 없습니다. 새 요청부터 수집합니다.','sc-detail-note'));
  const flow=el('ol',null,'sc-flow');for(const s of r.stages)flow.append(el('li',`${stamp(s.time)} · ${s.reasonCode} · ${s.result}`));card.append(flow);list.append(card);
 }if(!list.children.length)list.append(el('p','조회 조건에 맞는 요청이 없습니다. 기간을 넓히거나 검색어를 확인하세요.'));};search.addEventListener('input',draw);draw();
}
export function drawQrLifecycle(root,data){
 root.replaceChildren(el('h3','QR 생애주기'),el('p','발급·조회·접수·철회·거부를 같은 티켓의 기록으로 연결합니다. 건수는 티켓 수가 아닌 로그 수입니다.'));
 const ribbon=el('div',null,'sc-qr-ribbon');for(const [k,label]of Object.entries(stages))ribbon.append(el('div',`${label} ${data?.counts?.[k]??0}건`));root.append(ribbon);
 root.append(el('p',`티켓 연결 불가 기록 ${data?.unlinked??0}건 · 최신 최대 30개 티켓 · 철회·교체는 무효화이며 물리적 삭제가 아닙니다.`,'sc-detail-note'));
 for(const g of data?.groups??[]){const card=el('details',null,'sc-request-card'),s=el('summary');s.append(el('strong',g.ticketRef),el('span',stamp(g.lastAt)));card.append(s);const flow=el('ol',null,'sc-flow');for(const e of g.steps)flow.append(el('li',`${stamp(e.time)} · ${stages[e.stage]||e.stage} · ${e.reasonCode} · ${e.result}`));card.append(flow);root.append(card);}
 if(!data?.groups?.length)root.append(el('p','선택 기간에 연결 가능한 티켓 기록이 없습니다. 기간을 넓혀보세요.'));
 root.append(el('small','조회 기간에 관측한 이력입니다. 티켓의 현재 유효 상태나 전체 수명 이력을 보증하지 않습니다.'));
}
export async function drawProtection(root,api){
 root.replaceChildren(el('h3','보호 설정 현황'),el('p','현재 DB 연결과 운영자가 마지막으로 확인한 Azure 설정을 함께 봅니다.'));
 const pending=el('p','보호 설정 조회 중…');root.append(pending);
 try{const data=await api.fetchJson('/api/security/protection',{cache:'no-store',signal:AbortSignal.timeout(15000)});pending.remove();const d=data.database;
  const card=el('article',null,'sc-protection-card');card.dataset.status=d.status;card.append(el('h4',`DB 접속 보호 · ${d.status==='PASS'?'TLS 적용 확인':'확인 필요'}`),fields([['확인 범위',d.scope??'Control DB 연결'],['TLS',d.version??'미확인'],['확인 시각',stamp(d.observedAt)]]));root.append(card);
  const labels={storage:'DB 저장 위치',disk:'저장 디스크 암호화',fields:'컬럼 보호 방식',vault:'Key Vault 보호',roles:'키 접근 권한',diagnostics:'감사 수집 설정'};
  for(const c of data.snapshot.checks){const box=el('article',null,'sc-protection-card');box.dataset.status=c.status;box.append(el('h4',labels[c.id]),el('strong',c.stale?'재확인 필요':{PASS:'설정 확인',REVIEW:'검토할 내용 있음',UNKNOWN:'미확인'}[c.status]),el('p',c.summary),el('small',`확인: ${stamp(c.observedAt)} · 근거: ${c.source}${c.stale?' · 확인 후 24시간 경과':''}`));root.append(box);}
  if(!data.snapshot.checks.length)root.append(el('p','Azure 보호 설정 조회본이 아직 연결되지 않았습니다. 현재 DB 연결 결과만 표시합니다.'));
 }catch{pending.textContent='보호 설정을 불러오지 못했습니다. 보안관리자 로그인과 서버 연결을 확인하세요.';}
}
