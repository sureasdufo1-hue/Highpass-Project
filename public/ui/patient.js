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
  };
  path.setAttribute('d', paths[kind] || 'M4 3h16v18H4zM7 16l3-4 3 3 2-2 3 4M8 7h.01');
  svg.append(path); return svg;
}
function element(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
    const art = element('div', 'hp-study-art'); art.append(icon(), element('span', '', `${study.modality || '검사'} · 합성 데이터`));
    card.append(art, element('h3', '', study.description || '의료영상'), element('p', '', `${study.sourceHospitalId || '병원 확인 필요'} · ${study.studyDate || '검사일 미확인'}`));
    const actions = element('div', 'hp-study-actions');
    for (const [label, callback, primary] of [['미리보기', onView, false], ['공유 동의', onShare, true]]) {
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
  document.querySelectorAll('#patient-portal-app .nav-icon').forEach((node, index) => node.replaceChildren(icon(index === 0 ? 'home' : 'image')));
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
