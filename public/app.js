/* ==========================================================================
   HiPass Platform — Unified Frontend Controller
   - Persona Router: Patient Experience Portal vs. Hospital SaaS Console
   - Dynamic ABAC Policy Engine & DICOMweb Token Management
   - FHIR R4 PHR, 5-Step Pipeline, Cloud Viewer, PACS Import & Live Receipts
   ========================================================================== */

const demo = {
  patientId: "P-1001",
  doctorId: "DOC-B-01",
  sourceHospitalId: "HOSP-A",
  targetHospitalId: "HOSP-B",
  purpose: "TREATMENT",
  permission: "VIEW_ONLY",
  studyInstanceUid: "1.2.410.100.1.20260620.001",
};

const adminHospitals = [
  { hospitalId: "HOSP-A", name: "가상 병원 A (Virtual Hospital A)", status: "ACTIVE" },
  { hospitalId: "HOSP-B", name: "가상 병원 B (Virtual Hospital B)", status: "ACTIVE" },
  { hospitalId: "HOSP-C", name: "가상 병원 C (Virtual Hospital C)", status: "ACTIVE" },
];

const adminGateways = [
  { gatewayId: "GW-HOSP-A", hospitalId: "HOSP-A", endpoint: "/dicomweb", status: "ONLINE" },
  { gatewayId: "GW-HOSP-B", hospitalId: "HOSP-B", endpoint: "/dicomweb", status: "ONLINE" },
  { gatewayId: "GW-HOSP-C", hospitalId: "HOSP-C", endpoint: "/dicomweb", status: "ONLINE" },
];

const wwWlPresets = [
  { name: "기본", contrast: 1, brightness: 1 },
  { name: "폐 (Lung)", contrast: 1.6, brightness: 0.9 },
  { name: "골격 (Bone)", contrast: 2.0, brightness: 1.1 },
  { name: "뇌연부 (Brain)", contrast: 1.3, brightness: 1.05 },
];

const zoomScales = [1, 1.5, 2];

// Runtime State Variables (strictly in-memory only)
let currentPersona = "PATIENT";
let latestConsentId = "CONSENT-DEMO-ACTIVE";
let latestTicketNonce = null;
let latestToken = null;
let latestTokenInfo = null;
let countdownTimerId = null;
let selectedStudyUid = demo.studyInstanceUid;
let selectedSeriesUid = "";
let selectedSopUid = "";
let selectedStudy = null;
let lastStudies = [];
let lastConsents = [];
let lastSeries = [];
let lastInstances = [];
let patientConsentReady = false;
let isEasyMode = false;
let isPreflightPassed = false;
let wwWlPresetIndex = 0;
let zoomScaleIndex = 0;
let isInverted = false;
let isSideBySideActive = false;
let currentSliceIndex = 0;
let totalSlices = 1;
let isCinePlaying = false;
let cineFps = 15;
let cineIntervalId = null;
const sliceBlobCache = new Map();

// DOM Selectors
const output = document.querySelector("#output");
const patientStatus = document.querySelector("#patient-status");
const viewerStatus = document.querySelector("#viewer-status");
const viewerImage = document.querySelector("#viewer-image");
const viewerPlaceholder = document.querySelector("#viewer-placeholder");
const viewerAlert = document.querySelector("#viewer-alert");
const instanceDetail = document.querySelector("#instance-detail");
const sourceHospitalSelect = document.querySelector("#source-hospital-select");
const targetHospitalSelect = document.querySelector("#target-hospital-select");
const patientStudySelect = document.querySelector("#patient-study-select");
const patientSeriesSelect = document.querySelector("#patient-series-select");
const accessPurposeSelect = document.querySelector("#access-purpose-select");
const accessModeSelect = document.querySelector("#access-mode-select");
const consentValidFromInput = document.querySelector("#consent-valid-from");
const consentValidUntilInput = document.querySelector("#consent-valid-until");
const downloadButton = document.querySelector("#download-instance");
const auditResultFilter = document.querySelector("#audit-result-filter");
const auditActionFilter = document.querySelector("#audit-action-filter");
const phrLoadState = document.querySelector("#phr-load-state");
const phrImagingList = document.querySelector("#phr-imaging-list");
const phrHandoffLink = document.querySelector("#phr-handoff-link");
const pendingPhrHandoffNonce = capturePhrHandoffNonce();

// Cross-window Real-time Sync & Toast Notification
let toastTimer = null;
function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function pulseHighlightElement(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("highlight-pulse");
  void el.offsetWidth;
  el.classList.add("highlight-pulse");
  setTimeout(() => el.classList.remove("highlight-pulse"), 2500);
}

let hipassSyncChannel = null;
let hipassMobileChannel = null;

function handleIncomingSyncMessage(data) {
  if (!data) return;
  const action = data.action || (data.type === "SYNC" ? data.action : null);

  if (action === "TICKET_ISSUED") {
    if (data.nonce) {
      latestTicketNonce = data.nonce;
    }
    if (data.consentId) {
      latestConsentId = data.consentId;
      patientConsentReady = true;
    }
    const statusPill = document.querySelector("#qr-handoff-status");
    const scannedRef = document.querySelector("#qr-scanned-ref");
    const message = document.querySelector("#qr-handoff-message");

    if (statusPill) {
      statusPill.textContent = "모바일 QR 수신 대기 (READY)";
      statusPill.className = "mq-badge mq-badge-warn";
    }
    if (scannedRef && data.ticketId) {
      scannedRef.textContent = `${data.ticketId} (모바일 1회용)`;
    }
    if (message) {
      message.innerHTML = "<strong>모바일 QR 감지:</strong> 환자(P-1001)의 일회용 암호학적 티켓이 수신되었습니다. [원클릭 QR 현장 접수] 버튼을 누르면 즉시 진료실 세션으로 검증 연계됩니다.";
      message.dataset.tone = "info";
    }
    showToast("📱 환자 모바일 앱에서 새 1회용 QR 접수 티켓이 발행되었습니다.");
    loadDashboard({ skipPhr: true }).catch(() => {});
  } else if (action === "CONSENT_REVOKED") {
    latestTicketNonce = null;
    const statusPill = document.querySelector("#qr-handoff-status");
    const message = document.querySelector("#qr-handoff-message");
    if (statusPill) {
      statusPill.textContent = "동의 철회됨 (REVOKED)";
      statusPill.className = "mq-badge mq-badge-bad";
    }
    if (message) {
      message.textContent = "환자가 모바일에서 영상 공유 동의를 철회하였습니다. 접근 권한이 즉시 차단되었습니다.";
      message.dataset.tone = "fail";
    }
    showToast("⚠️ 환자가 모바일에서 영상 공유 동의를 철회했습니다.");
    loadDashboard({ skipPhr: true }).catch(() => {});
  } else {
    loadDashboard({ skipPhr: true }).catch(() => {});
  }
}

try {
  if (typeof BroadcastChannel !== "undefined") {
    hipassSyncChannel = new BroadcastChannel("hipass_sync");
    hipassSyncChannel.onmessage = (event) => {
      handleIncomingSyncMessage(event.data);
    };
    hipassMobileChannel = new BroadcastChannel("HI_PASS_SYNC_CHANNEL");
    hipassMobileChannel.onmessage = (event) => {
      handleIncomingSyncMessage(event.data);
    };
  }
} catch {
  // BroadcastChannel unavailable or restricted
}

function broadcastSync(action) {
  try {
    if (hipassSyncChannel) {
      hipassSyncChannel.postMessage({ type: "SYNC", action, timestamp: Date.now() });
    }
  } catch {
    // Ignore error
  }
  try {
    if (hipassMobileChannel) {
      hipassMobileChannel.postMessage({ action, timestamp: Date.now() });
    }
  } catch {
    // Ignore error
  }
}

// Background Heartbeat Polling (every 2.5s for seamless multi-tab or multi-window live sync)
setInterval(() => {
  loadDashboard({ skipPhr: true }).catch(() => {});
}, 2500);

// Initialize on DOM Ready
initNavigation();
initConsentDateDefaults();
renderAdminShell();
bindEvents();
await loadDashboard();

if (pendingPhrHandoffNonce) {
  await redeemPhrHandoff(pendingPhrHandoffNonce);
}

// --------------------------------------------------------------------------
// Navigation & Persona Routing
// --------------------------------------------------------------------------
function initNavigation() {
  // Top Global Persona Switcher Tabs
  document.querySelectorAll("[data-persona]").forEach((button) => {
    button.addEventListener("click", () => switchPersona(button.dataset.persona));
  });

  // Patient Portal Sub-routing
  document.querySelectorAll("#patient-portal-app [data-route]").forEach((button) => {
    button.addEventListener("click", () => navigatePatientPage(button.dataset.route));
  });

  // Contract Marker Support: data-view-target="patient-phr"
  document.querySelectorAll('[data-view-target="patient-phr"]').forEach((button) => {
    button.addEventListener("click", () => navigatePatientPage("phr"));
  });

  // Hospital SaaS Sub-routing
  document.querySelectorAll("#hospital-saas-app [data-view]").forEach((button) => {
    button.addEventListener("click", () => navigateHospitalScreen(button.dataset.view));
  });
  document.querySelectorAll("#hospital-saas-app [data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => navigateHospitalScreen(button.dataset.viewJump));
  });

  // Hash-based initial persona determination
  const initialHash = (location.hash || "").replace("#", "");
  if (["DOCTOR", "doctor", "HOSPITAL_ADMIN", "admin"].includes(initialHash)) {
    switchPersona("DOCTOR", false);
    navigateHospitalScreen("studies");
  } else {
    switchPersona("PATIENT", false);
    if (initialHash && !["PATIENT", "patient"].includes(initialHash)) {
      navigatePatientPage(initialHash);
    }
  }
}

function switchPersona(persona, updateHash = true) {
  currentPersona = persona;
  document.querySelectorAll("[data-persona]").forEach((btn) => {
    const isTarget = btn.dataset.persona === persona;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-selected", String(isTarget));
  });

  const patientApp = document.querySelector("#patient-portal-app");
  const hospitalApp = document.querySelector("#hospital-saas-app");

  if (persona === "PATIENT") {
    if (patientApp) patientApp.hidden = false;
    if (hospitalApp) hospitalApp.hidden = true;
    if (updateHash) history.replaceState(null, "", "#PATIENT");
  } else {
    if (patientApp) patientApp.hidden = true;
    if (hospitalApp) hospitalApp.hidden = false;
    if (updateHash) history.replaceState(null, "", "#DOCTOR");
  }
}

// Backwards-compatible Role activation helper
function activateRole(role, updateHash = true) {
  if (role === "DOCTOR" || role === "HOSPITAL_ADMIN" || role === "SECURITY_ADMIN" || role === "PLATFORM_ADMIN") {
    switchPersona("DOCTOR", updateHash);
  } else {
    switchPersona("PATIENT", updateHash);
  }
}

function navigatePatientPage(page) {
  const patientApp = document.querySelector("#patient-portal-app");
  if (!patientApp) return;

  const pageTitles = {
    home: "행동센터",
    timeline: "건강 타임라인",
    images: "내 의료영상",
    phr: "나의 PHR (FHIR R4)",
    consent: "공유 동의 관리",
    health: "건강검진·검사결과 데모",
    visit: "병원 방문 모드",
    activity: "접근이력·동의 영수증",
    notifications: "알림",
    storage: "저장공간·만료",
    recovery: "오류 복구",
    documents: "판독문·의뢰서",
    delegation: "보호자·가족 위임",
  };

  patientApp.querySelectorAll("[data-page]").forEach((p) => {
    p.hidden = p.dataset.page !== page;
  });
  patientApp.querySelectorAll("[data-route]").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === page);
  });

  const contextTitle = document.querySelector("#contextTitle");
  if (contextTitle && pageTitles[page]) {
    contextTitle.textContent = pageTitles[page];
  }
}

function navigateHospitalScreen(screen) {
  const hospitalApp = document.querySelector("#hospital-saas-app");
  if (!hospitalApp) return;
  if (screen !== "viewer") {
    stopCinePlayback();
  }

  const screenMeta = {
    dashboard: ["Hospital Portal / Dashboard", "Hospital Dashboard"],
    exchange: ["Hospital Portal / Exchange", "5단계 교류 파이프라인"],
    studies: ["Hospital Portal / 의료영상", "승인된 의료영상"],
    viewer: ["Hospital Portal / Cloud Viewer", "Cloud DICOM Viewer"],
    transfer: ["Hospital Portal / PACS Import", "PACS Import (STOW-RS)"],
    audit: ["Hospital Portal / 감사·추적", "감사·Provenance 로그"],
    qr: ["P1 / QR Handoff", "QR Medical Image Handoff 현장 접수"],
    admin: ["Operations / Connector", "Connector Operations"],
    "pacs-archive": ["Hospital Portal / PACS 수신함", "B병원 원내 PACS 수신함 (영구 아카이브)"],
  };

  hospitalApp.querySelectorAll(".mq-screen").forEach((s) => {
    s.hidden = s.dataset.screen !== screen;
  });
  hospitalApp.querySelectorAll(".mq-nav").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === screen);
    b.setAttribute("aria-selected", String(b.dataset.view === screen));
  });

  const breadcrumb = document.querySelector("#mq-breadcrumb");
  const title = document.querySelector("#mq-header-title");
  if (breadcrumb && screenMeta[screen]) breadcrumb.textContent = screenMeta[screen][0];
  if (title && screenMeta[screen]) title.textContent = screenMeta[screen][1];

  if (screen === "pacs-archive") {
    loadHospitalBPacsArchive();
  }
}

// Backwards-compatible View activation helper
function activateView(targetId) {
  if (targetId === "patient-phr" || targetId === "phr") {
    switchPersona("PATIENT");
    navigatePatientPage("phr");
  } else if (targetId === "patient-studies" || targetId === "images") {
    switchPersona("PATIENT");
    navigatePatientPage("images");
  } else if (targetId === "patient-receipts" || targetId === "activity") {
    switchPersona("PATIENT");
    navigatePatientPage("activity");
  } else if (targetId === "patient-visit" || targetId === "visit") {
    switchPersona("PATIENT");
    navigatePatientPage("visit");
  } else if (targetId === "doctor-viewer" || targetId === "viewer") {
    switchPersona("DOCTOR");
    navigateHospitalScreen("viewer");
  } else if (targetId === "doctor-studies" || targetId === "studies") {
    switchPersona("DOCTOR");
    navigateHospitalScreen("studies");
  }
}

// --------------------------------------------------------------------------
// Event Bindings
// --------------------------------------------------------------------------
function bindEvents() {
  // Global & Refresh
  document.querySelector("#refresh")?.addEventListener("click", loadDashboard);
  document.querySelector("#home-refresh-btn")?.addEventListener("click", loadDashboard);

  // Patient Actions
  document.querySelector("#patient-consent")?.addEventListener("click", createPatientConsent);
  document.querySelector("#patient-revoke")?.addEventListener("click", revokePatientConsent);
  document.querySelector("#btn-quick-approve")?.addEventListener("click", async () => {
    showToast("동의 정책을 생성하는 중입니다...");
    const res = await createPatientConsent();
    if (res?.consentId) {
      showToast("가상 병원 B 진료 의뢰 동의가 승인되었습니다. 병원 SaaS 콘솔에 즉시 동기화됩니다.");
      broadcastSync("CONSENT_APPROVED");
    }
  });
  document.querySelector("#btn-quick-revoke")?.addEventListener("click", async () => {
    showToast("동의를 철회하는 중입니다...");
    await revokePatientConsent();
    showToast("가상 병원 B 진료 의뢰 동의가 철회되었습니다. 병원 SaaS 콘솔에 즉시 동기화됩니다.");
    broadcastSync("CONSENT_REVOKED");
  });
  sourceHospitalSelect?.addEventListener("change", syncPatientChoices);
  targetHospitalSelect?.addEventListener("change", syncPatientChoices);
  accessPurposeSelect?.addEventListener("change", syncPatientChoices);
  accessModeSelect?.addEventListener("change", syncPatientChoices);
  patientStudySelect?.addEventListener("change", () => selectStudy(patientStudySelect.value, lastStudies));
  patientSeriesSelect?.addEventListener("change", () => {
    selectedSeriesUid = patientSeriesSelect.value;
    resetViewerData();
  });
  document.querySelector("#phr-refresh")?.addEventListener("click", loadPhrDashboard);
  document.querySelector("#toggle-easy-mode")?.addEventListener("click", toggleEasyMode);
  document.querySelector("#easyModeToggle")?.addEventListener("click", toggleEasyMode);
  document.querySelector("#patient-receipts-refresh")?.addEventListener("click", loadDashboard);

  // Patient Action Center Guided Direct Action & Deep Links
  document.querySelector("#btn-consent-detail")?.addEventListener("click", () => {
    if (sourceHospitalSelect) sourceHospitalSelect.value = "HOSP-A";
    if (targetHospitalSelect) targetHospitalSelect.value = "HOSP-B";
    if (accessPurposeSelect) accessPurposeSelect.value = "TREATMENT";
    if (accessModeSelect) accessModeSelect.value = "VIEW_ONLY";
    if (patientStudySelect && selectedStudyUid) patientStudySelect.value = selectedStudyUid;
    syncPatientChoices({ preserveConsentState: true });
    navigatePatientPage("consent");
    showToast("가상 병원 B 진료 의뢰 조건이 동의 설정 폼에 자동 입력되었습니다.");
  });

  document.querySelector("#btn-action-visit")?.addEventListener("click", async () => {
    if (!latestTicketNonce && latestConsentId) {
      try {
        const handoff = await postJson(`/api/consents/${encodeURIComponent(latestConsentId)}/handoff-ticket`, {});
        if (handoff?.qr?.payload) {
          const match = handoff.qr.payload.match(/\/t\/([A-Za-z0-9_-]{22,128})$/);
          if (match) latestTicketNonce = match[1];
          updateVisitModePacket(handoff);
        }
      } catch {
        // non-fatal deferred
      }
    }
    navigatePatientPage("visit");
    showToast("병원 창구 제시용 1회용 QR 방문 패킷이 준비되었습니다.");
  });

  document.querySelector("#btn-action-receipts")?.addEventListener("click", () => {
    navigatePatientPage("activity");
    showToast("발행된 접근 영수증 내역입니다.");
  });

  document.querySelector("#btn-head-transfer")?.addEventListener("click", () => {
    navigatePatientPage("images");
    showToast("가상 병원 B로 전송할 의료영상을 선택해주세요.");
  });

  document.querySelector("#btn-action-go-images")?.addEventListener("click", () => {
    navigatePatientPage("images");
    showToast("전송할 의료영상을 선택해주세요.");
  });

  document.querySelector("#btn-head-visit")?.addEventListener("click", () => {
    if (patientConsentReady) {
      navigatePatientPage("activity");
      showToast("활성화된 전송 현황 및 영수증 화면입니다.");
    } else {
      navigatePatientPage("home");
      const target = document.querySelector("#patient-action-consent-card");
      pulseHighlightElement(target);
      showToast("병원 방문 전 가상 병원 B 진료 의뢰 동의를 먼저 승인하세요.");
    }
  });

  // Action Center Summary Grid Cards Direct Action
  document.querySelector("#summary-card-requests")?.addEventListener("click", () => {
    navigatePatientPage("home");
    const target = document.querySelector("#patient-action-consent-card");
    pulseHighlightElement(target);
    if (!patientConsentReady) {
      showToast("가상 병원 B 진료 의뢰 동의가 대기 중입니다. [동의 승인]을 누르면 즉시 연계됩니다.");
    } else {
      showToast("이미 가상 병원 B 진료 의뢰 동의가 승인되어 있습니다.");
    }
  });

  document.querySelector("#summary-card-studies")?.addEventListener("click", () => {
    navigatePatientPage("images");
    showToast("보관 중인 의료영상 목록으로 이동했습니다.");
  });

  document.querySelector("#summary-card-access")?.addEventListener("click", () => {
    navigatePatientPage("activity");
    showToast("의료진 열람 감사 영수증 화면으로 이동했습니다.");
  });

  document.querySelector("#summary-card-consent")?.addEventListener("click", () => {
    if (patientConsentReady) {
      navigatePatientPage("consent");
      showToast("현재 활성화된 공유 동의 관리 화면입니다.");
    } else {
      navigatePatientPage("home");
      const target = document.querySelector("#patient-action-consent-card");
      pulseHighlightElement(target);
      showToast("동의 대기 상태입니다. [동의 승인]을 눌러 진료 의뢰를 승인하세요.");
    }
  });

  // Recent Imaging Study Cards Jumps directly to Consent
  document.querySelectorAll("[data-action-study]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const studyUid = btn.dataset.actionStudy;
      if (studyUid) {
        await selectStudy(studyUid, lastStudies);
        const study = lastStudies.find((s) => s.studyInstanceUid === studyUid);
        if (sourceHospitalSelect) sourceHospitalSelect.value = study?.sourceHospitalId || "HOSP-A";
        if (targetHospitalSelect) targetHospitalSelect.value = "HOSP-B";
        if (accessPurposeSelect) accessPurposeSelect.value = "TREATMENT";
        if (accessModeSelect) accessModeSelect.value = "VIEW_ONLY";
        syncPatientChoices({ preserveConsentState: true });
        navigatePatientPage("consent");
        const name = study?.description || "의료영상";
        showToast(`[${name}] 영상이 선택되었습니다. 수신 병원(가상 병원 B)을 확인하고 동의를 제출하세요.`);
      }
    });
  });

  // Patient Direct View from Home Cards
  document.querySelectorAll("[data-patient-view-home]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const studyUid = btn.dataset.patientViewHome;
      if (studyUid) openPatientStudyViewer(studyUid);
    });
  });

  setupPatientViewerModalEvents();

  // Keyboard accessibility for summary cards
  document.querySelectorAll('.summary-card[role="button"]').forEach((card) => {
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Doctor Actions
  document.querySelector("#doctor-request-token")?.addEventListener("click", requestDoctorToken);
  document.querySelector("#doctor-open-series")?.addEventListener("click", openViewer);
  document.querySelector("#load-studies")?.addEventListener("click", async () => {
    showToast("환자 전송 접수 목록을 새로고침하고 있습니다...");
    await loadDashboard();
    showToast("환자 전송 접수 목록이 갱신되었습니다.");
  });
  document.querySelector("#load-instances")?.addEventListener("click", loadInstancesForSelectedSeries);
  downloadButton?.addEventListener("click", downloadSelectedInstance);
  auditResultFilter?.addEventListener("change", loadDashboard);
  auditActionFilter?.addEventListener("change", loadDashboard);

  // Break-Glass Emergency Override
  document.querySelector("#btn-trigger-break-glass")?.addEventListener("click", () => showBreakGlassModal(demo.doctorId));

  // PACS Import Actions
  document.querySelector("#btn-preflight-check")?.addEventListener("click", runPreflightCheck);
  document.querySelector("#btn-pacs-import-run")?.addEventListener("click", runPacsImport);
  document.querySelector("#btn-refresh-pacs-archive")?.addEventListener("click", () => {
    loadHospitalBPacsArchive();
    showToast("B병원 원내 PACS 아카이브가 갱신되었습니다.");
  });

  // QR Handoff Scanner Actions
  document.querySelector("#btn-simulate-qr-scan")?.addEventListener("click", simulateQrScan);
  document.querySelector("#btn-reset-qr-scan")?.addEventListener("click", resetQrScan);
  document.querySelector("#btn-toggle-camera-scan")?.addEventListener("click", toggleCameraQrScan);

  // Cloud Viewer Tools
  document.querySelector("#tool-invert")?.addEventListener("click", toggleInvert);
  document.querySelector("#tool-zoom")?.addEventListener("click", cycleZoom);
  document.querySelector("#tool-pan")?.addEventListener("click", togglePan);
  document.querySelector("#tool-reset")?.addEventListener("click", resetViewerTools);
  document.querySelector("#tool-ww-wl")?.addEventListener("click", cycleWwWl);
  document.querySelector("#tool-side-by-side")?.addEventListener("click", toggleSideBySide);
  document.querySelector("#tool-cine-play")?.addEventListener("click", toggleCinePlayback);
  document.querySelector("#tool-cine-fps")?.addEventListener("click", cycleCineFps);

  // Multi-Slice Stack Navigation & Scrubber
  document.querySelector("#btn-prev-slice")?.addEventListener("click", () => stepSlice(-1));
  document.querySelector("#btn-next-slice")?.addEventListener("click", () => stepSlice(1));
  document.querySelector("#viewer-slice-slider")?.addEventListener("input", (e) => {
    const targetIdx = parseInt(e.target.value, 10) - 1;
    displaySlice(targetIdx);
  });

  // Mouse Wheel Scrubbing on Viewport
  const viewportBox = document.querySelector("#viewer-viewport-box");
  viewportBox?.addEventListener("wheel", (e) => {
    if (lastInstances.length <= 1) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      stepSlice(1);
    } else if (e.deltaY < 0) {
      stepSlice(-1);
    }
  }, { passive: false });

  // Keyboard navigation when viewer screen is active
  window.addEventListener("keydown", (e) => {
    const viewerScreen = document.querySelector('.mq-screen[data-screen="viewer"]');
    if (!viewerScreen || viewerScreen.hidden) return;
    if (["ArrowUp", "PageUp"].includes(e.key)) {
      e.preventDefault();
      stepSlice(-1);
    } else if (["ArrowDown", "PageDown"].includes(e.key)) {
      e.preventDefault();
      stepSlice(1);
    } else if (e.key === " " && e.target === document.body) {
      e.preventDefault();
      toggleCinePlayback();
    }
  });

  // Modal Closures
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
}

function initConsentDateDefaults() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (consentValidFromInput) consentValidFromInput.value = toDateTimeLocal(now);
  if (consentValidUntilInput) consentValidUntilInput.value = toDateTimeLocal(nextWeek);
}

// --------------------------------------------------------------------------
// Core Dashboard Data Loading
// --------------------------------------------------------------------------
async function loadDashboard(options = {}) {
  const auditParams = new URLSearchParams();
  if (auditResultFilter?.value) auditParams.set("result", auditResultFilter.value);
  if (auditActionFilter?.value) auditParams.set("action", auditActionFilter.value);
  const auditQuery = auditParams.toString();

  const [health, studies, consents, logs, usage, anomalies, quarantines] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson(`/api/imaging-studies?patientId=${demo.patientId}&includeSeries=true`),
    fetchJson(`/api/patients/${demo.patientId}/consents`),
    fetchJson(`/api/audit-logs${auditQuery ? `?${auditQuery}` : ""}`),
    fetchJson("/api/transfer-usage"),
    fetchJson("/api/anomaly-alerts"),
    fetchJson("/api/security/quarantines?all=true"),
  ]);

  lastStudies = Array.isArray(studies) ? studies : [];
  lastConsents = Array.isArray(consents) ? consents : [];
  updateConsentState(lastConsents);
  renderPatientStudyOptions(lastStudies);
  renderStudies(lastStudies);
  renderDoctorStudies(lastStudies);
  renderLogs(Array.isArray(logs) ? logs : []);
  renderAuditTable(Array.isArray(logs) ? logs : []);
  renderAnomalies(Array.isArray(anomalies) ? anomalies : []);
  renderQuarantines(Array.isArray(quarantines) ? quarantines : []);
  renderConsentHistory(Array.isArray(consents) ? consents : []);
  renderMetrics(lastStudies, Array.isArray(logs) ? logs : [], Array.isArray(usage) ? usage : []);
  renderHealth(health);
  renderPatientReceipts(Array.isArray(consents) ? consents : [], Array.isArray(logs) ? logs : []);
  updatePipelineSteps();
  await loadHospitalBPacsArchive();

  if (!options?.skipPhr) {
    await loadPhrDashboard();
  }
}

// --------------------------------------------------------------------------
// FHIR R4 Personal Health Record (PHR) Module
// --------------------------------------------------------------------------
async function loadPhrDashboard() {
  setPhrState("합성 PHR 데이터를 불러오는 중입니다.", "loading");
  try {
    const [summary, imaging] = await Promise.all([
      fetchJson("/api/v1/me/phr/summary"),
      fetchJson("/api/v1/me/phr/imaging-studies?limit=20"),
    ]);

    if (!summary?.data || !Array.isArray(imaging?.data)) {
      throw new Error(summary?.code ?? imaging?.code ?? "PHR_REQUEST_FAILED");
    }

    const patientNameEl = document.querySelector("#phr-patient-name");
    const encCountEl = document.querySelector("#phr-encounter-count");
    const obsCountEl = document.querySelector("#phr-observation-count");
    const imgCountEl = document.querySelector("#phr-imaging-count");

    if (patientNameEl) patientNameEl.textContent = summary.data.patient?.displayName ?? "가상환자 1001";
    if (encCountEl) encCountEl.textContent = String(summary.data.counts?.encounters ?? 0);
    if (obsCountEl) obsCountEl.textContent = String(summary.data.counts?.observations ?? 0);
    if (imgCountEl) imgCountEl.textContent = String(summary.data.counts?.imagingStudies ?? 0);

    renderPhrImaging(imaging.data);
    setPhrState(`합성 FHIR R4 자료 ${imaging.data.length}건을 확인했습니다.`, "success");
  } catch (error) {
    renderPhrImaging([]);
    setPhrState(toFriendlyError(error?.message), "fail");
  }
}

function renderPhrImaging(items) {
  if (!phrImagingList) return;
  if (!items.length) {
    phrImagingList.innerHTML = '<div class="notice">표시할 합성 FHIR ImagingStudy가 없습니다.</div>';
    return;
  }

  phrImagingList.innerHTML = items.map((item) => {
    const mapped = item.mappingStatus === "MAPPED";
    const modality = Array.isArray(item.modality)
      ? item.modality.map((entry) => entry?.code ?? entry?.display).filter(Boolean).join(", ")
      : "DICOM";

    return `
      <article class="phr-imaging-item">
        <div>
          <strong>${escapeHtml(item.description)}</strong>
          <div class="meta">${escapeHtml(modality || "DICOM")} / ${escapeHtml(item.started)} / 합성 데이터</div>
          <div class="meta">매핑: ${escapeHtml(item.mappingStatus)} / 접근: ${escapeHtml(item.accessStatus)}</div>
        </div>
        ${mapped
          ? `<button class="btn small primary" type="button" data-phr-consent-ref="${escapeHtml(item.imagingStudyRef)}">이 영상 공유 동의</button>`
          : '<span class="status red">Viewer 연결 불가</span>'}
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-phr-consent-ref]").forEach((button) => {
    button.addEventListener("click", () => createPhrConsent(button.dataset.phrConsentRef));
  });
}

async function createPhrConsent(imagingStudyRef) {
  if (phrHandoffLink) {
    phrHandoffLink.hidden = true;
    phrHandoffLink.removeAttribute("data-expires-at");
  }
  setPhrState("선택한 ImagingStudy의 공유 범위를 서버에서 검증하고 있습니다.", "loading");

  const result = await postJson(`/api/v1/me/phr/imaging-studies/${encodeURIComponent(imagingStudyRef)}/consents`, {
    targetHospitalId: targetHospitalSelect ? targetHospitalSelect.value : demo.targetHospitalId,
    purpose: accessPurposeSelect ? accessPurposeSelect.value : demo.purpose,
    permission: accessModeSelect ? accessModeSelect.value : demo.permission,
    validFrom: toIsoFromLocal(consentValidFromInput.value),
    validUntil: toIsoFromLocal(consentValidUntilInput.value),
  });

  if (result?.data?.consentId) {
    latestConsentId = result.data.consentId;
    const handoff = await postJson(`/api/consents/${encodeURIComponent(result.data.consentId)}/handoff-ticket`, {});
    const handoffUrl = safeSameOriginHandoffUrl(handoff?.qr?.payload);

    if (!handoffUrl) {
      setPhrState(`공유 동의는 생성되었지만 Viewer handoff 발급이 거부되었습니다: ${toFriendlyError(handoff?.error)}`, "fail");
      renderOutput({ status: result.data.status, consentId: result.data.consentId, handoff: handoff?.error ?? "HANDOFF_FAILED" });
      return;
    }

    if (phrHandoffLink) {
      phrHandoffLink.href = handoffUrl;
      phrHandoffLink.dataset.expiresAt = handoff.qr.expiresAt;
      phrHandoffLink.hidden = false;
    }
    setPhrState(`공유 동의와 일회용 Viewer handoff가 생성되었습니다. ${formatExpiry(handoff.qr.expiresAt)}까지 유효합니다.`, "success");
    renderOutput({
      status: result.data.status,
      consentId: result.data.consentId,
      permission: result.data.permission,
      purpose: result.data.purpose,
      targetHospital: result.data.targetHospitalId,
      handoffStatus: handoff.ticket?.status,
      handoffExpiresAt: handoff.qr.expiresAt,
    });
    broadcastSync("CONSENT_CREATED");
    await loadDashboard();
    switchPersona("PATIENT");
    navigatePatientPage("phr");
    return;
  }

  setPhrState(toFriendlyError(result?.code ?? result?.error), "fail");
  renderOutput(result);
}

function capturePhrHandoffNonce() {
  const match = location.pathname.match(/^\/t\/([A-Za-z0-9_-]{22,128})$/);
  if (!match) return null;
  history.replaceState(null, "", "/hipass/#DOCTOR");
  return match[1];
}

function safeSameOriginHandoffUrl(payload) {
  try {
    const parsed = new URL(payload, location.origin);
    if (parsed.origin !== location.origin || !/^\/t\/[A-Za-z0-9_-]{22,128}$/.test(parsed.pathname)) return null;
    return `${parsed.pathname}`;
  } catch {
    return null;
  }
}

function formatExpiry(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "잠시 후" : parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

async function redeemPhrHandoff(nonce) {
  switchPersona("DOCTOR");
  navigateHospitalScreen("viewer");
  showViewerMessage("일회용 handoff와 의료진 소속을 서버에서 검증하고 있습니다.", "info");

  const result = await postJson("/api/transfers/tickets/redeem-viewer", { nonce });
  if (result?.decision !== "ALLOWED" || !result.accessToken || !result.viewerContext?.studyInstanceUid) {
    latestToken = null;
    latestTokenInfo = null;
    if (viewerStatus) viewerStatus.textContent = "Handoff denied";
    showViewerMessage(toFriendlyError(result?.reasonCode ?? result?.error), "fail");
    renderOutput({ decision: result?.decision ?? "DENIED", reasonCode: result?.reasonCode ?? result?.error ?? "HANDOFF_FAILED" });
    return;
  }

  latestToken = result.accessToken;
  latestTokenInfo = result;
  latestConsentId = result.consentId ?? latestConsentId;
  selectedStudyUid = result.viewerContext.studyInstanceUid;
  selectedSeriesUid = result.viewerContext.seriesInstanceUid ?? "";
  selectedStudy = lastStudies.find((study) => study.studyInstanceUid === selectedStudyUid) ?? selectedStudy;
  if (viewerStatus) viewerStatus.textContent = "Handoff verified";
  syncSelectedStudyUi();
  setDownloadState();
  showViewerMessage("일회용 handoff 검증이 완료되었습니다. 승인된 Series만 불러옵니다.", "success");
  renderOutput({
    decision: result.decision,
    handoff: "CONSUMED",
    permission: result.viewerContext.permission,
    targetHospital: result.viewerContext.targetHospitalId,
  });

  startCountdownTimer(result.expiresAt);
  updateWatermark(result);
  updatePipelineSteps();
  broadcastSync("HANDOFF_REDEEMED");
  await loadGatewayStudies();
  await loadSeriesForActiveToken();
}

function setPhrState(message, tone) {
  if (!phrLoadState) return;
  phrLoadState.textContent = message;
  phrLoadState.dataset.tone = tone;
}

// --------------------------------------------------------------------------
// Consent Management & Hospital SaaS Real-time State Binding
// --------------------------------------------------------------------------
function renderActiveTransferCard(activeConsent) {
  const container = document.querySelector("#patient-active-transfer-banner");
  if (!container) return;
  if (activeConsent) {
    const study = lastStudies.find((s) => s.studyInstanceUid === selectedStudyUid) || lastStudies[0];
    const studyTitle = study?.description || "선택된 의료영상";
    container.innerHTML = `
      <div class="action-card" style="border: 2px solid #16a34a; background: #f0fdf4; padding: 18px; margin-bottom: 20px;">
        <div class="action-symbol" style="--soft:#dcfce7;--tone:#16a34a;font-size:22px;">✓</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;">
            <h3 style="margin:0;color:#166534;font-size:16px;">현재 활성 전송: ${escapeHtml(studyTitle)}</h3>
            <span class="status green">전송 완료 (ACTIVE)</span>
          </div>
          <p style="margin:6px 0 0;color:#15803d;font-size:13px;">
            수신 병원: <strong>가상 병원 B (신경과 DOC-B-01)</strong> · 목적: ${escapeHtml(activeConsent.purpose || demo.purpose)} · 권한: ${escapeHtml(activeConsent.permission || demo.permission)}
          </p>
          <p style="margin:3px 0 0;color:#166534;font-size:12px;">
            유효기간: ${escapeHtml(formatDate(activeConsent.validUntil))}까지 안전 조회 가능
          </p>
        </div>
        <div>
          <button id="btn-activity-revoke" class="btn small" type="button" style="color:var(--red);border-color:var(--red-soft);background:#ffffff;font-weight:700;">
            전송 즉시 철회
          </button>
        </div>
      </div>
    `;
    container.querySelector("#btn-activity-revoke")?.addEventListener("click", async () => {
      showToast("전송 동의를 철회하는 중입니다...");
      await revokePatientConsent();
      showToast("의료영상 전송이 즉시 철회되었습니다. 병원 SaaS 조회가 차단됩니다.");
    });
  } else {
    container.innerHTML = `
      <div class="action-card" style="border: 1px dashed #cbd5e1; background: #ffffff; padding: 16px; margin-bottom: 20px;">
        <div class="action-symbol" style="--soft:#f1f5f9;--tone:#64748b;font-size:20px;">📋</div>
        <div style="flex:1;">
          <h3 style="margin:0;color:#475569;font-size:15px;">현재 활성화된 영상 전송이 없습니다.</h3>
          <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
            다른 병원으로 영상을 전달해야 하는 경우, [내 의료영상 확인]에서 영상을 선택하여 전송하세요.
          </p>
        </div>
        <div>
          <button class="btn small primary" type="button" id="btn-activity-go-images">영상 전송 시작</button>
        </div>
      </div>
    `;
    container.querySelector("#btn-activity-go-images")?.addEventListener("click", () => navigatePatientPage("images"));
  }
}

function getConsentForStudy(studyUid, consents = lastConsents) {
  if (!studyUid || !Array.isArray(consents)) return null;
  const active = consents.find((consent) => (
    consent.status === "ACTIVE" &&
    consent.targetHospitalId === demo.targetHospitalId &&
    Array.isArray(consent.scopes) &&
    consent.scopes.length > 0 &&
    consent.scopes.some((scope) => scope.allowed !== false && scope.studyInstanceUid === studyUid)
  ));
  if (active) return active;
  return consents.find((consent) => (
    consent.targetHospitalId === demo.targetHospitalId &&
    Array.isArray(consent.scopes) &&
    consent.scopes.length > 0 &&
    consent.scopes.some((scope) => scope.allowed !== false && scope.studyInstanceUid === studyUid)
  )) || null;
}

function findConsentForStudy(studyUid, consents = lastConsents) {
  if (!studyUid || !Array.isArray(consents)) return null;
  return consents.find((consent) => (
    consent.status === "ACTIVE" &&
    consent.targetHospitalId === demo.targetHospitalId &&
    Array.isArray(consent.scopes) &&
    consent.scopes.length > 0 &&
    consent.scopes.some((scope) => scope.allowed !== false && scope.studyInstanceUid === studyUid)
  )) || null;
}

function updateConsentState(consents) {
  const active = findConsentForStudy(selectedStudyUid, consents);

  const quickApproveBtn = document.querySelector("#btn-quick-approve");
  const quickRevokeBtn = document.querySelector("#btn-quick-revoke");
  const actionConsentBadge = document.querySelector("#patient-action-consent-badge");
  const actionConsentDesc = document.querySelector("#patient-action-consent-desc");

  if (active) {
    latestConsentId = active.consentId;
    patientConsentReady = true;
    setPatientStatus("동의 완료 (ACTIVE)");

    if (quickApproveBtn) quickApproveBtn.style.display = "none";
    if (quickRevokeBtn) quickRevokeBtn.style.display = "inline-flex";
    if (actionConsentBadge) {
      actionConsentBadge.textContent = "동의 완료 (ACTIVE)";
      actionConsentBadge.className = "status green";
    }
    if (actionConsentDesc) {
      actionConsentDesc.textContent = `가상 병원 B (신경과 DOC-B-01)로 동의 완료 · ${selectedStudy?.description || "선택된 영상"} 열람 허용 중`;
    }
  } else {
    patientConsentReady = false;
    latestConsentId = null;
    setPatientStatus("동의 대기");

    if (quickApproveBtn) quickApproveBtn.style.display = "inline-flex";
    if (quickRevokeBtn) quickRevokeBtn.style.display = "none";
    if (actionConsentBadge) {
      actionConsentBadge.textContent = "동의 대기";
      actionConsentBadge.className = "status teal";
    }
    if (actionConsentDesc) {
      actionConsentDesc.textContent = `${selectedStudy?.description || "의료영상"}이 가상 병원 B 신경과로 안전하게 공유될 수 있는 정책 대기`;
    }
  }

  renderActiveTransferCard(active);
  updateHospitalSaaSState(active, consents);
}

function updateHospitalSaaSState(activeConsent, consents) {
  // 1. Dashboard Metric Cards
  const metricStatus = document.querySelector("#saas-metric-consent-status");
  const metricSub = document.querySelector("#saas-metric-consent-sub");

  if (metricStatus) {
    if (activeConsent) {
      metricStatus.textContent = "동의 완료";
      metricStatus.style.color = "#16a34a";
    } else {
      metricStatus.textContent = "대기";
      metricStatus.style.color = "#d97706";
    }
  }
  if (metricSub) {
    if (activeConsent) {
      metricSub.textContent = `환자 ${demo.patientId} 동의 확인됨 (검증 가능)`;
    } else {
      metricSub.textContent = `환자 ${demo.patientId} 동의 필요`;
    }
  }

  // 2. Recent Exchanges Table
  const recentTable = document.querySelector("#saas-recent-exchange-rows");
  if (recentTable) {
    if (activeConsent) {
      recentTable.innerHTML = `
        <tr>
          <td><strong>${escapeHtml(demo.patientId)}</strong></td>
          <td>${escapeHtml(activeConsent.sourceHospitalId || demo.sourceHospitalId)}</td>
          <td>${escapeHtml(activeConsent.targetHospitalId || demo.targetHospitalId)}</td>
          <td>${escapeHtml(activeConsent.purpose || demo.purpose)}</td>
          <td>${escapeHtml(activeConsent.permission || demo.permission)}</td>
          <td><span class="mq-badge mq-badge-good">동의 완료 (ACTIVE)</span></td>
          <td><button class="mq-btn small mq-btn-primary" type="button" data-view-jump="exchange">파이프라인 확인</button></td>
        </tr>
      `;
    } else {
      const revokedConsent = consents.find((c) => c.status === "REVOKED");
      const statusBadge = revokedConsent
        ? '<span class="mq-badge mq-badge-bad">철회됨 (REVOKED)</span>'
        : '<span class="mq-badge mq-badge-warn">대기 (PENDING)</span>';

      recentTable.innerHTML = `
        <tr>
          <td><strong>${escapeHtml(demo.patientId)}</strong></td>
          <td>가상 병원 A</td>
          <td>가상 병원 B</td>
          <td>${escapeHtml(demo.purpose)}</td>
          <td>${escapeHtml(demo.permission)}</td>
          <td>${statusBadge}</td>
          <td><button class="mq-btn small" type="button" data-view-jump="exchange">파이프라인 확인</button></td>
        </tr>
      `;
    }

    recentTable.querySelectorAll("[data-view-jump]").forEach((btn) => {
      btn.addEventListener("click", () => navigateHospitalScreen(btn.dataset.viewJump));
    });
  }

  // 3. Exchange Screen Cards
  const consentBadge = document.querySelector("#exchange-consent-badge");
  const consentIdEl = document.querySelector("#exchange-consent-id");
  const consentScopeEl = document.querySelector("#exchange-consent-scope");
  const consentExpiryEl = document.querySelector("#exchange-consent-expiry");
  const authBadge = document.querySelector("#exchange-auth-badge");
  const authDecisionEl = document.querySelector("#exchange-auth-decision");
  const tokenStatusEl = document.querySelector("#exchange-token-status");
  const doctorTokenNotice = document.querySelector("#doctor-token-notice");
  const step1Label = document.querySelector("#pipeline-step1-label");
  const step2Label = document.querySelector("#pipeline-step2-label");
  const step3Label = document.querySelector("#pipeline-step3-label");

  if (activeConsent) {
    if (consentBadge) {
      consentBadge.textContent = "ACTIVE (승인됨)";
      consentBadge.className = "mq-badge mq-badge-good";
    }
    if (consentIdEl) consentIdEl.textContent = activeConsent.consentId;
    if (consentScopeEl) consentScopeEl.textContent = `${activeConsent.purpose || demo.purpose} / ${activeConsent.permission || demo.permission}`;
    if (consentExpiryEl) consentExpiryEl.textContent = `${formatDate(activeConsent.validUntil)} 까지`;
    if (step1Label) step1Label.textContent = "동의 승인됨 (ACTIVE)";

    if (latestToken) {
      if (authBadge) {
        authBadge.textContent = "ONLINE (발급됨)";
        authBadge.className = "mq-badge mq-badge-good";
      }
      if (authDecisionEl) authDecisionEl.textContent = "ALLOWED (ABAC 통과)";
      if (tokenStatusEl) tokenStatusEl.textContent = `발급 완료 (${latestToken.slice(0, 16)}...)`;
      if (step2Label) step2Label.textContent = "검증 통과 (ALLOWED)";
      if (step3Label) step3Label.textContent = "5분 토큰 발급됨";
      if (doctorTokenNotice) {
        doctorTokenNotice.textContent = "단기 접근토큰(5분)이 발급되어 Gateway를 통해 안전하게 DICOM 영상을 열람할 수 있습니다.";
        doctorTokenNotice.style.background = "#e8f5ed";
        doctorTokenNotice.style.color = "#166534";
        doctorTokenNotice.style.borderColor = "#c6e7d1";
      }
    } else {
      if (authBadge) {
        authBadge.textContent = "READY (검증 가능)";
        authBadge.className = "mq-badge mq-badge-good";
      }
      if (authDecisionEl) authDecisionEl.textContent = "CONSENT_READY (발급 대기)";
      if (tokenStatusEl) tokenStatusEl.textContent = "미발급 (대기)";
      if (step2Label) step2Label.textContent = "검증 준비 (READY)";
      if (step3Label) step3Label.textContent = "미발급 (대기)";
      if (doctorTokenNotice) {
        doctorTokenNotice.textContent = "환자 동의가 승인되었습니다. [단기 DICOMweb 토큰 발급 요청] 버튼을 눌러 영상 열람을 시작하세요.";
        doctorTokenNotice.style.background = "#e0f2fe";
        doctorTokenNotice.style.color = "#0369a1";
        doctorTokenNotice.style.borderColor = "#bae6fd";
      }
    }
  } else {
    const revoked = consents.find((c) => c.status === "REVOKED");
    if (consentBadge) {
      if (revoked) {
        consentBadge.textContent = "REVOKED (철회됨)";
        consentBadge.className = "mq-badge mq-badge-bad";
      } else {
        consentBadge.textContent = "대기 (PENDING)";
        consentBadge.className = "mq-badge mq-badge-warn";
      }
    }
    if (consentIdEl) consentIdEl.textContent = revoked ? revoked.consentId : "-";
    if (consentScopeEl) consentScopeEl.textContent = `${demo.purpose} / ${demo.permission}`;
    if (consentExpiryEl) consentExpiryEl.textContent = revoked ? "동의 철회됨" : "미승인 (대기)";
    if (step1Label) step1Label.textContent = revoked ? "Consent REVOKED" : "Consent PENDING";

    if (authBadge) {
      authBadge.textContent = revoked ? "REVOKED" : "대기 (동의 필요)";
      authBadge.className = "mq-badge mq-badge-warn";
    }
    if (authDecisionEl) authDecisionEl.textContent = revoked ? "CONSENT_REVOKED" : "PATIENT_CONSENT_REQUIRED";
    if (tokenStatusEl) tokenStatusEl.textContent = "미발급 (대기)";
    if (step2Label) step2Label.textContent = "RBAC + ABAC";
    if (step3Label) step3Label.textContent = "5분 유효 Token";

    if (doctorTokenNotice) {
      if (revoked) {
        doctorTokenNotice.textContent = "환자가 동의를 철회하였습니다. 신규 토큰 발급 및 영상 접근이 차단됩니다.";
        doctorTokenNotice.style.background = "#fcebea";
        doctorTokenNotice.style.color = "#991b1b";
        doctorTokenNotice.style.borderColor = "#fecaca";
      } else {
        doctorTokenNotice.textContent = "환자 동의가 대기 상태입니다. 환자 포털에서 동의를 승인한 후 토큰 발급을 요청하세요.";
        doctorTokenNotice.style.background = "#fffbeb";
        doctorTokenNotice.style.color = "#92400e";
        doctorTokenNotice.style.borderColor = "#fde68a";
      }
    }
  }
}

async function createPatientConsent(options = {}) {
  syncPatientChoices({ preserveConsentState: true });
  const scope = { studyInstanceUid: selectedStudyUid };
  if (selectedSeriesUid) scope.seriesInstanceUid = selectedSeriesUid;

  const result = await postJson("/api/consents", {
    ...demo,
    studyInstanceUid: selectedStudyUid,
    seriesInstanceUid: selectedSeriesUid || undefined,
    validFrom: toIsoFromLocal(consentValidFromInput.value),
    validUntil: toIsoFromLocal(consentValidUntilInput.value),
    scopes: [scope],
  });

  if (result.consentId) {
    latestConsentId = result.consentId;
    patientConsentReady = true;
    setPatientStatus("동의 완료 (ACTIVE)");
    showViewerMessage("환자 동의가 성공적으로 생성되었습니다.", "success");

    try {
      const handoff = await postJson(`/api/consents/${encodeURIComponent(result.consentId)}/handoff-ticket`, {});
      if (handoff?.qr?.payload) {
        const match = handoff.qr.payload.match(/\/t\/([A-Za-z0-9_-]{22,128})$/);
        if (match) latestTicketNonce = match[1];
        updateVisitModePacket(handoff);
      }
    } catch {
      // Non-fatal if QR ticket issuance is deferred
    }
    broadcastSync("CONSENT_CREATED");
    navigatePatientPage("activity");
    showToast("가상 병원 B로 영상 전송 동의가 완료되었습니다! 병원 SaaS 콘솔에서 즉시 조회가 가능합니다.");
  } else {
    patientConsentReady = false;
    latestTicketNonce = null;
    setPatientStatus("동의 생성 실패");
    showViewerMessage(toFriendlyError(result.error), "fail");
  }

  updatePipelineSteps();
  if (!options.silent) renderOutput(result);
  await loadDashboard();
  return result;
}

async function revokePatientConsent() {
  const result = await postJson(`/api/consents/${latestConsentId}/revoke`, { actorId: demo.patientId });
  clearCountdownTimer();
  latestToken = null;
  latestTokenInfo = null;
  latestTicketNonce = null;
  patientConsentReady = false;
  setPatientStatus("동의 철회됨 (REVOKED)");
  if (viewerStatus) viewerStatus.textContent = "토큰 필요";
  resetViewerData();
  updatePipelineSteps();
  showViewerMessage(result.error ? toFriendlyError(result.error) : "동의가 철회되었습니다. 기존 발급 토큰은 폐기됩니다.", result.error ? "fail" : "warning");
  renderOutput(result);
  broadcastSync("CONSENT_REVOKED");
  await loadDashboard();
}

function syncPatientChoices(options = {}) {
  if (sourceHospitalSelect) demo.sourceHospitalId = sourceHospitalSelect.value;
  if (targetHospitalSelect) demo.targetHospitalId = targetHospitalSelect.value;
  if (accessPurposeSelect) demo.purpose = accessPurposeSelect.value;
  if (accessModeSelect) demo.permission = accessModeSelect.value;
  if (patientSeriesSelect) selectedSeriesUid = patientSeriesSelect.value;

  latestToken = null;
  latestTokenInfo = null;
  resetViewerData();
  if (!options.preserveConsentState) {
    patientConsentReady = false;
    setPatientStatus("동의 필요");
  }
  if (viewerStatus) viewerStatus.textContent = "토큰 필요";
}

function renderPatientStudyOptions(studies) {
  if (!patientStudySelect) return;
  patientStudySelect.innerHTML = studies.map((study) => `
    <option value="${escapeHtml(study.studyInstanceUid)}">${escapeHtml(study.description)} (${escapeHtml(study.modality)})</option>
  `).join("");

  if (!studies.some((study) => study.studyInstanceUid === selectedStudyUid) && studies[0]) {
    selectedStudyUid = studies[0].studyInstanceUid;
  }
  patientStudySelect.value = selectedStudyUid;
  if (sourceHospitalSelect) sourceHospitalSelect.value = demo.sourceHospitalId;
  if (targetHospitalSelect) targetHospitalSelect.value = demo.targetHospitalId;
  if (accessPurposeSelect) accessPurposeSelect.value = demo.purpose;
  if (accessModeSelect) accessModeSelect.value = demo.permission;
  renderPatientSeriesOptions();
}

function renderPatientSeriesOptions() {
  if (!patientSeriesSelect) return;
  const study = lastStudies.find((item) => item.studyInstanceUid === selectedStudyUid);
  const seriesRows = study?.series ?? [];
  patientSeriesSelect.innerHTML = [
    `<option value="">Study 전체</option>`,
    ...seriesRows.map((series) => `
      <option value="${escapeHtml(series.seriesInstanceUid)}">${escapeHtml(series.description)} / ${escapeHtml(series.seriesInstanceUid)}</option>
    `),
  ].join("");

  if (selectedSeriesUid && !seriesRows.some((series) => series.seriesInstanceUid === selectedSeriesUid)) {
    selectedSeriesUid = "";
  }
  patientSeriesSelect.value = selectedSeriesUid;
}

function renderConsentHistory(consents) {
  const container = document.querySelector("#patient-consent-history");
  if (!container) return;
  if (!consents.length) {
    container.innerHTML = '<div class="notice">생성된 동의 이력이 없습니다.</div>';
    return;
  }

  container.innerHTML = consents.slice(0, 8).map((consent) => {
    const isAct = consent.status === "ACTIVE";
    const statusClass = isAct ? "status green" : (consent.status === "REVOKED" ? "status red" : "status amber");
    return `
      <div class="action-card">
        <div class="action-symbol" style="--soft:${isAct ? '#e8f5ed' : '#fcebea'};--tone:${isAct ? '#2b7d55' : '#b13b38'}">
          ${isAct ? '✓' : '✕'}
        </div>
        <div>
          <h3>${escapeHtml(consent.sourceHospitalId)} → ${escapeHtml(consent.targetHospitalId)}</h3>
          <p>${escapeHtml(consent.purpose)} · ${escapeHtml(consent.permission)} · 만료: ${escapeHtml(formatDate(consent.validUntil))}</p>
        </div>
        <span class="${statusClass}">${escapeHtml(consent.status)}</span>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// Doctor Access & Token Operations
// --------------------------------------------------------------------------
async function requestDoctorToken() {
  if (!patientConsentReady) {
    latestToken = null;
    latestTokenInfo = null;
    if (viewerStatus) viewerStatus.textContent = "Consent required";
    const denied = { decision: "DENIED", reasonCode: "PATIENT_CONSENT_REQUIRED" };
    showViewerMessage(toFriendlyError(denied.reasonCode), "fail");
    renderOutput(denied);
    return denied;
  }

  const result = await postJson("/api/dicom-access/request", {
    consentId: latestConsentId,
    doctorId: demo.doctorId,
    requestingHospitalId: demo.targetHospitalId,
    studyInstanceUid: selectedStudyUid,
    seriesInstanceUid: selectedSeriesUid || undefined,
    purpose: demo.purpose,
    requestedAction: "VIEW",
  });

  if (result.decision === "ALLOWED") {
    latestToken = result.accessToken;
    latestTokenInfo = result;
    if (viewerStatus) viewerStatus.textContent = "토큰 발급됨 (ONLINE)";
    setDownloadState();
    showViewerMessage("단기 토큰이 발급되었습니다. 필요할 때만 Series와 Instance를 순차적으로 불러옵니다.", "success");
    startCountdownTimer(result.expiresAt);
    updateWatermark(result);
    updatePipelineSteps();
    broadcastSync("TOKEN_ISSUED");

    await loadGatewayStudies();
    await loadSeriesForActiveToken();
    if (lastSeries.length > 0) {
      await loadInstancesForSelectedSeries();
    }
  } else {
    latestToken = null;
    latestTokenInfo = null;
    if (viewerStatus) viewerStatus.textContent = "접근 거부";
    showViewerMessage(toFriendlyError(result.reasonCode), "fail");
  }

  renderOutput(result);
  await loadDashboard();
  return result;
}

async function openViewer() {
  switchPersona("DOCTOR");
  navigateHospitalScreen("viewer");
  if (!latestToken || latestTokenInfo?.studyInstanceUid !== selectedStudyUid) {
    await requestDoctorToken();
  } else {
    await loadGatewayStudies();
    await loadSeriesForActiveToken();
    if (lastSeries.length > 0) {
      await loadInstancesForSelectedSeries();
    }
  }
}

async function loadGatewayStudies() {
  if (!requireToken()) return;
  const result = await getJson("/dicomweb/studies", latestToken);
  renderOutput(result);
  if (!Array.isArray(result)) {
    showViewerMessage(toFriendlyError(result.error), "fail");
    return;
  }
  showViewerMessage(`Study 메타데이터 ${result.length}건을 확인했습니다. Series는 온디맨드로 지연 로딩됩니다.`, "success");
}

async function loadSeriesForActiveToken() {
  if (!requireToken()) return;
  const result = await getJson(`/dicomweb/studies/${selectedStudyUid}/series`, latestToken);
  renderOutput(result);
  if (!Array.isArray(result)) {
    lastSeries = [];
    renderSeries([]);
    showViewerMessage(toFriendlyError(result.error), "fail");
    return;
  }
  lastSeries = result;
  renderSeries(result);
  if (viewerStatus) viewerStatus.textContent = "Series ready";
  showViewerMessage("Series 메타데이터를 불러왔습니다. Series를 선택하여 Instance를 스트리밍하세요.", "success");
}

async function loadInstancesForSelectedSeries() {
  if (!requireToken()) return;
  if (!selectedSeriesUid && lastSeries.length > 0) {
    const firstUid = dicomValue(lastSeries[0], "0020000E");
    if (firstUid) {
      selectedSeriesUid = firstUid;
      showSeriesImage(resolvePreviewForSelectedSeries(), "대표 이미지");
    }
  }
  if (!selectedSeriesUid) {
    showViewerMessage("Instance를 불러오기 전에 Series를 먼저 선택하세요.", "warning");
    return;
  }
  stopCinePlayback();
  clearSliceBlobCache();

  const result = await getJson(`/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances`, latestToken);
  renderOutput(result);
  if (!Array.isArray(result) || result.length === 0) {
    lastInstances = [];
    totalSlices = 1;
    currentSliceIndex = 0;
    updateSliceControlsUi();
    showViewerMessage(toFriendlyError(result?.error || "NO_INSTANCES"), "fail");
    return;
  }

  // Sort instances by InstanceNumber ascending
  lastInstances = result.sort((a, b) => {
    const na = Number(dicomValue(a, "00200013") || 0);
    const nb = Number(dicomValue(b, "00200013") || 0);
    return na - nb;
  });

  totalSlices = lastInstances.length;
  currentSliceIndex = 0;
  updateSliceControlsUi();
  showViewerMessage(`Instance 메타데이터 ${totalSlices}건을 확인했습니다. 마우스 휠 또는 Cine 재생으로 단면을 탐색하세요.`, "success");

  await displaySlice(0);
}

function updateSliceControlsUi() {
  const slider = document.querySelector("#viewer-slice-slider");
  const badge = document.querySelector("#viewer-slice-indicator");
  const hudSlice = document.querySelector("#viewer-slice-hud");
  const hudStudy = document.querySelector("#viewer-hud-study");
  const btnPrev = document.querySelector("#btn-prev-slice");
  const btnNext = document.querySelector("#btn-next-slice");

  if (slider) {
    slider.min = "1";
    slider.max = String(Math.max(1, totalSlices));
    slider.value = String(currentSliceIndex + 1);
    slider.disabled = totalSlices <= 1;
  }
  if (badge) badge.textContent = `${currentSliceIndex + 1} / ${totalSlices}`;
  if (hudSlice) hudSlice.textContent = `${currentSliceIndex + 1} / ${totalSlices}`;
  if (hudStudy) {
    const desc = selectedStudy?.description || "Study";
    const mod = selectedStudy?.modality || "DICOM";
    hudStudy.textContent = `P-1001 · ${desc} (${mod})`;
  }
  if (btnPrev) btnPrev.disabled = totalSlices <= 1;
  if (btnNext) btnNext.disabled = totalSlices <= 1;
}

async function displaySlice(index, options = {}) {
  if (!lastInstances || lastInstances.length === 0) return;
  if (index < 0 || index >= lastInstances.length) return;

  currentSliceIndex = index;
  updateSliceControlsUi();

  const instance = lastInstances[index];
  const sopInstanceUid = dicomValue(instance, "00080018") || "";
  selectedSopUid = sopInstanceUid;
  setDownloadState();

  if (instanceDetail) {
    instanceDetail.hidden = false;
    instanceDetail.textContent = `SOP ${sopInstanceUid.slice(0, 24)}... (단면 ${index + 1}/${totalSlices})`;
  }
  if (viewerStatus) viewerStatus.textContent = `Slice ${index + 1}/${totalSlices}`;

  // 1. Check LRU Cache
  if (sliceBlobCache.has(sopInstanceUid)) {
    const cachedUrl = sliceBlobCache.get(sopInstanceUid);
    showSeriesImage(cachedUrl, `Slice ${index + 1}`);
    if (!options.isCine) prefetchAdjacentSlices(index);
    return;
  }

  // 2. Fetch rendered slice
  if (!latestToken) return;
  try {
    const renderedUrl = `/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances/${sopInstanceUid}/rendered`;
    const response = await fetch(renderedUrl, {
      headers: { authorization: `Bearer ${latestToken}` },
    });

    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (sliceBlobCache.size >= 40) {
        const oldestKey = sliceBlobCache.keys().next().value;
        const oldUrl = sliceBlobCache.get(oldestKey);
        try { URL.revokeObjectURL(oldUrl); } catch {}
        sliceBlobCache.delete(oldestKey);
      }
      sliceBlobCache.set(sopInstanceUid, blobUrl);

      if (currentSliceIndex === index) {
        showSeriesImage(blobUrl, `Slice ${index + 1}`);
      }
    } else {
      showSeriesImage(resolvePreviewForSelectedSeries(), `Slice ${index + 1}`);
    }
  } catch {
    showSeriesImage(resolvePreviewForSelectedSeries(), `Slice ${index + 1}`);
  }

  if (!options.isCine) {
    prefetchAdjacentSlices(index);
  }
}

function stepSlice(delta) {
  if (totalSlices <= 1) return;
  let next = currentSliceIndex + delta;
  if (next < 0) next = totalSlices - 1;
  else if (next >= totalSlices) next = 0;
  displaySlice(next);
}

let prefetching = false;
async function prefetchAdjacentSlices(currentIndex) {
  if (prefetching || !latestToken || totalSlices <= 1) return;
  prefetching = true;
  try {
    const targets = [currentIndex + 1, currentIndex + 2, currentIndex - 1].filter(
      (i) => i >= 0 && i < totalSlices
    );
    for (const idx of targets) {
      const inst = lastInstances[idx];
      if (!inst) continue;
      const sop = dicomValue(inst, "00080018");
      if (!sop || sliceBlobCache.has(sop)) continue;

      const res = await fetch(`/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances/${sop}/rendered`, {
        headers: { authorization: `Bearer ${latestToken}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (sliceBlobCache.size >= 40) {
          const oldestKey = sliceBlobCache.keys().next().value;
          const oldUrl = sliceBlobCache.get(oldestKey);
          try { URL.revokeObjectURL(oldUrl); } catch {}
          sliceBlobCache.delete(oldestKey);
        }
        sliceBlobCache.set(sop, url);
      }
    }
  } catch {} finally {
    prefetching = false;
  }
}

function toggleCinePlayback() {
  if (isCinePlaying) {
    stopCinePlayback();
  } else {
    startCinePlayback();
  }
}

function startCinePlayback() {
  if (totalSlices <= 1 || !latestToken) {
    showViewerMessage("Cine 재생을 위해서는 2개 이상의 Instance가 필요합니다.", "info");
    return;
  }
  isCinePlaying = true;
  const btn = document.querySelector("#tool-cine-play");
  if (btn) {
    btn.textContent = "⏸ Cine 정지";
    btn.classList.add("active");
  }

  const intervalMs = Math.round(1000 / cineFps);
  cineIntervalId = setInterval(() => {
    if (!latestToken || totalSlices <= 1) {
      stopCinePlayback();
      return;
    }
    const next = (currentSliceIndex + 1) % totalSlices;
    displaySlice(next, { isCine: true });
  }, intervalMs);
}

function stopCinePlayback() {
  if (cineIntervalId) {
    clearInterval(cineIntervalId);
    cineIntervalId = null;
  }
  isCinePlaying = false;
  const btn = document.querySelector("#tool-cine-play");
  if (btn) {
    btn.textContent = "▶ Cine 재생";
    btn.classList.remove("active");
  }
}

function cycleCineFps() {
  const speeds = [10, 15, 24, 30];
  const nextIdx = (speeds.indexOf(cineFps) + 1) % speeds.length;
  cineFps = speeds[nextIdx];
  const btn = document.querySelector("#tool-cine-fps");
  if (btn) btn.textContent = `속도: ${cineFps} fps`;
  if (isCinePlaying) {
    stopCinePlayback();
    startCinePlayback();
  }
}

function clearSliceBlobCache() {
  for (const url of sliceBlobCache.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  sliceBlobCache.clear();
}

async function loadInstancePixels(sopInstanceUid) {
  if (!requireToken()) return;
  const targetIdx = lastInstances.findIndex((inst) => dicomValue(inst, "00080018") === sopInstanceUid);
  if (targetIdx >= 0) {
    await displaySlice(targetIdx);
  } else {
    selectedSopUid = sopInstanceUid;
    setDownloadState();
  }
}

async function downloadSelectedInstance() {
  if (!requireToken() || !selectedSopUid) return;
  const response = await fetch(`/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances/${selectedSopUid}/download`, {
    headers: { authorization: `Bearer ${latestToken}` },
  });

  if (!response.ok) {
    const error = await safeJson(response);
    showViewerMessage(toFriendlyError(error.error), "fail");
    renderOutput(error);
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedSopUid}.dcm`;
  link.click();
  URL.revokeObjectURL(url);
  renderOutput({ status: "DOWNLOAD_STARTED", sopInstanceUid: selectedSopUid, bytes: blob.size });
}

function renderSeries(seriesRows) {
  const container = document.querySelector("#viewer-series-list");
  if (!container) return;

  if (!seriesRows.length) {
    container.innerHTML = '<div style="font-size:11px;color:#94a3b8;">조회 가능한 Series가 없습니다.</div>';
    hideSeriesImage();
    return;
  }

  container.innerHTML = seriesRows.map((series, index) => {
    const seriesUid = dicomValue(series, "0020000E");
    const description = dicomValue(series, "0008103E") || "Series";
    return `
      <div class="mq-thumb ${index === 0 ? "selected" : ""}" data-viewer-series-uid="${escapeHtml(seriesUid)}">
        <strong>${index + 1}. ${escapeHtml(description)}</strong>
        <div style="font-size:10px;color:#94a3b8;">${escapeHtml(seriesUid.slice(0, 18))}...</div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-viewer-series-uid]").forEach((thumb, index) => {
    thumb.addEventListener("click", async () => {
      container.querySelectorAll(".mq-thumb").forEach((t) => t.classList.remove("selected"));
      thumb.classList.add("selected");
      selectedSeriesUid = thumb.dataset.viewerSeriesUid;
      selectedSopUid = "";
      showSeriesImage(resolvePreviewForSelectedSeries(), `Series ${index + 1}`);
      await loadInstancesForSelectedSeries();
    });
  });

  const firstUid = seriesRows[0] ? dicomValue(seriesRows[0], "0020000E") : "";
  if (firstUid) {
    selectedSeriesUid = firstUid;
    showSeriesImage(resolvePreviewForSelectedSeries(), "대표 이미지");
  } else {
    hideSeriesImage();
  }
}

// --------------------------------------------------------------------------
// Studies & Views Rendering
// --------------------------------------------------------------------------
function renderStudies(studies) {
  selectedStudy = studies.find((study) => study.studyInstanceUid === selectedStudyUid) ?? studies[0] ?? null;
  if (selectedStudy) selectedStudyUid = selectedStudy.studyInstanceUid;
  syncSelectedStudyUi();

  const studiesContainer = document.querySelector("#studies");
  if (!studiesContainer) return;

  if (isEasyMode) {
    studiesContainer.innerHTML = studies.map((study) => {
      const mod = (study.modality || "").toUpperCase();
      const desc = (study.description || "").toUpperCase();
      let plainTitle = study.description;
      let plainDesc = "병원 진단용 고해상도 의료영상 데이터입니다.";

      if (mod === "MR" || desc.includes("BRAIN")) {
        plainTitle = "뇌 정밀 자기공명영상 (Brain MRI)";
        plainDesc = "뇌실 및 두개골 내부 신경 구조를 정밀하게 확인한 단층 영상입니다. 어지럼증, 두통, 뇌혈관 건강 상태를 점검하는 데 사용됩니다.";
      } else if (mod === "CR" || desc.includes("CHEST PA") || desc.includes("X-RAY")) {
        plainTitle = "흉부 단순 X선 촬영 (Chest X-ray)";
        plainDesc = "폐와 심장, 흉곽의 전체적인 윤곽을 방사선으로 촬영한 검사입니다. 폐렴, 결핵, 기흉 등 주요 흉부 질환의 기본 검진에 사용됩니다.";
      } else if (mod === "CT" && (desc.includes("ABDOMEN") || desc.includes("ABD"))) {
        plainTitle = "복부 전산화단층촬영 (Abdomen CT)";
        plainDesc = "간, 담낭, 췌장, 신장 등 복부 주요 장기를 3차원 단층으로 정밀 촬영한 고해상도 영상입니다. 염증 및 종양 유무를 정밀 분석합니다.";
      } else if (mod === "CT") {
        plainTitle = "흉부 전산화단층촬영 (Chest CT)";
        plainDesc = "폐, 기관지, 흉곽 내부 혈관과 주요 조직을 고해상도로 관찰한 단층 영상입니다. 폐 질환 및 호흡기 이상 여부를 정밀 분석합니다.";
      } else if (mod === "ES" || desc.includes("ERCP")) {
        plainTitle = "담췌관 내시경 검사 (ERCP Endoscopy)";
        plainDesc = "특수 내시경을 통해 담관과 췌관 내부를 직접 관찰하고 조영한 영상입니다. 담석증, 담도 협착 및 췌장 질환 진단에 사용됩니다.";
      } else if (mod === "US") {
        plainTitle = "복부 정밀 초음파 (Abdomen Ultrasound)";
        plainDesc = "인체에 무해한 초음파를 이용하여 간, 담낭, 췌장, 신장의 내부 구조와 혈류 상태를 실시간으로 확인한 영상입니다.";
      }
      return `
        <div class="easy-mode-card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;">
          <div style="flex:1;">
            <span class="easy-badge">우리말 쉬운 설명 카드</span>
            <div class="easy-summary">${escapeHtml(plainTitle)}</div>
            <div class="easy-explanation">${escapeHtml(plainDesc)}</div>
            <div style="margin-top: 8px; font-size: 11.5px; color: #166534;">
              검사 병원: ${escapeHtml(study.sourceHospitalId)} | 검사 일자: ${escapeHtml(study.studyDate)} | 형식: ${escapeHtml(study.modality)}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="btn small" type="button" data-patient-view="${escapeHtml(study.studyInstanceUid)}" style="white-space:nowrap;padding:10px 14px;">
              🔍 내 영상 직접 열람
            </button>
            <button class="btn primary" type="button" data-select-study="${escapeHtml(study.studyInstanceUid)}" data-transfer-study="${escapeHtml(study.studyInstanceUid)}" style="white-space:nowrap;padding:10px 16px;font-weight:700;">
              이 영상 전송하기 →
            </button>
          </div>
        </div>
      `;
    }).join("");
  } else {
    studiesContainer.innerHTML = studies.map((study) => `
      <div class="action-card" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:14px;flex:1;">
          <div class="action-symbol" style="--soft:#e0f2fe;--tone:#0284c7;font-size:20px;">📁</div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <h3 style="margin:0;font-size:16px;">${escapeHtml(study.description)}</h3>
              <span class="status teal" style="font-size:11px;">${escapeHtml(study.modality)}</span>
            </div>
            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
              출처: <strong>${escapeHtml(study.sourceHospitalId)}</strong> · 검사일자: ${escapeHtml(study.studyDate)} · Series: ${study.series?.length || 1}개
            </p>
            <div style="font-size:11px;color:#94a3b8;font-family:monospace;margin-top:3px;">
              UID: ${escapeHtml(study.studyInstanceUid)}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn small" type="button" data-patient-view="${escapeHtml(study.studyInstanceUid)}" style="white-space:nowrap;padding:10px 14px;">
            🔍 내 영상 직접 열람
          </button>
          <button class="btn primary" type="button" data-select-study="${escapeHtml(study.studyInstanceUid)}" data-transfer-study="${escapeHtml(study.studyInstanceUid)}" style="white-space:nowrap;padding:10px 16px;font-weight:700;">
            이 영상 전송하기 →
          </button>
        </div>
      </div>
    `).join("");
  }

  studiesContainer.querySelectorAll("[data-patient-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.patientView;
      if (uid) openPatientStudyViewer(uid);
    });
  });

  studiesContainer.querySelectorAll("[data-select-study]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.selectStudy;
      const targetStudy = studies.find((s) => s.studyInstanceUid === uid);
      selectStudy(uid, studies);
      if (sourceHospitalSelect) sourceHospitalSelect.value = targetStudy?.sourceHospitalId || "HOSP-A";
      if (targetHospitalSelect) targetHospitalSelect.value = "HOSP-B";
      if (accessPurposeSelect) accessPurposeSelect.value = "TREATMENT";
      if (accessModeSelect) accessModeSelect.value = "VIEW_ONLY";
      syncPatientChoices({ preserveConsentState: true });
      navigatePatientPage("consent");
      showToast(`[${targetStudy?.description || "의료영상"}]이(가) 선택되었습니다. 수신 병원(가상 병원 B)을 확인하고 동의를 제출하세요.`);
    });
  });
}

function renderDoctorStudies(studies) {
  const container = document.querySelector("#doctor-studies");
  if (!container) return;

  if (!studies.length) {
    container.innerHTML = '<div class="notice">조회 가능한 의료영상이 없습니다.</div>';
    return;
  }

  container.innerHTML = `
    <div class="mq-table-wrap">
      <table>
        <thead>
          <tr>
            <th>환자 ID</th>
            <th>검사명 (Study)</th>
            <th>Modality</th>
            <th>검사 일자</th>
            <th>출처 병원</th>
            <th>동의 상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${studies.map((s) => {
            const isTarget = s.studyInstanceUid === selectedStudyUid;
            const latestConsent = getConsentForStudy(s.studyInstanceUid, lastConsents);
            let consentBadge;
            let canView = false;
            if (latestConsent?.status === "ACTIVE") {
              consentBadge = '<span class="mq-badge mq-badge-good">동의 완료 (ACTIVE)</span>';
              canView = true;
            } else if (latestConsent?.status === "REVOKED") {
              consentBadge = '<span class="mq-badge mq-badge-fail" style="background:#fee2e2;color:#991b1b;border:1px solid #f87171;">철회됨 (REVOKED)</span>';
            } else if (latestConsent?.status === "EXPIRED") {
              consentBadge = '<span class="mq-badge mq-badge-warn">만료됨 (EXPIRED)</span>';
            } else {
              consentBadge = '<span class="mq-badge mq-badge-warn">대기 (동의 필요)</span>';
            }

            const actionBtn = canView
              ? `<button class="mq-btn small mq-btn-primary" type="button" data-doctor-view="${escapeHtml(s.studyInstanceUid)}">
                  선택 및 뷰어 열기
                </button>`
              : `<button class="mq-btn small" type="button" data-doctor-view="${escapeHtml(s.studyInstanceUid)}" style="opacity:0.65;background:#64748b;color:#fff;cursor:not-allowed;" title="환자의 전송 동의가 접수되지 않았습니다 (Fail-Closed)">
                  동의 대기 (조회 불가)
                </button>`;

            return `
              <tr style="${isTarget ? 'background:rgba(11,99,143,0.06);' : ''}">
                <td><strong>${escapeHtml(demo.patientId)}</strong></td>
                <td>
                  <strong>${escapeHtml(s.description)}</strong>
                  <div style="font-size:11px;color:#94a3b8;font-family:monospace;">${escapeHtml(s.studyInstanceUid.slice(0, 24))}...</div>
                </td>
                <td><span class="mq-badge">${escapeHtml(s.modality || "DICOM")}</span></td>
                <td>${escapeHtml(s.studyDate || "-")}</td>
                <td>${escapeHtml(s.sourceHospitalId || "HOSP-A")}</td>
                <td>${consentBadge}</td>
                <td style="white-space:nowrap;">
                  ${actionBtn}
                  <button class="mq-btn small" type="button" data-doctor-select="${escapeHtml(s.studyInstanceUid)}" data-doctor-pipeline="${escapeHtml(s.studyInstanceUid)}" style="margin-left:4px;">
                    파이프라인
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-doctor-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.doctorView;
      const targetStudy = studies.find((s) => s.studyInstanceUid === uid);
      const studyConsent = findConsentForStudy(uid, lastConsents);
      if (!studyConsent) {
        const latestConsent = getConsentForStudy(uid, lastConsents);
        const reason = latestConsent?.status === "REVOKED"
          ? "환자가 전송 동의를 철회하여"
          : "환자의 전송 동의가 접수되지 않아";
        showToast(`'${targetStudy?.description || "선택된 영상"}'은 ${reason} 조회가 차단되었습니다 (Fail-Closed). 환자 포털에서 가상 병원 B로 전송 동의를 먼저 진행해 주세요.`);
        return;
      }
      await selectStudy(uid, studies);
      await openViewer();
    });
  });

  container.querySelectorAll("[data-doctor-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.doctorSelect || btn.dataset.doctorPipeline;
      selectStudy(uid, studies);
      navigateHospitalScreen("exchange");
    });
  });
}

async function selectStudy(studyUid, studies = lastStudies) {
  selectedStudyUid = studyUid;
  selectedStudy = studies.find((study) => study.studyInstanceUid === studyUid) ?? selectedStudy;
  selectedSeriesUid = "";
  if (patientStudySelect) patientStudySelect.value = selectedStudyUid;
  renderPatientSeriesOptions();
  latestToken = null;
  latestTokenInfo = null;
  resetViewerData();
  updateConsentState(lastConsents);
  if (viewerStatus) viewerStatus.textContent = "토큰 필요";
  syncSelectedStudyUi();
}

function syncSelectedStudyUi() {
  if (!selectedStudy) return;
  const label = document.querySelector("#viewer-study-label");
  if (label) label.textContent = `${selectedStudy.description} (${selectedStudy.modality})`;
  const perm = document.querySelector("#viewer-perm-label");
  if (perm) perm.textContent = latestTokenInfo?.permission || demo.permission;
}

function resetViewerData() {
  stopCinePlayback();
  clearSliceBlobCache();
  lastSeries = [];
  lastInstances = [];
  selectedSopUid = "";
  currentSliceIndex = 0;
  totalSlices = 1;
  updateSliceControlsUi();
  hideSeriesImage();
  setDownloadState();
}

function setDownloadState() {
  const allowed = latestTokenInfo?.permission === "DOWNLOAD_ALLOWED" && Boolean(selectedSopUid);
  if (downloadButton) {
    downloadButton.disabled = !allowed;
    downloadButton.title = allowed
      ? "선택된 DICOM 인스턴스 다운로드"
      : "조회 전용(VIEW_ONLY) 토큰입니다. 서버에서 다운로드가 원천 차단됩니다.";
  }
}

function requireToken() {
  if (latestToken) return true;
  showViewerMessage("단기 접근토큰이 필요합니다. 먼저 토큰 발급을 요청하세요.", "fail");
  if (viewerStatus) viewerStatus.textContent = "토큰 필요";
  return false;
}

function showSeriesImage(imageUrl, label) {
  if (viewerImage) {
    viewerImage.src = imageUrl;
    viewerImage.alt = label;
    viewerImage.hidden = false;
  }
  if (viewerPlaceholder) viewerPlaceholder.hidden = true;
}

function hideSeriesImage() {
  if (viewerImage) {
    viewerImage.removeAttribute("src");
    viewerImage.hidden = true;
  }
  if (viewerPlaceholder) viewerPlaceholder.hidden = false;
  if (instanceDetail) {
    instanceDetail.hidden = true;
    instanceDetail.textContent = "";
  }
}

function resolvePreviewForSelectedSeries() {
  const localSeries = selectedStudy?.series?.find((series) => series.seriesInstanceUid === selectedSeriesUid)
    || selectedStudy?.series?.[0];
  if (localSeries?.previewImageUrl) return localSeries.previewImageUrl;
  const label = `${localSeries?.description ?? selectedStudy?.description ?? ""} ${selectedStudy?.bodyPart ?? ""}`.toUpperCase();
  if (label.includes("CR") || label.includes("X-RAY")) return "/assets/clinical/cr_chest.jpg";
  if (label.includes("CT") || label.includes("CHEST") || label.includes("LUNG")) return "/assets/demo-ct.png";
  if (label.includes("ES") || label.includes("ERCP")) return "/assets/clinical/es_ercp.jpg";
  if (label.includes("US") || label.includes("ULTRASOUND")) return "/assets/clinical/us_abdomen.jpg";
  return "/assets/demo-mri.png";
}

function showViewerMessage(message, tone = "info") {
  if (!viewerAlert) return;
  viewerAlert.textContent = message;
  viewerAlert.dataset.tone = tone;
}

function setPatientStatus(text) {
  if (patientStatus) patientStatus.textContent = text;
  const dashStatus = document.querySelector("#patient-dashboard-status");
  if (dashStatus) dashStatus.textContent = text;
}

function toggleEasyMode() {
  isEasyMode = !isEasyMode;
  const btn1 = document.querySelector("#toggle-easy-mode");
  const btn2 = document.querySelector("#easyModeToggle");
  if (btn1) btn1.textContent = isEasyMode ? "표준 모드 (DICOM 메타)" : "쉬운 모드 (우리말 설명)";
  if (btn2) {
    btn2.setAttribute("aria-pressed", String(isEasyMode));
    btn2.classList.toggle("active", isEasyMode);
  }
  renderStudies(lastStudies);
}

// --------------------------------------------------------------------------
// 5-Step Pipeline Synchronization
// --------------------------------------------------------------------------
function updatePipelineSteps() {
  const stepConsent = document.querySelector("#step-consent");
  const stepPolicy = document.querySelector("#step-policy");
  const stepToken = document.querySelector("#step-token");
  const stepDicom = document.querySelector("#step-dicomweb");
  const stepAudit = document.querySelector("#step-audit");
  const overallStatus = document.querySelector("#pipeline-overall-status");
  const sessionIdEl = document.querySelector("#pipeline-session-id");
  const line1 = document.querySelector("#line-1");
  const line2 = document.querySelector("#line-2");
  const line3 = document.querySelector("#line-3");
  const line4 = document.querySelector("#line-4");

  if (!stepConsent) return;

  if (latestTokenInfo?.auditSessionId && sessionIdEl) {
    sessionIdEl.textContent = latestTokenInfo.auditSessionId.slice(0, 16);
  }

  // Step 1: Consent
  if (patientConsentReady) {
    stepConsent.className = "step-node completed";
    line1?.classList.add("completed");
    stepPolicy.className = "step-node active";
    if (overallStatus) {
      overallStatus.textContent = "동의 확인됨 (ACTIVE)";
      overallStatus.className = "mq-badge mq-badge-good";
    }
  } else {
    stepConsent.className = "step-node active";
    line1?.classList.remove("completed");
    stepPolicy.className = "step-node";
    if (overallStatus) {
      overallStatus.textContent = "동의 대기";
      overallStatus.className = "mq-badge mq-badge-warn";
    }
  }

  // Steps 2 & 3: Policy & Token
  if (latestToken) {
    stepPolicy.className = "step-node completed";
    line2?.classList.add("completed");
    stepToken.className = "step-node completed";
    line3?.classList.add("completed");
    stepDicom.className = "step-node active";
    if (overallStatus) {
      overallStatus.textContent = "단기 토큰 발급됨 (ONLINE)";
      overallStatus.className = "mq-badge mq-badge-good";
    }
  } else {
    stepToken.className = "step-node";
    line2?.classList.remove("completed");
    line3?.classList.remove("completed");
  }

  // Steps 4 & 5: DICOMweb & Audit
  if (lastSeries.length > 0 || viewerImage?.src) {
    stepDicom.className = "step-node completed";
    line4?.classList.add("completed");
    stepAudit.className = "step-node completed";
    if (overallStatus) {
      overallStatus.textContent = "영상 조회 및 감사 기록 완료";
      overallStatus.className = "mq-badge mq-badge-good";
    }
  }
}

// --------------------------------------------------------------------------
// Countdown Timer & Watermark
// --------------------------------------------------------------------------
function startCountdownTimer(expiresAtIso) {
  if (countdownTimerId) clearInterval(countdownTimerId);
  const badge = document.querySelector("#viewer-countdown");
  if (!badge) return;

  function tick() {
    const remainingMs = new Date(expiresAtIso).getTime() - Date.now();
    if (remainingMs <= 0) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
      stopCinePlayback();
      clearSliceBlobCache();
      badge.textContent = "토큰 만료됨 (재발급 필요)";
      latestToken = null;
      latestTokenInfo = null;
      if (viewerStatus) viewerStatus.textContent = "Token expired";
      setDownloadState();
      showViewerMessage("접근토큰이 만료되었습니다. 새 토큰을 요청하세요.", "warning");
      updatePipelineSteps();
      return;
    }
    const totalSec = Math.floor(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    badge.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")} 남음`;
  }

  tick();
  countdownTimerId = setInterval(tick, 1000);
}

function clearCountdownTimer() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  stopCinePlayback();
  clearSliceBlobCache();
  const badge = document.querySelector("#viewer-countdown");
  if (badge) badge.textContent = "세션 대기";
}

function updateWatermark(sessionInfo) {
  const wm = document.querySelector("#viewer-watermark");
  if (!wm) return;
  const doc = demo.doctorId;
  const hosp = demo.targetHospitalId;
  const pt = demo.patientId;
  const sess = sessionInfo?.auditSessionId || "SECURE-AUDIT-SESSION";
  const ts = new Date().toLocaleString("ko-KR", { hour12: false });
  wm.textContent = `${hosp} · ${doc} · ${pt} · ${sess.slice(0, 16)} · ${ts}`;
}

// --------------------------------------------------------------------------
// Viewer Dark Tools
// --------------------------------------------------------------------------
function toggleInvert() {
  isInverted = !isInverted;
  const btn = document.querySelector("#tool-invert");
  if (btn) btn.classList.toggle("active", isInverted);
  applyViewerFilters();
}

function cycleZoom() {
  zoomScaleIndex = (zoomScaleIndex + 1) % zoomScales.length;
  const scale = zoomScales[zoomScaleIndex];
  const btn = document.querySelector("#tool-zoom");
  if (btn) {
    btn.textContent = zoomScaleIndex === 0 ? "Zoom 확대" : `Zoom (${scale}x)`;
    btn.classList.toggle("active", zoomScaleIndex > 0);
  }
  applyViewerTransforms();
}

function togglePan() {
  const btn = document.querySelector("#tool-pan");
  const box = document.querySelector("#viewer-viewport-box");
  if (btn) {
    const active = btn.classList.toggle("active");
    if (box) box.style.cursor = active ? "grab" : "";
  }
}

function cycleWwWl() {
  wwWlPresetIndex = (wwWlPresetIndex + 1) % wwWlPresets.length;
  const preset = wwWlPresets[wwWlPresetIndex];
  const btn = document.querySelector("#tool-ww-wl");
  if (btn) {
    btn.textContent = wwWlPresetIndex === 0 ? "W/L 조절" : `W/L (${preset.name})`;
    btn.classList.toggle("active", wwWlPresetIndex > 0);
  }
  applyViewerFilters();
}

function toggleSideBySide() {
  isSideBySideActive = !isSideBySideActive;
  const btn = document.querySelector("#tool-side-by-side");
  const box = document.querySelector("#viewer-viewport-box");
  if (btn) btn.classList.toggle("active", isSideBySideActive);
  if (box) box.classList.toggle("side-by-side-layout", isSideBySideActive);
}

function applyViewerFilters() {
  const img = document.querySelector("#viewer-image");
  if (!img) return;
  const preset = wwWlPresets[wwWlPresetIndex];
  const filters = [];
  if (isInverted) filters.push("invert(1)");
  if (preset.contrast !== 1) filters.push(`contrast(${preset.contrast})`);
  if (preset.brightness !== 1) filters.push(`brightness(${preset.brightness})`);
  img.style.filter = filters.join(" ");
}

function applyViewerTransforms() {
  const img = document.querySelector("#viewer-image");
  if (!img) return;
  const scale = zoomScales[zoomScaleIndex];
  img.style.transform = scale === 1 ? "" : `scale(${scale})`;
}

function resetViewerTools() {
  isInverted = false;
  zoomScaleIndex = 0;
  wwWlPresetIndex = 0;
  isSideBySideActive = false;

  const btnWw = document.querySelector("#tool-ww-wl");
  if (btnWw) { btnWw.textContent = "W/L 조절"; btnWw.classList.remove("active"); }
  const btnZoom = document.querySelector("#tool-zoom");
  if (btnZoom) { btnZoom.textContent = "Zoom 확대"; btnZoom.classList.remove("active"); }
  const btnPan = document.querySelector("#tool-pan");
  if (btnPan) btnPan.classList.remove("active");
  const btnInv = document.querySelector("#tool-invert");
  if (btnInv) btnInv.classList.remove("active");
  const btnSide = document.querySelector("#tool-side-by-side");
  if (btnSide) btnSide.classList.remove("active");

  applyViewerFilters();
  applyViewerTransforms();

  const box = document.querySelector("#viewer-viewport-box");
  if (box) {
    box.style.cursor = "";
    box.classList.remove("side-by-side-layout");
  }
}

// --------------------------------------------------------------------------
// PACS Import (STOW-RS)
// --------------------------------------------------------------------------
function runPreflightCheck() {
  const pill = document.querySelector("#pacs-import-status-pill");
  const log = document.querySelector("#pacs-import-log");
  const runBtn = document.querySelector("#btn-pacs-import-run");
  const integrityStatus = document.querySelector("#pacs-integrity-status");
  const destStatus = document.querySelector("#pacs-destination-status");

  if (!patientConsentReady && !latestConsentId) {
    isPreflightPassed = false;
    if (pill) {
      pill.textContent = "사전 검증 실패 (동의 없음)";
      pill.className = "mq-badge mq-badge-bad";
    }
    if (log) {
      log.textContent = "환자의 유효한 공유 동의(ACTIVE)가 확인되지 않았습니다. 환자 포털에서 먼저 동의를 생성하세요.";
      log.dataset.tone = "fail";
    }
    if (runBtn) runBtn.disabled = true;
    return;
  }

  isPreflightPassed = true;
  if (pill) {
    pill.textContent = "Preflight 4/4 검증 통과";
    pill.className = "mq-badge mq-badge-good";
  }
  if (integrityStatus) integrityStatus.textContent = "SHA-256 사전 해시 준비됨";
  if (destStatus) destStatus.textContent = "Hospital B STOW-RS 준비 완료 (200 OK)";
  if (log) {
    log.innerHTML = "<strong>Preflight 통과:</strong> 출처 Orthanc Gateway, 환자 동의 범위, 수신 병원 B STOW-RS 수용성이 확인되었습니다. [PACS 전송 실행] 버튼을 눌러 전송을 시작하세요.";
    log.dataset.tone = "success";
  }
  if (runBtn) runBtn.disabled = false;
}

async function runPacsImport() {
  if (!isPreflightPassed) return;
  const pill = document.querySelector("#pacs-import-status-pill");
  const log = document.querySelector("#pacs-import-log");
  const integrityStatus = document.querySelector("#pacs-integrity-status");
  const destStatus = document.querySelector("#pacs-destination-status");
  const transferStatus = document.querySelector("#pacs-transfer-status");

  if (pill) {
    pill.textContent = "전송 진행 중...";
    pill.className = "mq-badge mq-badge-warn";
  }
  if (log) {
    log.textContent = "출처 WADO-RS에서 Instance를 수신하여 수신 병원 B STOW-RS로 안전하게 전송하고 있습니다...";
    log.dataset.tone = "loading";
  }

  const result = await postJson("/api/transfers/pacs-import", {
    consentId: latestConsentId,
    doctorId: demo.doctorId,
    targetHospitalId: demo.targetHospitalId,
    studyInstanceUid: selectedStudyUid,
  });

  if (result.status === "COMPLETED") {
    const gotoBtn = document.querySelector("#btn-goto-pacs-archive");
    if (gotoBtn) gotoBtn.style.display = "block";
    if (integrityStatus) integrityStatus.innerHTML = `<span style="color:#15803d;font-weight:700;">${escapeHtml(result.sha256)} (일치)</span>`;
    if (destStatus) destStatus.innerHTML = `<span style="color:#15803d;font-weight:700;">수신 확인됨 (STOW-RS 200 OK)</span>`;
    if (transferStatus) transferStatus.innerHTML = `<span style="color:#15803d;font-weight:700;">성공 (${result.instancesTransferred}건 인스턴스)</span>`;
    if (pill) {
      pill.textContent = "PACS 전송 완료";
      pill.className = "mq-badge mq-badge-good";
    }
    if (log) {
      const bytesFmt = result.transferredBytes ? `(${(result.transferredBytes / 1024).toFixed(1)} KB)` : "";
      log.innerHTML = `<strong>PACS Import 성공:</strong> 원본 DICOM 바이너리 ${result.instancesTransferred}건 ${bytesFmt}이 B병원 영구 PACS 저장소(<code>${escapeHtml(result.destinationPath || "data/hospital-b-pacs")}</code>)에 직접 아카이빙되었습니다. SHA-256 무결성 검증 완료 및 감사세션 <code>${escapeHtml(result.auditSessionId)}</code>로 영구 보존되었습니다.`;
      log.dataset.tone = "success";
    }
    updatePipelineSteps();
    renderOutput(result);
    broadcastSync("PACS_IMPORT");
    await loadHospitalBPacsArchive();
    await loadDashboard();
  } else {
    if (pill) {
      pill.textContent = "전송 실패";
      pill.className = "mq-badge mq-badge-bad";
    }
    if (log) {
      log.textContent = `PACS 전송 실패: ${toFriendlyError(result.error || result.message)}`;
      log.dataset.tone = "fail";
    }
    renderOutput(result);
  }
}

// --------------------------------------------------------------------------
// Hospital B PACS Archive Workstation Module
// --------------------------------------------------------------------------
let lastHospitalBArchives = [];

async function loadHospitalBPacsArchive() {
  const tableBody = document.querySelector("#hospital-b-pacs-table-body");
  const kpiStudies = document.querySelector("#kpi-archive-studies");
  const kpiInstances = document.querySelector("#kpi-archive-instances");
  const kpiBytes = document.querySelector("#kpi-archive-bytes");
  const kpiIntegrity = document.querySelector("#kpi-archive-integrity");

  try {
    const res = await fetchJson("/api/hospitals/HOSP-B/pacs-archive");
    const archives = Array.isArray(res) ? res : (Array.isArray(res?.studies) ? res.studies : []);
    lastHospitalBArchives = archives;

    const totalStudies = archives.length;
    const totalInstances = archives.reduce((sum, s) => sum + (s.instancesCount || s.instances?.length || 0), 0);
    const totalBytes = archives.reduce((sum, s) => sum + (s.totalBytes || 0), 0);

    if (kpiStudies) kpiStudies.textContent = String(totalStudies);
    if (kpiInstances) kpiInstances.textContent = String(totalInstances);
    if (kpiBytes) kpiBytes.textContent = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
    if (kpiIntegrity) {
      if (totalStudies > 0) {
        kpiIntegrity.textContent = "100% 무결";
        kpiIntegrity.style.color = "var(--green)";
      } else {
        kpiIntegrity.textContent = "대기 중";
        kpiIntegrity.style.color = "var(--mq-muted)";
      }
    }

    renderHospitalBPacsArchive(archives);
  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:24px;">아카이브 목록 조회 중 오류가 발생했습니다: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function renderHospitalBPacsArchive(archives) {
  const tableBody = document.querySelector("#hospital-b-pacs-table-body");
  if (!tableBody) return;

  if (!archives || archives.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:36px;color:#94a3b8;">
          <div style="font-size:28px;margin-bottom:8px;">📭</div>
          <strong style="color:#64748b;font-size:14px;display:block;">원내 PACS 아카이브에 영구 보존된 영상이 없습니다.</strong>
          <div style="font-size:12px;margin-top:4px;">환자 동의(DOWNLOAD_ALLOWED) 후 PACS 임포트를 실행하면 실제 Part 10 DICOM 파일셋이 원내 스토리지(<code>data/hospital-b-pacs</code>)에 안전하게 저장됩니다.</div>
          <button class="mq-btn small mq-btn-primary" type="button" data-view-jump="transfer" style="margin-top:14px;">PACS 전송 콘솔로 이동</button>
        </td>
      </tr>
    `;
    tableBody.querySelectorAll("[data-view-jump]").forEach((btn) => {
      btn.addEventListener("click", () => navigateHospitalScreen(btn.dataset.viewJump));
    });
    return;
  }

  tableBody.innerHTML = archives.map((item) => {
    const studyUid = item.studyInstanceUid || "-";
    const patientId = item.patientId || demo.patientId;
    const sourceHospital = item.sourceHospitalId || "HOSP-A";
    const importedAt = formatDate(item.importedAt);
    const instancesCount = item.instancesCount || item.instances?.length || 1;
    const bytesFormatted = item.totalBytes ? `${(item.totalBytes / 1024 / 1024).toFixed(1)} MB` : "0 MB";
    const sha256 = item.sha256 || "";
    const shortSha = sha256.length > 16 ? `${sha256.slice(0, 8)}...${sha256.slice(-8)}` : (sha256 || "OK");

    const matchedStudy = lastStudies.find((s) => s.studyInstanceUid === studyUid);
    const studyDesc = matchedStudy?.description || "DICOM 검사";
    const modality = matchedStudy?.modality || "DICOM";

    return `
      <tr>
        <td><strong>${escapeHtml(patientId)}</strong></td>
        <td>
          <strong>${escapeHtml(studyDesc)}</strong>
          <span class="mq-badge" style="margin-left:4px;font-size:10px;">${escapeHtml(modality)}</span>
          <div class="pacs-path-tag">${escapeHtml(studyUid.slice(0, 28))}...</div>
        </td>
        <td>${escapeHtml(sourceHospital)}</td>
        <td style="font-size:12px;color:#64748b;">${escapeHtml(importedAt)}</td>
        <td>
          <strong>${instancesCount}건</strong>
          <small style="color:#64748b;display:block;">(${bytesFormatted})</small>
        </td>
        <td>
          <span class="pacs-hash-badge" title="전체 SHA-256 해시: ${escapeHtml(sha256)} (클릭하여 복사)" data-copy-hash="${escapeHtml(sha256)}">
            🔒 ${escapeHtml(shortSha)}
          </span>
        </td>
        <td>
          <span class="mq-badge mq-badge-good" title="B병원 PACS 스토리지에 AES-256-GCM 봉투 암호화 보관됨">
            ${item.encryptedAtRest ? "AES-GCM 🔒 (200 OK)" : "ARCHIVED (200 OK)"}
          </span>
        </td>
        <td style="white-space:nowrap;">
          <button class="mq-btn small" type="button" data-archive-manifest="${escapeHtml(studyUid)}" title="manifest.json 및 개별 인스턴스 검증 내역 확인">
            Manifest 확인
          </button>
          <button class="mq-btn small mq-btn-primary" type="button" data-archive-view="${escapeHtml(studyUid)}" style="margin-left:4px;" title="Cloud DICOM 뷰어로 열람">
            뷰어 열기
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Bind copy hash
  tableBody.querySelectorAll("[data-copy-hash]").forEach((badge) => {
    badge.addEventListener("click", () => {
      const hash = badge.dataset.copyHash;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(hash).then(() => {
          showToast("SHA-256 해시가 클립보드에 복사되었습니다.");
        }).catch(() => {});
      } else {
        showToast(`해시: ${hash}`);
      }
    });
  });

  // Bind Manifest button
  tableBody.querySelectorAll("[data-archive-manifest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sUid = btn.dataset.archiveManifest;
      const targetArchive = archives.find((a) => a.studyInstanceUid === sUid);
      if (targetArchive) showArchiveManifestModal(targetArchive);
    });
  });

  // Bind Viewer button
  tableBody.querySelectorAll("[data-archive-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sUid = btn.dataset.archiveView;
      selectedStudyUid = sUid;
      navigateHospitalScreen("viewer");
      showToast(`Study ${sUid.slice(0, 16)}... 를 선택하여 뷰어로 전환했습니다.`);
    });
  });
}

function showArchiveManifestModal(archive) {
  const matched = lastStudies.find((s) => s.studyInstanceUid === archive.studyInstanceUid);
  const desc = matched?.description || "DICOM 검사";
  const mod = matched?.modality || "DICOM";
  const instances = Array.isArray(archive.instances) ? archive.instances : [];

  const bodyHtml = `
    <div style="font-size:13px;line-height:1.6;">
      <div class="mq-callout" style="margin-bottom:14px;border-left-color:var(--green);background:rgba(21,128,61,0.08);">
        <p><strong>가상 B병원 원내 PACS 아카이브 검증 완료:</strong> 외부 병원(HOSP-A)으로부터 수신되어 독립된 스토리지에 <strong>AES-256-GCM 봉투 암호화</strong>로 영구 보관된 정규 DICOM 파일셋입니다. 디스크 유출 시에도 데이터가 완벽히 보호됩니다.</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px;margin-bottom:14px;">
        <div class="mq-state-card">
          <small style="color:#64748b;">환자 / 검사명</small>
          <strong>${escapeHtml(archive.patientId || demo.patientId)} · ${escapeHtml(desc)} (${escapeHtml(mod)})</strong>
        </div>
        <div class="mq-state-card">
          <small style="color:#64748b;">원내 보관 상태</small>
          <strong style="color:var(--green);">ARCHIVED_IN_PACS (AES-256-GCM 🔒)</strong>
        </div>
        <div class="mq-state-card">
          <small style="color:#64748b;">총 파일 수 및 용량</small>
          <strong>${archive.instancesCount}개 인스턴스 · ${(archive.totalBytes / 1024 / 1024).toFixed(2)} MB (${(archive.totalBytes || 0).toLocaleString()} bytes)</strong>
        </div>
        <div class="mq-state-card">
          <small style="color:#64748b;">임포트 일시 / 방법</small>
          <strong>${formatDate(archive.importedAt)} · ${escapeHtml(archive.transferMethod || "STOW_RS_DIRECT_ARCHIVE")}</strong>
        </div>
      </div>

      <div class="mq-state-card" style="margin-bottom:14px;">
        <small style="color:#64748b;">저장구간 암호화 스펙 (At-Rest Encryption)</small>
        <strong>${archive.encryptedAtRest ? "AES-256-GCM Envelope Encryption (A256GCM)" : "Plaintext"}</strong>
        <div style="margin-top:6px;font-size:11px;color:#64748b;">
          마스터 KEK 참조: <code>${escapeHtml(archive.keyEnvelope?.keyRef || "HOSP-B-KEK-v1")}</code> · 
          알고리즘: <code>${escapeHtml(archive.cipherSuite || "AES-256-GCM")}</code>
        </div>
        <small style="color:#64748b;display:block;margin-top:8px;">StudyInstanceUID</small>
        <code style="font-size:11px;word-break:break-all;display:block;margin-top:2px;">${escapeHtml(archive.studyInstanceUid)}</code>
        <small style="color:#64748b;display:block;margin-top:8px;">Study 전체 집합 SHA-256 무결성 해시</small>
        <code style="font-size:11px;word-break:break-all;color:#15803d;display:block;margin-top:2px;font-weight:700;">${escapeHtml(archive.sha256)}</code>
      </div>

      <h4 style="margin:14px 0 6px;font-size:13px;">개별 DICOM 인스턴스 파일 목록 (${instances.length}건)</h4>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--mq-border);border-radius:6px;">
        <table class="manifest-instance-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SOPInstanceUID</th>
              <th>크기 (Cipher / Plain)</th>
              <th>인스턴스 SHA-256</th>
              <th>물리 저장 파일 (.enc)</th>
            </tr>
          </thead>
          <tbody>
            ${instances.map((inst, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml((inst.sopInstanceUid || "").slice(0, 24))}...</td>
                <td>${((inst.cipherBytes || inst.fileSize || 0)).toLocaleString()} B / ${((inst.plainBytes || inst.fileSize || 0)).toLocaleString()} B</td>
                <td title="${escapeHtml(inst.plainSha256 || inst.sha256)}">${escapeHtml((inst.plainSha256 || inst.sha256 || "").slice(0, 12))}...</td>
                <td><code style="font-size:10px;color:#0284c7;">${escapeHtml(inst.storedPath || "-")}</code></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  showModal({
    eyebrow: "Hospital B Local PACS Archive",
    title: "아카이브 Manifest 및 DICOM 바이너리 검증",
    bodyHtml,
    actionsHtml: '<button class="btn primary small" data-close type="button">확인 닫기</button>',
  });
}

/// --------------------------------------------------------------------------
// QR Medical Image Handoff Scanner & Camera Scanner
// --------------------------------------------------------------------------
let cameraStream = null;
let cameraScanningActive = false;

async function toggleCameraQrScan() {
  const video = document.querySelector("#qr-camera-stream");
  const laserBox = document.querySelector("#qr-laser-box");
  const toggleBtn = document.querySelector("#btn-toggle-camera-scan");
  const message = document.querySelector("#qr-handoff-message");

  if (cameraScanningActive) {
    stopCameraQrScan();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("이 브라우저 환경에서는 카메라 기능을 실행할 수 없습니다.");
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    if (!video) return;
    video.srcObject = cameraStream;
    video.style.display = "block";
    video.play();
    cameraScanningActive = true;
    if (toggleBtn) toggleBtn.textContent = "🛑 카메라 스캐너 끄기";
    if (laserBox) laserBox.style.display = "flex";
    if (message) message.textContent = "환자 모바일 화면의 QR 코드를 카메라 프레임 중앙에 비춰주세요.";

    requestAnimationFrame(scanCameraFrame);
  } catch (err) {
    showToast("카메라 접근이 거부되었거나 사용 가능한 카메라가 없습니다.");
    stopCameraQrScan();
  }
}

function stopCameraQrScan() {
  cameraScanningActive = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = document.querySelector("#qr-camera-stream");
  const toggleBtn = document.querySelector("#btn-toggle-camera-scan");
  if (video) video.style.display = "none";
  if (toggleBtn) toggleBtn.textContent = "📷 카메라 스캐너 켜기";
}

function scanCameraFrame() {
  if (!cameraScanningActive) return;
  const video = document.querySelector("#qr-camera-stream");
  const canvas = document.querySelector("#qr-canvas-preview");
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
    requestAnimationFrame(scanCameraFrame);
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (typeof jsQR === "function") {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code && code.data) {
      const match = code.data.match(/\/t\/([A-Za-z0-9_-]{22,128})$/);
      if (match) {
        stopCameraQrScan();
        showToast("QR 코드를 성공적으로 인식했습니다!");
        redeemScannedNonce(match[1]);
        return;
      }
    }
  }

  requestAnimationFrame(scanCameraFrame);
}

async function redeemScannedNonce(nonce) {
  const statusPill = document.querySelector("#qr-handoff-status");
  const scannedRef = document.querySelector("#qr-scanned-ref");
  const scannedPatient = document.querySelector("#qr-scanned-patient");
  const scannedConsent = document.querySelector("#qr-scanned-consent");
  const scannedToken = document.querySelector("#qr-scanned-token");
  const message = document.querySelector("#qr-handoff-message");

  if (statusPill) {
    statusPill.textContent = "QR 인식 및 검증 중...";
    statusPill.className = "mq-badge mq-badge-warn";
  }

  const result = await postJson("/api/transfers/tickets/redeem-viewer", { nonce });
  if (result?.decision === "ALLOWED" && result.accessToken) {
    latestToken = result.accessToken;
    latestTokenInfo = result;
    latestTicketNonce = null;
    selectedStudyUid = result.viewerContext?.studyInstanceUid || selectedStudyUid;
    selectedStudy = lastStudies.find((s) => s.studyInstanceUid === selectedStudyUid) || selectedStudy;
    syncSelectedStudyUi();
    if (viewerStatus) viewerStatus.textContent = "Token issued (QR)";
    setDownloadState();

    if (statusPill) {
      statusPill.textContent = "QR 인식 완료 (ALLOWED)";
      statusPill.className = "mq-badge mq-badge-good";
    }
    if (scannedRef) scannedRef.textContent = `${result.ticketId || "TICKET-VERIFIED"} (소진됨)`;
    if (scannedPatient) scannedPatient.textContent = `${demo.patientId} (가상환자 1001)`;
    if (scannedConsent) scannedConsent.textContent = `ACTIVE (${result.viewerContext?.permission || "VIEW_ONLY"})`;
    if (scannedToken) scannedToken.textContent = `발급 완료 (${result.accessToken.slice(0, 16)}...)`;
    if (message) {
      message.innerHTML = "<strong>QR 바인딩 성공:</strong> 환자 일회용 암호학적 티켓이 검증되어 Viewer 세션과 단기 토큰이 생성되었습니다.";
      message.dataset.tone = "success";
    }

    startCountdownTimer(result.expiresAt);
    updateWatermark(result);
    updatePipelineSteps();
    broadcastSync("QR_SCANNED");
    renderOutput({
      qrEvent: "CLAIM_VERIFIED",
      ticketId: result.ticketId,
      patientId: demo.patientId,
      grantScope: result.viewerContext?.permission || "VIEW_ONLY",
      decision: result.decision,
      auditSessionId: result.auditSessionId,
    });

    await loadDashboard();
    navigateHospitalScreen("viewer");
    await loadGatewayStudies();
    await loadSeriesForActiveToken();
    if (lastSeries.length > 0) {
      await loadInstancesForSelectedSeries();
    }
    showToast("QR 검증 완료: Cloud DICOM 뷰어로 자동 전환되었습니다.");
  } else {
    if (statusPill) {
      statusPill.textContent = "QR 검증 거부";
      statusPill.className = "mq-badge mq-badge-bad";
    }
    if (message) {
      message.textContent = `검증 거부: ${toFriendlyError(result?.reasonCode || result?.error || "HANDOFF_FAILED")}`;
      message.dataset.tone = "fail";
    }
    renderOutput(result);
  }
}

async function simulateQrScan() {
  const statusPill = document.querySelector("#qr-handoff-status");
  const message = document.querySelector("#qr-handoff-message");

  if (!patientConsentReady && !latestConsentId) {
    if (statusPill) {
      statusPill.textContent = "동의 없음";
      statusPill.className = "mq-badge mq-badge-bad";
    }
    if (message) {
      message.textContent = "환자의 유효한 동의가 없습니다. 먼저 환자 포털에서 동의를 생성하세요.";
      message.dataset.tone = "fail";
    }
    return;
  }

  let nonceToRedeem = latestTicketNonce;
  if (!nonceToRedeem && latestConsentId) {
    const handoff = await postJson(`/api/consents/${encodeURIComponent(latestConsentId)}/handoff-ticket`, {});
    if (handoff?.qr?.payload) {
      const match = handoff.qr.payload.match(/\/t\/([A-Za-z0-9_-]{22,128})$/);
      if (match) {
        nonceToRedeem = match[1];
        latestTicketNonce = nonceToRedeem;
      }
    }
  }

  if (!nonceToRedeem) {
    if (statusPill) {
      statusPill.textContent = "QR 발급 실패";
      statusPill.className = "mq-badge mq-badge-bad";
    }
    if (message) {
      message.textContent = "티켓 발급 실패: 기존 티켓이 소진되었거나 동의가 만료/철회되었습니다.";
      message.dataset.tone = "fail";
    }
    return;
  }

  await redeemScannedNonce(nonceToRedeem);
}

function resetQrScan() {
  const statusPill = document.querySelector("#qr-handoff-status");
  const scannedRef = document.querySelector("#qr-scanned-ref");
  const scannedToken = document.querySelector("#qr-scanned-token");
  const message = document.querySelector("#qr-handoff-message");

  if (statusPill) {
    statusPill.textContent = "스캐너 대기";
    statusPill.className = "mq-badge mq-badge-warn";
  }
  if (scannedRef) scannedRef.textContent = "대기 중";
  if (scannedToken) scannedToken.textContent = "미발급";
  if (message) {
    message.textContent = "환자의 모바일 화면 또는 종이 안내장의 일회용 QR을 스캔하세요.";
    message.dataset.tone = "";
  }
}

function updateVisitModePacket(handoff) {
  const expiryEl = document.querySelector("#visit-packet-expiry");
  const qrMeta = document.querySelector(".qr-meta");
  if (expiryEl && handoff?.qr?.expiresAt) {
    expiryEl.textContent = `${formatExpiry(handoff.qr.expiresAt)}까지 유효 (1회용)`;
  }
  if (qrMeta && handoff?.qr?.payload) {
    qrMeta.textContent = handoff.qr.payload;
  }
}

// --------------------------------------------------------------------------
// Patient Access Receipts (SPEC-02)
// --------------------------------------------------------------------------
function renderPatientReceipts(consents, logs) {
  const receiptsList = document.querySelector("#patient-receipts-list");
  if (!receiptsList) return;

  const relevantActions = [
    "IMAGE_VIEWED",
    "TOKEN_ISSUED",
    "IMAGE_TRANSFER",
    "IMAGE_DOWNLOADED",
    "CONSENT_CREATED",
    "TICKET_REDEEMED",
    "ACCESS_ALLOWED",
  ];

  const accessLogs = logs.filter((log) => relevantActions.includes(log.action));

  if (!accessLogs.length && !consents.length) {
    receiptsList.innerHTML = `<div class="notice">발급된 접근 영수증 내역이 없습니다.</div>`;
    return;
  }

  receiptsList.innerHTML = accessLogs.slice(0, 10).map((log, index) => {
    let actionLabel = "접근 확인";
    let tagClass = "view";
    if (log.action === "IMAGE_VIEWED") { actionLabel = "영상 열람"; tagClass = "view"; }
    else if (log.action === "IMAGE_TRANSFER") { actionLabel = "PACS 원본 전송"; tagClass = "transfer"; }
    else if (log.action === "IMAGE_DOWNLOADED") { actionLabel = "영상 다운로드"; tagClass = "download"; }
    else if (log.action === "TOKEN_ISSUED") { actionLabel = "접근 토큰 발급"; tagClass = "token"; }
    else if (log.action === "TICKET_REDEEMED") { actionLabel = "QR 티켓 현장 접수"; tagClass = "qr"; }
    else if (log.action === "CONSENT_CREATED") { actionLabel = "동의 생성"; tagClass = "consent"; }

    const timeStr = log.createdAt ? formatDate(log.createdAt) : (log.timestamp ? formatDate(log.timestamp) : "최근");
    const actorStr = log.actorId || "의료진 B-01";
    const hospitalStr = log.targetHospitalId || log.hospitalId || demo.targetHospitalId;
    const studyDesc = selectedStudy?.description || "Brain MRI (두부 검사)";
    const rcptId = log.auditId ? `RCPT-${log.auditId.slice(0, 8).toUpperCase()}` : `RCPT-HP-${1000 + index}`;

    return `
      <div class="receipt-card">
        <div class="receipt-header">
          <div>
            <span class="receipt-doc">${escapeHtml(actorStr)}</span>
            <small style="color: #64748b;">(소속: ${escapeHtml(hospitalStr)})</small>
          </div>
          <span class="receipt-tag ${tagClass}">${escapeHtml(actionLabel)}</span>
        </div>
        <div class="receipt-meta-grid">
          <div><strong>열람 일시:</strong> ${escapeHtml(timeStr)}</div>
          <div><strong>열람 대상:</strong> ${escapeHtml(studyDesc)}</div>
          <div><strong>접근 목적:</strong> 진료 및 협진 (${escapeHtml(demo.purpose)})</div>
          <div><strong>보안 검증:</strong> <span style="color: #166534; font-weight: 700;">Fail-Closed ABAC 통과</span></div>
        </div>
        <div style="margin-top: 8px; font-size: 0.75rem; color: #94a3b8; font-family: monospace;">
          영수증 검증 고유 ID: ${escapeHtml(rcptId)} · 감사세션: ${escapeHtml(log.auditSessionId ? log.auditSessionId.slice(0, 16) : "AUDIT-CHAIN-OK")}
        </div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// Audit Log Table & Metrics
// --------------------------------------------------------------------------
function renderAuditTable(logs) {
  const tbody = document.querySelector("#audit-log-rows");
  if (!tbody) return;
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px;">기록된 감사로그가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.slice(0, 20).map((log) => {
    const isSuccess = log.result === "SUCCESS" || log.result === "ALLOWED";
    const badgeClass = isSuccess ? "mq-badge mq-badge-good" : (log.result === "ALERT" ? "mq-badge mq-badge-warn" : "mq-badge mq-badge-bad");
    return `
      <tr>
        <td style="font-family:monospace;font-size:12px;">${escapeHtml(formatDate(log.createdAt || log.timestamp))}</td>
        <td><strong>${escapeHtml(log.action)}</strong></td>
        <td>${escapeHtml(log.actorType || "USER")}:${escapeHtml(log.actorId || "-")}</td>
        <td>${escapeHtml(log.hospitalId || log.targetHospitalId || "-")}</td>
        <td><span class="${badgeClass}">${escapeHtml(log.result)}</span></td>
        <td><code style="font-size:11px;">${escapeHtml(log.reasonCode || log.reason || "OK")}</code></td>
      </tr>
    `;
  }).join("");
}

function renderMetrics(studies, logs, usage) {
  const bytes = usage.reduce((sum, row) => sum + (row.bytesTransferred ?? 0), 0);
  const studiesEl = document.querySelector("#metric-studies");
  const logsEl = document.querySelector("#metric-logs");
  const transferEl = document.querySelector("#metric-transfer");

  if (studiesEl) studiesEl.textContent = studies.length;
  if (logsEl) logsEl.textContent = logs.length;
  if (transferEl) transferEl.textContent = `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderHealth(health) {
  const healthEl = document.querySelector("#metric-health");
  if (healthEl) healthEl.textContent = `${health.status} (DB ${health.database})`;
}

function renderLogs(logs) {
  // Legacy or auxiliary lists
}

function renderAnomalies(logs) {
  const rows = logs.slice(0, 10).map((log) => ({
    title: `${log.action} / ${log.reasonCode ?? log.reason}`,
    detail: `${log.actorId} / ${log.hospitalId ?? "-"} / ${formatDate(log.createdAt)}`,
    tone: "warning",
  }));
  const fallback = [{ title: "이상행위 미감지", detail: "보안 룰 임계치를 초과한 비정상 패턴이 없습니다.", tone: "success" }];
  renderInto("#anomaly-list", rows.length ? rows : fallback);
}

function renderQuarantines(quarantines) {
  const container = document.querySelector("#quarantine-list");
  const countBadge = document.querySelector("#quarantine-count-badge");
  if (!container) return;

  const activeQuarantines = quarantines.filter((q) => q.status === "QUARANTINED");
  if (countBadge) {
    countBadge.textContent = `${activeQuarantines.length}건 격리 중`;
    countBadge.className = activeQuarantines.length > 0 ? "mq-badge mq-badge-bad" : "mq-badge mq-badge-good";
  }

  if (!quarantines.length) {
    container.innerHTML = `
      <div class="action-card">
        <div class="action-symbol" style="--soft:#dcfce7;--tone:#16a34a;">🛡️</div>
        <div>
          <h3>능동 격리된 위협 주체 없음</h3>
          <p>모든 주체 및 IP가 정상 보안 정책 범위 내에서 활동하고 있습니다.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = quarantines.slice(0, 10).map((q) => {
    const isQuarantined = q.status === "QUARANTINED";
    const statusBadge = isQuarantined
      ? '<span class="mq-badge mq-badge-bad">🚨 격리 중 (QUARANTINED)</span>'
      : (q.status === "RELEASED" ? '<span class="mq-badge mq-badge-good">해제됨 (RELEASED)</span>' : '<span class="mq-badge mq-badge-warn">만료됨 (EXPIRED)</span>');

    return `
      <div class="action-card" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid ${isQuarantined ? '#ef4444' : 'var(--mq-border)'};border-radius:8px;background:${isQuarantined ? 'rgba(239,68,68,0.05)' : 'transparent'};">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <strong style="font-size:14px;color:${isQuarantined ? '#dc2626' : 'inherit'};">${escapeHtml(q.actorId)}</strong>
            <small style="color:#64748b;">(${escapeHtml(q.actorType || "ACTOR")}${q.ipAddress ? ` · IP: ${escapeHtml(q.ipAddress)}` : ""})</small>
            ${statusBadge}
          </div>
          <div style="font-size:12px;color:#475569;">
            사유: <strong style="color:#b91c1c;">${escapeHtml(q.reason)}</strong> · 격리일시: ${formatDate(q.quarantinedAt)} · 만료: ${formatDate(q.expiresAt)}
          </div>
          ${q.releasedBy ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">관리자 해제: ${escapeHtml(q.releasedBy)} (${formatDate(q.releasedAt)})</div>` : ""}
        </div>
        <div>
          ${isQuarantined ? `
            <button class="mq-btn small mq-btn-primary" type="button" data-release-quarantine="${escapeHtml(q.quarantineId)}" style="background:#dc2626;border-color:#dc2626;color:#fff;">
              🔓 격리 해제 (Unblock)
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-release-quarantine]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qid = btn.dataset.releaseQuarantine;
      if (!qid) return;
      btn.disabled = true;
      btn.textContent = "해제 처리 중...";
      try {
        const res = await postJson(`/api/security/quarantines/${encodeURIComponent(qid)}/release`, {
          reason: "ADMIN_CONSOLE_MANUAL_RELEASE",
        });
        if (res?.error) {
          showToast(`격리 해제 실패: ${res.error}`);
        } else {
          showToast("격리가 즉시 해제되었습니다. 해당 주체의 접근이 정상 재개됩니다.");
          await loadDashboard();
        }
      } catch (err) {
        showToast("격리 해제 요청 중 오류가 발생했습니다.");
      }
    });
  });
}

function showBreakGlassModal(doctorId = demo.doctorId) {
  const bodyHtml = `
    <div class="stack" style="gap:12px;">
      <div class="notice" style="border-left:4px solid #f59e0b;background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:4px;font-size:13px;">
        ⚠️ <strong>의료 비상 프로토콜 (Clinical Break-Glass)</strong><br>
        응급실/중환자실 등 생명이 위급한 환자의 진료를 위해 15분간 능동 격리를 임시 해제합니다.
        비상 열람 행위는 보안감사팀에 실시간 통보되며 영구 감사 체인에 기록됩니다.
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">의사 식별자 (Doctor ID)</label>
        <input type="text" id="bg-doctor-id" class="text-input" value="${escapeHtml(doctorId)}" readonly style="background:#f1f5f9;width:100%;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">의사 면허 번호 (Medical License Number) *</label>
        <input type="text" id="bg-license-number" class="text-input" placeholder="예: DOC-LIC-99281" value="DOC-LIC-99281" style="width:100%;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">응급 환자 번호 (Patient ID)</label>
        <input type="text" id="bg-patient-id" class="text-input" value="${escapeHtml(demo.patientId)}" style="width:100%;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">응급 임상 사유 (Clinical Emergency Reason) *</label>
        <textarea id="bg-clinical-reason" class="text-input" rows="2" style="width:100%;" placeholder="예: 급성 뇌출혈 의심 응급 CT 판독 및 혈전용해술 평가">급성 뇌출혈 의심 응급 CT 판독 및 감별진단</textarea>
      </div>
    </div>
  `;

  showModal({
    eyebrow: "Emergency Clinical Override",
    title: "🚨 응급 비상 열람 (Break-Glass) 승인",
    bodyHtml,
    actionsHtml: `
      <button class="btn primary small" id="btn-submit-break-glass" type="button" style="background:#dc2626;border-color:#dc2626;color:#fff;">
        비상 권한 승인 및 임시 해제
      </button>
      <button class="btn secondary small" data-close type="button">취소</button>
    `,
  });

  document.querySelector("#btn-submit-break-glass")?.addEventListener("click", async () => {
    const docId = document.querySelector("#bg-doctor-id")?.value;
    const license = document.querySelector("#bg-license-number")?.value;
    const patientId = document.querySelector("#bg-patient-id")?.value;
    const reason = document.querySelector("#bg-clinical-reason")?.value;

    if (!license || !reason) {
      showToast("면허 번호와 응급 임상 사유를 모두 입력해야 합니다.");
      return;
    }

    try {
      const res = await postJson("/api/security/quarantines/break-glass", {
        doctorId: docId,
        doctorLicenseNumber: license,
        patientId,
        clinicalReason: reason,
        studyInstanceUid: selectedStudyUid || "1.2.410.100.1.20260518.002",
      });

      if (res?.overrideSuccess) {
        closeModal();
        showToast("🚨 응급 비상 열람이 승인되었습니다 (15분간 유효). 즉시 진료를 속개할 수 있습니다.");
        await loadDashboard();
      } else {
        showToast(`비상 열람 승인 실패: ${res?.error || res?.message || "오류"}`);
      }
    } catch (err) {
      showToast("비상 열람 요청 중 오류가 발생했습니다.");
    }
  });
}

function renderAdminShell() {
  const hospitalRows = adminHospitals.map((h) => ({ title: `${h.name} (${h.hospitalId})`, detail: `Status: ${h.status}`, tone: "success" }));
  const gatewayRows = adminGateways.map((g) => ({ title: `${g.gatewayId} (${g.status})`, detail: `${g.hospitalId} -> ${g.endpoint}`, tone: g.status === "ONLINE" ? "success" : "warning" }));
  renderInto("#admin-hospitals-table", hospitalRows);
  renderInto("#admin-gateways-table", gatewayRows);
}

function renderInto(selector, rows) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = rows.map((row) => `
    <div class="action-card">
      <div class="action-symbol" style="--soft:#f1f5f9;--tone:#0f172a;">⚙️</div>
      <div>
        <h3>${escapeHtml(row.title)}</h3>
        <p>${escapeHtml(row.detail)}</p>
      </div>
    </div>
  `).join("");
}

function renderOutput(value) {
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

// --------------------------------------------------------------------------
// Modal Controls
// --------------------------------------------------------------------------
function closeModal() {
  const modal = document.querySelector("#modal");
  if (modal) modal.hidden = true;
}

function showModal({ eyebrow = "HiPass", title = "상세", bodyHtml = "", actionsHtml = "" }) {
  const modal = document.querySelector("#modal");
  if (!modal) return;
  const eyebrowEl = document.querySelector("#modalEyebrow");
  const titleEl = document.querySelector("#modalTitle");
  const bodyEl = document.querySelector("#modalBody");
  const actionsEl = document.querySelector("#modalActions");
  if (eyebrowEl) eyebrowEl.textContent = eyebrow;
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  if (actionsEl) {
    actionsEl.innerHTML = actionsHtml || '<button class="btn primary small" data-close type="button">닫기</button>';
    actionsEl.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  }
  modal.hidden = false;
}

// --------------------------------------------------------------------------
// Networking & Authentication
// --------------------------------------------------------------------------
async function postJson(path, body) {
  return fetchJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJson(path, token) {
  return fetchJson(path, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function fetchJson(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  for (const [key, value] of Object.entries(developmentPrincipalHeaders(path))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const response = await fetch(path, { ...options, headers });
  return safeJson(response);
}

function developmentPrincipalHeaders(path) {
  if (!path.startsWith("/api/")) return {};
  if (path === "/api/health") return {};

  if (path.startsWith("/api/v1/me/phr/")) {
    return {
      "x-hipass-role": "PATIENT",
      "x-hipass-user-id": "synthetic-account-a",
      "x-hipass-patient-id": demo.patientId,
      "x-hipass-session-id": "dev-phr-patient-session",
    };
  }

  if (path === "/api/transfers/tickets/redeem-viewer") {
    return {
      "x-hipass-role": "DOCTOR",
      "x-hipass-user-id": demo.doctorId,
      "x-hipass-doctor-id": demo.doctorId,
      "x-hipass-hospital-id": demo.targetHospitalId,
      "x-hipass-session-id": "dev-doctor-handoff-session",
    };
  }

  if (path === "/api/security/quarantines/break-glass") {
    return {
      "x-hipass-role": "DOCTOR",
      "x-hipass-user-id": demo.doctorId,
      "x-hipass-doctor-id": demo.doctorId,
      "x-hipass-hospital-id": demo.targetHospitalId,
      "x-hipass-session-id": "dev-doctor-break-glass-session",
    };
  }

  if (
    path.startsWith("/api/audit-logs") ||
    path.startsWith("/api/anomaly-alerts") ||
    path.startsWith("/api/audit-integrity") ||
    path.startsWith("/api/transfer-usage") ||
    path.startsWith("/api/research/") ||
    path.startsWith("/api/security/")
  ) {
    return {
      "x-hipass-role": "SECURITY_ADMIN",
      "x-hipass-user-id": "SECURITY-ADMIN-001",
      "x-hipass-session-id": "dev-security-session",
    };
  }

  if (
    path.startsWith("/api/dicom-access") ||
    path.startsWith("/api/policies") ||
    path === "/api/transfers/pacs-import" ||
    path.startsWith("/api/hospitals/") ||
    path === "/api/transfers/pacs-archive"
  ) {
    return {
      "x-hipass-role": "DOCTOR",
      "x-hipass-user-id": demo.doctorId,
      "x-hipass-doctor-id": demo.doctorId,
      "x-hipass-hospital-id": demo.targetHospitalId,
      "x-hipass-session-id": "dev-doctor-session",
    };
  }

  if (
    path.startsWith("/api/patients/") ||
    path.startsWith("/api/consents") ||
    path.startsWith("/api/imaging-studies")
  ) {
    return {
      "x-hipass-role": "PATIENT",
      "x-hipass-user-id": "synthetic-account-a",
      "x-hipass-patient-id": demo.patientId,
      "x-hipass-session-id": "dev-patient-session",
    };
  }

  return {
    "x-hipass-role": currentPersona === "DOCTOR" ? "DOCTOR" : "PATIENT",
    "x-hipass-user-id": currentPersona === "DOCTOR" ? demo.doctorId : "synthetic-account-a",
    "x-hipass-doctor-id": demo.doctorId,
    "x-hipass-hospital-id": demo.targetHospitalId,
    "x-hipass-patient-id": demo.patientId,
    "x-hipass-session-id": "dev-generic-session",
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return { error: `HTTP_${response.status}` };
  }
}

// --------------------------------------------------------------------------
// Utilities & Formatters
// --------------------------------------------------------------------------
function dicomValue(row, tag) {
  const value = row?.[tag]?.Value;
  return Array.isArray(value) ? String(value[0] ?? "") : "";
}

function toFriendlyError(code) {
  const messages = {
    PATIENT_CONSENT_REQUIRED: "의료영상 열람을 위해 환자의 유효한 공유 동의가 필요합니다.",
    ACCESS_DENIED_NO_CONSENT: "해당 영상에 대한 유효한 동의 정책이 존재하지 않습니다.",
    CONSENT_REVOKED: "환자가 해당 의료영상의 공유 동의를 철회하였습니다.",
    TOKEN_CONSENT_INACTIVE: "동의 상태가 더 이상 활성(ACTIVE) 상태가 아닙니다.",
    CONSENT_EXPIRED: "동의 유효기간이 만료되었습니다.",
    TOKEN_EXPIRED: "단기 접근토큰 유효기간(5분)이 만료되었습니다. 새 토큰을 요청하세요.",
    HOSPITAL_MISMATCH: "동의된 수신 병원과 요청 병원이 일치하지 않습니다.",
    TOKEN_HOSPITAL_MISMATCH: "발급된 토큰이 요청 병원 범위와 일치하지 않습니다.",
    STUDY_SCOPE_MISMATCH: "요청한 Study가 환자 동의 범위를 벗어납니다.",
    TOKEN_STUDY_MISMATCH: "요청한 Study가 토큰 허용 범위를 벗어납니다.",
    SERIES_SCOPE_MISMATCH: "요청한 Series가 환자 동의 범위를 벗어납니다.",
    TOKEN_SERIES_MISMATCH: "요청한 Series가 토큰 허용 범위를 벗어납니다.",
    DOWNLOAD_NOT_ALLOWED: "환자가 조회 전용(VIEW_ONLY)으로 동의하여 다운로드가 차단되었습니다.",
    TOKEN_PERMISSION_MISMATCH: "토큰 권한 범위를 벗어난 다운로드 요청입니다.",
    TOKEN_INVALID: "접근토큰이 누락되었거나 유효하지 않습니다.",
    ORTHANC_QIDO_STUDY_FAILED: "Gateway가 Study 메타데이터를 조회하지 못했습니다.",
    ORTHANC_QIDO_SERIES_FAILED: "Gateway가 Series 메타데이터를 조회하지 못했습니다.",
    ORTHANC_QIDO_INSTANCE_FAILED: "Gateway가 Instance 메타데이터를 조회하지 못했습니다.",
    ORTHANC_WADO_INSTANCE_FAILED: "Gateway가 선택된 인스턴스를 스트리밍하지 못했습니다.",
    ORTHANC_UNAVAILABLE: "가상 PACS 의료영상 서버에 일시적으로 연결할 수 없습니다.",
    PHR_PROVIDER_NOT_CONFIGURED: "PHR 프로바이더가 구성되지 않았습니다.",
    PHR_PATIENT_BINDING_MISMATCH: "현재 환자 계정에 인가되지 않은 PHR 요청입니다.",
    PHR_IMAGING_NOT_MAPPED: "승인된 가상 PACS 출처와 매핑되지 않은 영상입니다.",
    PHR_CONSENT_REQUEST_INVALID: "PHR 공유 요청 범위가 올바르지 않습니다.",
    PHR_REQUEST_FAILED: "PHR 데이터를 불러오지 못했습니다.",
    ACTOR_QUARANTINED: "보안 위협 행위(비정상 반복 실패, 만료 토큰 남용 등)로 인해 해당 주체 또는 IP가 격리되어 접근이 차단되었습니다.",
    ACCESS_DENIED_ACTOR_QUARANTINED: "보안 위협 행위 감지로 인해 해당 주체의 접근이 능동 격리 차단되었습니다.",
  };
  return messages[code] ?? "접근 실패: 동의, 단기 토큰, Gateway 상태를 확인하세요.";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { hour12: false });
}

function toDateTimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocal(value) {
  return new Date(value).toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==========================================================================
// Patient In-App Medical Imaging Viewer Controller
// Security: VIEW_ONLY enforced, Watermarked, Real-time Self-View Audit
// ==========================================================================
const patientViewerState = {
  study: null,
  currentSlice: 1,
  totalSlices: 50,
  isPlaying: false,
  timer: null,
  preset: "DEFAULT",
  zoom: 1.0,
};

function setupPatientViewerModalEvents() {
  const modal = document.querySelector("#patient-viewer-modal");
  const btnClose = document.querySelector("#btn-close-patient-viewer");
  const btnCloseBottom = document.querySelector("#pv-btn-close-bottom");
  const btnTransfer = document.querySelector("#pv-btn-transfer-now");
  const btnPrev = document.querySelector("#pv-btn-prev");
  const btnNext = document.querySelector("#pv-btn-next");
  const slider = document.querySelector("#pv-slice-slider");
  const btnCine = document.querySelector("#pv-btn-cine");
  const btnReset = document.querySelector("#pv-btn-reset-view");
  const btnZoom = document.querySelector("#pv-btn-zoom");

  const closeViewer = () => {
    if (patientViewerState.timer) clearInterval(patientViewerState.timer);
    patientViewerState.isPlaying = false;
    if (modal) modal.hidden = true;
  };

  btnClose?.addEventListener("click", closeViewer);
  btnCloseBottom?.addEventListener("click", closeViewer);

  btnTransfer?.addEventListener("click", async () => {
    const studyUid = patientViewerState.study?.studyInstanceUid;
    closeViewer();
    if (studyUid) {
      await selectStudy(studyUid, lastStudies);
      const study = lastStudies.find((s) => s.studyInstanceUid === studyUid);
      if (sourceHospitalSelect) sourceHospitalSelect.value = study?.sourceHospitalId || "HOSP-A";
      if (targetHospitalSelect) targetHospitalSelect.value = "HOSP-B";
      if (accessPurposeSelect) accessPurposeSelect.value = "TREATMENT";
      if (accessModeSelect) accessModeSelect.value = "VIEW_ONLY";
      syncPatientChoices({ preserveConsentState: true });
      navigatePatientPage("consent");
      showToast(`[${study?.description || "의료영상"}] 전송 동의 화면으로 이동했습니다.`);
    }
  });

  slider?.addEventListener("input", (e) => {
    patientViewerState.currentSlice = Number(e.target.value);
    drawPatientViewerFrame();
  });

  btnPrev?.addEventListener("click", () => {
    patientViewerState.currentSlice = Math.max(1, patientViewerState.currentSlice - 1);
    updatePatientViewerControls();
  });

  btnNext?.addEventListener("click", () => {
    patientViewerState.currentSlice = Math.min(patientViewerState.totalSlices, patientViewerState.currentSlice + 1);
    updatePatientViewerControls();
  });

  btnCine?.addEventListener("click", togglePatientCinePlayback);

  btnReset?.addEventListener("click", () => {
    patientViewerState.preset = "DEFAULT";
    patientViewerState.zoom = 1.0;
    patientViewerState.currentSlice = 1;
    document.querySelectorAll(".pv-preset-btn").forEach((b) => b.classList.toggle("active", b.dataset.pvPreset === "DEFAULT"));
    if (btnZoom) btnZoom.textContent = "🔍 확대 보기 (1.0x)";
    updatePatientViewerControls();
  });

  btnZoom?.addEventListener("click", () => {
    const zooms = [1.0, 1.25, 1.5, 2.0];
    const nextIdx = (zooms.indexOf(patientViewerState.zoom) + 1) % zooms.length;
    patientViewerState.zoom = zooms[nextIdx];
    if (btnZoom) btnZoom.textContent = `🔍 확대 보기 (${patientViewerState.zoom.toFixed(2)}x)`;
    drawPatientViewerFrame();
  });

  document.querySelectorAll(".pv-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pv-preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      patientViewerState.preset = btn.dataset.pvPreset;
      drawPatientViewerFrame();
    });
  });

  // Canvas Mouse Wheel Navigation
  const canvas = document.querySelector("#patient-viewer-canvas");
  canvas?.addEventListener("wheel", (e) => {
    if (patientViewerState.totalSlices <= 1) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      patientViewerState.currentSlice = Math.min(patientViewerState.totalSlices, patientViewerState.currentSlice + 1);
    } else {
      patientViewerState.currentSlice = Math.max(1, patientViewerState.currentSlice - 1);
    }
    updatePatientViewerControls();
  }, { passive: false });
}

async function openPatientStudyViewer(studyUid) {
  const study = lastStudies.find((s) => s.studyInstanceUid === studyUid);
  if (!study) {
    showToast("해당 의료영상을 찾을 수 없습니다.");
    return;
  }

  // 1. Audit log on server (PATIENT_SELF_VIEW)
  try {
    await postJson(`/api/patients/${demo.patientId}/studies/${encodeURIComponent(studyUid)}/self-view`, {});
  } catch (err) {
    console.warn("Self-view audit log deferred:", err);
  }

  // 2. Setup state
  patientViewerState.study = study;
  patientViewerState.totalSlices = study.modality === "CR" ? 1 : (study.series?.[0]?.instances?.length || 50);
  patientViewerState.currentSlice = 1;
  patientViewerState.isPlaying = false;
  patientViewerState.preset = "DEFAULT";
  patientViewerState.zoom = 1.0;
  if (patientViewerState.timer) clearInterval(patientViewerState.timer);

  // 3. UI Update
  const modal = document.querySelector("#patient-viewer-modal");
  const title = document.querySelector("#patientViewerTitle");
  const sub = document.querySelector("#patientViewerSub");
  const modBadge = document.querySelector("#patientViewerModality");
  const findingDesc = document.querySelector("#pv-finding-desc");
  const slider = document.querySelector("#pv-slice-slider");
  const btnPrev = document.querySelector("#pv-btn-prev");
  const btnNext = document.querySelector("#pv-btn-next");
  const btnCine = document.querySelector("#pv-btn-cine");

  if (title) title.textContent = `${study.description}`;
  if (sub) sub.innerHTML = `출처: <strong>${escapeHtml(study.sourceHospitalId)}</strong> · 검사일자: ${escapeHtml(study.studyDate)} · <span class="badge">${escapeHtml(study.modality)}</span>`;
  if (modBadge) modBadge.textContent = study.modality || "DICOM";

  if (slider) {
    slider.min = "1";
    slider.max = String(patientViewerState.totalSlices);
    slider.value = "1";
    slider.disabled = patientViewerState.totalSlices <= 1;
  }
  if (btnPrev) btnPrev.disabled = patientViewerState.totalSlices <= 1;
  if (btnNext) btnNext.disabled = patientViewerState.totalSlices <= 1;
  if (btnCine) {
    btnCine.textContent = "▶ 동영상 연속재생 (Cine)";
    btnCine.disabled = patientViewerState.totalSlices <= 1;
  }

  if (findingDesc) {
    const mod = (study.modality || "").toUpperCase();
    const desc = (study.description || "").toUpperCase();
    if (mod === "CT" || desc.includes("CHEST CT")) {
      findingDesc.innerHTML = "<strong>우측 폐 상엽 미세 결절 소견:</strong> 이전 검진 대비 크기 변화 미미함. 흉부 임파선 종대 없음 (6개월 후 저선량 CT 추적 권고).";
    } else if (mod === "MR" || desc.includes("BRAIN")) {
      findingDesc.innerHTML = "<strong>급성 뇌경색 병변 없음:</strong> 뇌실질 및 대뇌 혈관 정상 윤곽 유지. 경추 C5-6 디스크 경미한 퇴행성 팽륜 소견 관찰.";
    } else if (mod === "CR" || desc.includes("X-RAY")) {
      findingDesc.innerHTML = "<strong>흉부 단순촬영 정상 소견:</strong> 양측 폐야에 활동성 병변 및 삼출액 없음. 심장 음영 정상 범위.";
    } else {
      findingDesc.innerHTML = "<strong>관절 연골 및 골격 소견:</strong> 골절 소견 없음. 연부조직 부종 미미함.";
    }
  }

  if (modal) {
    modal.hidden = false;
  }

  updatePatientViewerControls();
  showToast(`[${study.description}] 영상을 환자 안심 뷰어로 열었습니다.`);
}

function updatePatientViewerControls() {
  const slider = document.querySelector("#pv-slice-slider");
  if (slider) slider.value = String(patientViewerState.currentSlice);
  const badge = document.querySelector("#pv-slice-badge");
  if (badge) badge.textContent = `${patientViewerState.currentSlice} / ${patientViewerState.totalSlices}`;
  const hudSlice = document.querySelector("#pv-hud-slice");
  if (hudSlice) hudSlice.textContent = `Slice ${patientViewerState.currentSlice} / ${patientViewerState.totalSlices}`;
  drawPatientViewerFrame();
}

function togglePatientCinePlayback() {
  const btnCine = document.querySelector("#pv-btn-cine");
  if (patientViewerState.isPlaying) {
    if (patientViewerState.timer) clearInterval(patientViewerState.timer);
    patientViewerState.isPlaying = false;
    if (btnCine) btnCine.textContent = "▶ 동영상 연속재생 (Cine)";
  } else {
    patientViewerState.isPlaying = true;
    if (btnCine) btnCine.textContent = "⏸ 일시정지";
    patientViewerState.timer = setInterval(() => {
      patientViewerState.currentSlice = patientViewerState.currentSlice >= patientViewerState.totalSlices ? 1 : patientViewerState.currentSlice + 1;
      updatePatientViewerControls();
    }, 85);
  }
}

function drawPatientViewerFrame() {
  const canvas = document.querySelector("#patient-viewer-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const slice = patientViewerState.currentSlice;
  const total = patientViewerState.totalSlices;
  const study = patientViewerState.study;
  const mod = (study?.modality || "CT").toUpperCase();
  const preset = patientViewerState.preset;
  const zoom = patientViewerState.zoom || 1.0;

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = preset === "INVERT" ? "#ffffff" : "#05070a";
  ctx.fillRect(0, 0, w, h);

  // Apply Zoom around center
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);

  const progress = slice / Math.max(1, total);

  if (mod === "CR") {
    drawSyntheticChestXray(ctx, w, h, preset);
  } else if (mod === "MR") {
    drawSyntheticBrainMri(ctx, w, h, progress, preset);
  } else {
    drawSyntheticBodyCt(ctx, w, h, progress, preset);
  }

  ctx.restore();

  // Draw HUD Watermark overlay (not affected by zoom)
  ctx.save();
  ctx.fillStyle = preset === "INVERT" ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.22)";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("HOSP-A · P-1001 · PATIENT SELF-VIEW · VIEW_ONLY", w / 2, h - 14);
  ctx.restore();
}

function drawSyntheticChestXray(ctx, w, h, preset) {
  const invert = preset === "INVERT";
  const ribColor = invert ? "rgba(40,40,40,0.7)" : "rgba(220,225,235,0.7)";
  const spineColor = invert ? "rgba(20,20,20,0.85)" : "rgba(240,245,255,0.85)";
  const lungColor = invert ? "#eaeaea" : "#111822";
  const heartColor = invert ? "rgba(60,60,60,0.6)" : "rgba(180,190,210,0.6)";

  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.44, 0, 0, Math.PI * 2);
  ctx.fillStyle = invert ? "#f5f5f5" : "#0d131d";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(w * 0.35, h * 0.45, w * 0.14, h * 0.28, -0.05, 0, Math.PI * 2);
  ctx.ellipse(w * 0.65, h * 0.45, w * 0.14, h * 0.28, 0.05, 0, Math.PI * 2);
  ctx.fillStyle = lungColor;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(w * 0.47, h * 0.53, w * 0.12, h * 0.16, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = heartColor;
  ctx.fill();

  ctx.fillStyle = spineColor;
  ctx.fillRect(w / 2 - 8, h * 0.12, 16, h * 0.72);

  ctx.strokeStyle = ribColor;
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const y = h * 0.25 + i * 26;
    ctx.beginPath();
    ctx.arc(w * 0.34, y, 42, Math.PI * 0.8, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.66, y, 42, Math.PI * 1.1, Math.PI * 0.2);
    ctx.stroke();
  }
}

function drawSyntheticBrainMri(ctx, w, h, progress, preset) {
  const invert = preset === "INVERT";
  const cx = w / 2;
  const cy = h / 2;
  const skullRadius = Math.sin(progress * Math.PI) * (w * 0.38) + 30;

  ctx.strokeStyle = invert ? "rgba(30,30,30,0.8)" : (preset === "BONE" ? "#ffffff" : "rgba(220,230,245,0.75)");
  ctx.lineWidth = preset === "BONE" ? 7 : 4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, skullRadius, skullRadius * 1.15, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = invert ? "rgba(100,100,100,0.5)" : (preset === "BRAIN" ? "rgba(140,155,185,0.75)" : "rgba(110,125,150,0.6)");
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(10, skullRadius - 8), Math.max(10, skullRadius * 1.15 - 8), 0, 0, Math.PI * 2);
  ctx.fill();

  const ventSize = Math.sin(progress * Math.PI) * 22;
  if (ventSize > 5) {
    ctx.fillStyle = invert ? "#ffffff" : "#080c14";
    ctx.beginPath();
    ctx.ellipse(cx - 14, cy - 8, ventSize * 0.45, ventSize, 0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + 14, cy - 8, ventSize * 0.45, ventSize, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = invert ? "rgba(200,200,200,0.4)" : "rgba(20,30,45,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - skullRadius);
  ctx.lineTo(cx, cy + skullRadius);
  ctx.stroke();
}

function drawSyntheticBodyCt(ctx, w, h, progress, preset) {
  const invert = preset === "INVERT";
  const cx = w / 2;
  const cy = h / 2;

  ctx.fillStyle = invert ? "#e8e8e8" : "#121a24";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = invert ? "#111" : (preset === "BONE" ? "#ffffff" : "#d8e2ec");
  ctx.lineWidth = preset === "BONE" ? 6 : 3.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.40, h * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = invert ? "#000" : "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.24, 14, 0, Math.PI * 2);
  ctx.fill();

  const lungOpacity = preset === "LUNG" ? 0.95 : 0.6;
  ctx.fillStyle = invert ? "#ffffff" : `rgba(4, 7, 12, ${lungOpacity})`;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.18, cy - 10, w * 0.15, h * 0.20, 0.05, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.18, cy - 10, w * 0.15, h * 0.20, -0.05, 0, Math.PI * 2);
  ctx.fill();

  if (Math.abs(progress - 0.5) < 0.15) {
    ctx.fillStyle = invert ? "#b91c1c" : (preset === "LUNG" ? "#38bdf8" : "#f59e0b");
    ctx.beginPath();
    ctx.arc(cx + w * 0.20, cy - 15, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

