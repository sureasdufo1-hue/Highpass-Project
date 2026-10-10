// HiPass MediQ Patient Mobile Application
// Patient-Controlled Medical Imaging & MyData Mobility Client
// Security Contract: Zero browser plaintext storage (no localStorage/sessionStorage), Fail-Closed
import { initializeCapstoneAuth } from "/capstone-auth.js";
import {openPatientPixelViewer} from '/patient-pixel-viewer.js';
import {createFaqAssistant} from '/ui/faq-assistant.js';
let faqAssistant=null;
let capstoneAuth = null;
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("HI_PASS_SYNC_CHANNEL") : null;
const secondarySyncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("hipass_sync") : null;

function postMobileSync(msg) {
  try {
    if (syncChannel) syncChannel.postMessage(msg);
  } catch {}
  try {
    if (secondarySyncChannel) {
      secondarySyncChannel.postMessage({ type: "SYNC", ...msg, timestamp: Date.now() });
    }
  } catch {}
}

const state = {
  patientId: "P-1001",
  patientName: "김가상 (P-1001)",
  sourceHospitalId: "HOSP-A",
  targetHospitalId: "HOSP-B",
  currentTab: "home",
  activeSubtabRecords: "clinical",
  activeFilterModality: "ALL",
  activeChipFilter: "IMAGING",
  studies: [],
  consents: [],
  clinicalRecords: [],
  checkupRecords: [],
  vaccineRecords: [],
  activeStudy: null,
  activeConsent: null,
  activeTicket: null,
  countdownTimer: null,
  ticketStatusTimer: null,
  ticketStatusBusy: false,
  vaultData: null,
  deviceData: null,
  isAuthenticated: false,
  authMethod: null,
  authenticatedAt: null,
  isVerifying: false,
  
  // Multi-Slice Cine Player State
  cineStudy: null,
  cineCurrentSlice: 1,
  cineTotalSlices: 1,
  cineIsPlaying: false,
  cineTimer: null,
  cineMode: "manual", // 'manual' | 'cine'

  // 4-Step Share Wizard State
  shareWizardStep: 1,
  shareSelectedItems: new Set(),
  shareTargetHospital: "HOSP-B",
  shareTargetDuration: "24h",
  shareMaskSensitive: true,
};

// --------------------------------------------------------------------------
// Initialization & Navigation
// --------------------------------------------------------------------------
async function initializeMobileApp() {
  // Match the existing web portal: signed presenter-login profiles stay in RAM.
  // No development role-header fallback is allowed on a capstone-marked page.
  capstoneAuth = await initializeCapstoneAuth();
  if (document.documentElement.dataset.capstone === "1" && !capstoneAuth) {
    throw new Error("CAPSTONE_AUTH_REQUIRED");
  }
  if (capstoneAuth?.context) handlePatientSelect(capstoneAuth.context.patientId);
  setupNavigation();
  setupSyncChannel();
  registerServiceWorker();
  setupAuth();
  faqAssistant=createFaqAssistant({root:document.querySelector('.mobile-shell'),surface:'mobile',navigate:route=>{
    if(route==='share-manage'){switchTab('share');document.querySelector('#btn-share-sub-manage')?.click();}
    else switchTab(route);
  },available:()=>state.isAuthenticated});
  setupCinePlayer();
  setupShareWizard();

  // App starts locked fail-closed by default
  const authOverlay = document.querySelector("#auth-overlay");
  if (authOverlay) {
    authOverlay.classList.remove("unlocked");
  }
  const headerBadge = document.querySelector("#header-auth-badge");
  if (headerBadge) {
    headerBadge.textContent = "🔒 잠금 상태";
    headerBadge.className = "badge";
  }
  if (capstoneAuth?.context.scenario) {
    document.querySelector('.auth-grid-options')?.setAttribute('hidden', '');
    const authTitle = document.querySelector('.auth-title'); if (authTitle) authTitle.textContent = '홍길동님의 시연 세션 확인';
    await handleQuickAuth('CAPSTONE_SESSION');
  }
}
const startMobileApp = () => {
  void initializeMobileApp().catch(() => showToast("시연 인증을 확인하지 못했습니다. 새로고침하여 다시 로그인하세요."));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startMobileApp, { once: true });
else startMobileApp();

function setupNavigation() {
  const home=document.querySelector('#tab-home');
  const help=home?.querySelector('.wallet-help');
  if (help) {
    // Keep the home hierarchy aligned with the approved wallet mockup.
    // Secondary account information remains available without crowding the home.
    const profile = document.querySelector('#tab-profile');
    profile.append(home.querySelector('#home-share-widget'));
    help.after(home.querySelector('.wallet-extra'));
  }
  const paths={home:'M3 10 12 3 21 10 M5 9v12h5v-7h4v7h5V9',studies:'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5',share:'M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5',profile:'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-2a8 8 0 0 1 16 0v2z'};
  for(const button of document.querySelectorAll('.mobile-nav [data-tab]')){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24','aria-hidden':'true'}))svg.setAttribute(key,value);
    const path=document.createElementNS(svg.namespaceURI,'path');
    for(const [key,value] of Object.entries({d:paths[button.dataset.tab],fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}))path.setAttribute(key,value);
    svg.append(path);button.querySelector('.icon')?.replaceChildren(svg);
  }
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
      if (btn.classList.contains('nav-item') && btn.dataset.tab === 'share') document.querySelector('#btn-share-sub-manage')?.click();
    });
  });

  // Home Quick Action buttons
  document.querySelector("#btn-home-quick-share")?.addEventListener("click", () => {
    switchTab("share");
    document.querySelector('#btn-share-sub-wizard')?.click();
    setWizardStep(1);
  });
  document.querySelector("#btn-goto-share-tab")?.addEventListener("click", () => {
    switchTab("share");
  });
  document.querySelector("#btn-refresh-home")?.addEventListener("click", () => {
    loadInitialData();
  });
  document.querySelector("#btn-refresh-studies")?.addEventListener("click", () => {
    loadStudies();
  });

  // Kind Chips Filter on Home
  document.querySelectorAll("[data-chip-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-chip-filter]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeChipFilter = chip.dataset.chipFilter;
      renderHomeRecentList();
    });
  });

  // Modality Filters on Studies
  document.querySelectorAll("[data-modality-filter]").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-modality-filter]").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.activeFilterModality = pill.dataset.modalityFilter;
      renderStudiesList();
    });
  });

  // Records Subnav
  document.querySelectorAll("[data-records-sub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-records-sub]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeSubtabRecords = btn.dataset.recordsSub;
      renderRecordsScreen();
    });
  });

  // Vault Buttons
  document.querySelector("#btn-crypto-erase")?.addEventListener("click", handleCryptoErase);
}

function switchTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-${tabName}`);
  });
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
    if (btn.dataset.tab === tabName) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  if (state.isAuthenticated) {
    if (tabName === "home") renderHomeScreen();
    if (tabName === "studies") renderStudiesList();
    if (tabName === "records") renderRecordsScreen();
    if (tabName === "share") {
      updateShareSelectCheckboxes();
      renderShareManageScreen();
    }
    if (tabName === "vault") {
      renderVaultView();
      renderDeviceView();
    }
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/mobile/sw.js", { scope: "/mobile/" })
        .then((reg) => {
          console.log("[MediQ PWA] Service Worker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("[MediQ PWA] Service Worker registration failed:", err);
        });
    });
  }
}

function setupSyncChannel() {
  const handleSyncMessage = (data) => {
    const action = data?.action || (data?.type === "SYNC" ? data.action : null);
    if (action === "QR_SCANNED" || action === "HANDOFF_REDEEMED" || action === "TICKET_REDEEMED") {
      onQrConsumedByHospital();
    }
  };

  if (syncChannel) {
    syncChannel.onmessage = (event) => handleSyncMessage(event.data);
  }
  if (secondarySyncChannel) {
    secondarySyncChannel.onmessage = (event) => handleSyncMessage(event.data);
  }
}

// --------------------------------------------------------------------------
// 1-Second Quick Authentication
// --------------------------------------------------------------------------
function setupAuth() {
  document.querySelector("#btn-auth-bio")?.addEventListener("click", () => handleQuickAuth(capstoneAuth?.context.scenario ? 'CAPSTONE_SESSION' : 'BIO'));
  document.querySelector("#btn-auth-pass")?.addEventListener("click", () => handleQuickAuth("PASS"));
  document.querySelector("#btn-auth-kakao")?.addEventListener("click", () => handleQuickAuth("KAKAO"));
  document.querySelector("#btn-auth-pin")?.addEventListener("click", () => handleQuickAuth("PIN"));
  document.querySelector("#btn-lock-app")?.addEventListener("click", handleLockApp);

  const patientSelect = document.querySelector("#auth-patient-select");
  if (patientSelect) {
    if (capstoneAuth) {
      patientSelect.replaceChildren(new Option(capstoneAuth.context.patientName, capstoneAuth.context.patientId));
      patientSelect.disabled = true;
    } else {
      patientSelect.replaceChildren(new Option('가상환자 1001', 'P-1001'), new Option('가상환자 1002', 'P-1002'), new Option('가상환자 1003', 'P-1003'));
    }
    patientSelect.addEventListener("change", (e) => {
      handlePatientSelect(e.target.value);
    });
  }
}

async function handleQuickAuth(method = "BIO") {
  if (state.isVerifying) return;
  state.isVerifying = true;

  const methodMetadata = {
    CAPSTONE_SESSION: { name: '시연 로그인 세션', badge: '시연 로그인', icon: '✓' },
    BIO: { name: "생체인증 화면 시뮬레이션", badge: "개발용 인증", icon: "👆" },
    PASS: { name: "PASS 화면 시뮬레이션", badge: "실제 PASS 미연동", icon: "📱" },
    KAKAO: { name: "카카오 화면 시뮬레이션", badge: "실제 카카오 미연동", icon: "💬" },
    PIN: { name: "PIN 화면 시뮬레이션", badge: "개발용 인증", icon: "🔢" },
  };

  const meta = methodMetadata[method] || methodMetadata.BIO;

  // UI state during 1-second pulse verification
  const verifyBox = document.querySelector("#auth-verifying-box");
  const verifyText = document.querySelector("#auth-verifying-text");
  const progressFill = document.querySelector("#auth-progress-fill");
  const btnBio = document.querySelector("#btn-auth-bio");
  const optGrid = document.querySelector(".auth-grid-options");
  const scanIcon = document.querySelector(".scan-fingerprint");
  const authMainIcon = document.querySelector("#auth-main-icon");

  if (scanIcon) scanIcon.textContent = meta.icon;
  if (verifyText) verifyText.textContent = `${meta.name} 확인 중... (1초)`;
  if (verifyBox) {
    verifyBox.hidden = false;
    verifyBox.style.display = "flex";
  }
  if (btnBio) btnBio.style.display = "none";
  if (optGrid) optGrid.style.display = "none";

  // Haptic feedback
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate([40, 60, 40]); } catch {}
  }

  // Animate progress bar fill over ~850ms
  if (progressFill) {
    progressFill.style.width = "0%";
    requestAnimationFrame(() => {
      progressFill.style.width = "100%";
    });
  }

  // 1-second scanning pulse
  if (method !== 'CAPSTONE_SESSION') await new Promise((resolve) => setTimeout(resolve, 900));

  if (verifyText) verifyText.textContent = "개발용 서버 인증 확인 중...";
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(60); } catch {}
  }

  // Record audit log via backend API
  try {
    const result = await fetch("/api/v1/mobile/auth/login", {
      method: "POST",
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        patientId: state.patientId,
        method,
      }),
    });
    if (!result.ok) throw new Error("AUTHORIZATION_FAILED");
    const receipt = await result.json();
    if (receipt.authenticated !== true || receipt.patientId !== state.patientId || receipt.simulation !== true) {
      throw new Error("AUTH_RECEIPT_NOT_CONFIRMED");
    }
  } catch {
    state.isVerifying = false;
    if (verifyText) verifyText.textContent = "인증을 확인하지 못했습니다. 다시 시도하세요.";
    if (btnBio) btnBio.style.display = "";
    if (optGrid) optGrid.style.display = "";
    return;
  }

  // Update authentication state
  if (verifyText) verifyText.textContent = `✅ 개발용 서버 인증 연결 완료 (${meta.name})`;
  if (authMainIcon) authMainIcon.textContent = "🔓";
  state.isAuthenticated = true;
  state.authMethod = method;
  state.authenticatedAt = new Date().toISOString();
  state.isVerifying = false;

  // Update header badges
  const headerBadge = document.querySelector("#header-auth-badge");
  if (headerBadge) {
    headerBadge.textContent = "개발용 인증 · 하드웨어 미검증";
    headerBadge.className = "badge badge-good";
  }

  const authOverlay = document.querySelector("#auth-overlay");
  if (authOverlay) {
    authOverlay.classList.add("unlocked");
  }

  showToast("개발용 인증으로 연결했습니다. 생체인증·하드웨어 검증은 시뮬레이션입니다.");

  // Load all patient data now that app is authenticated
  await loadInitialData();
}

async function handleLockApp() {
  if (!state.isAuthenticated) return;

  state.isAuthenticated = false;
  faqAssistant?.reset();
  state.authMethod = null;
  state.authenticatedAt = null;

  // Record audit log
  try {
    await fetch("/api/v1/mobile/auth/lock", {
      method: "POST",
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        patientId: state.patientId,
      }),
    });
  } catch {}

  // Reset UI components
  const authOverlay = document.querySelector("#auth-overlay");
  const verifyBox = document.querySelector("#auth-verifying-box");
  const progressFill = document.querySelector("#auth-progress-fill");
  const btnBio = document.querySelector("#btn-auth-bio");
  const optGrid = document.querySelector(".auth-grid-options");
  const headerBadge = document.querySelector("#header-auth-badge");
  const authMainIcon = document.querySelector("#auth-main-icon");

  if (authMainIcon) authMainIcon.textContent = "🔒";
  if (verifyBox) {
    verifyBox.hidden = true;
    verifyBox.style.display = "none";
  }
  if (progressFill) progressFill.style.width = "0%";
  if (btnBio) btnBio.style.display = "flex";
  if (optGrid) optGrid.style.display = "grid";

  if (headerBadge) {
    headerBadge.textContent = "🔒 잠금 상태";
    headerBadge.className = "badge";
  }

  if (authOverlay) {
    authOverlay.classList.remove("unlocked");
  }

  // Clear in-memory active lists
  state.studies = [];
  state.consents = [];
  state.activeStudy = null;
  state.activeTicket = null;
  stopTicketStatusPolling();
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  closeCineViewer();

  // Reset view containers
  const studyContainer = document.querySelector("#study-list-container");
  if (studyContainer) {
    studyContainer.innerHTML = '<div class="card" style="text-align:center;color:#94a3b8;">앱 잠금 상태입니다. 본인인증 후 조회됩니다.</div>';
  }
  const homeRecent = document.querySelector("#home-recent-list");
  if (homeRecent) homeRecent.innerHTML = "";

  showToast("앱이 안전하게 잠금 처리되었습니다.");
}

function handlePatientSelect(patientId) {
  faqAssistant?.reset();
  state.patientId = patientId;
  const names = {
    "HP-TEST-PHANTOM-001": "합성 팬텀 환자",
    "P-1001": "김가상 (P-1001)",
    "P-1002": "이가상 (P-1002)",
    "P-1003": "박가상 (P-1003)",
  };
  state.patientName = capstoneAuth?.context?.patientId === patientId
    ? capstoneAuth.context.scenario ? `${capstoneAuth.context.patientName} · 56세 · 합성 환자` : `${capstoneAuth.context.patientName} (${patientId})`
    : names[patientId] || `${patientId} (합성 환자)`;

  const authPatientEl = document.querySelector("#auth-patient-name");
  if (authPatientEl) authPatientEl.textContent = state.patientName;

  const headerPatientEl = document.querySelector("#header-patient-name");
  if (headerPatientEl) headerPatientEl.textContent = state.patientName;

  const selectEl = document.querySelector("#auth-patient-select");
  if (selectEl && selectEl.value !== patientId) selectEl.value = patientId;

  if (state.isAuthenticated) {
    loadInitialData();
  }
}

// --------------------------------------------------------------------------
// Fail-Closed Data Loading
// --------------------------------------------------------------------------
async function loadInitialData() {
  if (!state.isAuthenticated) return;
  initMockMedicalRecords();
  await Promise.all([loadStudies(), loadConsents(), loadVaultInfo(), loadDeviceInfo()]);
  renderHomeScreen();
  renderStudiesList();
  renderRecordsScreen();
  renderShareManageScreen();
}

async function loadStudies() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch(`/api/imaging-studies?patientId=${state.patientId}&includeSeries=true`, {
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    const studies = await res.json();
    state.studies = Array.isArray(studies) ? studies : [];
  } catch (err) {
    state.studies = [];
  }
  renderStudiesList();
  renderHomeScreen();
}

async function loadConsents() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch(`/api/patients/${state.patientId}/consents`, {
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    const consents = await res.json();
    state.consents = Array.isArray(consents) ? consents : [];
  } catch {
    state.consents = [];
  }
}

async function loadVaultInfo() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch("/api/v1/mobile/vault", { headers: patientHeaders(), signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      state.vaultData = await res.json();
      renderVaultView();
    }
  } catch {}
}

async function loadDeviceInfo() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch("/api/v1/mobile/device", { headers: patientHeaders(), signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      state.deviceData = await res.json();
      renderDeviceView();
    }
  } catch {}
}

function initMockMedicalRecords() {
  // Exact records and prescriptions referenced from MediQ APK
  state.clinicalRecords = [
    {
      id: "REC-2026-001",
      type: "CLINICAL",
      title: "신경외과 외래 진료 및 정밀 처방",
      hospital: "가상 병원 A (신경외과)",
      doctor: "김의사 전문의",
      date: "2026-06-20",
      diagnosis: "추간판 탈출 의심 소견 (경추부)",
      medications: [
        { name: "바이클러캡슐 (250밀리그램)", dosage: "1회 1캡슐, 1일 3회 (3일분)" },
        { name: "스타빅현탁액 (3그램/20밀리리터)", dosage: "1회 1포, 1일 2회 (식간 복용)" },
      ],
    },
    {
      id: "REC-2026-002",
      type: "CLINICAL",
      title: "호흡기내과 추적 진료",
      hospital: "가상 병원 A (호흡기내과)",
      doctor: "최호흡 전문의",
      date: "2026-05-14",
      diagnosis: "우측 폐 결절 소견 (추적 관찰 필요)",
      medications: [
        { name: "신풍겐타마이신주 80밀리그램", dosage: "주사 처방 완료 (원내 투약)" },
      ],
    },
  ];

  state.checkupRecords = [
    {
      id: "CHK-2026-001",
      type: "CHECKUP",
      title: "국민건강보험공단 일반건강검진",
      institution: "국민건강보험공단 지정검진센터 (A병원)",
      date: "2026-03-10",
      status: "정상 A (건강 양호)",
      items: [
        { name: "혈압", value: "118/76 mmHg (정상)" },
        { name: "공복혈당", value: "92 mg/dL (정상)" },
        { name: "간기능(AST/ALT)", value: "22/19 U/L (정상)" },
      ],
    },
    {
      id: "CHK-2025-001",
      type: "CHECKUP",
      title: "국가 암검진 (위 내시경)",
      institution: "가상 병원 A 내시경센터",
      date: "2025-11-04",
      status: "경미한 표재성 위염 (특이 이상 소견 없음)",
      items: [
        { name: "내시경 소견", value: "활동성 궤양 또는 악성 병변 없음" },
      ],
    },
  ];

  state.vaccineRecords = [
    {
      id: "VAC-2025-001",
      type: "VACCINE",
      title: "Tdap (파상풍·디프테리아·백일해) 1회 접종",
      institution: "질병관리청 연계 A병원",
      date: "2025-09-15",
      batchNo: "TD-20250811A",
      status: "접종 완료",
    },
    {
      id: "VAC-2025-002",
      type: "VACCINE",
      title: "인플루엔자 (독감 4가) 백신",
      institution: "질병관리청 연계 A병원",
      date: "2025-10-22",
      batchNo: "FL-20250930C",
      status: "접종 완료",
    },
  ];
}

// --------------------------------------------------------------------------
// Screen 1: Home (MediQ HomeScreen)
// --------------------------------------------------------------------------
function renderHomeScreen() {
  const display = (id,value) => { const node=document.getElementById(id); if(node)node.textContent=value; };
  display('wallet-patient-name', `${capstoneAuth?.context?.patientName ?? state.patientName}님,`);
  display('wallet-profile-name', state.patientName);
  display('header-patient-name', capstoneAuth?.context?.patientName ?? state.patientName);
  const study=state.studies.find(item=>item.studyInstanceUid===capstoneAuth?.context?.defaultStudyUid) ?? state.studies[0];
  const hospital=id=>({'HOSP-A':'A대학병원','HOSP-B':'B대학병원','HOSP-C':'C대학병원'}[id] ?? id ?? '촬영 병원 미확인');
  display('wallet-study',study?.description || '공유할 영상을 확인해 주세요');
  display('wallet-study-date',study ? `${study.studyDate || '검사일 미확인'} · ${study.modality || 'DICOM'} · 합성 검사` : '현재 조회된 영상이 없습니다. 새로고침해 주세요.');
  display('wallet-route',study ? `${hospital(study.sourceHospitalId)} → 수신 병원 선택` : '검사 목록 확인 필요');
  const shareButton=document.querySelector('#btn-home-quick-share');if(shareButton)shareButton.disabled=!study;
  const widgetBadge = document.querySelector("#home-share-badge");
  const widgetDesc = document.querySelector("#home-share-desc");

  const activeConsents = state.consents.filter((c) => c.status === "ACTIVE");
  if (activeConsents.length > 0) {
    if (widgetBadge) {
      widgetBadge.textContent = `🟢 ${activeConsents.length}건 동의 활성 (ACTIVE)`;
      widgetBadge.className = "badge badge-good";
    }
    if (widgetDesc) {
      widgetDesc.textContent = "유효 동의 목록입니다. 일회용 QR의 발급·사용 상태는 공유 화면에서 별도로 확인하세요.";
    }
  } else {
    if (widgetBadge) {
      widgetBadge.textContent = "대기 중";
      widgetBadge.className = "badge";
    }
    if (widgetDesc) {
      widgetDesc.textContent = "현재 활성화된 1회용 QR 공유가 없습니다.";
    }
  }

  renderHomeRecentList();
}

function renderHomeRecentList() {
  const container = document.querySelector("#home-recent-list");
  if (!container) return;

  const filter = state.activeChipFilter;
  let items = [];

  if (filter === "ALL" || filter === "IMAGING") {
    state.studies.forEach((s) => {
      items.push({
        type: "IMAGING",
        title: s.description,
        sub: `${s.modality || "DICOM"} · ${s.sourceHospitalId || "가상 병원 A"}`,
        date: s.studyDate || "검사일 미확인",
        badge: "🩻 영상검사",
        study: s,
      });
    });
  }

  if (filter === "ALL" || filter === "CLINICAL") {
    state.clinicalRecords.forEach((c) => {
      items.push({
        type: "CLINICAL",
        title: c.title,
        sub: `${c.hospital} (${c.diagnosis})`,
        date: c.date,
        badge: "📋 진료·처방",
      });
    });
  }

  if (filter === "ALL" || filter === "CHECKUP") {
    state.checkupRecords.forEach((k) => {
      items.push({
        type: "CHECKUP",
        title: k.title,
        sub: `${k.institution} (${k.status})`,
        date: k.date,
        badge: "🩺 건강검진",
      });
    });
  }

  if (filter === "ALL" || filter === "VACCINE") {
    state.vaccineRecords.forEach((v) => {
      items.push({
        type: "VACCINE",
        title: v.title,
        sub: `${v.institution} (${v.status})`,
        date: v.date,
        badge: "💉 예방접종",
      });
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center;color:#94a3b8;">해당 카테고리의 최근 기록이 없습니다.</div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="wallet-record">
      <div class="wallet-record-icon" aria-hidden="true">${escapeHtml(item.study?.modality || "기록")}</div>
      <div class="wallet-record-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.sub)}</span><span>${escapeHtml(item.date)}</span>
      </div>
      ${item.study ? `<button class="wallet-record-open" aria-label="${escapeHtml(item.title)} 영상 보기" data-action-view-study="${escapeHtml(item.study.studyInstanceUid)}" type="button">›</button>` : ''}
    </article>
  `).join("");

  container.querySelectorAll("[data-action-view-study]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.actionViewStudy;
      const targetStudy = state.studies.find((s) => s.studyInstanceUid === uid);
      if (targetStudy) openCineViewer(targetStudy);
    });
  });
}

// --------------------------------------------------------------------------
// Screen 2: Medical Imaging & Multi-Slice Viewer (MediQ ImagingScreens)
// --------------------------------------------------------------------------
function renderStudiesList() {
  const container = document.querySelector("#study-list-container");
  if (!container) return;

  if (!state.isAuthenticated) {
    container.innerHTML = '<div class="card" style="text-align:center;color:#94a3b8;">앱 잠금 상태입니다. 본인인증 후 조회됩니다.</div>';
    return;
  }

  let list = state.studies;
  if (state.activeFilterModality !== "ALL") {
    list = list.filter((s) => (s.modality || "").toUpperCase() === state.activeFilterModality);
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center;color:#94a3b8;">해당 Modality의 의료영상이 없습니다.</div>';
    return;
  }

  container.innerHTML = list.map((study) => {
    const isShared = state.consents.some(
      (c) => c.status === "ACTIVE" && c.scopes?.some((s) => s.studyInstanceUid === study.studyInstanceUid)
    );
    const badgeHtml = isShared
      ? '<span class="badge badge-good">공유 중 (ACTIVE)</span>'
      : '<span class="badge">대기</span>';

    const sliceCount = study.modality === "CR" ? 1 : (study.series?.[0]?.instances?.length || 50);

    return `
      <article class="card study-item" style="margin-bottom:12px;">
        <div class="study-header">
          <div>
            <div class="study-title">${escapeHtml(study.description)}</div>
            <div class="study-uid">${escapeHtml(study.studyInstanceUid.slice(0, 26))}...</div>
          </div>
          <span class="badge badge-modality">${escapeHtml(study.modality || "DICOM")}</span>
        </div>
        <div class="study-meta">
          <span>📅 ${escapeHtml(study.studyDate || "2026-06-20")}</span>
          <span>🏥 ${escapeHtml(study.sourceHospitalId || "가상 병원 A")}</span>
          <span>🎞️ ${sliceCount} 슬라이스</span>
          ${badgeHtml}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-secondary" style="flex:1;" type="button" data-action-cine="${escapeHtml(study.studyInstanceUid)}">
            🔍 단면/Cine 보기
          </button>
          <button class="btn btn-primary" style="flex:1;" type="button" data-action-share-quick="${escapeHtml(study.studyInstanceUid)}">
            📱 1회용 QR 공유
          </button>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-action-cine]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = state.studies.find((s) => s.studyInstanceUid === btn.dataset.actionCine);
      if (target) openCineViewer(target);
    });
  });

  container.querySelectorAll("[data-action-share-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = state.studies.find((s) => s.studyInstanceUid === btn.dataset.actionShareQuick);
      if (target) {
        state.shareSelectedItems.clear();
        state.shareSelectedItems.add(target.studyInstanceUid);
        switchTab("share");
        setWizardStep(2);
      }
    });
  });
}

// --------------------------------------------------------------------------
// Multi-Slice SyntheticScanCine Player Modal
// --------------------------------------------------------------------------
function setupCinePlayer() {
  document.querySelector("#btn-close-cine")?.addEventListener("click", closeCineViewer);
  document.querySelector("#btn-mode-manual")?.addEventListener("click", () => setCineMode("manual"));
  document.querySelector("#btn-mode-cine")?.addEventListener("click", () => setCineMode("cine"));

  const slider = document.querySelector("#cine-slider");
  if (slider) {
    slider.addEventListener("input", (e) => {
      state.cineCurrentSlice = Number(e.target.value);
      drawCurrentCineFrame();
    });
  }

  document.querySelector("#btn-cine-prev")?.addEventListener("click", () => {
    state.cineCurrentSlice = Math.max(1, state.cineCurrentSlice - 1);
    updateCineSliderAndFrame();
  });
  document.querySelector("#btn-cine-next")?.addEventListener("click", () => {
    state.cineCurrentSlice = Math.min(state.cineTotalSlices, state.cineCurrentSlice + 1);
    updateCineSliderAndFrame();
  });
  document.querySelector("#btn-cine-play")?.addEventListener("click", toggleCinePlayback);

  document.querySelector("#btn-cine-share-this")?.addEventListener("click", () => {
    if (state.cineStudy) {
      state.shareSelectedItems.clear();
      state.shareSelectedItems.add(state.cineStudy.studyInstanceUid);
      closeCineViewer();
      switchTab("share");
      setWizardStep(2);
    }
  });
}

async function openCineViewer(study) {
  if(!capstoneAuth){showToast('본인 영상은 보안 시연 로그인 후 열람할 수 있습니다.');return;}
  try{await openPatientPixelViewer({patientId:state.patientId,study,headers:patientHeaders()});}
  catch{showToast('본인 열람 인증을 확인하지 못했습니다. 다시 로그인해 주세요.');}
}

// Historical mock canvas is not a fallback for denied/unavailable real pixels.
async function openRetiredIllustrativeCineViewer(study) {
  try {
    const response = await fetch(`/api/patients/${state.patientId}/studies/${encodeURIComponent(study.studyInstanceUid)}/self-view`, {
      method: "POST", headers: patientHeaders(), body: JSON.stringify({}), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("SELF_VIEW_DENIED");
  } catch {
    showToast("열람 승인을 확인하지 못했습니다. 다시 로그인한 뒤 시도하세요.");
    return;
  }
  state.cineStudy = study;
  // One illustrative canvas frame; never claim a retrieved DICOM slice count.
  state.cineTotalSlices = 1;
  state.cineCurrentSlice = 1;
  state.cineIsPlaying = false;
  state.cineMode = "manual";

  const modal = document.querySelector("#modal-cine-viewer");
  const title = document.querySelector("#cine-title");
  const badge = document.querySelector("#cine-modality-badge");
  const sliceBadge = document.querySelector("#cine-slice-badge");
  const slider = document.querySelector("#cine-slider");
  const maxLabel = document.querySelector("#cine-max-label");
  const hudDate = document.querySelector("#hud-study-date");
  const findingText = document.querySelector("#cine-finding-text");

  if (title) title.textContent = `[모의 미리보기 · 실제 DICOM 아님] ${study.description}`;
  if (badge) badge.textContent = study.modality || "DICOM";
  if (sliceBadge) sliceBadge.textContent = `모의 프레임 1 / ${state.cineTotalSlices}`;
  if (slider) {
    slider.min = 1;
    slider.max = state.cineTotalSlices;
    slider.value = 1;
    slider.disabled = state.cineTotalSlices <= 1;
  }
  if (maxLabel) maxLabel.textContent = state.cineTotalSlices;
  for (const selector of ["#btn-mode-cine", "#btn-cine-play"]) {
    const button = document.querySelector(selector);
    if (button) button.disabled = state.cineTotalSlices <= 1;
  }
  if (hudDate) hudDate.textContent = study.studyDate || "검사일 미확인";

  if (findingText) {
    if (study.modality === "CT") {
      findingText.textContent = "의료진 판독 소견: 우측 폐 결절 소견. 이전 검사 대비 크기 변화 관찰 요망. 흉부 임파선 종대 소견 없음.";
    } else if (study.modality === "MR") {
      findingText.textContent = "의료진 판독 소견: 뇌 실질 내 급성 뇌경색 병변 없음. 경추 추간판 탈출 의심 소견 (C5-6 디스크 퇴행성 변화).";
    } else {
      findingText.textContent = "의료진 판독 소견: 흉부 단순촬영 특이소견 없음. 심장 및 대혈관 정상 윤곽 유지.";
    }
    findingText.textContent = "시연용 예시 설명입니다. 실제 영상 판독이나 진단 결과가 아닙니다.";
  }

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }

  setCineMode("manual");
  drawCurrentCineFrame();
}

function closeCineViewer() {
  if (state.cineTimer) clearInterval(state.cineTimer);
  state.cineIsPlaying = false;
  const modal = document.querySelector("#modal-cine-viewer");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
}

function setCineMode(mode) {
  state.cineMode = mode;
  document.querySelector("#btn-mode-manual")?.classList.toggle("active", mode === "manual");
  document.querySelector("#btn-mode-cine")?.classList.toggle("active", mode === "cine");

  if (mode === "cine") {
    startCinePlayback();
  } else {
    stopCinePlayback();
  }
}

function toggleCinePlayback() {
  if (state.cineIsPlaying) {
    stopCinePlayback();
  } else {
    startCinePlayback();
  }
}

function startCinePlayback() {
  if (state.cineTotalSlices <= 1) return;
  if (state.cineTimer) clearInterval(state.cineTimer);
  state.cineIsPlaying = true;
  const playBtn = document.querySelector("#btn-cine-play");
  if (playBtn) playBtn.textContent = "⏸ 일시정지";

  state.cineTimer = setInterval(() => {
    state.cineCurrentSlice = state.cineCurrentSlice >= state.cineTotalSlices ? 1 : state.cineCurrentSlice + 1;
    updateCineSliderAndFrame();
  }, 90); // ~11-12 fps smooth medical cine playback
}

function stopCinePlayback() {
  if (state.cineTimer) clearInterval(state.cineTimer);
  state.cineIsPlaying = false;
  const playBtn = document.querySelector("#btn-cine-play");
  if (playBtn) playBtn.textContent = "▶ 재생 (Cine)";
}

function updateCineSliderAndFrame() {
  const slider = document.querySelector("#cine-slider");
  if (slider) slider.value = state.cineCurrentSlice;
  const sliceBadge = document.querySelector("#cine-slice-badge");
  if (sliceBadge) sliceBadge.textContent = `모의 프레임 ${state.cineCurrentSlice} / ${state.cineTotalSlices}`;
  const hudInst = document.querySelector("#hud-instance-no");
  if (hudInst) hudInst.textContent = `모의 프레임: ${state.cineCurrentSlice}`;
  drawCurrentCineFrame();
}

function drawCurrentCineFrame() {
  const canvas = document.querySelector("#cine-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const slice = state.cineCurrentSlice;
  const total = state.cineTotalSlices;
  const mod = state.cineStudy?.modality || "CT";

  // Clear background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // Render Synthetic Anatomical Slices based on Modality & Slice Number
  const progress = slice / total;
  const centerX = w / 2;
  const centerY = h / 2;

  if (mod === "MR") {
    // Cranial brain cross-section contour
    const radius = 90 + Math.sin(progress * Math.PI) * 20;
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 0.85, radius, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Ventricles & Brain parenchyma
    ctx.fillStyle = `rgba(148, 163, 184, ${0.15 + Math.sin(progress * Math.PI) * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 0.75, radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ventricle butterflies
    const ventW = 12 + Math.sin(progress * Math.PI) * 16;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.ellipse(centerX - 16, centerY, ventW * 0.5, ventW * 1.5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(centerX + 16, centerY, ventW * 0.5, ventW * 1.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (mod === "CT") {
    // Thorax & Rib cage contour
    const ribW = 110;
    const ribH = 85;
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, ribW, ribH, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Spine bone
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(centerX, centerY + ribH - 15, 12, 0, Math.PI * 2);
    ctx.fill();

    // Lungs (Left & Right air cavities)
    const lungScale = Math.sin(progress * Math.PI);
    ctx.fillStyle = "#090d16";
    ctx.beginPath();
    ctx.ellipse(centerX - 45, centerY - 5, 38 * lungScale, 55 * lungScale, -0.15, 0, Math.PI * 2);
    ctx.ellipse(centerX + 45, centerY - 5, 38 * lungScale, 55 * lungScale, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Suspicious Nodule (matches diagnostic report on slices 20~30)
    if (slice >= 18 && slice <= 32) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(centerX + 50, centerY - 15, 4 + Math.sin((slice - 18) / 14 * Math.PI) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Chest X-ray
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 100, 110, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Slice scanlines overlay
  ctx.fillStyle = "rgba(56, 189, 248, 0.04)";
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }
}

// --------------------------------------------------------------------------
// Screen 3: Health Records & Prescriptions (MediQ RecordsScreens)
// --------------------------------------------------------------------------
function renderRecordsScreen() {
  const container = document.querySelector("#records-content-container");
  if (!container) return;

  const sub = state.activeSubtabRecords;

  if (sub === "clinical") {
    container.innerHTML = state.clinicalRecords.map((r) => `
      <article class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <strong style="color:#0f172a;font-size:14px;">${escapeHtml(r.title)}</strong>
          <span class="badge badge-good">진료 완료</span>
        </div>
        <div style="font-size:12px;color:#334155;line-height:1.5;margin-bottom:8px;">
          • 병원: ${escapeHtml(r.hospital)} (${escapeHtml(r.doctor)})<br>
          • 진단명: <strong style="color:#0284c7;">${escapeHtml(r.diagnosis)}</strong>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">💊 처방 약제 정보</div>
          ${r.medications.map((m) => `
            <div style="font-size:12px;color:#0f172a;display:flex;justify-content:space-between;padding:2px 0;">
              <span>${escapeHtml(m.name)}</span>
              <span style="color:#64748b;font-size:11px;">${escapeHtml(m.dosage)}</span>
            </div>
          `).join("")}
        </div>
        <div style="font-size:11px;color:#64748b;text-align:right;">📅 ${escapeHtml(r.date)}</div>
      </article>
    `).join("");
  } else if (sub === "checkup") {
    container.innerHTML = state.checkupRecords.map((c) => `
      <article class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <strong style="color:#0f172a;font-size:14px;">${escapeHtml(c.title)}</strong>
          <span class="badge badge-good">판독 완료</span>
        </div>
        <div style="font-size:12px;color:#334155;margin-bottom:8px;">
          • 기관: ${escapeHtml(c.institution)}<br>
          • 종합판정: <strong style="color:#16a34a;">${escapeHtml(c.status)}</strong>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">
          ${c.items.map((i) => `
            <div style="font-size:12px;color:#0f172a;display:flex;justify-content:space-between;padding:2px 0;">
              <span>${escapeHtml(i.name)}</span>
              <span style="color:#0284c7;font-weight:700;">${escapeHtml(i.value)}</span>
            </div>
          `).join("")}
        </div>
        <div style="font-size:11px;color:#64748b;text-align:right;margin-top:8px;">📅 ${escapeHtml(c.date)}</div>
      </article>
    `).join("");
  } else if (sub === "vaccine") {
    container.innerHTML = state.vaccineRecords.map((v) => `
      <article class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <strong style="color:#0f172a;font-size:14px;">${escapeHtml(v.title)}</strong>
          <span class="badge badge-good">${escapeHtml(v.status)}</span>
        </div>
        <div style="font-size:12px;color:#334155;margin-bottom:6px;">
          • 접종기관: ${escapeHtml(v.institution)}<br>
          • 백신 제조번호: <span style="font-family:monospace;color:#64748b;">${escapeHtml(v.batchNo)}</span>
        </div>
        <div style="font-size:11px;color:#64748b;text-align:right;">📅 ${escapeHtml(v.date)}</div>
      </article>
    `).join("");
  }
}

// --------------------------------------------------------------------------
// Screen 4: 4-Step Share Flow (MediQ ShareSelect ~ ShareResult)
// --------------------------------------------------------------------------
function setupShareWizard() {
  document.querySelector("#btn-share-sub-wizard")?.addEventListener("click", () => {
    document.querySelector("#btn-share-sub-wizard")?.classList.add("active");
    document.querySelector("#btn-share-sub-manage")?.classList.remove("active");
    document.querySelector("#share-wizard-wrap").style.display = "block";
    document.querySelector("#share-manage-wrap").style.display = "none";
  });

  document.querySelector("#btn-share-sub-manage")?.addEventListener("click", () => {
    document.querySelector("#btn-share-sub-wizard")?.classList.remove("active");
    document.querySelector("#btn-share-sub-manage")?.classList.add("active");
    document.querySelector("#share-wizard-wrap").style.display = "none";
    document.querySelector("#share-manage-wrap").style.display = "block";
    renderShareManageScreen();
  });

  // Stepper navigation
  document.querySelector("#btn-wizard-to-2")?.addEventListener("click", () => {
    if (state.shareSelectedItems.size === 0) {
      showToast("공유할 기록을 최소 1건 이상 선택해 주세요.");
      return;
    }
    setWizardStep(2);
  });
  document.querySelector("#btn-wizard-back-to-1")?.addEventListener("click", () => setWizardStep(1));

  document.querySelector("#btn-wizard-to-3")?.addEventListener("click", () => {
    const hospSelect = document.querySelector("#select-target-hospital");
    state.shareTargetHospital = hospSelect ? hospSelect.value : "HOSP-B";
    const durSelect = document.querySelector("#select-validity-duration");
    state.shareTargetDuration = durSelect ? durSelect.value : "24h";

    const confirmHosp = document.querySelector("#confirm-hosp-label");
    if (confirmHosp) confirmHosp.textContent = hospSelect ? hospSelect.options[hospSelect.selectedIndex].text : "가상 병원 B";
    const confirmCount = document.querySelector("#confirm-items-count");
    const selectedStudies=state.studies.filter(item=>state.shareSelectedItems.has(item.studyInstanceUid));
    const selectedRecords=state.clinicalRecords.filter(item=>state.shareSelectedItems.has(item.id));
    if (confirmCount) confirmCount.textContent = [...selectedStudies.map(item=>item.description || item.modality || '검사'),...selectedRecords.map(item=>item.title || '합성 진료기록')].join(', ') || '공유할 항목 선택 필요';
    const sourceLabel=document.querySelector('#confirm-source-label');
    if(sourceLabel)sourceLabel.textContent=state.sourceHospitalId || '제공 기관 확인 필요';
    const confirmDuration = document.querySelector("#confirm-duration-label");
    if (confirmDuration) confirmDuration.textContent = durSelect ? durSelect.options[durSelect.selectedIndex].text : "발급 후 24시간";

    setWizardStep(3);
  });
  document.querySelector("#btn-wizard-back-to-2")?.addEventListener("click", () => setWizardStep(2));

  // Target hospital select change
  document.querySelector("#select-target-hospital")?.addEventListener("change", (e) => {
    const docLabel = document.querySelector("#label-target-doctor");
    const val = e.target.value;
    const doctors = {
      "HOSP-B": "B대학병원 담당 의료진 DOC-B-01",
      "HOSP-C": "정형외과 DOC-C-01 (박정형 전문의)",
      "HOSP-SNU": "영상의학과 DOC-SNU-01 (김영상 교수)",
      "HOSP-SEV": "호흡기내과 DOC-SEV-01 (최호흡 교수)",
    };
    if (docLabel) docLabel.textContent = doctors[val] || "일반 진료의 (자동 매칭)";
  });

  // Step 3 Submit
  document.querySelector("#btn-wizard-confirm-submit")?.addEventListener("click", handleExecuteShareTicket);

  // Revoke buttons
  document.querySelector("#btn-revoke-qr")?.addEventListener("click", handleRevokeCurrentQr);
  document.querySelector("#btn-revoke-all-shares")?.addEventListener("click", handleRevokeAllConsents);
}

function setWizardStep(step) {
  state.shareWizardStep = step;
  document.querySelectorAll(".wizard-step-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `wizard-step-${step}`);
  });
  document.querySelectorAll(".step-dot").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.step) <= step);
  });
}

function updateShareSelectCheckboxes() {
  const container = document.querySelector("#share-select-items");
  if (!container) return;

  const items = [];
  state.studies.forEach((s) => {
    items.push({
      id: s.studyInstanceUid,
      title: s.description,
      sub: `${s.modality || "DICOM"} · ${s.sourceHospitalId || "가상 병원 A"} (촬영일: ${s.studyDate || "2026-06-20"})`,
    });
  });
  state.clinicalRecords.forEach((c) => {
    items.push({
      id: c.id,
      title: c.title,
      sub: `${c.hospital} (${c.diagnosis})`,
    });
  });

  // Default select first item if none selected
  if (state.shareSelectedItems.size === 0 && items.length > 0) {
    state.shareSelectedItems.add(items[0].id);
  }

  container.innerHTML = items.map((item) => `
    <label class="share-check-card">
      <input type="checkbox" data-share-check="${escapeHtml(item.id)}" ${state.shareSelectedItems.has(item.id) ? "checked" : ""}>
      <div>
        <strong style="font-size:13px;color:#0f172a;display:block;">${escapeHtml(item.title)}</strong>
        <span style="font-size:11px;color:#94a3b8;">${escapeHtml(item.sub)}</span>
      </div>
    </label>
  `).join("");

  container.querySelectorAll("[data-share-check]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.shareCheck;
      if (chk.checked) state.shareSelectedItems.add(id);
      else state.shareSelectedItems.delete(id);
    });
  });
}

function mobileConsentValidUntil(duration, nowMs = Date.now()) {
  const hours = new Map([["1h", 1], ["24h", 24], ["7d", 168]]).get(duration);
  if (hours === undefined || !Number.isFinite(nowMs)) throw new Error("INVALID_SHARE_DURATION");
  return new Date(nowMs + hours * 3600000).toISOString();
}

async function handleExecuteShareTicket() {
  showToast("1회용 공유 티켓 및 QR을 생성하고 있습니다...");

  try {
    // Reject unknown durations before issuing any consent or ticket request.
    const validUntil = mobileConsentValidUntil(state.shareTargetDuration);
    // 1. Gather Selected Scopes
    const scopes = [];
    state.shareSelectedItems.forEach((id) => {
      const isStudy = state.studies.some((s) => s.studyInstanceUid === id);
      if (isStudy) {
        scopes.push({ studyInstanceUid: id });
      } else {
        scopes.push({ clinicalRecordId: id });
      }
    });

    // 2. Issue Active Consent
    const targetHosp = state.shareTargetHospital || "HOSP-B";
    const createRes = await fetch("/api/consents", {
      method: "POST",
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        patientId: state.patientId,
        sourceHospitalId: state.sourceHospitalId,
        targetHospitalId: targetHosp,
        purpose: "TREATMENT",
        permission: "VIEW_ONLY",
        validUntil,
        scopes: scopes.length > 0 ? scopes : [{ studyInstanceUid: state.studies[0]?.studyInstanceUid }],
      }),
    });

    if (!createRes.ok) {
      showToast("환자 전송 동의 생성에 실패했습니다.");
      return;
    }

    const consent = await createRes.json();
    state.activeConsent = consent;
    state.consents.unshift(consent);

    // 3. Issue One-Time QR Handoff Ticket
    const ticketRes = await fetch(`/api/consents/${encodeURIComponent(consent.consentId)}/handoff-ticket`, {
      method: "POST",
      headers: patientHeaders(),
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({}),
    });

    if (!ticketRes.ok) {
      showToast("일회용 QR 티켓 발급에 실패했습니다.");
      return;
    }

    const ticketData = await ticketRes.json();
    state.activeTicket = ticketData;

    renderActiveQrView();
    startTicketStatusPolling();
    setWizardStep(4);
    showToast("가상 병원 B 진료실 제시용 1회용 QR 발급 완료!");

    const nonceMatch = ticketData.qr?.payload?.match(/\/t\/([A-Za-z0-9_-]{22,128})$/);
    const nonce = nonceMatch ? nonceMatch[1] : null;

    postMobileSync({
      action: "TICKET_ISSUED",
      ticketId: ticketData.ticketId,
      consentId: consent.consentId,
      nonce: nonce,
      payload: ticketData.qr?.payload
    });
  } catch (err) {
    showToast("QR 공유 생성 중 오류가 발생했습니다.");
  }
}

function renderActiveQrView() {
  const boxWrap = document.querySelector("#qr-box-wrap");
  const studyLabel = document.querySelector("#qr-study-label");
  const targetLabel = document.querySelector("#qr-target-label");
  const refLabel = document.querySelector("#qr-ref-label");
  const statusPill = document.querySelector("#qr-status-pill");

  if (!state.activeTicket) return;

  const { ticketId, qr } = state.activeTicket;
  if (state.activeTicket.terminal || typeof qr?.payload !== "string") return;
  const payloadUrl = qr.payload.replace("https://hipass.example", window.location.origin);

  // Crisp SVG QR
  try {
    if (typeof qrcode === "function") {
      const qrGen = qrcode(0, "M");
      qrGen.addData(payloadUrl);
      qrGen.make();
      if (boxWrap) boxWrap.innerHTML = qrGen.createSvgTag({ scalable: true });
    } else if (boxWrap) {
      boxWrap.innerHTML = `<div style="font-family:monospace;font-size:11px;word-break:break-all;">${payloadUrl}</div>`;
    }
  } catch {
    if (boxWrap) boxWrap.innerHTML = `<div style="color:#ef4444;font-size:12px;">QR 생성 오류</div>`;
  }

  if (studyLabel) studyLabel.textContent = `${state.shareSelectedItems.size || 1}건의 기록`;
  if (targetLabel) targetLabel.textContent = state.shareTargetHospital === 'HOSP-B' ? 'B대학병원' : state.shareTargetHospital;
  const heading=document.querySelector('#wallet-qr-heading');if(heading)heading.textContent=`${targetLabel?.textContent || '수신 병원'} 접수 시 보여주세요.`;
  const consentExpiry=document.querySelector('#wallet-consent-expiry');
  const deadline=Date.parse(state.activeConsent?.validUntil);
  if(consentExpiry)consentExpiry.textContent=Number.isFinite(deadline) ? `영상 공유 기한 ${new Date(deadline).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국 시간)` : '영상 공유 기한 확인 필요';
  if (refLabel) refLabel.textContent = ticketId;
  if (statusPill) {
    statusPill.textContent = "🟢 스캔 대기 중 (1회용)";
    statusPill.className = "badge badge-good";
  }

  startCountdownTimer(qr.expiresAt);
}

function startCountdownTimer(expiresAtString) {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  const targetTime = new Date(expiresAtString).getTime();
  const ticket = state.activeTicket;
  const timerEl = document.querySelector("#qr-countdown-text");

  function update() {
    if (state.activeTicket !== ticket || ticket?.terminal) return;
    const diff = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
    const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const secs = String(diff % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `⏱️ 유효시간: ${hours}:${mins}:${secs}`;

    if (Date.now() >= targetTime) expireActiveMobileTicket(ticket);
  }

  update();
  if (ticket && !ticket.terminal && Number.isFinite(targetTime) && Date.now() < targetTime) state.countdownTimer = setInterval(update, 1000);
}

function expireActiveMobileTicket(ticket, nowMs = Date.now()) {
  // Local capability deadline only; not a claim of a server expiry receipt.
  const deadline = Date.parse(ticket?.qr?.expiresAt);
  if (!ticket || state.activeTicket !== ticket || ticket.terminal || !Number.isFinite(deadline) || nowMs < deadline) return;
  ticket.terminal = true;
  ticket.qr.payload = null;
  stopTicketStatusPolling();
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = null;
  const status = document.querySelector("#qr-status-pill");
  const box = document.querySelector("#qr-box-wrap");
  const timer = document.querySelector("#qr-countdown-text");
  if (status) { status.textContent = "QR 유효기간 만료 (EXPIRED) · 서버 접수 여부 미확인"; status.className = "badge badge-warn"; }
  if (box) box.textContent = "QR 유효기간 만료 · 재사용 불가";
  if (timer) timer.textContent = "QR 표시 종료 · 다시 공유하려면 새 티켓을 발급하세요";
}

function onQrConsumedByHospital() {
  // A same-origin BroadcastChannel event is only an untrusted refresh hint.
  // It is not an authenticated ticket-status receipt and must never overwrite
  // REVOKED/EXPIRED, stop the deadline, or claim successful consumption.
  if (!state.isAuthenticated || !state.activeTicket || !state.activeConsent || state.activeConsent.status !== "ACTIVE") return;
  void refreshActiveTicketStatus();
}

function stopTicketStatusPolling() {
  if (state.ticketStatusTimer) clearTimeout(state.ticketStatusTimer);
  state.ticketStatusTimer = null;
}

function startTicketStatusPolling() {
  stopTicketStatusPolling();
  const ticket = state.activeTicket;
  const deadline = Math.min(Date.parse(ticket?.qr?.expiresAt), Date.now() + 600000);
  if (!Number.isFinite(deadline)) return;
  const poll = async () => {
    if (state.activeTicket !== ticket || !state.isAuthenticated || ticket.statusAuthExpired || Date.now() >= deadline) return;
    await refreshActiveTicketStatus();
    if (state.activeTicket === ticket && state.isAuthenticated && !ticket.terminal && !ticket.statusAuthExpired && Date.now() < deadline) state.ticketStatusTimer = setTimeout(poll, 5000);
  };
  void poll();
}

async function refreshActiveTicketStatus() {
  const ticket = state.activeTicket;
  const consentId = state.activeConsent?.consentId;
  if (!state.isAuthenticated || !ticket?.ticketId || !consentId || ticket.terminal || ticket.statusAuthExpired || state.ticketStatusBusy) return;
  state.ticketStatusBusy = true;
  try {
    const response = await fetch(`/api/consents/${encodeURIComponent(consentId)}/handoff-tickets/${encodeURIComponent(ticket.ticketId)}`, {
      headers: patientHeaders(), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("TICKET_STATUS_UNAVAILABLE");
    const receipt = await response.json();
    if (state.activeTicket !== ticket || ticket.terminal || state.activeConsent?.consentId !== consentId || !state.isAuthenticated) return;
    if (receipt.consentId !== consentId || receipt.ticketId !== ticket.ticketId || receipt.expiresAt !== ticket.qr?.expiresAt || !["ISSUED", "USED", "REVOKED", "EXPIRED"].includes(receipt.status)) throw new Error("TICKET_STATUS_INVALID");
    // A late success must not resurrect a locally confirmed revoked consent.
    if (state.activeConsent.status === "REVOKED" && receipt.status !== "REVOKED") return;
    if (receipt.status === "ISSUED") {
      const status = document.querySelector("#qr-status-pill");
      if (status) { status.textContent = "서버 확인 · 스캔 대기 (ISSUED)"; status.className = "badge badge-good"; }
      return;
    }
    ticket.terminal = true;
    ticket.ticket = { ...ticket.ticket, status: receipt.status };
    stopTicketStatusPolling();
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    const status = document.querySelector("#qr-status-pill");
    const box = document.querySelector("#qr-box-wrap");
    const timer = document.querySelector("#qr-countdown-text");
    const labels = { USED: "서버 확인 · 티켓 사용 완료 (USED)", REVOKED: "서버 확인 · 공유 철회 (REVOKED)", EXPIRED: "서버 확인 · 유효기간 만료 (EXPIRED)" };
    if (status) { status.textContent = labels[receipt.status]; status.className = receipt.status === "USED" ? "badge badge-good" : "badge badge-warn"; }
    if (box) box.textContent = "QR 무효화됨 · 재사용 불가";
    if (timer) timer.textContent = "티켓 종료 · 서버 상태 확인 완료";
    // Remove the capability from memory as well as from the displayed QR.
    ticket.qr.payload = null;
  } catch (error) {
    if (state.activeTicket === ticket && !ticket.terminal && state.isAuthenticated) {
      const status = document.querySelector("#qr-status-pill");
      const authExpired = error?.code === "CAPSTONE_SESSION_EXPIRED";
      if (authExpired) {
        ticket.statusAuthExpired = true;
        stopTicketStatusPolling();
      }
      // Authentication expiry is not a server Ticket receipt. Keep the QR
      // deadline running; never refresh credentials or extend the capability.
      if (status) {
        status.textContent = authExpired
          ? "시연 인증 만료 · 새로고침하여 다시 로그인하세요 · 서버 접수 여부 미확인"
          : "서버 상태 확인 실패 · 접수 여부 미확인";
        status.className = "badge badge-warn";
      }
    }
  } finally { state.ticketStatusBusy = false; }
}

async function requestMobileRevocation(consentId) {
  const response = await fetch(`/api/consents/${encodeURIComponent(consentId)}/revoke`, {
    method: "POST", headers: patientHeaders(), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("REVOCATION_NOT_CONFIRMED");
  const receipt = await response.json();
  if (receipt.consentId !== consentId || receipt.status !== "REVOKED") throw new Error("REVOCATION_NOT_CONFIRMED");
  return receipt;
}

function confirmMobileAction(message) {
  if (document.querySelector("#mobile-action-confirm")) return Promise.resolve(false);
  const dialog = document.createElement("dialog");
  if (typeof dialog.showModal !== "function") {
    showToast("확인 대화상자를 지원하는 브라우저에서 다시 시도하세요.");
    return Promise.resolve(false);
  }
  dialog.id = "mobile-action-confirm";
  dialog.setAttribute("aria-labelledby", "mobile-action-confirm-title");
  dialog.setAttribute("aria-describedby", "mobile-action-confirm-message");
  dialog.style.cssText = "width:min(360px,calc(100% - 32px));box-sizing:border-box;border:1px solid #cbd5e1;border-radius:16px;padding:24px;color:#0f172a;background:white";
  const title = document.createElement("h2");
  title.id = "mobile-action-confirm-title";
  title.textContent = "작업 확인";
  const description = document.createElement("p");
  description.id = "mobile-action-confirm-message";
  description.textContent = message;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-secondary";
  cancel.textContent = "취소";
  const proceed = document.createElement("button");
  proceed.type = "button";
  proceed.className = "btn btn-danger";
  proceed.textContent = "확인 후 실행";
  dialog.append(title, description, cancel, proceed);
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const settle = accepted => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(accepted);
    };
    cancel.addEventListener("click", () => settle(false));
    proceed.addEventListener("click", () => settle(true));
    dialog.addEventListener("cancel", event => { event.preventDefault(); settle(false); });
    dialog.addEventListener("close", () => settle(false));
    try {
      document.body.append(dialog);
      dialog.showModal();
      cancel.focus();
      timer = setTimeout(() => settle(false), 120000);
    } catch { settle(false); }
  });
}

function applyMobileRevocation(receipt) {
  state.consents = state.consents.map(consent => consent.consentId === receipt.consentId ? receipt : consent);
  if (state.activeConsent?.consentId === receipt.consentId) {
    state.activeConsent = receipt;
    state.activeTicket = null;
    stopTicketStatusPolling();
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    const box = document.querySelector("#qr-box-wrap");
    if (box) box.textContent = "동의 철회 확인 · QR 무효화됨";
  }
  postMobileSync({ action: "CONSENT_REVOKED", consentId: receipt.consentId });
}

async function handleRevokeCurrentQr() {
  if (!state.activeConsent) {
    showToast("철회할 활성 동의가 없습니다.");
    return;
  }

  const consentId = state.activeConsent.consentId;
  if (!await confirmMobileAction("현재 선택한 의료영상 공유를 중단할까요? 이후 접근은 차단되지만 이미 열람하거나 허용된 방식으로 저장된 자료까지 회수되지는 않습니다.")) return;
  if (state.activeConsent?.consentId !== consentId) {
    showToast("선택한 동의가 변경됐습니다. 현재 상태를 확인한 뒤 다시 시도하세요.");
    return;
  }

  try {
    const receipt = await requestMobileRevocation(consentId);
    applyMobileRevocation(receipt);
    if (state.activeConsent?.consentId === receipt.consentId) {
      if (state.countdownTimer) clearInterval(state.countdownTimer);
      const statusPill = document.querySelector("#qr-status-pill");
      const boxWrap = document.querySelector("#qr-box-wrap");
      if (statusPill) {
        statusPill.textContent = "🛑 동의 철회됨 (REVOKED)";
        statusPill.className = "badge badge-bad";
      }
      if (boxWrap) {
        boxWrap.innerHTML = '<div style="color:#ef4444;font-size:13px;font-weight:700;">QR 코드 폐기 완료<br><span style="font-size:11px;color:#94a3b8;">열람 권한이 차단되었습니다</span></div>';
      }
      showToast("공유 동의가 철회되고 QR이 무효화되었습니다.");
      await loadConsents();
      renderHomeScreen();
    }
  } catch {
    showToast("동의 철회 중 오류가 발생했습니다.");
  }
}

async function handleRevokeAllConsents() {
  const activeList = state.consents.filter((c) => c.status === "ACTIVE");
  if (activeList.length === 0) {
    showToast("차단할 활성 공유가 없습니다.");
    return;
  }

  if (!await confirmMobileAction(`현재 표시된 활성 동의 ${activeList.length}건을 모두 철회하시겠습니까?`)) return;
  if (activeList.some(item => !state.consents.some(current => current.consentId === item.consentId && current.status === "ACTIVE"))) {
    showToast("동의 상태가 변경됐습니다. 목록을 새로 확인해 주세요.");
    return;
  }

  let confirmed = 0;
  for (const c of activeList) {
    try {
      const receipt = await requestMobileRevocation(c.consentId);
      applyMobileRevocation(receipt);
      confirmed++;
    } catch {}
  }

  showToast(confirmed === activeList.length ? "모든 동의의 철회를 서버에서 확인했습니다." : `${confirmed}/${activeList.length}건 철회 확인. 나머지 동의는 철회 성공을 확인하지 못했습니다.`);
  await loadConsents();
  renderHomeScreen();
  renderShareManageScreen();
}

// --------------------------------------------------------------------------
// Screen 4-B: Share Management & Transfer Logs (MediQ ShareManageScreen)
// --------------------------------------------------------------------------
function renderShareManageScreen() {
  const activeContainer = document.querySelector("#share-active-list");
  const timelineContainer = document.querySelector("#share-timeline-logs");
  if (!activeContainer || !timelineContainer) return;

  const activeConsents = state.consents.filter((c) => c.status === "ACTIVE");
  if (activeConsents.length === 0) {
    activeContainer.innerHTML = '<div class="card" style="text-align:center;color:#94a3b8;">현재 공유 중인 기록이 없습니다.</div>';
  } else {
    activeContainer.innerHTML = activeConsents.map((c) => `
      <article class="card" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#0f172a;font-size:13px;">${escapeHtml(c.targetHospitalId)} 전송 동의</strong>
          <span class="badge badge-good">공유 중</span>
        </div>
        <div style="font-size:11px;color:#64748b;font-family:monospace;margin-bottom:6px;">
          동의 ID: ${escapeHtml(c.consentId)}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="font-size:11px;color:#64748b;">만료: ${new Date(c.validUntil).toLocaleDateString()}</span>
          <button class="btn btn-sm btn-danger" data-action-revoke-one="${escapeHtml(c.consentId)}" type="button">
            차단하기
          </button>
        </div>
      </article>
    `).join("");

    activeContainer.querySelectorAll("[data-action-revoke-one]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const cid = btn.dataset.actionRevokeOne;
        btn.disabled = true;
        try {
          if (!await confirmMobileAction("이 동의의 의료영상 공유를 철회하시겠습니까?")) return;
          const receipt = await requestMobileRevocation(cid);
          applyMobileRevocation(receipt);
          showToast("동의 철회를 서버에서 확인했습니다.");
          await loadConsents();
          renderShareManageScreen();
          renderHomeScreen();
        } catch {
          showToast("철회 성공을 확인하지 못했습니다. 동의 상태를 다시 확인하세요.");
        } finally { btn.disabled = false; }
      });
    });
  }

  // Transfer Timeline (Hospital Mobility Logs)
  timelineContainer.innerHTML = `
    <div class="timeline-item">
      <div class="timeline-icon-wrap">1</div>
      <div class="timeline-content">
        <strong style="font-size:13px;color:#0f172a;">환자 1초 간편인증 및 공유 동의 발급</strong>
        <p style="font-size:11px;color:#64748b;margin:2px 0 0 0;">개발용 인증 시뮬레이션 · FIDO2/TEE 검증 NOT VERIFIED</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-icon-wrap">2</div>
      <div class="timeline-content">
        <strong style="font-size:13px;color:#0f172a;">B병원 진료실 1회용 QR 코드 제시</strong>
        <p style="font-size:11px;color:#64748b;margin:2px 0 0 0;">24시간 한시 유효 · 무단 복제 방지 일회용 난수 바인딩</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-icon-wrap">3</div>
      <div class="timeline-content">
        <strong style="font-size:13px;color:#0f172a;">B병원 PACS 게이트웨이 토큰 인트로스펙션</strong>
        <p style="font-size:11px;color:#64748b;margin:2px 0 0 0;">ABAC 정책 및 의사 소속 검증 완료 · 단기 WADO 토큰 발급</p>
      </div>
    </div>
    <div class="timeline-item">
      <div class="timeline-icon-wrap">4</div>
      <div class="timeline-content">
        <strong style="font-size:13px;color:#0f172a;">의료영상 무손실 단면 스트리밍 열람</strong>
        <p style="font-size:11px;color:#64748b;margin:2px 0 0 0;">클라우드 원본 비저장 원칙 준수 · 감사로그 영구 기록</p>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// Screen 5: Encrypted Vault & Device Attestation (MediQ Vault & Security)
// --------------------------------------------------------------------------
function renderVaultView() {
  const container = document.querySelector("#vault-packages-list");
  if (!container || !state.vaultData) return;

  const { packages } = state.vaultData;
  container.innerHTML = packages.map((pkg) => `
    <article class="card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="color:#0f172a;font-size:14px;">${escapeHtml(pkg.description)}</strong>
        <span class="badge badge-good">암호화 보관 중</span>
      </div>
      <div style="font-size:11px;color:#64748b;font-family:monospace;margin-bottom:8px;">
        식별자: ${escapeHtml(pkg.packageId)}<br>
        무결성: ${escapeHtml(pkg.integrityHash.slice(0, 32))}...
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#334155;">
        <span>용량: ${(pkg.encryptedBytes / (1024 * 1024)).toFixed(1)} MB</span>
        <span>청크 수: ${pkg.chunkCount}개 (AES-256-GCM)</span>
      </div>
    </article>
  `).join("");
}

async function handleCryptoErase() {
  if (!await confirmMobileAction("모바일 볼트의 모든 암호화 패키지 파기를 요청하시겠습니까? 현재 실제 모바일 보관함은 미연동입니다.")) return;
  try {
    const res = await fetch("/api/v1/mobile/vault/erase", { method: "POST", headers: patientHeaders(), signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("VAULT_ERASE_NOT_VERIFIED");
    if (res.ok) {
      const data = await res.json();
      showToast(`보관함 파기 완료: 영수증 ${data.receipt.slice(0, 20)}...`);
      const container = document.querySelector("#vault-packages-list");
      if (container) {
        container.innerHTML = '<div class="card" style="text-align:center;color:#4ade80;">모든 패키지가 암호학적으로 영구 파기되었습니다.</div>';
      }
    }
  } catch {
    showToast("보관함 파기 중 오류가 발생했습니다.");
  }
}

function renderDeviceView() {
  if (!state.deviceData) return;
  const dev = state.deviceData;
  const setEl = (id, text) => {
    const el = document.querySelector(id);
    if (el) el.textContent = text;
  };

  setEl("#dev-id-val", dev.deviceId);
  setEl("#dev-platform-val", `${dev.platform} (${dev.appVersion})`);
  setEl("#dev-enclave-val", dev.keyEnclave);
  setEl("#dev-attest-val", dev.attestation);
  setEl("#dev-risk-val", dev.riskLevel);
}

// --------------------------------------------------------------------------
// Utilities
// --------------------------------------------------------------------------
function patientHeaders() {
  if (document.documentElement.dataset.capstone === "1") {
    if (!capstoneAuth) throw new Error("CAPSTONE_AUTH_REQUIRED");
    return { "content-type": "application/json", ...capstoneAuth.headers("PATIENT") };
  }
  return {
    "content-type": "application/json",
    "x-hipass-role": "PATIENT",
    "x-hipass-patient-id": state.patientId,
    "x-hipass-user-id": state.patientId === "P-1001" ? "synthetic-account-a" : `synthetic-account-${state.patientId.toLowerCase()}`,
    "x-hipass-auth-method": state.authMethod || "ANONYMOUS",
  };
}

function showToast(message) {
  let toast = document.querySelector("#mobile-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mobile-toast";
    toast.className = "mobile-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
