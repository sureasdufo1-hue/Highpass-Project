import { existsSync, readFileSync } from "node:fs";

loadLocalEnvFile();

const baseUrl = process.env.PHR_E2E_BASE_URL ?? "http://localhost:3000";
const timeoutMs = Number(process.env.PHR_E2E_TIMEOUT_MS ?? 30_000);
const PHR_STUDY_UID = "1.2.826.0.1.3680043.10.5432.20260908.1001.1";
const PHR_SERIES_UID = "1.2.826.0.1.3680043.10.5432.20260908.1001.1.1";
const suffix = String(Date.now());
const results = [];

const patientHeaders = {
  "x-hipass-role": "PATIENT",
  "x-hipass-user-id": `phr-e2e-account-a-${suffix}`,
  "x-hipass-patient-id": "P-1001",
  "x-hipass-session-id": `phr-e2e-patient-${suffix}`,
};
const doctorHeaders = (doctorId, hospitalId) => ({
  "x-hipass-role": "DOCTOR",
  "x-hipass-user-id": doctorId,
  "x-hipass-doctor-id": doctorId,
  "x-hipass-hospital-id": hospitalId,
  "x-hipass-session-id": `phr-e2e-doctor-${suffix}`,
});
const securityHeaders = {
  "x-hipass-role": "SECURITY_ADMIN",
  "x-hipass-user-id": `PHR-E2E-SEC-${suffix}`,
  "x-hipass-session-id": `phr-e2e-security-${suffix}`,
};

try {
  const health = await request("GET", "/api/health");
  record("Control Plane health", health.status === 200 && health.body.status === "UP", `${health.status}`);

  const listing = await request("GET", "/api/v1/me/phr/imaging-studies", undefined, patientHeaders);
  record("PHR 영상검사 목록(MAPPED)", listing.status === 200 && listing.body.data?.some((item) => item.mappingStatus === "MAPPED"), `${listing.status}`);
  const mapped = listing.body.data.find((item) => item.mappingStatus === "MAPPED");
  record("PHR 목록 UID 비노출", !JSON.stringify(listing.body).includes("1.2.826") && !JSON.stringify(listing.body).includes("urn:dicom"), "no UID leak");
  if (!mapped) throw new Error("NO_MAPPED_IMAGING_STUDY");

  const validUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const share = await request("POST", `/api/v1/me/phr/imaging-studies/${mapped.imagingStudyRef}/consents`, {
    targetHospitalId: "HOSP-B",
    purpose: "TREATMENT",
    permission: "VIEW_ONLY",
    validUntil,
  }, patientHeaders);
  record("PHR→동의 생성(201)", share.status === 201 && share.body.data?.status === "ACTIVE" && share.body.data?.consentId, `${share.status}`);
  record("동의 응답 UID 비노출", !JSON.stringify(share.body).includes("1.2.826"), "no UID leak");
  if (share.status !== 201) throw new Error(`PHR_SHARE_FAILED ${share.status} ${JSON.stringify(share.body)}`);
  const consentId = share.body.data.consentId;

  const unmappedPatientB = await request("GET", "/api/v1/me/phr/imaging-studies", undefined, {
    ...patientHeaders,
    "x-hipass-user-id": `phr-e2e-account-b-${suffix}`,
    "x-hipass-patient-id": "P-1002",
  });
  const unmapped = unmappedPatientB.body.data?.find((item) => item.mappingStatus === "NOT_MAPPED");
  const unmappedShare = unmapped ? await request("POST", `/api/v1/me/phr/imaging-studies/${unmapped.imagingStudyRef}/consents`, {
    targetHospitalId: "HOSP-A",
    purpose: "TREATMENT",
    permission: "VIEW_ONLY",
    validUntil,
  }, { ...patientHeaders, "x-hipass-user-id": `phr-e2e-account-b-${suffix}`, "x-hipass-patient-id": "P-1002" }) : null;
  record("NOT_MAPPED 동의 거부(fail-closed)", unmappedShare?.status === 403 && unmappedShare.body.code === "PHR_IMAGING_NOT_MAPPED", `${unmappedShare?.status} ${unmappedShare?.body?.code}`);

  const access = await request("POST", "/api/dicom-access/request", {
    consentId,
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: PHR_STUDY_UID,
    seriesInstanceUid: PHR_SERIES_UID,
    purpose: "TREATMENT",
    requestedAction: "VIEW",
  }, doctorHeaders("DOC-B-01", "HOSP-B"));
  record("의료진 접근정책 검증+단기토큰", access.status === 200 && access.body.decision === "ALLOWED" && access.body.accessToken, `${access.status} ${access.body.decision ?? access.body.reasonCode}`);
  if (!access.body?.accessToken) throw new Error("PHR_TOKEN_FAILED");
  const token = access.body.accessToken;
  const auditSessionId = access.body.auditSessionId;

  const series = await request("GET", `/dicomweb/studies/${PHR_STUDY_UID}/series`, undefined, { authorization: `Bearer ${token}` });
  record("Orthanc live QIDO Series", series.status === 200 && Array.isArray(series.body) && series.body.length === 1, `${series.status} count=${Array.isArray(series.body) ? series.body.length : "n/a"}`);

  const instances = await request("GET", `/dicomweb/studies/${PHR_STUDY_UID}/series/${PHR_SERIES_UID}/instances`, undefined, { authorization: `Bearer ${token}` });
  record("Orthanc live QIDO Instances", instances.status === 200 && Array.isArray(instances.body) && instances.body.length >= 1, `${instances.status} count=${Array.isArray(instances.body) ? instances.body.length : "n/a"}`);
  const sopUid = instances.body?.[0]?.["00080018"]?.Value?.[0];

  const wado = await fetch(`${baseUrl}/dicomweb/studies/${PHR_STUDY_UID}/series/${PHR_SERIES_UID}/instances/${sopUid}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const bytes = wado.status === 200 ? await wado.arrayBuffer() : null;
  record("WADO 실 영상 바이트 스트리밍", wado.status === 200 && bytes.byteLength > 128, `status=${wado.status} bytes=${bytes?.byteLength}`);

  const download = await request("GET", `/dicomweb/studies/${PHR_STUDY_UID}/series/${PHR_SERIES_UID}/instances/${sopUid}/download`, undefined, { authorization: `Bearer ${token}` });
  record("VIEW_ONLY 다운로드 거부", download.status === 403, `${download.status} ${download.body?.error}`);

  const outOfScopeSeries = await request("GET", `/dicomweb/studies/${PHR_STUDY_UID}/series/1.2.826.0.1.3680043.10.5432.20260908.1001.9.1/instances`, undefined, { authorization: `Bearer ${token}` });
  record("토큰 범위 외 Series 거부", outOfScopeSeries.status === 403, `${outOfScopeSeries.status} ${outOfScopeSeries.body?.error}`);

  const revoke = await request("POST", `/api/consents/${consentId}/revoke`, { actorId: "P-1001" }, patientHeaders);
  record("동의 철회", revoke.status === 200 && revoke.body.status === "REVOKED", `${revoke.status}`);
  const afterRevoke = await request("POST", "/api/dicom-access/request", {
    consentId,
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: PHR_STUDY_UID,
    seriesInstanceUid: PHR_SERIES_UID,
    purpose: "TREATMENT",
    requestedAction: "VIEW",
  }, doctorHeaders("DOC-B-01", "HOSP-B"));
  record("철회 후 신규 토큰 거부", afterRevoke.status === 403 && afterRevoke.body.reasonCode === "CONSENT_REVOKED", `${afterRevoke.status} ${afterRevoke.body.reasonCode}`);

  const auditLogs = await request("GET", "/api/audit-logs?limit=500", undefined, securityHeaders);
  const actions = (auditLogs.body ?? []).map((log) => log.action);
  record("감사 PHR_SHARE_INTENT_CREATED", actions.includes("PHR_SHARE_INTENT_CREATED"), "");
  record("감사 세션 연결", ["TOKEN_ISSUED", "IMAGE_VIEWED"].every((action) => (auditLogs.body ?? []).some((log) => log.action === action && log.auditSessionId === auditSessionId))
    || ["ACCESS_ALLOWED", "TOKEN_ISSUED"].every((action) => actions.includes(action)), `session=${auditSessionId}`);
  const phrLeaks = (auditLogs.body ?? []).filter((log) => String(log.action).startsWith("PHR_"));
  record("PHR 감사 UID 비노출", !JSON.stringify(phrLeaks).includes("1.2.826"), `${phrLeaks.length} events`);
} catch (error) {
  record("FATAL", false, `${error.name}: ${error.message}`);
}

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({ check: "PHR-W07 vertical path live E2E", baseUrl, results, overall: failed.length === 0 ? "PASS" : "FAIL" }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;

function record(name, pass, detail) {
  results.push({ name, result: pass ? "PASS" : "FAIL", detail });
}

async function request(method, pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: response.status, body: parsed };
}

function loadLocalEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replaceAll(/^"|"$/g, "");
  }
}
