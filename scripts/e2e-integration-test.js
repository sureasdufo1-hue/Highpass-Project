import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

loadLocalEnvFile();

if (process.env.NODE_TEST_CONTEXT && process.env.RUN_HIPASS_E2E !== "1") {
  console.log("Skipping live E2E script during node --test. Run with node scripts/e2e-integration-test.js.");
  process.exit(0);
}

const execFileAsync = promisify(execFile);
const baseUrl = process.env.HIPASS_E2E_BASE_URL ?? "http://localhost:3300";
const viewerUrl = process.env.HIPASS_E2E_VIEWER_URL ?? "http://localhost:3001";
const now = new Date();
const suffix = `${now.getTime()}`;

const studyUid = "1.2.410.100.1.20260620.001";
const allowedSeriesUid = "1.2.410.100.1.20260620.001.1";
const deniedSeriesUid = "1.2.410.100.1.20260620.001.2";
const sopUid = `${allowedSeriesUid}.1`;

const metrics = {};
const results = [];

try {
  await checkDockerFacingServices();
  await runSecurityAndHappyPath();
  await verifyControlPlaneDoesNotStoreDicom();
  printReport();
} catch (error) {
  console.error(JSON.stringify({ fatal: error.message, stack: error.stack }, null, 2));
  process.exit(1);
}

async function checkDockerFacingServices() {
  const health = await timed("health", () => getJson("/api/health"));
  record("Backend / Control Plane health", health.status === 200 && health.body.status === "UP", "UP", `${health.status} ${JSON.stringify(health.body)}`);

  const viewer = await timed("viewerInitialLoad", () => fetch(viewerUrl));
  record("Viewer initial HTTP load", viewer.status < 500, "success", `${viewer.status}`);
}

async function runSecurityAndHappyPath() {
  const noConsent = await timed("preConsentAccess", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: `CONSENT-NOT-FOUND-${suffix}`,
  })));
  record("동의 전 접근", noConsent.status === 403 && noConsent.body.reasonCode === "ACCESS_DENIED_NO_CONSENT", "DENIED ACCESS_DENIED_NO_CONSENT", `${noConsent.status} ${noConsent.body.reasonCode}`);

  const consent = await timed("createConsent", () => postJson("/api/consents", {
    patientId: "P-1001",
    sourceHospitalId: "HOSP-A",
    targetHospitalId: "HOSP-B",
    purpose: "TRANSFER",
    permission: "VIEW_ONLY",
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.000Z",
    scopes: [
      {
        studyInstanceUid: studyUid,
        seriesInstanceUid: allowedSeriesUid,
      },
    ],
  }));
  record("ACTIVE Consent 생성", consent.status === 201 && consent.body.status === "ACTIVE", "ACTIVE", `${consent.status} ${consent.body.consentId ?? consent.body.error}`);

  const allowed = await timed("tokenIssue", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
  })));
  record("동의 후 접근", allowed.status === 200 && allowed.body.decision === "ALLOWED" && allowed.body.accessToken, "ALLOWED token issued", `${allowed.status} ${allowed.body.decision}`);

  const token = allowed.body.accessToken;
  const auditSessionId = allowed.body.auditSessionId;

  const seriesMismatch = await timed("seriesMismatch", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
    seriesInstanceUid: deniedSeriesUid,
  })));
  record("범위 외 Series", seriesMismatch.status === 403 && seriesMismatch.body.reasonCode === "SERIES_SCOPE_MISMATCH", "DENIED SERIES_SCOPE_MISMATCH", `${seriesMismatch.status} ${seriesMismatch.body.reasonCode}`);

  const series = await timed("seriesList", () => getJson(`/dicomweb/studies/${studyUid}/series`, token));
  record("Gateway Series 조회", series.status === 200 && Array.isArray(series.body) && series.body.length === 1, "1 allowed series", `${series.status} count=${Array.isArray(series.body) ? series.body.length : "n/a"}`);

  const instances = await timed("instanceList", () => getJson(`/dicomweb/studies/${studyUid}/series/${allowedSeriesUid}/instances`, token));
  record("Gateway Instance 조회", instances.status === 200 && Array.isArray(instances.body) && instances.body.length >= 1, "instance list", `${instances.status} count=${Array.isArray(instances.body) ? instances.body.length : "n/a"}`);

  const instance = await timed("wadoInstance", () => fetch(`${baseUrl}/dicomweb/studies/${studyUid}/series/${allowedSeriesUid}/instances/${sopUid}`, {
    headers: { authorization: `Bearer ${token}` },
  }));
  const bytes = await instance.arrayBuffer();
  record("Viewer 영상 표시 대체 검증", instance.status === 200 && bytes.byteLength > 0, "DICOM bytes streamed", `${instance.status} bytes=${bytes.byteLength}`);

  const download = await timed("viewOnlyDownload", () => fetch(`${baseUrl}/dicomweb/studies/${studyUid}/series/${allowedSeriesUid}/instances/${sopUid}/download`, {
    headers: { authorization: `Bearer ${token}` },
  }).then(toJsonResponse));
  record("VIEW_ONLY 다운로드", download.status === 403 && download.body.error === "TOKEN_PERMISSION_MISMATCH", "DENIED TOKEN_PERMISSION_MISMATCH", `${download.status} ${download.body.error}`);

  const tampered = tamperToken(token);
  const tamperedResult = await timed("tamperedToken", () => postJson("/gateway/token/introspect", {
    token: tampered,
    targetHospitalId: "HOSP-B",
    studyInstanceUid: studyUid,
    requestedAction: "VIEW",
  }));
  record("변조 토큰", tamperedResult.body.active === false && tamperedResult.body.reason === "TOKEN_INVALID", "DENIED TOKEN_INVALID", JSON.stringify(tamperedResult.body));

  const badSignature = await timed("badSignature", () => postJson("/gateway/token/introspect", {
    token: `${token.slice(0, -1)}x`,
    targetHospitalId: "HOSP-B",
    studyInstanceUid: studyUid,
    requestedAction: "VIEW",
  }));
  record("잘못된 서명", badSignature.body.active === false && badSignature.body.reason === "TOKEN_INVALID", "DENIED TOKEN_INVALID", JSON.stringify(badSignature.body));

  const directGateway = await timed("gatewayDirectNoToken", () => getJson("/dicomweb/studies"));
  record("Gateway 직접 우회", directGateway.status === 403 && directGateway.body.error === "TOKEN_INVALID", "DENIED TOKEN_INVALID", `${directGateway.status} ${directGateway.body.error}`);

  const purposeMismatch = await timed("purposeMismatch", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
    purpose: "CONSULTATION",
  })));
  record("목적 불일치", purposeMismatch.status === 403 && purposeMismatch.body.reasonCode === "PURPOSE_MISMATCH", "DENIED PURPOSE_MISMATCH", `${purposeMismatch.status} ${purposeMismatch.body.reasonCode}`);

  const doctorMismatch = await timed("doctorMismatch", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
    doctorId: "DOC-C-01",
  })));
  record("타 병원 의료진/소속 불일치", doctorMismatch.status === 403 && doctorMismatch.body.reasonCode === "DOCTOR_HOSPITAL_MISMATCH", "DENIED DOCTOR_HOSPITAL_MISMATCH", `${doctorMismatch.status} ${doctorMismatch.body.reasonCode}`);

  const studyMismatch = await timed("studyMismatch", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
    studyInstanceUid: "1.2.410.100.1.20260518.002",
    seriesInstanceUid: "1.2.410.100.1.20260518.002.1",
  })));
  record("Study 불일치", studyMismatch.status === 403 && studyMismatch.body.reasonCode === "STUDY_SCOPE_MISMATCH", "DENIED STUDY_SCOPE_MISMATCH", `${studyMismatch.status} ${studyMismatch.body.reasonCode}`);

  const revoked = await timed("revokeConsent", () => postJson(`/api/consents/${consent.body.consentId}/revoke`, {
    actorId: "P-1001",
  }));
  record("Consent 철회", revoked.status === 200 && revoked.body.status === "REVOKED", "REVOKED", `${revoked.status} ${revoked.body.status}`);

  const afterRevoke = await timed("afterRevokeToken", () => postJson("/api/dicom-access/request", accessPayload({
    consentId: consent.body.consentId,
  })));
  record("동의 철회 후 신규 토큰", afterRevoke.status === 403 && afterRevoke.body.reasonCode === "CONSENT_REVOKED" && !afterRevoke.body.accessToken, "DENIED no token", `${afterRevoke.status} ${afterRevoke.body.reasonCode}`);

  const expiredToken = await makeExpiredToken();
  const expiredResult = await timed("expiredToken", () => postJson("/gateway/token/introspect", {
    token: expiredToken,
    targetHospitalId: "HOSP-B",
    studyInstanceUid: studyUid,
    seriesInstanceUid: allowedSeriesUid,
    requestedAction: "VIEW",
  }));
  record("토큰 만료", expiredResult.body.active === false && expiredResult.body.reason === "TOKEN_EXPIRED", "DENIED TOKEN_EXPIRED", JSON.stringify(expiredResult.body));

  const sessionLogs = await getJson(`/api/audit-logs?limit=200`);
  const normalSessionActions = sessionLogs.body
    .filter((log) => log.auditSessionId === auditSessionId)
    .map((log) => log.action);
  record(
    "AuditLog 정상 세션",
    ["ACCESS_ALLOWED", "TOKEN_ISSUED", "IMAGE_VIEWED"].every((action) => normalSessionActions.includes(action)),
    "ACCESS_ALLOWED/TOKEN_ISSUED/IMAGE_VIEWED",
    normalSessionActions.join(","),
  );
  const deniedLogs = sessionLogs.body.filter((log) => log.action === "ACCESS_DENIED" && log.reasonCode);
  record("AuditLog 거부 세션", deniedLogs.length > 0, "ACCESS_DENIED with reasonCode", `count=${deniedLogs.length}`);
}

async function makeExpiredToken() {
  const consent = await postJson("/api/consents", {
    patientId: "P-1001",
    sourceHospitalId: "HOSP-A",
    targetHospitalId: "HOSP-B",
    purpose: "TRANSFER",
    permission: "VIEW_ONLY",
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.000Z",
    scopes: [{ studyInstanceUid: studyUid, seriesInstanceUid: allowedSeriesUid }],
  });
  if (consent.status !== 201) throw new Error(`Failed to create expiry consent: ${JSON.stringify(consent.body)}`);
  const crypto = await import("node:crypto");
  const secret = process.env.DICOM_TOKEN_SECRET ?? "local-dev-32-byte-minimum-secret-for-compose";
  const claims = {
    jti: `e2e-expired-${suffix}`,
    consentId: consent.body.consentId,
    doctorId: "DOC-B-01",
    targetHospitalId: "HOSP-B",
    studyInstanceUid: studyUid,
    allowedSeriesUids: [allowedSeriesUid],
    permission: "VIEW_ONLY",
    purpose: "TRANSFER",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    auditSessionId: `e2e-expired-session-${suffix}`,
  };
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(JSON.stringify(claims));
  const token = `${header}.${payload}.${crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
  await insertExpiredTokenLog(claims, token, crypto);
  await restartControlApi();
  return token;
}

async function insertExpiredTokenLog(claims, token, crypto) {
  const connectionString = process.env.HIPASS_E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (process.env.HIPASS_E2E_DATABASE_DOCKER === "1") {
    await insertExpiredTokenLogViaDocker(claims, token, crypto);
    return;
  }
  if (!connectionString) {
    throw new Error("HIPASS_E2E_DATABASE_URL or DATABASE_URL is required for TOKEN_EXPIRED E2E verification");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO dicom_access_token_logs (
         token_id, token, audit_session_id, consent_id, doctor_id, target_hospital_id,
         study_instance_uid, series_instance_uid, allowed_series_uids, permission, purpose,
         issued_at, expires_at, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)
       ON CONFLICT (token_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, status = 'ACTIVE'`,
      [
        claims.jti,
        `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`,
        claims.auditSessionId,
        claims.consentId,
        claims.doctorId,
        claims.targetHospitalId,
        claims.studyInstanceUid,
        claims.allowedSeriesUids[0],
        JSON.stringify(claims.allowedSeriesUids),
        claims.permission,
        claims.purpose,
        claims.issuedAt,
        claims.expiresAt,
        "ACTIVE",
      ],
    );
  } finally {
    await client.end();
  }
}

async function insertExpiredTokenLogViaDocker(claims, token, crypto) {
  const tokenDigest = `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`;
  const sql = `
    INSERT INTO dicom_access_token_logs (
      token_id, token, audit_session_id, consent_id, doctor_id, target_hospital_id,
      study_instance_uid, series_instance_uid, allowed_series_uids, permission, purpose,
      issued_at, expires_at, status
    )
    VALUES (
      ${sqlLiteral(claims.jti)},
      ${sqlLiteral(tokenDigest)},
      ${sqlLiteral(claims.auditSessionId)},
      ${sqlLiteral(claims.consentId)},
      ${sqlLiteral(claims.doctorId)},
      ${sqlLiteral(claims.targetHospitalId)},
      ${sqlLiteral(claims.studyInstanceUid)},
      ${sqlLiteral(claims.allowedSeriesUids[0])},
      ${sqlLiteral(JSON.stringify(claims.allowedSeriesUids))}::jsonb,
      ${sqlLiteral(claims.permission)},
      ${sqlLiteral(claims.purpose)},
      ${sqlLiteral(claims.issuedAt)},
      ${sqlLiteral(claims.expiresAt)},
      'ACTIVE'
    )
    ON CONFLICT (token_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, status = 'ACTIVE';
  `;
  await execFileAsync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "hipass_app", "-d", "hipass", "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function restartControlApi() {
  await execFileAsync("docker", ["restart", "hipass-control-api"]);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson("/api/health");
      if (health.status === 200 && health.body.status === "UP") return;
    } catch {
      // retry until the control API is healthy again
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("hipass-control-api did not become healthy after restart");
}

async function verifyControlPlaneDoesNotStoreDicom() {
  const transfer = await getJson("/api/transfer-usage");
  const hasBinary = JSON.stringify(transfer.body).includes("DICM");
  record("원본 DICOM Control Plane 미저장", transfer.status === 200 && !hasBinary, "no DICM payload in API logs", `${transfer.status} binaryMarker=${hasBinary}`);
}

function accessPayload(overrides = {}) {
  return {
    consentId: overrides.consentId,
    doctorId: overrides.doctorId ?? "DOC-B-01",
    requestingHospitalId: overrides.requestingHospitalId ?? "HOSP-B",
    studyInstanceUid: overrides.studyInstanceUid ?? studyUid,
    seriesInstanceUid: overrides.seriesInstanceUid ?? allowedSeriesUid,
    purpose: overrides.purpose ?? "TRANSFER",
    requestedAction: overrides.requestedAction ?? "VIEW",
  };
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...principalHeadersFor(path, body) },
    body: JSON.stringify(body),
  });
  return toJsonResponse(response);
}

async function getJson(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : principalHeadersFor(path),
  });
  return toJsonResponse(response);
}

function principalHeadersFor(path, body = {}) {
  if (path.startsWith("/dicomweb")) return {};
  if (path.startsWith("/gateway/token/introspect")) {
    return {
      "x-hipass-role": "SECURITY_ADMIN",
      "x-hipass-user-id": "SECURITY-ADMIN-E2E",
      "x-hipass-session-id": `e2e-security-${suffix}`,
    };
  }
  if (path.startsWith("/api/audit-logs") || path.startsWith("/api/transfer-usage")) {
    return {
      "x-hipass-role": "SECURITY_ADMIN",
      "x-hipass-user-id": "SECURITY-ADMIN-E2E",
      "x-hipass-session-id": `e2e-security-${suffix}`,
    };
  }
  if (path.startsWith("/api/dicom-access")) {
    return {
      "x-hipass-role": "DOCTOR",
      "x-hipass-user-id": body.doctorId ?? "DOC-B-01",
      "x-hipass-doctor-id": body.doctorId ?? "DOC-B-01",
      "x-hipass-hospital-id": body.requestingHospitalId ?? "HOSP-B",
      "x-hipass-session-id": `e2e-doctor-${suffix}`,
    };
  }
  if (path.startsWith("/api/consents")) {
    return {
      "x-hipass-role": "PATIENT",
      "x-hipass-user-id": "P-1001",
      "x-hipass-patient-id": "P-1001",
      "x-hipass-session-id": `e2e-patient-${suffix}`,
    };
  }
  return {};
}

async function toJsonResponse(response) {
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function timed(name, fn) {
  const start = performance.now();
  const result = await fn();
  metrics[name] = Math.round((performance.now() - start) * 100) / 100;
  return result;
}

function record(name, ok, expected, actual) {
  results.push({
    name,
    expected,
    actual,
    verdict: ok ? "PASS" : "FAIL",
  });
}

function tamperToken(token) {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  claims.studyInstanceUid = "1.2.410.tampered";
  return `${header}.${b64(JSON.stringify(claims))}.${signature}`;
}

function b64(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function printReport() {
  const report = {
    baseUrl,
    viewerUrl,
    generatedAt: new Date().toISOString(),
    metricsMs: metrics,
    results,
    summary: {
      pass: results.filter((result) => result.verdict === "PASS").length,
      fail: results.filter((result) => result.verdict === "FAIL").length,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.fail > 0) process.exit(1);
}

function loadLocalEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
