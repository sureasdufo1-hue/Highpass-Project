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
  { hospitalId: "HOSP-A", name: "Virtual Hospital A", status: "ACTIVE" },
  { hospitalId: "HOSP-B", name: "Virtual Hospital B", status: "ACTIVE" },
  { hospitalId: "HOSP-C", name: "Virtual Hospital C", status: "ACTIVE" },
];

const adminGateways = [
  { gatewayId: "GW-HOSP-A", hospitalId: "HOSP-A", endpoint: "/dicomweb", status: "ONLINE" },
  { gatewayId: "GW-HOSP-B", hospitalId: "HOSP-B", endpoint: "/dicomweb", status: "ONLINE" },
  { gatewayId: "GW-HOSP-C", hospitalId: "HOSP-C", endpoint: "/dicomweb", status: "DEGRADED" },
];

let latestConsentId = "CONSENT-DEMO-ACTIVE";
let latestToken = null;
let latestTokenInfo = null;
let selectedStudyUid = demo.studyInstanceUid;
let selectedSeriesUid = "";
let selectedSopUid = "";
let selectedStudy = null;
let lastStudies = [];
let lastSeries = [];
let lastInstances = [];
let patientConsentReady = false;

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

initNavigation();
renderAdminShell();
initConsentDateDefaults();
bindEvents();
await loadDashboard();

function bindEvents() {
  document.querySelector("#refresh")?.addEventListener("click", loadDashboard);
  document.querySelector("#patient-consent")?.addEventListener("click", createPatientConsent);
  document.querySelector("#patient-revoke")?.addEventListener("click", revokePatientConsent);
  document.querySelector("#doctor-request-token")?.addEventListener("click", requestDoctorToken);
  document.querySelector("#doctor-open-series")?.addEventListener("click", openViewer);
  document.querySelector("#load-studies")?.addEventListener("click", loadGatewayStudies);
  document.querySelector("#load-instances")?.addEventListener("click", loadInstancesForSelectedSeries);
  downloadButton?.addEventListener("click", downloadSelectedInstance);
  sourceHospitalSelect?.addEventListener("change", syncPatientChoices);
  targetHospitalSelect?.addEventListener("change", syncPatientChoices);
  accessPurposeSelect?.addEventListener("change", syncPatientChoices);
  accessModeSelect?.addEventListener("change", syncPatientChoices);
  patientStudySelect?.addEventListener("change", () => selectStudy(patientStudySelect.value, lastStudies));
  patientSeriesSelect?.addEventListener("change", () => {
    selectedSeriesUid = patientSeriesSelect.value;
    resetViewerData();
  });
  auditResultFilter?.addEventListener("change", loadDashboard);
  auditActionFilter?.addEventListener("change", loadDashboard);
}

function initNavigation() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => activateRole(button.dataset.role));
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.viewTarget));
  });
  const initialRole = location.hash.replace("#", "") || "PATIENT";
  activateRole(document.querySelector(`[data-role="${initialRole}"]`) ? initialRole : "PATIENT", false);
}

function activateRole(role, updateHash = true) {
  document.querySelectorAll("[data-role]").forEach((button) => button.classList.toggle("active", button.dataset.role === role));
  document.querySelectorAll("[data-role-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.rolePanel === role));
  document.querySelector("#active-role-label").textContent = role;
  if (updateHash) history.replaceState(null, "", `#${role}`);
}

function activateView(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const rolePanel = target.closest("[data-role-panel]");
  rolePanel.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === targetId));
  rolePanel.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === targetId));
}

function initConsentDateDefaults() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  consentValidFromInput.value = toDateTimeLocal(now);
  consentValidUntilInput.value = toDateTimeLocal(nextWeek);
}

async function loadDashboard() {
  const auditParams = new URLSearchParams();
  if (auditResultFilter?.value) auditParams.set("result", auditResultFilter.value);
  if (auditActionFilter?.value) auditParams.set("action", auditActionFilter.value);
  const auditQuery = auditParams.toString();
  const [health, studies, consents, logs, usage, anomalies] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson(`/api/imaging-studies?patientId=${demo.patientId}&includeSeries=true`),
    fetchJson(`/api/patients/${demo.patientId}/consents`),
    fetchJson(`/api/audit-logs${auditQuery ? `?${auditQuery}` : ""}`),
    fetchJson("/api/transfer-usage"),
    fetchJson("/api/anomaly-alerts"),
  ]);

  lastStudies = Array.isArray(studies) ? studies : [];
  updateConsentState(Array.isArray(consents) ? consents : []);
  renderPatientStudyOptions(lastStudies);
  renderStudies(lastStudies);
  renderLogs(Array.isArray(logs) ? logs : []);
  renderUsage(Array.isArray(usage) ? usage : []);
  renderAnomalies(Array.isArray(anomalies) ? anomalies : []);
  renderConsentHistory(Array.isArray(consents) ? consents : []);
  renderMetrics(lastStudies, Array.isArray(logs) ? logs : [], Array.isArray(usage) ? usage : []);
  renderHealth(health);
}

function updateConsentState(consents) {
  const active = consents.find((consent) => (
    consent.status === "ACTIVE" &&
    consent.sourceHospitalId === demo.sourceHospitalId &&
    consent.targetHospitalId === demo.targetHospitalId &&
    consent.purpose === demo.purpose &&
    consent.permission === demo.permission &&
    consent.scopes?.some((scope) => scope.studyInstanceUid === selectedStudyUid && (!selectedSeriesUid || !scope.seriesInstanceUid || scope.seriesInstanceUid === selectedSeriesUid))
  ));
  if (active) {
    latestConsentId = active.consentId;
    patientConsentReady = true;
    setPatientStatus("Consent active");
  } else {
    patientConsentReady = false;
    setPatientStatus("Consent required");
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
    setPatientStatus("Consent active");
    showViewerMessage("Consent created. Request a short-lived token to open the viewer.", "success");
  } else {
    patientConsentReady = false;
    setPatientStatus("Consent failed");
    showViewerMessage(toFriendlyError(result.error), "fail");
  }
  if (!options.silent) renderOutput(result);
  await loadDashboard();
  return result;
}

async function revokePatientConsent() {
  const result = await postJson(`/api/consents/${latestConsentId}/revoke`, { actorId: demo.patientId });
  latestToken = null;
  latestTokenInfo = null;
  patientConsentReady = false;
  setPatientStatus("Consent revoked");
  viewerStatus.textContent = "Token required";
  resetViewerData();
  showViewerMessage(result.error ? toFriendlyError(result.error) : "Consent was revoked. Existing tokens cannot be used.", result.error ? "fail" : "warning");
  renderOutput(result);
  await loadDashboard();
}

async function requestDoctorToken() {
  if (!patientConsentReady) {
    latestToken = null;
    latestTokenInfo = null;
    viewerStatus.textContent = "Consent required";
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
    viewerStatus.textContent = "Token issued";
    setDownloadState();
    showViewerMessage("Token issued. Load Study metadata first; Series and Instance data load on demand.", "success");
  } else {
    latestToken = null;
    latestTokenInfo = null;
    viewerStatus.textContent = "Access denied";
    showViewerMessage(toFriendlyError(result.reasonCode), "fail");
  }
  renderOutput(result);
  await loadDashboard();
  return result;
}

async function openViewer() {
  activateRole("DOCTOR");
  activateView("doctor-viewer");
  if (!latestToken) {
    await requestDoctorToken();
  }
  if (latestToken) {
    await loadGatewayStudies();
    await loadSeriesForActiveToken();
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
  showViewerMessage(`Study metadata loaded (${result.length}). Series are still unloaded.`, "success");
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
  viewerStatus.textContent = "Series ready";
  showViewerMessage("Series metadata loaded. Select a Series to load Instances.", "success");
}

async function loadInstancesForSelectedSeries() {
  if (!requireToken()) return;
  if (!selectedSeriesUid) {
    showViewerMessage("Select a Series before loading Instances.", "warning");
    return;
  }
  const result = await getJson(`/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances`, latestToken);
  renderOutput(result);
  if (!Array.isArray(result)) {
    lastInstances = [];
    renderInstances([]);
    showViewerMessage(toFriendlyError(result.error), "fail");
    return;
  }
  lastInstances = result;
  renderInstances(result);
  showViewerMessage(`Instance metadata loaded (${result.length}). Choose one to stream DICOM bytes.`, "success");
}

async function loadInstancePixels(sopInstanceUid) {
  if (!requireToken()) return;
  selectedSopUid = sopInstanceUid;
  const response = await fetch(`/dicomweb/studies/${selectedStudyUid}/series/${selectedSeriesUid}/instances/${sopInstanceUid}`, {
    headers: { authorization: `Bearer ${latestToken}` },
  });
  if (!response.ok) {
    const error = await safeJson(response);
    showViewerMessage(toFriendlyError(error.error), "fail");
    renderOutput(error);
    return;
  }
  const bytes = await response.arrayBuffer();
  showSeriesImage(resolvePreviewForSelectedSeries(), `Instance ${sopInstanceUid}`);
  instanceDetail.hidden = false;
  instanceDetail.textContent = `SOP ${sopInstanceUid} streamed lazily (${bytes.byteLength} bytes).`;
  viewerStatus.textContent = "Instance loaded";
  setDownloadState();
  renderOutput({ status: "INSTANCE_LOADED", sopInstanceUid, bytes: bytes.byteLength });
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
  const content = seriesRows.length ? seriesRows.map((series, index) => {
    const seriesUid = dicomValue(series, "0020000E");
    const description = dicomValue(series, "0008103E") || "Series";
    const modality = dicomValue(series, "00080060") || selectedStudy?.modality || "DICOM";
    return `
      <button class="series-row ${index === 0 ? "active" : ""}" type="button" data-series-uid="${escapeHtml(seriesUid)}">
        <strong>${escapeHtml(description)}</strong>
        <span>${escapeHtml(modality)} / ${escapeHtml(seriesUid)}</span>
      </button>
    `;
  }).join("") : `<div class="empty-state">No Series available for this token.</div>`;

  document.querySelector("#series-list").innerHTML = content;
  document.querySelectorAll("[data-series-uid]").forEach((button, index) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".series-row.active").forEach((row) => row.classList.remove("active"));
      button.classList.add("active");
      selectedSeriesUid = button.dataset.seriesUid;
      selectedSopUid = "";
      renderInstances([]);
      showSeriesImage(resolvePreviewForSelectedSeries(), `Series ${index + 1}`);
      await loadInstancesForSelectedSeries();
    });
  });

  const firstUid = seriesRows[0] ? dicomValue(seriesRows[0], "0020000E") : "";
  if (firstUid) {
    selectedSeriesUid = firstUid;
    showSeriesImage(resolvePreviewForSelectedSeries(), "Representative thumbnail");
  } else {
    hideSeriesImage();
  }
  renderInstances([]);
}

function renderInstances(instanceRows) {
  const content = instanceRows.length ? instanceRows.map((instance, index) => {
    const sop = dicomValue(instance, "00080018");
    const number = dicomValue(instance, "00200013") || String(index + 1);
    return `
      <button class="instance-row" type="button" data-sop-uid="${escapeHtml(sop)}">
        <strong>Instance ${escapeHtml(number)}</strong>
        <span>${escapeHtml(sop)}</span>
      </button>
    `;
  }).join("") : `<div class="empty-state">Instance metadata is not loaded.</div>`;
  document.querySelector("#instance-list").innerHTML = content;
  document.querySelectorAll("[data-sop-uid]").forEach((button) => {
    button.addEventListener("click", () => loadInstancePixels(button.dataset.sopUid));
  });
}

function renderPatientStudyOptions(studies) {
  patientStudySelect.innerHTML = studies.map((study) => `
    <option value="${escapeHtml(study.studyInstanceUid)}">${escapeHtml(study.description)} (${escapeHtml(study.modality)})</option>
  `).join("");
  if (!studies.some((study) => study.studyInstanceUid === selectedStudyUid) && studies[0]) {
    selectedStudyUid = studies[0].studyInstanceUid;
  }
  patientStudySelect.value = selectedStudyUid;
  sourceHospitalSelect.value = demo.sourceHospitalId;
  targetHospitalSelect.value = demo.targetHospitalId;
  accessPurposeSelect.value = demo.purpose;
  accessModeSelect.value = demo.permission;
  renderPatientSeriesOptions();
}

function renderPatientSeriesOptions() {
  const study = lastStudies.find((item) => item.studyInstanceUid === selectedStudyUid);
  const seriesRows = study?.series ?? [];
  patientSeriesSelect.innerHTML = [
    `<option value="">Study scope</option>`,
    ...seriesRows.map((series) => `
      <option value="${escapeHtml(series.seriesInstanceUid)}">${escapeHtml(series.description)} / ${escapeHtml(series.seriesInstanceUid)}</option>
    `),
  ].join("");
  if (selectedSeriesUid && !seriesRows.some((series) => series.seriesInstanceUid === selectedSeriesUid)) selectedSeriesUid = "";
  patientSeriesSelect.value = selectedSeriesUid;
}

function renderStudies(studies) {
  selectedStudy = studies.find((study) => study.studyInstanceUid === selectedStudyUid) ?? studies[0] ?? null;
  if (selectedStudy) selectedStudyUid = selectedStudy.studyInstanceUid;
  syncSelectedStudyUi();

  document.querySelector("#studies").innerHTML = studies.map((study) => `
    <button class="item study-button ${study.studyInstanceUid === selectedStudyUid ? "active" : ""}" type="button" data-study-uid="${escapeHtml(study.studyInstanceUid)}">
      <strong>${escapeHtml(study.description)}</strong>
      <div class="meta">${escapeHtml(study.modality)} / ${escapeHtml(study.bodyPart)} / ${escapeHtml(study.studyDate)}<br>${escapeHtml(study.sourceHospitalId)} / ${escapeHtml(study.studyInstanceUid)}</div>
    </button>
  `).join("");
  document.querySelectorAll("[data-study-uid]").forEach((button) => {
    button.addEventListener("click", () => selectStudy(button.dataset.studyUid, studies));
  });
}

async function selectStudy(studyUid, studies = lastStudies) {
  selectedStudyUid = studyUid;
  selectedStudy = studies.find((study) => study.studyInstanceUid === studyUid) ?? selectedStudy;
  selectedSeriesUid = "";
  patientStudySelect.value = selectedStudyUid;
  renderPatientSeriesOptions();
  latestToken = null;
  latestTokenInfo = null;
  patientConsentReady = false;
  resetViewerData();
  setPatientStatus("Consent required");
  viewerStatus.textContent = "Token required";
  syncSelectedStudyUi();
}

function syncPatientChoices(options = {}) {
  demo.sourceHospitalId = sourceHospitalSelect.value;
  demo.targetHospitalId = targetHospitalSelect.value;
  demo.purpose = accessPurposeSelect.value;
  demo.permission = accessModeSelect.value;
  selectedSeriesUid = patientSeriesSelect.value;
  latestToken = null;
  latestTokenInfo = null;
  resetViewerData();
  if (!options.preserveConsentState) {
    patientConsentReady = false;
    setPatientStatus("Consent required");
  }
  viewerStatus.textContent = "Token required";
}

function syncSelectedStudyUi() {
  if (!selectedStudy) return;
  document.querySelector("#viewer-study-title").textContent = selectedStudy.description;
  document.querySelector("#viewer-study-meta").textContent = `${selectedStudy.modality} / ${selectedStudy.bodyPart} / ${selectedStudy.studyInstanceUid}`;
}

function resetViewerData() {
  lastSeries = [];
  lastInstances = [];
  selectedSopUid = "";
  document.querySelector("#series-list").innerHTML = `<div class="empty-state">Series metadata is not loaded.</div>`;
  renderInstances([]);
  hideSeriesImage();
  setDownloadState();
}

function setDownloadState() {
  const allowed = latestTokenInfo?.permission === "DOWNLOAD_ALLOWED" && Boolean(selectedSopUid);
  downloadButton.disabled = !allowed;
  downloadButton.title = latestTokenInfo?.permission === "DOWNLOAD_ALLOWED"
    ? "Download selected instance"
    : "VIEW_ONLY token: download is blocked by the server";
}

function requireToken() {
  if (latestToken) return true;
  showViewerMessage("A short-lived access token is required.", "fail");
  viewerStatus.textContent = "Token required";
  return false;
}

function showSeriesImage(imageUrl, label) {
  viewerImage.src = imageUrl;
  viewerImage.alt = label;
  viewerImage.hidden = false;
  viewerPlaceholder.hidden = true;
}

function hideSeriesImage() {
  viewerImage.removeAttribute("src");
  viewerImage.hidden = true;
  viewerPlaceholder.hidden = false;
  instanceDetail.hidden = true;
  instanceDetail.textContent = "";
}

function resolvePreviewForSelectedSeries() {
  const localSeries = selectedStudy?.series?.find((series) => series.seriesInstanceUid === selectedSeriesUid);
  if (localSeries?.previewImageUrl) return localSeries.previewImageUrl;
  const label = `${localSeries?.description ?? selectedStudy?.description ?? ""} ${selectedStudy?.bodyPart ?? ""}`.toUpperCase();
  if (label.includes("CT") || label.includes("CHEST") || label.includes("LUNG")) return "/assets/demo-ct.png";
  return "/assets/demo-mri.png";
}

function showViewerMessage(message, tone = "info") {
  viewerAlert.textContent = message;
  viewerAlert.dataset.tone = tone;
}

function setPatientStatus(text) {
  patientStatus.textContent = text;
  document.querySelector("#patient-dashboard-status").textContent = text;
}

function renderMetrics(studies, logs, usage) {
  const bytes = usage.reduce((sum, row) => sum + (row.bytesTransferred ?? 0), 0);
  document.querySelector("#metric-studies").textContent = studies.length;
  document.querySelector("#metric-logs").textContent = logs.length;
  document.querySelector("#metric-transfer").textContent = `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderHealth(health) {
  document.querySelector("#metric-health").textContent = `${health.status} / DB ${health.database}`;
}

function renderLogs(logs) {
  const rows = logs.slice(0, 10).map((log) => ({
    title: `${log.action} - ${log.result}`,
    detail: `${log.actorType}:${log.actorId} / ${log.hospitalId ?? log.targetHospitalId ?? "-"} / ${log.studyInstanceUid ?? "-"} / ${log.reasonCode ?? log.reason ?? "OK"} / ${formatDate(log.createdAt)}`,
    tone: log.result === "SUCCESS" ? "success" : (log.result === "ALERT" ? "warning" : "fail"),
  }));
  renderInto("#hospital-audit-logs", rows.slice(0, 6));
  renderInto("#security-audit-logs", rows.length ? rows : [{ title: "No logs match filter", detail: "Adjust result or action filters.", tone: "warning" }]);
}

function renderUsage(rows) {
  const usageRows = rows.slice(0, 8).map((row) => ({
    title: `${row.transferMode} / ${(row.bytesTransferred / 1024).toFixed(1)} KB`,
    detail: `${row.sourceHospitalId} -> ${row.targetHospitalId} / ${row.sopInstanceUid ?? row.seriesInstanceUid ?? row.studyInstanceUid}`,
  }));
  renderInto("#usage", usageRows);
}

function renderConsentHistory(consents) {
  const rows = consents.slice(0, 12).map((consent) => ({
    title: `${consent.status} / ${consent.permission}`,
    detail: `${consent.sourceHospitalId} -> ${consent.targetHospitalId} / ${consent.purpose} / ${formatDate(consent.validUntil)}`,
    tone: consent.status === "ACTIVE" ? "success" : (consent.status === "REVOKED" ? "fail" : "warning"),
  }));
  renderInto("#patient-consent-history", rows.length ? rows : [{ title: "No consent history", detail: "Create consent before requesting access.", tone: "warning" }]);
}

function renderAdminShell() {
  const hospitalRows = adminHospitals.map((hospital) => ({ title: `${hospital.name} (${hospital.hospitalId})`, detail: `Status ${hospital.status}`, tone: "success" }));
  const gatewayRows = adminGateways.map((gateway) => ({ title: `${gateway.gatewayId} / ${gateway.status}`, detail: `${gateway.hospitalId} / ${gateway.endpoint}`, tone: gateway.status === "ONLINE" ? "success" : "warning" }));
  renderInto("#hospital-list", hospitalRows);
  renderInto("#gateway-list", gatewayRows);
  renderInto("#platform-hospital-list", hospitalRows);
  renderInto("#platform-gateway-list", gatewayRows);
  renderAnomalies([]);
}

function renderAnomalies(logs) {
  const rows = logs.slice(0, 12).map((log) => ({
    title: `${log.action} / ${log.reasonCode ?? log.reason}`,
    detail: `${log.actorId} / ${log.hospitalId ?? "-"} / ${log.studyInstanceUid ?? "-"} / ${formatDate(log.createdAt)}`,
    tone: "warning",
  }));
  const fallback = [{ title: "No anomaly alerts", detail: "Rule-based detector has not crossed a threshold.", tone: "success" }];
  renderInto("#anomaly-list", rows.length ? rows : fallback);
  renderInto("#platform-anomaly-list", rows.length ? rows : fallback);
}

function renderInto(selector, rows) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = rows.map((row) => `
    <article class="item">
      <strong class="${row.tone ?? ""}">${escapeHtml(row.title)}</strong>
      <div class="meta">${escapeHtml(row.detail)}</div>
    </article>
  `).join("");
}

function renderOutput(value) {
  output.textContent = JSON.stringify(value, null, 2);
}

function dicomValue(row, tag) {
  const value = row?.[tag]?.Value;
  return Array.isArray(value) ? String(value[0] ?? "") : "";
}

function toFriendlyError(code) {
  const messages = {
    PATIENT_CONSENT_REQUIRED: "Patient consent is required before image access.",
    ACCESS_DENIED_NO_CONSENT: "No matching consent exists.",
    CONSENT_REVOKED: "The consent has been revoked.",
    TOKEN_CONSENT_INACTIVE: "The consent is no longer active.",
    CONSENT_EXPIRED: "The consent has expired.",
    TOKEN_EXPIRED: "The access token has expired. Request a new token.",
    HOSPITAL_MISMATCH: "The requested hospital does not match the consent.",
    TOKEN_HOSPITAL_MISMATCH: "The token cannot be used for this hospital.",
    STUDY_SCOPE_MISMATCH: "The Study is outside the consent scope.",
    TOKEN_STUDY_MISMATCH: "The Study is outside the token scope.",
    SERIES_SCOPE_MISMATCH: "The Series is outside the consent scope.",
    TOKEN_SERIES_MISMATCH: "The Series is outside the token scope.",
    DOWNLOAD_NOT_ALLOWED: "Download is not allowed by this consent.",
    TOKEN_PERMISSION_MISMATCH: "Download is blocked by the token permission.",
    TOKEN_INVALID: "The token is missing, invalid, or tampered.",
    ORTHANC_QIDO_STUDY_FAILED: "Gateway could not query Study metadata.",
    ORTHANC_QIDO_SERIES_FAILED: "Gateway could not query Series metadata.",
    ORTHANC_QIDO_INSTANCE_FAILED: "Gateway could not query Instance metadata.",
    ORTHANC_WADO_INSTANCE_FAILED: "Gateway could not stream the selected Instance.",
    ORTHANC_UNAVAILABLE: "Medical imaging server is temporarily unavailable. Try again later.",
  };
  return messages[code] ?? "Access failed. Check consent, token, gateway, and Orthanc status.";
}

function formatDate(value) {
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
  const response = await fetch(path, options);
  return safeJson(response);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return { error: response.ok ? "EMPTY_RESPONSE" : "GATEWAY_ERROR" };
  }
}
