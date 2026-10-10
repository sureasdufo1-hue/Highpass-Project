// Presenter key and actor JWTs remain in memory. No URL/localStorage/sessionStorage.
export async function initializeCapstoneAuth() {
  if (document.documentElement.dataset.capstone !== "1") return null;
  const form = document.createElement("form");
  form.id = "capstone-login";
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/ui/capstone-login.css'; document.head.append(style);
  form.innerHTML = `<div class="mediq-login-shell"><section class="mediq-login-story">
    <a class="mediq-login-brand" href="/hipass/" aria-label="Medi Q 홈"><span class="mediq-login-logo" role="img" aria-label="Medi Q"></span></a>
    <span class="mediq-login-tag">합성 환자 시연</span><h1>내 영상을 가지고,<br>다음 진료로.</h1>
    <p class="mediq-login-intro">다시 찍기 전에, 내가 찍은 CT를 안전하게 연결하세요.</p>
    <div class="mediq-login-patient"><span class="mediq-login-avatar" aria-hidden="true">Q</span><div><strong>내 의료영상</strong><p>내가 확인하고, 내가 승인하는 공유</p></div><span class="mediq-login-exam">Medi Q</span></div>
    <div class="mediq-login-journey"><div><span>검사한 병원</span><strong>A대학병원</strong></div><span aria-hidden="true">→</span><div><span>다음 진료</span><strong>B대학병원</strong></div></div>
    <p class="mediq-login-note">합성 데이터만 사용하는 캡스톤 시연입니다. 실제 본인확인·병원 인증 서비스가 아닙니다.</p>
  </section><section class="mediq-login-entry" aria-labelledby="mediq-login-title"><h2 id="mediq-login-title">다시 만나 반가워요.</h2><p>로그인하고 다음 진료를 준비하세요.</p>
    <div id="mediq-account-fields"><label for="capstone-login-username">아이디</label><input id="capstone-login-username" name="username" autocomplete="username" maxlength="32" required placeholder="아이디를 입력하세요" autocapitalize="none" spellcheck="false">
    <label for="capstone-login-password">비밀번호</label><input id="capstone-login-password" name="password" type="password" autocomplete="current-password" maxlength="128" required placeholder="비밀번호를 입력하세요"></div>
    <label class="mediq-presenter-toggle"><input id="mediq-presenter-mode" type="checkbox"> 발표자·의료진 시연 접근 키 사용</label>
    <div id="mediq-presenter-fields" hidden>
    <div class="mediq-login-roles" aria-label="시연 시작 화면"><button type="button" data-entry-role="PATIENT" aria-pressed="true" class="is-active">환자</button><button type="button" data-entry-role="DOCTOR" aria-pressed="false">의료진</button></div>
    <p id="capstone-entry-description" class="mediq-login-role-description">홍길동님의 CT를 확인하고 B대학병원에 공유합니다.</p>
    <div id="capstone-legacy-profiles" hidden><label for="capstone-patient-profile">시연 환자</label><select id="capstone-patient-profile"><option value="HCC_SYNTHETIC">홍길동 · 56세 · 복부 CT</option></select></div>
    <label for="capstone-login-key">시연 접근 키</label><input id="capstone-login-key" type="password" autocomplete="off" disabled maxlength="128" placeholder="발표자에게 받은 접근 키" aria-describedby="capstone-login-help"></div>
    <p id="capstone-login-help" class="mediq-login-help">환자 시연 계정으로 로그인합니다. 실제 개인정보를 입력하지 마세요.</p><button class="btn primary mediq-login-submit" type="submit" disabled>로그인</button>
    <button type="button" id="mediq-signup-open" class="mediq-login-text-button">처음이신가요? 회원가입</button>
    <div class="mediq-social" aria-describedby="mediq-social-note"><p id="mediq-social-note">간편 로그인 · 연동 준비 중</p><button type="button" disabled>Google로 계속하기 · 준비 중</button><button type="button" disabled>네이버로 계속하기 · 준비 중</button><button type="button" disabled>카카오로 계속하기 · 준비 중</button></div>
    <dialog id="mediq-signup" aria-labelledby="mediq-signup-title"><h2 id="mediq-signup-title">Medi Q 회원가입</h2><p>가입 화면 미리보기입니다. 현재 계정은 생성되지 않으며 입력 내용은 전송·저장하지 않습니다. 실제 개인정보를 입력하지 마세요.</p><fieldset disabled><label for="mediq-signup-id">아이디</label><input id="mediq-signup-id" placeholder="사용할 아이디"><label for="mediq-signup-password">비밀번호</label><input id="mediq-signup-password" type="password" autocomplete="new-password"><label for="mediq-signup-confirm">비밀번호 확인</label><input id="mediq-signup-confirm" type="password" autocomplete="new-password"><button type="button" class="mediq-login-submit" disabled>회원가입 · 준비 중</button></fieldset><button type="button" id="mediq-signup-close" class="mediq-login-text-button">로그인으로 돌아가기</button></dialog>
    <p id="capstone-login-error" role="alert"></p><p class="mediq-login-footer">환자 승인 · 범위가 정해진 공유 · 암호화된 연결</p>
  </section></div>`;
  const inactive = [...document.body.children].map(node => [node, node.inert]);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  for (const [node] of inactive) node.inert = true;
  document.body.append(form);
  const mobile = location.pathname.startsWith('/mobile');
  if (mobile) {
    form.classList.add('mediq-mobile-login');
    const entry = form.querySelector('.mediq-login-entry');
    const brand = form.querySelector('.mediq-login-brand');
    entry.prepend(brand);
    const presenterDetails = document.createElement('details');
    presenterDetails.className = 'mediq-login-advanced';
    const summary = document.createElement('summary');
    summary.textContent = '발표자 접근 설정';
    presenterDetails.append(summary, form.querySelector('.mediq-presenter-toggle'), form.querySelector('#mediq-presenter-fields'));
    entry.append(presenterDetails);
    form.querySelector('.mediq-login-footer').textContent = '합성 환자 시연 · 실제 본인확인 서비스가 아닙니다.';
    form.querySelectorAll('.mediq-social button').forEach((button, index) => {
      button.textContent = ['Google', '네이버', '카카오'][index];
      button.setAttribute('aria-label', `${button.textContent} 로그인 · 연동 준비 중`);
    });
  }
  let entryRole = !mobile && /^(?:#DOCTOR|#doctor)$/.test(location.hash) ? 'DOCTOR' : 'PATIENT';
  const submit = form.querySelector('[type="submit"]');
  const select = form.querySelector('select');
  const presenterMode = form.querySelector('#mediq-presenter-mode');
  presenterMode.checked = entryRole === 'DOCTOR';
  const username = form.querySelector('#capstone-login-username');
  const password = form.querySelector('#capstone-login-password');
  const key = form.querySelector('#capstone-login-key');
  const signup = form.querySelector('#mediq-signup');
  form.querySelector('#mediq-signup-open').addEventListener('click', () => signup.showModal());
  form.querySelector('#mediq-signup-close').addEventListener('click', () => signup.close());
  function applyMode() {
    const presenter = presenterMode.checked;
    form.querySelector('#mediq-account-fields').hidden = presenter;
    form.querySelector('#mediq-presenter-fields').hidden = !presenter;
    username.disabled = password.disabled = presenter;
    username.required = password.required = !presenter;
    key.disabled = !presenter; key.required = presenter;
    password.value = key.value = '';
    setRole(presenter ? entryRole : 'PATIENT');
  }
  presenterMode.addEventListener('change', applyMode);
  function setRole(role) {
    entryRole = role;
    for (const button of form.querySelectorAll('[data-entry-role]')) {
      button.classList.toggle('is-active', button.dataset.entryRole === role);
      button.setAttribute('aria-pressed', String(button.dataset.entryRole === role));
    }
    form.querySelector('#capstone-entry-description').textContent = role === 'DOCTOR'
      ? 'B대학병원에서 환자의 동의를 확인하고 전달된 CT를 열람합니다.' : select.value === 'HCC_SYNTHETIC' ? '홍길동님의 CT를 확인하고 B대학병원에 공유합니다.' : '선택한 합성 환자의 영상과 동의를 확인합니다.';
    submit.textContent = role === 'DOCTOR' ? 'B대학병원 의료진으로 시작' : select.value === 'HCC_SYNTHETIC' ? '홍길동으로 시작' : '선택한 합성 환자로 시작';
    if (!presenterMode.checked) submit.textContent = '로그인';
  }
  if (mobile) form.querySelector('.mediq-login-roles').hidden = true;
  for (const button of form.querySelectorAll('[data-entry-role]')) button.addEventListener('click', () => setRole(button.dataset.entryRole));
  setRole(entryRole);
  applyMode();
  try {
    const response = await fetch('/api/capstone-demo/scenario', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const config = response.ok ? await response.json() : response.status === 404 ? { mainScenario: false } : null;
    if (!config) throw new Error('SCENARIO_UNAVAILABLE');
    if (!config.mainScenario) {
      select.replaceChildren(new Option('기존 합성 환자', 'DEFAULT'), new Option('CT·MR 팬텀 환자', 'PHANTOM'), new Option('홍길동 · 56세 · 복부 CT', 'HCC_SYNTHETIC'));
      form.querySelector('#capstone-legacy-profiles').hidden = false;
      setRole(entryRole);
    }
    select.addEventListener('change', () => setRole(entryRole));
    submit.disabled = false; (presenterMode.checked ? key : username).focus();
  } catch {
    form.querySelector('#capstone-login-error').textContent = '시연 서버에 연결하지 못했습니다. 연결을 확인하고 새로고침해 주세요.';
  }
  const profiles = await new Promise(resolve => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const input = presenterMode.checked ? key : password;
      const button = submit;
      button.disabled = true;
      try {
        const patientProfile = presenterMode.checked ? select.value : 'HCC_SYNTHETIC';
        const credentials = presenterMode.checked ? { key: input.value, patientProfile, entryRole } : { username: username.value, password: input.value, patientProfile, entryRole: 'PATIENT' };
        const response = await fetch("/api/capstone-demo/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(10000), cache: "no-store" });
        input.value = "";
        if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || 'DEMO_LOGIN_FAILED'); }
        const session = await response.json();
        if (!session.profiles || !Number.isFinite(Date.parse(session.expiresAt))) throw new Error("INVALID_DEMO_SESSION");
        const expectedPatient = patientProfile === 'PHANTOM' ? 'HP-TEST-PHANTOM-001'
          : patientProfile === 'HCC_SYNTHETIC' ? 'MEDIQ-SYN-HCC-001' : 'P-1001';
        if (session.demoContext?.patientId !== expectedPatient && !(patientProfile === 'DEFAULT' && !session.demoContext)) throw new Error('DEMO_PATIENT_CONTEXT_MISMATCH');
        for (const [node, wasInert] of inactive) if (node.isConnected) node.inert = wasInert;
        document.documentElement.style.overflow = previousOverflow;
        form.remove();
        const badge = document.createElement("div");
        badge.textContent = "CAPSTONE · 합성 데이터 · Mock IdP · 비운영 환경";
        badge.style.cssText = "position:relative;background:#eff6ff;color:#1e40af;padding:8px 16px;font-size:12px;line-height:1.5;text-align:center";
        document.body.prepend(badge);
        resolve(session);
      } catch (error) {
        form.querySelector("#capstone-login-error").textContent = error.message === 'HCC_CATALOG_NOT_REGISTERED'
          ? '홍길동님의 CT 등록을 준비 중입니다. 발표자에게 환경 준비 상태를 확인해 주세요.'
          : error.message === 'DEMO_PROFILE_ARCHIVED' ? '이전 시연 환자는 보관 처리되었습니다. 홍길동 시나리오를 선택하세요.'
          : '아이디·비밀번호 또는 시연 접근 키와 연결을 확인해 주세요.';
      } finally { input.value = ""; button.disabled = false; }
    });
  });
  return { roles: Object.keys(profiles.profiles), context: profiles.demoContext ?? { patientId: 'P-1001', patientName: '가상환자 1001', defaultStudyUid: '1.2.410.100.1.20260620.001' }, headers(role) {
    if (Date.now() >= Date.parse(profiles.expiresAt)) {
      const error = new Error("시연 인증이 만료되었습니다. 새로고침하여 다시 로그인해 주세요.");
      error.code = "CAPSTONE_SESSION_EXPIRED";
      throw error;
    }
    if (!profiles.profiles[role]) throw new Error("이 역할은 현재 캡스톤 시연 범위에 없습니다.");
    return { authorization: `Bearer ${profiles.profiles[role]}` };
  } };
}
