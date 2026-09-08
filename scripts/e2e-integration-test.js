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
const requestTimeoutMs = positiveInteger(process.env.HIPASS_E2E_REQUEST_TIMEOUT_MS, 10_000);
const dockerTimeoutMs = positiveInteger(process.env.HIPASS_E2E_DOCKER_TIMEOUT_MS, 20_000);
const restartTimeoutMs = positiveInteger(process.env.HIPASS_E2E_RESTART_TIMEOUT_MS, 60_000);
const scriptTimeoutMs = positiveInteger(process.env.HIPASS_E2E_TIMEOUT_MS, 180_000);
const now = new Date();
const suffix = `${now.getTime()}`;

const studyUid = "1.2.410.100.1.20260620.001";
const allowedSeriesUid = "1.2.410.100.1.20260620.001.1";
const deniedSeriesUid = "1.2.410.100.1.20260620.001.2";
const sopUid = `${allowedSeriesUid}.1`;

const metrics = {};
const results = [];
let currentStep = "bootstrap";
let timeoutFired = false;

const scriptTimer = setTimeout(() => {
  timeoutFired = true;
  console.error(JSON.stringify({
    fatal: "HTTPS_E2E_SCRIPT_TIMEOUT",
    currentStep,
    timeoutMs: scriptTimeoutMs,
    generatedAt: new Date().toISOString(),
  }, null, 2));
  process.exit(124);
}, scriptTimeoutMs);

try {
  await checkDockerFacingServices();
  await runSecurityAndHappyPath();
  await verifyControlPlaneDoesNotStoreDicom();
  clearTimeout(scriptTimer);
  printReport();
} catch (error) {
  clearTimeout(scriptTimer);
  console.error(JSON.stringify({
    fatal: error.message,
    code: error.code,
    step: error.step ?? currentStep,
    timeoutMs: error.timeoutMs,
    stack: error.stack,
  }, null, 2));
  process.exit(1);
}

process.on("beforeExit", () => {
  if (!timeoutFired) clearTimeout(scriptTimer);
});

async function checkDockerFacingServices() {
  if (process.env.HIPASS_E2E_DATABASE_DOCKER === "1") {
    await timed("dockerComposeHealth", assertComposeServicesReady, { timeoutMs: dockerTimeoutMs });
  }

  const health = await timed("health", () => getJson("/api/health"));
  record("Backend / Control Plane health", health.status === 200 && health.body.status === "UP", "UP", `${health.status} ${JSON.stringify(health.body)}`);

  const viewer = await timed("viewerInitialLoad", () => fetchWithTimeout(viewerUrl, {}, "viewerInitialLoad"));
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

  const instance = await timed("wadoInstance", () => fetchWithTimeout(`${baseUrl}/dicomweb/studies/${studyUid}/series/${allowedSeriesUid}/instances/${sopUid}`, {
    headers: { authorization: `Bearer ${token}` },
  }, "wadoInstance"));
  const bytes = await instance.arrayBuffer();
  record("Viewer 영상 표시 대체 검증", instance.status === 200 && bytes.byteLength > 0, "DICOM bytes streamed", `${instance.status} bytes=${bytes.byteLength}`);

  const download = await timed("viewOnlyDownload", () => fetchWithTimeout(`${baseUrl}/dicomweb/studies/${studyUid}/series/${allowedSeriesUid}/instances/${sopUid}/download`, {
    headers: { authorization: `Bearer ${token}` },
  }, "viewOnlyDownload").then(toJsonResponse));
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

  const expiredToken = await timed("makeExpiredToken", makeExpiredToken, { timeoutMs: restartTimeoutMs + dockerTimeoutMs });
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
  // Keep the synthetic expired-token fixture aligned with Compose's documented
  // development-only default. Production configurations must inject a secret.
  const secret = process.env.DICOM_TOKEN_SECRET ?? "replace-with-local-32-byte-minimum-secret";
  const claims = {
    jti: `e2e-expired-${suffix}`,
    iss: "highpass-control-plane",
    aud: "highpass-dicomweb-gateway",
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
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: requestTimeoutMs,
    query_timeout: requestTimeoutMs,
    statement_timeout: requestTimeoutMs,
  });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO dicom_access_token_logs (
         token_id, token_hash, jti, issuer, audience, scope, audit_session_id,
         consent_id, doctor_id, target_hospital_id, study_instance_uid, series_instance_uid,
         allowed_series_uids, permission, purpose, issued_at, expires_at, status
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, $18)
       ON CONFLICT (token_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, issuer = EXCLUDED.issuer,
         audience = EXCLUDED.audience, expires_at = EXCLUDED.expires_at, status = 'ACTIVE'`,
      [
        claims.jti,
        `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`,
        claims.jti,
        claims.iss,
        claims.aud,
        JSON.stringify({ studyInstanceUid: claims.studyInstanceUid, allowedSeriesUids: claims.allowedSeriesUids, permission: claims.permission }),
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
      token_id, token_hash, jti, issuer, audience, scope, audit_session_id,
      consent_id, doctor_id, target_hospital_id, study_instance_uid, series_instance_uid,
      allowed_series_uids, permission, purpose, issued_at, expires_at, status
    )
    VALUES (
      ${sqlLiteral(claims.jti)},
      ${sqlLiteral(tokenDigest)},
      ${sqlLiteral(claims.jti)},
      ${sqlLiteral(claims.iss)},
      ${sqlLiteral(claims.aud)},
      ${sqlLiteral(JSON.stringify({ studyInstanceUid: claims.studyInstanceUid, allowedSeriesUids: claims.allowedSeriesUids, permission: claims.permission }))}::jsonb,
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
    ON CONFLICT (token_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, issuer = EXCLUDED.issuer,
      audience = EXCLUDED.audience, expires_at = EXCLUDED.expires_at, status = 'ACTIVE';
  `;
  await runCommand("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "hipass_app", "-d", "hipass", "-v", "ON_ERROR_STOP=1", "-c", sql], "insertExpiredTokenLogViaDocker");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function restartControlApi() {
  await runCommand("docker", ["restart", "hipass-control-api"], "restartControlApi");
  const deadline = Date.now() + restartTimeoutMs;
  let lastError = "not checked";
  while (Date.now() < deadline) {
    try {
      const health = await getJson("/api/health");
      if (health.status === 200 && health.body.status === "UP") return;
      lastError = `${health.status} ${JSON.stringify(health.body)}`;
    } catch {
      lastError = "health request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`hipass-control-api did not become healthy after restart: ${lastError}`);
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
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...principalHeadersFor(path, body) },
    body: JSON.stringify(body),
  }, `POST ${path}`);
  return toJsonResponse(response);
}

async function getJson(path, token) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : principalHeadersFor(path),
  }, `GET ${path}`);
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

async function timed(name, fn, options = {}) {
  const start = performance.now();
  currentStep = name;
  logStep("START", { step: name, target: options.target });
  const timeoutMs = options.timeoutMs ?? requestTimeoutMs;
  let timeout;
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`Step timed out after ${timeoutMs}ms`);
          error.code = "STEP_TIMEOUT";
          error.step = name;
          error.timeoutMs = timeoutMs;
          reject(error);
        }, timeoutMs);
      }),
    ]);
    metrics[name] = Math.round((performance.now() - start) * 100) / 100;
    logStep("PASS", { step: name, elapsedMs: metrics[name] });
    return result;
  } catch (error) {
    metrics[name] = Math.round((performance.now() - start) * 100) / 100;
    error.step = error.step ?? name;
    logStep("FAIL", {
      step: name,
      elapsedMs: metrics[name],
      code: error.code,
      reason: error.message,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    timeoutPolicy: {
      requestTimeoutMs,
      dockerTimeoutMs,
      restartTimeoutMs,
      scriptTimeoutMs,
    },
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

async function fetchWithTimeout(url, options = {}, step = "fetch") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`HTTP request timed out after ${requestTimeoutMs}ms: ${redactUrl(url)}`);
      timeoutError.code = "HTTP_REQUEST_TIMEOUT";
      timeoutError.step = step;
      timeoutError.timeoutMs = requestTimeoutMs;
      throw timeoutError;
    }
    error.step = step;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertComposeServicesReady() {
  const { stdout } = await runCommand("docker", ["compose", "ps", "--format", "json"], "dockerComposeHealth");
  const services = parseComposePs(stdout);
  const required = ["hipass-edge", "hipass-control-api", "postgres", "hospital-a-orthanc-mtls", "hospital-a-orthanc", "hospital-b-viewer"];
  const failures = [];

  for (const serviceName of required) {
    const service = services.find((item) => item.Service === serviceName || item.Name === serviceName || item.Names === serviceName);
    if (!service) {
      failures.push(`${serviceName}:missing`);
      continue;
    }
    const state = String(service.State ?? "").toLowerCase();
    const health = String(service.Health ?? "").toLowerCase();
    if (state !== "running" || (health && health !== "healthy")) {
      failures.push(`${serviceName}:state=${service.State ?? "unknown"} health=${service.Health ?? "n/a"}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Docker Compose services are not ready: ${failures.join("; ")}`);
  }
}

function parseComposePs(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function runCommand(command, args, step) {
  logStep("COMMAND_START", { step, command, args: sanitizeArgs(args) });
  const start = performance.now();
  try {
    const result = await execFileAsync(command, args, {
      timeout: dockerTimeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5,
    });
    logStep("COMMAND_PASS", {
      step,
      elapsedMs: Math.round((performance.now() - start) * 100) / 100,
      exitCode: 0,
    });
    return result;
  } catch (error) {
    if (error.killed || error.signal === "SIGTERM") {
      error.code = error.code ?? "COMMAND_TIMEOUT";
      error.message = `${command} ${sanitizeArgs(args).join(" ")} timed out after ${dockerTimeoutMs}ms`;
    }
    error.step = step;
    error.stdout = undefined;
    error.stderr = error.stderr ? String(error.stderr).slice(0, 2000) : undefined;
    logStep("COMMAND_FAIL", {
      step,
      elapsedMs: Math.round((performance.now() - start) * 100) / 100,
      exitCode: error.code,
      reason: error.message,
    });
    throw error;
  }
}

function logStep(status, details) {
  console.error(`[HTTPS-E2E][${status}] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...details,
  })}`);
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return String(value).replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeArgs(args) {
  return args.map((arg) => {
    const value = String(arg);
    if (value.length > 160) return `${value.slice(0, 160)}...[truncated]`;
    return value;
  });
}
