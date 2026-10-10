// Presentation helpers: no credentials, persistence or authorization decisions.
const svgNamespace = 'http://www.w3.org/2000/svg';
export function icon(kind = 'image') {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'hp-icon'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNamespace, 'path');
  const paths = {
    check:'M5 12l4 4L19 6', home:'M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10',
    qr:'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z',
    exchange:'M3 7h16l-4-4M21 17H5l4 4',
    audit:'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    archive:'M3 8h18v13H3zM2 3h20v5H2zM9 12h6',
    shield:'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6',
    dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    share:'M18 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 23a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.5 10.5l7-5M8.5 13.5l7 5',
    clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
    phone:'M7 2h10v20H7zM11 18h2',
    help:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
    book:'M12 5v16M12 5C8 2 4 3 2 4v16c3-2 7-2 10 1 3-3 7-3 10-1V4c-2-1-6-2-10 1',
  };
  path.setAttribute('d', paths[kind] || 'M4 3h16v18H4zM7 16l3-4 3 3 2-2 3 4M8 7h.01');
  svg.append(path); return svg;
}
function element(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
let presentationStudy, presentationActions;
export function renderPresentationScenario(context, { study, consent, onView, onShare }) {
  if (!context?.scenario?.synthetic) return;
  const home = document.querySelector('#patient-portal-app [data-page="home"]');
  if (!home) return;
  presentationStudy = study; presentationActions = { onView, onShare };
  let panel = home.querySelector('#presentation-referral');
  if (!panel) {
    panel = element('section', 'mediq-scenario'); panel.id = 'presentation-referral';
    const title = element('h2', '', `${context.patientName}님의 다음 진료를 준비해요.`);
    const summary = element('p', '', context.scenario.referralSummary);
    const stages = element('ol', '');
    for (const [title, description, id] of [['내 CT 확인', '다중시기 복부 CT · 4개 시리즈', 'scenario-ct-state'],
      ['B대학병원에 공유 동의', '환자가 범위와 기간을 선택', 'scenario-consent-state'],
      ['병원에서 접수·열람', '동의 후 QR로 병원 연결', 'scenario-receive-state']]) {
      const step = element('li', ''); const detail = element('span', '', description); detail.id = id;
      step.append(element('strong', '', title), detail); stages.append(step);
    }
    const actions = element('div', 'mediq-scenario-actions');
    for (const [text, kind] of [['내 CT 보기', 'view'], ['전원 공유 준비', 'share']]) {
      const button = element('button', `btn${kind === 'share' ? ' primary' : ''}`, text); button.type = 'button';
      button.dataset.scenarioAction = kind;
      button.addEventListener('click', () => {
        if (presentationStudy) presentationActions[kind === 'view' ? 'onView' : 'onShare'](presentationStudy);
      }); actions.append(button);
    }
    panel.append(title, summary, stages, actions, element('small', '', '홍길동 · 56세 · 합성 환자 / 진단은 발표용 가상 설정'));
    home.querySelector('.page-head')?.after(panel);
  }
  const state = consent?.status === 'ACTIVE' && Date.parse(consent.validUntil) <= Date.now() ? 'EXPIRED' : consent?.status;
  panel.querySelector('#scenario-ct-state').textContent = study ? `${study.series?.length ?? 0}개 시리즈 · 승인 후 영상 열람` : 'CT 목록 등록 확인 중';
  panel.querySelector('#scenario-consent-state').textContent = ({ ACTIVE: '동의 유효 · 범위와 기간 확인', REVOKED: '동의 철회됨 · 신규 접근 차단', EXPIRED: '동의 만료 · 다시 동의 필요', PENDING: '환자 승인 대기' })[state] || '아직 동의하지 않았습니다';
  for (const button of panel.querySelectorAll('[data-scenario-action]')) button.disabled = !study;
}
let overviewSignature;
let overviewStudies = [], overviewActions, overviewQuery = '';
export function filterPatientStudies(studies, query) {
  const normalize = value => String(value || '').toLocaleLowerCase().replace(/mri/g, 'mr').trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return studies.filter(study => {
    const text = normalize([study.description, study.modality, study.studyDate, study.sourceHospitalId].join(' '));
    return terms.every(term => text.includes(term));
  });
}
export function renderPatientOverview(studies, { onShare, onView }) {
  overviewStudies = studies; overviewActions = { onShare, onView };
  const count = document.querySelector('#patient-study-count');
  if (count) count.textContent = `${studies.length}건`;
  const container = document.querySelector('#patient-recent-studies');
  if (!container) return;
  const signature = JSON.stringify([overviewQuery, studies.map(s => [s.studyInstanceUid, s.description, s.modality, s.studyDate, s.sourceHospitalId])]);
  if (signature === overviewSignature) return;
  overviewSignature = signature;
  container.replaceChildren();
  const matches = filterPatientStudies(studies, overviewQuery);
  const visible = overviewQuery.trim() ? matches : studies.slice(0, 2);
  const result = document.querySelector('#patient-search-result');
  if (result) result.textContent = overviewQuery.trim() ? `검색 결과 ${matches.length}건 / 전체 ${studies.length}건` : `전체 ${studies.length}건 중 ${visible.length}건 표시`;
  if (!visible.length) { container.append(element('p', 'hp-empty', studies.length ? '검색 결과가 없습니다. 검사명·날짜를 바꾸거나 검색어를 지워 주세요.' : '조회된 의료영상이 없습니다. 새로고침하여 목록을 확인해 주세요.')); return; }
  for (const study of visible) {
    const card = element('article', 'hp-study-card');
    card.dataset.search = `${study.description || ''} ${study.modality || ''} ${study.studyDate || ''}`.toLocaleLowerCase();
    const art = element('div', 'hp-study-art'); art.append(icon(), element('span', 'premium-study-modality', study.modality || '검사'), element('span', 'premium-study-preview-note', '합성 데이터 · 비진단용'), element('span', 'premium-study-preview-note', '영상 보기에서 실제 픽셀을 확인하세요'));
    card.append(art, element('h3', '', study.description || '의료영상'), element('p', '', `${study.sourceHospitalId || '병원 확인 필요'} · ${study.studyDate || '검사일 미확인'}`));
    const actions = element('div', 'hp-study-actions');
    for (const [label, callback, primary] of [['영상 보기', onView, true], ['공유하기', onShare, false]]) {
      const button = element('button', `hp-button${primary ? ' hp-button--primary' : ''}`, label);
      button.type = 'button'; button.addEventListener('click', () => callback(study)); actions.append(button);
    }
    card.append(actions); container.append(card);
  }
}
export function initializePatientComponents() {
  const clinicalIcons = { studies:'home', viewer:'image', qr:'qr', exchange:'exchange', audit:'audit', 'pacs-archive':'archive', dashboard:'dashboard', admin:'shield' };
  document.querySelectorAll('#hospital-saas-app .mq-nav > span').forEach(node => node.replaceChildren(icon(clinicalIcons[node.parentElement.dataset.view])));
  document.querySelector('#patient-home-search')?.addEventListener('input', event => {
    overviewQuery = event.target.value;
    document.querySelector('#patient-portal-app [data-route="home"]')?.click();
    if (overviewActions) renderPatientOverview(overviewStudies, overviewActions);
  });
  const patientIcons={home:'home',images:'image',consent:'share',activity:'clock',phr:'audit'};
  document.querySelectorAll('#patient-portal-app .nav-icon').forEach(node => node.replaceChildren(icon(patientIcons[node.parentElement.dataset.route])));
  document.querySelectorAll('#patient-portal-app .action-symbol').forEach(node => node.replaceChildren(icon()));
  document.querySelectorAll('[data-hp-icon]').forEach(node => node.replaceChildren(icon(node.dataset.hpIcon)));
  document.querySelectorAll('#patient-portal-app .summary-card[role="button"]').forEach(node => node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); node.click(); }
  }));
}
export function validTicketReceipt(receipt, packet) {
  return receipt?.ticketId === packet.ticketId && receipt?.consentId === packet.consentId
    && receipt?.expiresAt === packet.qr.expiresAt && ['ISSUED', 'USED', 'REVOKED', 'EXPIRED'].includes(receipt.status);
}
export function createPatientQrController({ readStatus, render, now = Date.now, schedule = setInterval, cancel = clearInterval }) {
  let packet = null, timer = null, busy = false, generation = 0, lastCheck = 0;
  const clear = (label = '동의 후 발급되는 1회용 QR가 여기에 표시됩니다.') => {
    generation++; packet = null; if (timer !== null) cancel(timer); timer = null;
    render({ label, payload: null, expiresAt: null });
  };
  async function tick() {
    if (!packet) return;
    if (Date.parse(packet.qr.expiresAt) <= now()) { clear('QR 유효시간이 만료되었습니다.'); return; }
    if (busy || now() - lastCheck < 5000) return;
    const current = packet, revision = generation; busy = true; lastCheck = now();
    try {
      const receipt = await readStatus(current.consentId, current.ticketId);
      if (generation !== revision) return;
      if (!validTicketReceipt(receipt, current)) throw new Error('INVALID_RECEIPT');
      if (Date.parse(current.qr.expiresAt) <= now()) { clear('QR 유효시간이 만료되었습니다.'); return; }
      if (receipt.status !== 'ISSUED') {
        clear({ USED: 'QR가 사용되었습니다. 재사용할 수 없습니다.', REVOKED: '동의가 철회되어 QR를 사용할 수 없습니다.', EXPIRED: 'QR 유효시간이 만료되었습니다.' }[receipt.status]); return;
      }
      render({ label:'서버 확인 · 스캔 대기', payload:current.qr.payload, expiresAt:current.qr.expiresAt });
    } catch {
      if (generation === revision) render({ label:'QR 상태를 확인하지 못했습니다. 연결 후 다시 확인합니다.', payload:null, expiresAt:null });
    } finally { busy = false; }
  }
  return { clear, tick, set(handoff, consentId) {
    clear('QR 상태 확인 중…');
    if (!handoff?.ticketId || !consentId || !Number.isFinite(Date.parse(handoff.qr?.expiresAt)) || typeof handoff.qr?.payload !== 'string' || !/^https?:\/\/[^\s]+\/t\/[A-Za-z0-9_-]{22,128}$/.test(handoff.qr.payload)) { clear('QR 발급 결과를 확인하지 못했습니다.'); return; }
    packet = { ticketId:handoff.ticketId, consentId, qr:{...handoff.qr} }; lastCheck = -Infinity;
    timer = schedule(() => { void tick(); }, 1000); void tick();
  } };
}
export function renderPatientQr({ label, payload, expiresAt }) {
  const box = document.querySelector('#patient-qr-code'), status = document.querySelector('#patient-qr-state'), expiry = document.querySelector('#visit-packet-expiry');
  if (!box) return;
  if (status) status.textContent = label;
  if (expiry) expiry.textContent = expiresAt ? new Date(expiresAt).toLocaleString('ko-KR') : '—';
  if (!payload) { box.replaceChildren(); return; }
  // Canvas holds pixels only; capability is not copied into DOM text/attributes.
  try {
    const qr = window.qrcode(0, 'M'); qr.addData(payload); qr.make();
    const count = qr.getModuleCount(), cell = 6, margin = 4;
    const canvas = element('canvas', 'hp-qr-canvas'); canvas.width = canvas.height = (count + 2 * margin) * cell;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '병원 접수용 1회용 QR 코드');
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000';
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) context.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
    box.replaceChildren(canvas);
  } catch { box.replaceChildren(); if (status) status.textContent = 'QR를 표시하지 못했습니다. 새로고침 후 다시 시도해 주세요.'; }
}
