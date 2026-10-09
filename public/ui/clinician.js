// Presentation only: never issues permission or substitutes for server policy.
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
