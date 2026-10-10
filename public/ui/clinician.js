// Presentation only: never issues permission or substitutes for server policy.
export function clinicalNextAction(study, consent, token, pixelVisible = false, now = Date.now()) {
  if (!study) return {action:'qr',label:'QR로 환자 연결',note:'환자의 QR을 연결하거나 아래에서 검사를 선택하세요.'};
  const state = clinicianDetailModel(study,consent,now)[2][1];
  if (!consent) return {action:'qr',label:'환자 QR 연결',note:'이 검사의 공유 동의가 필요합니다. 환자에게 연결을 요청하세요.'};
  if (state === '철회됨') return {action:'details',label:'철회 내용 확인',note:'환자가 공유 동의를 철회했습니다. 다시 열람하려면 새로운 동의가 필요합니다.'};
  if (state === '만료됨') return {action:'details',label:'공유 기간 확인',note:'공유 기간이 끝났습니다. 환자의 새로운 승인을 확인하세요.'};
  if (state !== '동의 유효 · 서버 검증 필요') return {action:'refresh',label:'승인 상태 확인',note:'동의 상태와 시작 시간을 다시 확인합니다.'};
  const currentToken = token?.studyInstanceUid === study.studyInstanceUid && Number.isFinite(Date.parse(token.expiresAt)) && Date.parse(token.expiresAt)>now;
  return {action:'viewer',label:currentToken && pixelVisible ? 'Viewer로 돌아가기' : `접근 확인 후 ${study.modality === 'CT' ? 'CT' : '영상'} 열기`,note:'동의된 기관·목적·검사 범위를 확인한 뒤 영상을 엽니다.'};
}

export function renderClinicalActivity(container, logs, studyUid) {
  if (!container) return;
  const names = {DICOM_ACCESS_REQUEST:'영상 접근 요청',TOKEN_ISSUED:'열람 권한 발급',CONSENT_CREATED:'공유 동의 생성',CONSENT_REVOKED:'공유 동의 철회',DICOM_INSTANCE_READ:'영상 조회',DICOM_STUDY_QUERY:'검사 목록 조회'};
  const rows = studyUid ? logs.filter(log => (log.studyUid || log.studyInstanceUid) === studyUid)
    .sort((a,b) => (Date.parse(b.timestamp || b.createdAt)||0)-(Date.parse(a.timestamp || a.createdAt)||0)).slice(0,3) : [];
  container.replaceChildren();
  if (!rows.length) { const p=document.createElement('p'); p.textContent='현재 조회된 기록에 이 검사의 이력이 없습니다. 전체 이력에서 확인할 수 있습니다.'; container.append(p); return; }
  for (const row of rows) {
    const item=document.createElement('div'); item.className='desk-activity-row';
    const title=document.createElement('strong'); title.textContent=names[row.action] || '검사 관련 활동';
    const result=document.createElement('span'); result.textContent=['SUCCESS','ALLOWED'].includes(row.result)?'허용 / 성공':['DENIED','FAIL','FAILED'].includes(row.result)?'거부 / 실패':'결과 확인 필요';
    const time=document.createElement('time'); const value=Date.parse(row.timestamp || row.createdAt);
    time.textContent=Number.isFinite(value)?new Date(value).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'시각 미확인';
    item.append(title,result,time); container.append(item);
  }
}

export function clinicalDossierModel(study, consent, context = {}, now = Date.now()) {
  const rows = clinicianDetailModel(study, consent, now);
  return {
    patient: context.patientName || '합성 환자',
    patientNote: Number.isInteger(context.scenario?.age) ? `${context.scenario.age}세 · 합성 시연 환자 · 임상 판단 금지` : '합성 데이터 · 비운영 시연',
    source: study?.sourceHospitalId || '출처 확인 대기',
    target: consent?.targetHospitalId || '수신 기관 확인 대기',
    consent: rows[2]?.[1] || '검사 선택 대기',
    facts: [
      ['검사일', study?.studyDate || '미확인'],
      ['영상 종류', study?.modality || '미확인'],
      ['승인 목적', consent?.purpose === 'TREATMENT' ? '진료' : consent?.purpose || '미확인'],
      ['공유 기한', Number.isFinite(Date.parse(consent?.validUntil)) ? new Date(consent.validUntil).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '미확인'],
    ],
  };
}

export function renderClinicalDossier(container, study, consent, context) {
  if (!container) return;
  const model = clinicalDossierModel(study, consent, context);
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const patient = element('div', undefined, 'mq-dossier-patient');
  const avatar = element('span', model.patient.slice(0, 1), 'mq-dossier-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  const copy = element('div');
  copy.append(element('strong', `${model.patient}님의 다음 진료를 준비합니다.`), element('p', model.patientNote));
  patient.append(avatar, copy);
  const route = element('div', undefined, 'mq-dossier-route');
  const hospital = id => ({'HOSP-A':'A대학병원','HOSP-B':'B대학병원','HOSP-C':'C대학병원'}[id] || id);
  for (const [label, value] of [['출처 병원',hospital(model.source)],['환자 승인',model.consent],['수신 병원',hospital(model.target)]]) {
    const stop=element('div',undefined,'desk-route-stop'); stop.append(element('small',label),element('strong',value)); route.append(stop);
  }
  const facts = element('dl', undefined, 'mq-dossier-facts');
  for (const [title, value] of model.facts) {
    const pair = element('div'); pair.append(element('dt', title), element('dd', value)); facts.append(pair);
  }
  container.replaceChildren(patient, route, facts);
}

export function filterClinicalStudies(studies, query, filter, consentForStudy, now = Date.now()) {
  const normalize = value => String(value ?? '').toLowerCase().replace(/mri/g, 'mr');
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return studies.filter(study => {
    const text = normalize([study.description, study.modality, study.studyDate, study.sourceHospitalId].join(' '));
    const active = clinicianDetailModel(study, consentForStudy(study.studyInstanceUid), now)[2][1] === '동의 유효 · 서버 검증 필요';
    return terms.every(term => text.includes(term)) && (filter === 'all' || (filter === 'active' ? active : !active));
  });
}

export function renderClinicalMetrics(container, studies, consentForStudy) {
  if (!container) return;
  const active = filterClinicalStudies(studies, '', 'active', consentForStudy).length;
  container.replaceChildren();
  for (const [label, value, note] of [
    ['조회된 검사', studies.length, '현재 환자 목록 기준'],
    ['동의 유효', active, '열람 권한은 별도 검증'],
    ['확인 필요', studies.length - active, '동의·기간 확인'],
    ['수신 완료', '미연결', 'PACS 수신함에서 확인'],
  ]) {
    const card = document.createElement('section');
    const title = document.createElement('span'); title.textContent = label;
    const count = document.createElement('strong'); count.textContent = String(value);
    const help = document.createElement('small'); help.textContent = note;
    card.append(title, count, help); container.append(card);
  }
}
export function clinicianDetailModel(study, consent, now = Date.now()) {
  if (!study) return [];
  const start = Date.parse(consent?.validFrom);
  const end = Date.parse(consent?.validUntil);
  let state = '동의 필요';
  if (consent?.status === 'REVOKED') state = '철회됨';
  else if (consent?.status === 'EXPIRED' || (Number.isFinite(end) && end <= now)) state = '만료됨';
  else if (consent?.status === 'ACTIVE') {
    state = !Number.isFinite(start) || !Number.isFinite(end) ? '유효기간 확인 필요'
      : start > now ? '시작 전' : '동의 유효 · 서버 검증 필요';
  }
  return [
    ['검사 정보', study.description || '검사명 없음', `${study.modality || 'DICOM'} · ${study.studyDate || '검사일 미확인'}`],
    ['출처 병원', study.sourceHospitalId || '미확인', '원본 보관 기관'],
    ['환자 동의', state, consent?.purpose || '목적 미확인'],
    ['동의된 작업', consent?.permission || '미확인', '동의와 실제 접근 허용은 별개입니다.'],
    ['수신 병원', consent?.targetHospitalId || '미확인', '환자 매핑 검증 결과: 미연결'],
    ['접근 권한', '열람 시 서버 검증', '단기 토큰·Study·Series 범위를 검증합니다.'],
    ['수신 결과', '미검증', '목록 조회는 영상 전송·PACS 반입 완료가 아닙니다.'],
  ];
}

export function renderClinicianDetail(container, study, consent) {
  if (!container) return;
  container.replaceChildren();
  if (!study) { container.textContent = '목록에서 검사를 선택하세요.'; return; }
  for (const [title, value, note] of clinicianDetailModel(study, consent)) {
    const card = document.createElement('section');
    card.className = 'mq-detail-item';
    const heading = document.createElement('h4'); heading.textContent = title;
    const text = document.createElement('strong'); text.textContent = value;
    const help = document.createElement('p'); help.textContent = note;
    card.append(heading, text, help); container.append(card);
  }
}

export function renderClinicalStudyList(container, studies, selectedUid, consentForStudy) {
  container.replaceChildren();
  for (const study of studies) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mq-study-choice';
    button.dataset.doctorDetail = study.studyInstanceUid;
    button.setAttribute('aria-pressed', String(study.studyInstanceUid === selectedUid));
    const modality = document.createElement('span'); modality.className = 'mq-modality'; modality.textContent = study.modality || 'DCM';
    const body = document.createElement('span'); body.className = 'mq-study-copy';
    const name = document.createElement('strong'); name.textContent = study.description || '의료영상';
    const meta = document.createElement('small'); meta.textContent = `${study.studyDate || '날짜 미확인'} · ${study.sourceHospitalId || '출처 미확인'}`;
    const status = document.createElement('span'); status.className = 'mq-study-state';
    const value = clinicianDetailModel(study, consentForStudy(study.studyInstanceUid))[2][1];
    status.textContent = value === '동의 유효 · 서버 검증 필요' ? '동의 유효' : value;
    body.append(name, meta, status); button.append(modality, body); container.append(button);
  }
}
