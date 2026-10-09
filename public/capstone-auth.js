// Presenter key and actor JWTs remain in memory. No URL/localStorage/sessionStorage.
export async function initializeCapstoneAuth() {
  if (document.documentElement.dataset.capstone !== "1") return null;
  const form = document.createElement("form");
  form.id = "capstone-login";
  form.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-content:center;background:#0d1529;color:white;padding:24px;gap:12px";
  form.innerHTML = '<h1>Medi Q 캡스톤 시연 로그인</h1><p>가상 병원·합성 데이터 / 개발용 Mock IdP / 비운영 환경</p><label>시연 데이터 <select id="capstone-patient-profile"><option value="DEFAULT">기존 합성 환자</option><option value="PHANTOM">CT·MR 팬텀 환자 (등록 후 사용)</option></select></label><label>시연 접근 키 <input id="capstone-login-key" type="password" autocomplete="off" required maxlength="128"></label><button class="btn primary" type="submit">시연 시작</button><p id="capstone-login-error" role="alert"></p>';
  document.body.append(form);
  const profiles = await new Promise(resolve => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const input = form.querySelector("input");
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const patientProfile = form.querySelector('select').value;
        const response = await fetch("/api/capstone-demo/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: input.value, patientProfile }), signal: AbortSignal.timeout(10000), cache: "no-store" });
        input.value = "";
        if (!response.ok) throw new Error("DEMO_LOGIN_FAILED");
        const session = await response.json();
        if (!session.profiles || !Number.isFinite(Date.parse(session.expiresAt))) throw new Error("INVALID_DEMO_SESSION");
        const expectedPatient = patientProfile === 'PHANTOM' ? 'HP-TEST-PHANTOM-001' : 'P-1001';
        if (session.demoContext?.patientId !== expectedPatient && !(patientProfile === 'DEFAULT' && !session.demoContext)) throw new Error('DEMO_PATIENT_CONTEXT_MISMATCH');
        form.remove();
        const badge = document.createElement("div");
        badge.textContent = "CAPSTONE · 합성 데이터 · Mock IdP · 비운영 환경";
        badge.style.cssText = "position:relative;background:#eff6ff;color:#1e40af;padding:8px 16px;font-size:12px;line-height:1.5;text-align:center";
        document.body.prepend(badge);
        resolve(session);
      } catch {
        form.querySelector("#capstone-login-error").textContent = "접근 키 또는 연결을 확인해 주세요. 상세 인증 정보는 표시하지 않습니다.";
      } finally { input.value = ""; button.disabled = false; }
    });
  });
  return { context: profiles.demoContext ?? { patientId: 'P-1001', patientName: '가상환자 1001', defaultStudyUid: '1.2.410.100.1.20260620.001' }, headers(role) {
    if (Date.now() >= Date.parse(profiles.expiresAt)) throw new Error("시연 인증이 만료되었습니다. 새로고침하여 다시 로그인해 주세요.");
    if (!profiles.profiles[role]) throw new Error("이 역할은 현재 캡스톤 시연 범위에 없습니다.");
    return { authorization: `Bearer ${profiles.profiles[role]}` };
  } };
}
