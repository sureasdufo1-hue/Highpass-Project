// Isolated design prototype. No authentication, API, storage, tokens or real QR.
let signedIn = false;
let sharing = 'NONE';
let screen = 'login';
const labels = {NONE:'공유 승인이 필요해요.',ACTIVE:'QR로 병원을 연결해 주세요.',CONSUMED:'병원 연결이 확인됐어요. · 예시',EXPIRED:'QR 연결 시간이 끝났어요. · 예시',REVOKED:'공유를 중단했어요. · 예시',UNAVAILABLE:'연결 상태를 확인하지 못했어요.'};
const dialog = document.querySelector('#info-dialog');
const confirm = document.querySelector('#dialog-confirm');
let confirmAction = null;
// Small consistent line icons, not platform-dependent text glyphs.
const iconPaths = {home:'M3 10 12 3 21 10 M5 9v12h5v-7h4v7h5V9',images:'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5',history:'M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5',profile:'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-2a8 8 0 0 1 16 0v2z'};
for(const button of document.querySelectorAll('.tabs button,.icon-label')){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','24');svg.setAttribute('height','24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[button.dataset.action]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);
  button.firstChild.replaceWith(svg);
}
function info(title, copy, action = null) {
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-copy').textContent = copy;
  confirmAction = action; confirm.hidden = !action;
  dialog.showModal();
}
function show(next) {
  if (!signedIn && next !== 'login') next = 'login';
  if (next === 'qr' && sharing === 'NONE') next = 'consent';
  screen = next;
  for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== next;
  for (const node of document.querySelectorAll('[data-step]')) node.classList.toggle('current', node.dataset.step === next);
  document.querySelector('#home-status').textContent = labels[sharing];
  document.querySelector('#home-next').textContent = sharing === 'NONE' ? '공유 내용 확인 →' : '공유 상태 확인 →';
  document.querySelector('#approve').disabled = sharing !== 'NONE';
  document.querySelector('#approve').textContent = sharing === 'NONE' ? '내용을 확인하고 승인' : '공유 상태에서 확인';
  const active = sharing === 'ACTIVE';
  document.querySelector('#qr-visual').hidden = !active;
  document.querySelector('#qr-ended').hidden = active;
  document.querySelector('#qr-time').hidden = !active;
  document.querySelector('#qr-status').textContent = active ? '✓ 환자 승인 완료 · 예시' : labels[sharing];
  document.querySelector('#qr-description').textContent = active ? '병원 연결을 기다리고 있어요.\nQR에는 의료영상이 포함되지 않아요.' : sharing === 'UNAVAILABLE' ? '확인되지 않은 상태로 QR를 표시하지 않습니다. 실제 서비스의 서버 상태와는 무관한 화면 예시입니다.' : 'QR는 더 이상 표시하지 않습니다. 실제 서버 만료·사용·철회 검증 결과가 아닌 디자인 예시입니다.';
  document.querySelector('#revoke').disabled = sharing === 'REVOKED';
  document.querySelector('#announcement').textContent = `${document.querySelector(`[data-screen="${next}"] h2`).textContent} · 디자인 시안`;
  document.querySelector(`[data-screen="${next}"] h2`).focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
document.querySelector('#login-form').addEventListener('submit', event => {event.preventDefault();signedIn=true;show('home');});
document.querySelector('#dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{confirmAction=null;});
confirm.addEventListener('click',()=>{const action=confirmAction;dialog.close();action?.();});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='reset'){signedIn=false;sharing='NONE';show('login');return;}
  if(action==='signup'){info('회원가입 · 준비 중','이 프로토타입에서는 계정을 생성하지 않습니다. 로그인 화면 체험 버튼으로 네 화면을 둘러볼 수 있어요.');return;}
  if(!signedIn)return;
  if(action==='home')return show('home');
  if(action==='next')return show(sharing==='NONE'?'consent':'qr');
  if(action==='details')return show('consent');
  if(action==='approve'&&sharing==='NONE'){sharing='ACTIVE';show('qr');return;}
  if(action==='revoke'){info('공유를 중단할까요?','B대학병원 · 복부 CT\n이후 접근을 차단하는 화면 예시입니다. 이미 열람하거나 허용된 방식으로 저장된 자료까지 회수되지는 않습니다.\n실제 동의는 변경하지 않습니다.',()=>{sharing='REVOKED';show('qr');});return;}
  if(['consumed','expired','unavailable'].includes(action)&&screen==='qr'&&sharing!=='REVOKED'){sharing=action.toUpperCase();show('qr');return;}
  const descriptions={images:['내 의료영상','복부 CT · A대학병원\n2026.10.08 · 합성 검사\n이번 프로토타입에는 실제 DICOM 조회와 Viewer가 연결되지 않았습니다.'],exam:['복부 CT','합성 검사 · A대학병원\n실제 영상 픽셀이 아닌 시안입니다. 홈의 공유 내용 확인에서 승인 흐름을 체험하세요.'],profile:['내 정보','홍길동 · 56세 · 합성 시연 환자\n실제 본인확인이나 계정 조회 결과가 아닙니다.'],history:['공유 내역',labels[sharing]+'\n현재 브라우저 메모리의 시안 상태입니다. 감사로그나 서버 동의 이력은 아닙니다.'],help:['공유가 처음이신가요?','공유 내용 확인 → 수신 병원·검사·권한·기간 확인 → 명시적 승인 → QR 연결 순서입니다.\n모든 화면은 디자인 체험이며 실제 개인정보를 입력하지 마세요.']};
  if(descriptions[action])info(...descriptions[action]);
});
show('login');
