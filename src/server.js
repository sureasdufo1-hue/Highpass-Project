import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  AuthError,
  InternalServiceProvider,
  PrincipalRole,
  applyAuditScope,
  assertDoctorPrincipal,
  assertDoctorPrincipalAudited,
  assertPatientPrincipal,
  authenticateRequest,
  canReadAuditLogs,
  isPrivilegedAdmin,
  requireInternalServiceScope,
  requireRoles,
  validateAuthConfiguration,
} from "./auth.js";
import { HipassService, ServiceValidationError } from "./services.js";
import { authorizeDataPlane, recordDataPlaneReady, isLegacyImageOperation } from "./data-plane-authorization.js";
import { ingressMeta, validateIngressConfig } from "./ingress.js";
import { createStoreFromEnv } from "./store-factory.js";
import { getBearerToken, readJson, RequestBodyError, sendError, sendJson, sendProblem, serveStatic } from "./http-utils.js";
import { PhrProviderError, PhrProviderErrorCode, SyntheticFhirProvider } from "./health-data-provider.js";
import { PhrService } from "./phr-service.js";
import { OpfLocalAdapter } from "./privacy-adapter.js";
import { PrivacyProcessingError } from "./privacy-contracts.js";
import { PrivacyTextInspectionService } from "./privacy-service.js";
import { createPrivacyHttpHandler } from "./privacy-http-handler.js";
import { createCapstoneMockIdp } from "./capstone-mock-idp.js";
import { registerPhantomCatalog, isPhantomCatalogCommitted } from "./capstone-phantom-catalog.js";
import { createKeyReleaseHttpHandler, keyReleasePaths } from "./key-release-http-handler.js";
import { PostgresKeyReleaseRepository } from "./consent-bound-key-release.js";
import {patientKeyReleasePaths} from './patient-key-release-http-handler.js';
import { createPatientSelfViewGrantRuntime } from './patient-self-view-grant-runtime.js';
import { createPatientSelfViewGrantHttpHandler, createPatientGrantAuthenticationAudit } from './patient-self-view-grant-http-handler.js';

const port = Number(process.env.PORT ?? 3000);
validateAuthConfiguration(process.env);
validateIngressConfig(process.env);
const store = createStoreFromEnv();
await store.load();
const service = new HipassService(store);
const patientGrantRuntime = await createPatientSelfViewGrantRuntime({store,service});
const routePatientGrant = createPatientSelfViewGrantHttpHandler({issuer:patientGrantRuntime?.issuer,
  authenticate:authenticateRequest,requestMeta,auditAuthenticationDenied:createPatientGrantAuthenticationAudit(service)});
let routeKeyRelease = null;
if (process.env.HIPASS_CAPSTONE_KEY_RELEASE === "1") {
  if (process.env.HIPASS_CONTROL_PLANE_ONLY !== "1" || process.env.HIPASS_STORE !== "postgres" || !process.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN) throw new Error("KEY_RELEASE_PROFILE_REQUIRED");
  requireInternalServiceScope(new InternalServiceProvider().authenticate({ headers: { "x-hipass-service-token": process.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN } }), "gateway:package-key-release");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: store.connectionString, max: 4, connectionTimeoutMillis: 5000,
    statement_timeout: 4000, query_timeout: 5000, options: "-c lock_timeout=3000" });
  pool.on("error", () => console.warn("KEY_RELEASE_DATABASE_UNAVAILABLE"));
  const schema = await pool.query("SELECT to_regclass('capstone_key_releases') IS NOT NULL AS ready");
  if (schema.rows[0]?.ready !== true) { await pool.end(); throw new Error("KEY_RELEASE_MIGRATION_REQUIRED"); }
  await pool.query("SELECT release_id, metadata, expires_at, consumed_at FROM capstone_key_releases LIMIT 0");
  routeKeyRelease = createKeyReleaseHttpHandler({ service, repository: new PostgresKeyReleaseRepository(pool), configuration: {
    sourceHospitalId: process.env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID,
    publicBaseUrl: process.env.HIPASS_DATA_PLANE_PUBLIC_BASE_URL,
    recipientHospitalId: process.env.HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID,
    keyId: process.env.HIPASS_KEY_RELEASE_VAULT_KEY_ID,
  } });
}
const capstoneMockIdp = createCapstoneMockIdp(process.env);
const privacyService = new PrivacyTextInspectionService({ adapter: new OpfLocalAdapter() });
const privacyRequestTimeoutMs = Number(process.env.HIPASS_PRIVACY_REQUEST_TIMEOUT_MS ?? 30000);
const routePrivacy = createPrivacyHttpHandler({ service: privacyService, timeoutMs: privacyRequestTimeoutMs });
const phrCursorSecret = process.env.PHR_CURSOR_SECRET ?? process.env.DICOM_TOKEN_SECRET;
const phrReferenceSecret = process.env.PHR_REFERENCE_SECRET ?? phrCursorSecret;
const phrService = new PhrService({
  provider: new SyntheticFhirProvider({ cursorSecret: phrCursorSecret }),
  auditService: service,
  consentService: service,
  store,
  referenceSecret: phrReferenceSecret,
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (process.env.HIPASS_CONTROL_PLANE_ONLY === "1" && isLegacyImageOperation(url.pathname)) {
      await service.writeAudit({ actorType: "SYSTEM", actorId: "control-plane-boundary", action: "ACCESS_DENIED", result: "FAIL", reason: "CONTROL_PLANE_IMAGE_ROUTE_DISABLED", ipAddress: request.socket.remoteAddress });
      await store.save();
      sendJson(response, 403, { error: "CONTROL_PLANE_IMAGE_ROUTE_DISABLED" });
      return;
    }
    // Readiness discloses no protected data and must not inherit an actor's
    // security delay, otherwise negative tests can make healthy services restart.
    if (url.pathname !== "/api/health" && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dicomweb/") || url.pathname.startsWith("/gateway/"))) {
      const ingress = ingressMeta(request, process.env.HIPASS_INGRESS_SECRET);
      const clientIp = ingress.ipAddress;
      const ja3 = ingress.ja3Fingerprint;
      const tarpit = service.calculateTarpitDelay({ ipAddress: clientIp, ja3Fingerprint: ja3 });
      if (tarpit.throttled && tarpit.delayMs > 0) {
        response.setHeader("x-hipass-tarpit-delay-ms", String(tarpit.delayMs));
        response.setHeader("x-hipass-security-mode", tarpit.mode);
        await new Promise((resolve) => setTimeout(resolve, tarpit.delayMs));
      } else if (tarpit.mode) {
        response.setHeader("x-hipass-security-mode", tarpit.mode);
      }
    }
    if (url.pathname.startsWith("/internal/privacy/")) {
      await routePrivacy(request, response, url);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }
    if (url.pathname.startsWith("/dicomweb/") || url.pathname === "/dicomweb/studies") {
      await routeDicomweb(request, response, url);
      return;
    }
    if (url.pathname.startsWith("/gateway/")) {
      await routeGateway(request, response, url);
      return;
    }
    if (request.method === "GET" && /^\/t\/[A-Za-z0-9_-]{22,128}$/.test(url.pathname)) {
      await serveStatic(response, "/index.html");
      return;
    }
    if (url.pathname.startsWith("/assets/clinical/") && process.env.HIPASS_ENABLE_CURATED_DICOM !== "1") {
      sendJson(response, 404, { error: "DATASET_NOT_ENABLED" });
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    if (response.destroyed) return;
    if (error instanceof AuthError) {
      sendJson(response, error.statusCode, { error: error.code });
      return;
    }
    if (error instanceof PrivacyProcessingError || error instanceof RequestBodyError) {
      sendJson(response, error.statusCode, { error: error.code });
      return;
    }
    console.error(error);
    sendError(response, 500, "Internal server error");
  }
});

server.listen(port, () => {
  console.log(`HiPass MVP is running at http://localhost:${port}`);
});
server.on('close',()=>{patientGrantRuntime?.close().catch(()=>console.warn('PATIENT_AUTHORITY_CLOSE_FAILED'));});

async function routeApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (url.pathname === "/api/capstone-demo/login") {
    if (!capstoneMockIdp) return sendJson(response, 404, { error: "DEMO_IDP_NOT_ENABLED" });
    if (method !== "POST") return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    const meta = requestMeta(request);
    if (!meta.ingressTrusted) return sendJson(response, 403, { error: "TRUSTED_INGRESS_REQUIRED" });
    const body = await readJson(request, { maxBytes: 2048, strictUtf8: true });
    const result = capstoneMockIdp({ key: body.key, ip: meta.ipAddress, patientProfile: body.patientProfile, phantomRegistered: isPhantomCatalogCommitted(store) });
    await service.writeAudit({ actorType: "SYSTEM", actorId: "synthetic-capstone-presenter", action: result.status === 200 ? "LOGIN_SUCCESS" : "LOGIN_FAILURE", result: result.status === 200 ? "SUCCESS" : "FAIL", reason: "CAPSTONE_MOCK_IDP_ONLY", ipAddress: meta.ipAddress });
    await store.save(); // No signed credentials are released if audit persistence fails.
    response.setHeader("cache-control", "no-store");
    return sendJson(response, result.status, result.body);
  }

  if (method === "GET" && url.pathname === "/api/health") {
    const health = await getHealth();
    sendJson(response, health.status === "UP" ? 200 : 503, health);
    return;
  }

  if (method === "GET" && url.pathname === "/api/security/proof-policy") {
    sendJson(response, 200, { supported: Boolean(process.env.HIPASS_INGRESS_SECRET), required: process.env.HIPASS_DPOP_REQUIRED === "1", replayScope: service.dpopReplayStore.scope });
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/client-attestation") {
    const meta = requestMeta(request);
    const body = await readJson(request).catch(() => ({}));
    const clientSessionId = body?.clientSessionId || randomUUID();
    const result = service.issueClientAttestationToken({
      clientSessionId,
      clientPublicKeyJwk: body?.clientPublicKeyJwk || null,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
    sendJson(response, 200, result);
    return;
  }

  if (url.pathname.startsWith("/api/v1/me/phr/")) {
    const correlationId = phrCorrelationId(request);
    try {
      const phrPrincipal = authenticateRequest(request);
      await routePhr(request, response, url, phrPrincipal, correlationId);
    } catch (error) {
      sendPhrProblem(response, error, correlationId);
    }
    return;
  }

  if (await routePatientGrant(request,response,url)) return;
  const principal = authenticateRequest(request);

  if (method === "POST" && url.pathname === "/api/capstone-demo/phantom-catalog") {
    response.setHeader("cache-control", "no-store");
    try {
      const input = await readJson(request, { maxBytes: 2048, strictUtf8: true });
      const result = await registerPhantomCatalog({ service, principal, input, env: process.env, meta: requestMeta(request, principal) });
      return sendJson(response, 200, result);
    } catch (error) {
      if (process.env.HIPASS_CAPSTONE_PHANTOM_CATALOG === '1') {
        const meta = requestMeta(request, principal);
        await service.writeAudit({ actorType: principal.role, actorId: meta.actorId, hospitalId: principal.hospitalId, action: 'SYNTHETIC_CATALOG_REGISTRATION_DENIED', result: 'FAIL', reasonCode: error instanceof AuthError || error instanceof ServiceValidationError ? error.code : 'CATALOG_REGISTRATION_UNAVAILABLE', ipAddress: meta.ipAddress });
        if (store.appendOnlyChanges?.() === null) throw new AuthError(503, 'CATALOG_DENIAL_AUDIT_UNAVAILABLE');
        await store.save();
      }
      if (error instanceof ServiceValidationError) return sendJson(response, error.statusCode, { error: error.code });
      throw error;
    }
  }

  if (url.pathname.startsWith("/api/v1/mobile/")) {
    assertPatientPrincipal(principal, principal.patientId);
    response.setHeader("cache-control", "no-store");
    if (method === "GET" && url.pathname === "/api/v1/mobile/device") {
      sendJson(response, 200, {
        deviceId: null,
        patientId: principal.patientId,
        platform: "WEB_PWA_SIMULATOR",
        appVersion: "v3.0.0-mobile-core",
        status: "NOT_ENROLLED",
        attestation: "NOT VERIFIED",
        keyEnclave: "NOT VERIFIED",
        riskLevel: "NOT VERIFIED",
        simulation: true,
      });
      return;
    }
    if (method === "GET" && url.pathname === "/api/v1/mobile/vault") {
      sendJson(response, 200, {
        patientId: principal.patientId,
        vaultStatus: "NOT CONNECTED",
        storageType: "NOT VERIFIED",
        simulation: true,
        packages: [],
      });
      return;
    }
    if (method === "POST" && url.pathname === "/api/v1/mobile/vault/erase") {
      sendJson(response, 501, { error: "VAULT_NOT_CONNECTED", status: "NOT VERIFIED", simulation: true });
      return;
    }
    if (method === "POST" && url.pathname === "/api/v1/mobile/auth/login") {
      const body = await readJson(request);
      const patientId = body.patientId ?? principal.patientId;
      assertPatientPrincipal(principal, patientId);
      const authMethod = String(body.method || "BIO");
      await service.writeAudit({
        actorType: "PATIENT",
        actorId: patientId,
        action: "PATIENT_QUICK_AUTH_LOGIN",
        result: "SUCCESS",
        details: {
          method: authMethod,
          simulation: true,
          hardwareAttestation: "NOT VERIFIED",
        },
        ipAddress: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
      await store.save();
      sendJson(response, 200, {
        authenticated: true,
        patientId,
        authMethod: principal.authMethod,
        simulation: true,
        fido2Attested: false,
        enclaveVerified: false,
      });
      return;
    }
    if (method === "POST" && url.pathname === "/api/v1/mobile/auth/lock") {
      const body = await readJson(request);
      const patientId = body.patientId ?? principal.patientId;
      assertPatientPrincipal(principal, patientId);
      await service.writeAudit({
        actorType: "PATIENT",
        actorId: patientId,
        action: "PATIENT_APP_LOCKED",
        result: "SUCCESS",
        ipAddress: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
      await store.save();
      sendJson(response, 200, {
        locked: true,
        patientId,
      });
      return;
    }
  }

  if (method === "POST" && url.pathname === "/api/consents") {
    const body = await readJson(request);
    const validation = requireFields(body, ["patientId", "sourceHospitalId", "targetHospitalId", "purpose", "permission", "validUntil"]);
    if (validation) return sendError(response, 400, validation);
    assertPatientPrincipal(principal, body.patientId);
    try {
      sendJson(response, 201, await service.createConsent(body, requestMeta(request, principal)));
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && segments[1] === "consents" && segments[2] && segments.length === 3) {
    const candidate = service.getConsent(segments[2]);
    if (!candidate) return sendError(response, 404, "Consent not found");
    authorizeConsentRead(principal, candidate);
    const consent = await service.viewConsent(segments[2], principalActorId(principal), requestMeta(request, principal));
    if (!consent) return sendError(response, 404, "Consent not found");
    sendJson(response, 200, consent);
    return;
  }

  if (method === "GET" && segments[1] === "patients" && segments[2] && segments[3] === "consents") {
    assertPatientPrincipal(principal, segments[2]);
    sendJson(response, 200, service.listConsentsByPatient(segments[2]));
    return;
  }

  if (method === "POST" && segments[1] === "consents" && segments[2] && segments[3] === "revoke") {
    const consentForAuth = service.getConsent(segments[2]);
    if (!consentForAuth) return sendError(response, 404, "Consent not found");
    assertPatientPrincipal(principal, consentForAuth.patientId);
    let consent;
    try {
      consent = await service.revokeConsent(segments[2], principal.patientId);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, 409, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    if (!consent) return sendError(response, 404, "Consent not found");
    sendJson(response, 200, consent);
    return;
  }

  if (method === "GET" && segments[1] === "consents" && segments[2] && segments[3] === "handoff-tickets" && segments[4] && segments.length === 5) {
    assertPatientPrincipal(principal, principal.patientId);
    response.setHeader("Cache-Control", "no-store");
    try {
      const result = await service.viewPatientTicketStatus(segments[2], segments[4], principal.patientId, requestMeta(request, principal));
      if (!result) return sendError(response, 404, "Ticket status unavailable");
      return sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) return sendJson(response, error.statusCode, { error: error.code });
      throw error;
    }
  }

  if (method === "POST" && segments[1] === "consents" && segments[2] && segments[3] === "handoff-ticket") {
    const consentForAuth = service.getConsent(segments[2]);
    if (!consentForAuth) return sendError(response, 404, "Consent not found");
    assertPatientPrincipal(principal, consentForAuth.patientId);
    try {
      const result = await service.issueConsentHandoffTicket(
        segments[2],
        principal.patientId,
        requestMeta(request, principal),
      );
      sendJson(response, 201, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        const conflictCodes = ["HANDOFF_TICKET_ALREADY_ISSUED", "CONSENT_REVOKED", "CONSENT_EXPIRED"];
        sendJson(response, conflictCodes.includes(error.code) ? 409 : error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && segments[1] === "patients" && segments[2] && segments[3] === "transfer-requests") {
    assertPatientPrincipal(principal, segments[2]);
    sendJson(response, 200, service.listTransferRequestsByPatient(segments[2]));
    return;
  }

  if (method === "POST" && url.pathname === "/api/transfers/requests") {
    const body = await readJson(request);
    const validation = requireFields(body, ["requesterDoctorId", "patientId", "sourceHospitalId", "targetHospitalId", "purpose", "permission", "scopes"]);
    if (validation) return sendError(response, 400, validation);
    assertDoctorPrincipal(principal, {
      doctorId: body.requesterDoctorId,
      hospitalId: body.sourceHospitalId,
    });
    try {
      sendJson(response, 201, await service.createTransferRequest(body, requestMeta(request, principal)));
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && segments[1] === "transfers" && segments[2] === "requests" && segments[3] && segments[4] === "consent") {
    const body = await readJson(request);
    const validation = requireFields(body, ["patientId", "permission", "validUntil"]);
    if (validation) return sendError(response, 400, validation);
    assertPatientPrincipal(principal, body.patientId);
    try {
      const result = await service.approveTransferRequest(segments[3], body, requestMeta(request, principal));
      if (!result) return sendError(response, 404, "Transfer request not found");
      sendJson(response, 201, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode === 400 ? 400 : 409, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && segments[1] === "transfers" && segments[2] === "requests" && segments[3] && !segments[4]) {
    const candidate = service.getTransferRequest(segments[3]);
    if (!candidate) return sendError(response, 404, "Transfer request not found");
    authorizeTransferRequestRead(principal, candidate);
    sendJson(response, 200, candidate);
    return;
  }

  if (method === "POST" && url.pathname === "/api/transfers/tickets/redeem-viewer") {
    const body = await readJson(request);
    const validation = requireFields(body, ["nonce"]);
    if (validation) return sendError(response, 400, validation);
    assertDoctorPrincipal(principal, {
      doctorId: principal.doctorId,
      hospitalId: principal.hospitalId,
    });
    const result = await service.redeemViewerHandoff(body.nonce, principal, requestMeta(request, principal));
    sendJson(response, result.statusCode ?? (result.decision === "ALLOWED" ? 200 : 403), result);
    return;
  }

  if (method === "POST" && segments[1] === "transfers" && segments[2] === "tickets" && segments[3] === "redeem") {
    const body = await readJson(request);
    assertDoctorPrincipal(principal, {
      doctorId: body.doctorId,
      hospitalId: body.requestingHospitalId,
    });
    const result = await service.redeemTransferTicket(body.nonce, body, requestMeta(request, principal));
    sendJson(response, result.statusCode ?? (result.decision === "ALLOWED" ? 200 : 403), result);
    return;
  }

  if (method === "POST" && segments[1] === "patients" && segments[2] && segments[3] === "studies" && segments[4] && segments[5] === "self-view") {
    assertPatientPrincipal(principal, segments[2]);
    try {
      const result = await service.recordPatientSelfView(segments[2], segments[4], requestMeta(request, principal));
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, 404, { error: error.code, message: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/imaging-studies") {
    const patientId = url.searchParams.get("patientId") ?? principal.patientId;
    if (principal.role === PrincipalRole.PATIENT) assertPatientPrincipal(principal, patientId);
    else requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    sendJson(response, 200, service.listStudies(patientId, {
      includeSeries: url.searchParams.get("includeSeries") === "true",
    }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/dicom-access/request") {
    const body = await readJson(request);
    await assertDoctorPrincipalAudited(principal, {
      doctorId: body.doctorId,
      hospitalId: body.requestingHospitalId,
      consentId: body.consentId,
    }, async (denial) => {
      const meta = requestMeta(request, principal);
      await service.writeAudit({ ...denial, ipAddress: meta.ipAddress });
      await store.save();
    });
    const result = await service.requestDicomAccessToken(body, requestMeta(request, principal));
    sendJson(response, result.statusCode ?? (result.decision === "ALLOWED" ? 200 : 403), result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/transfers/pacs-import") {
    const body = await readJson(request);
    if (body.destDir !== undefined || body.baseDestDir !== undefined) {
      return sendJson(response, 400, { error: "CLIENT_STORAGE_PATH_NOT_ALLOWED" });
    }
    const validation = requireFields(body, ["studyInstanceUid"]);
    if (validation) return sendError(response, 400, validation);
    assertDoctorPrincipal(principal, {
      doctorId: body.doctorId,
      hospitalId: body.targetHospitalId ?? body.requestingHospitalId,
    });
    try {
      const result = await service.executePacsImport(body, requestMeta(request, principal));
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, message: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && (url.pathname === "/api/hospitals/HOSP-B/pacs-archive" || url.pathname === "/api/transfers/pacs-archive")) {
    requireRoles(principal, [PrincipalRole.DOCTOR, PrincipalRole.HOSPITAL_ADMIN]);
    if (principal.hospitalId !== "HOSP-B") throw new AuthError(403, "HOSPITAL_IDENTITY_MISMATCH");
    sendJson(response, 200, service.listHospitalBPacsArchive().map(({ keyEnvelope, destinationPath, instances, ...archive }) => ({
      ...archive,
      instances: (instances ?? []).map(({ storedPath, nonce, tag, ...instance }) => instance),
    })));
    return;
  }

  if (method === "POST" && url.pathname === "/api/policies/access-check") {
    requireRoles(principal, [PrincipalRole.DOCTOR, PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    if (principal.role === PrincipalRole.DOCTOR) {
      assertDoctorPrincipal(principal, {
        doctorId: body.doctorId,
        hospitalId: body.targetHospitalId ?? body.requestingHospitalId,
      });
    }
    sendJson(response, 200, service.checkAccess(body));
    return;
  }

  if (method === "POST" && url.pathname === "/api/research/datasets/prepare") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    try {
      sendJson(response, 200, service.prepareResearchDataset(body, requestMeta(request, principal)));
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/research/exports") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    sendJson(response, 200, service.listResearchExportRequests());
    return;
  }

  if (method === "POST" && url.pathname === "/api/research/exports") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    try {
      sendJson(response, 201, await service.requestResearchExport(body, requestMeta(request, principal)));
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && segments[1] === "research" && segments[2] === "exports" && segments[3] && segments[4] === "decision") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    try {
      const result = await service.decideResearchExport(segments[3], body, requestMeta(request, principal));
      if (!result) return sendError(response, 404, "Research export request not found");
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, details: error.details });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && segments[1] === "research" && segments[2] === "exports" && segments[3] && segments[4] === "export") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const result = await service.exportResearchDataset(segments[3], requestMeta(request, principal));
    if (!result) return sendError(response, 404, "Research export request not found");
    sendJson(response, result.decision === "ALLOWED" ? 200 : 403, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/audit-logs") {
    requireInternalServiceScope(principal, "audit:write");
    const body = await readJson(request);
    await service.writeAudit({
      ...body,
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    await store.save();
    sendJson(response, 201, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/audit-logs") {
    const filters = applyAuditScope(principal, {
      action: url.searchParams.get("action"),
      result: url.searchParams.get("result"),
      actorId: url.searchParams.get("actorId"),
      hospitalId: url.searchParams.get("hospitalId"),
      reasonCode: url.searchParams.get("reasonCode"),
      limit: Number(url.searchParams.get("limit") ?? 64),
    });
    sendJson(response, 200, service.listAuditLogs(filters));
    return;
  }

  if (["PUT", "PATCH", "DELETE"].includes(method) && url.pathname.startsWith("/api/audit-logs")) {
    await service.recordAuditMutationDenied(requestMeta(request, principal));
    sendError(response, 405, "Audit logs are append-only");
    return;
  }

  if (method === "GET" && url.pathname === "/api/anomaly-alerts") {
    canReadAuditLogs(principal);
    sendJson(response, 200, service.listAnomalyAlerts());
    return;
  }

  if (method === "GET" && url.pathname === "/api/audit-integrity") {
    canReadAuditLogs(principal);
    sendJson(response, 200, service.verifyAuditIntegrity());
    return;
  }

  if (method === "GET" && url.pathname === "/api/transfer-usage") {
    canReadAuditLogs(principal);
    sendJson(response, 200, store.get("transferUsageLogs").slice(-64).reverse());
    return;
  }

  if (method === "GET" && url.pathname === "/api/security/quarantines") {
    canReadAuditLogs(principal);
    const includeAll = url.searchParams.get("all") === "true";
    sendJson(response, 200, service.listQuarantines(includeAll));
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/quarantines") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    const validation = requireFields(body, ["actorId"]);
    if (validation) return sendError(response, 400, validation);
    const record = await service.quarantineActor({
      actorId: body.actorId,
      actorType: body.actorType,
      reason: body.reason || "MANUAL_ADMIN_QUARANTINE",
      durationMinutes: body.durationMinutes,
      ipAddress: body.ipAddress,
      auditSessionId: `session-${randomUUID()}`,
    });
    sendJson(response, 201, record);
    return;
  }

  if (method === "POST" && segments[1] === "security" && segments[2] === "quarantines" && segments[3] && segments[4] === "release") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request).catch(() => ({}));
    try {
      const record = await service.releaseQuarantine(segments[3], principalActorId(principal), body?.reason);
      sendJson(response, 200, record);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, message: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/quarantines/break-glass") {
    requireRoles(principal, [PrincipalRole.DOCTOR]);
    const body = await readJson(request);
    const validation = requireFields(body, ["doctorId", "doctorLicenseNumber", "clinicalReason"]);
    if (validation) return sendError(response, 400, validation);
    assertDoctorPrincipal(principal, { doctorId: body.doctorId });
    try {
      const result = await service.executeBreakGlassOverride(body, requestMeta(request, principal));
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof ServiceValidationError) {
        sendJson(response, error.statusCode, { error: error.code, message: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/retention/policies") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    sendJson(response, 200, service.listRetentionPolicies());
    return;
  }

  if (method === "POST" && url.pathname === "/api/retention/purge-plan") {
    requireRoles(principal, [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    sendJson(response, 200, service.planRetentionPurge());
    return;
  }

  if (method === "GET" && segments[1] === "hospitals" && segments[2] && segments[3] === "gateway") {
    authorizeGatewayRead(principal, segments[2]);
    const gateway = service.getGateway(segments[2]);
    if (!gateway) return sendError(response, 404, "Hospital not found");
    sendJson(response, 200, gateway);
    return;
  }

  sendError(response, 404, "API route not found");
}

async function routePhr(request, response, url, principal, correlationId) {
  const segments = url.pathname.split("/").filter(Boolean);
  const resourceName = segments[4];
  const resourceRef = segments[5];
  const context = {
    correlationId,
    requestedAt: new Date().toISOString(),
    ipAddress: request.socket.remoteAddress,
    userAgent: request.headers["user-agent"],
  };

  if (request.method === "POST") {
    if (resourceName === "imaging-studies" && resourceRef && segments[6] === "consents" && segments.length === 7) {
      const body = await readJson(request);
      const result = await phrService.createConsentFromImagingStudy(resourceRef, principal, body, context);
      sendJson(response, 201, result);
      return;
    }
    throw new PhrProviderError(405, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
  }
  if (request.method !== "GET") throw new PhrProviderError(405, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);

  if (resourceName === "summary" && !resourceRef) {
    sendJson(response, 200, await phrService.getSummary(principal, context));
    return;
  }
  if (resourceName === "imaging-studies" && resourceRef && segments.length === 6) {
    sendJson(response, 200, await phrService.getImagingStudy(resourceRef, principal, context));
    return;
  }
  if (["encounters", "conditions", "medications", "observations", "diagnostic-reports", "imaging-studies"].includes(resourceName) && !resourceRef) {
    sendJson(response, 200, await phrService.list(resourceName, principal, phrQuery(url), context));
    return;
  }
  throw new PhrProviderError(404, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
}

function phrQuery(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function phrCorrelationId(request) {
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(supplied) ? supplied : `phr-${randomUUID()}`;
}

function sendPhrProblem(response, error, correlationId) {
  let status = 500;
  let code = "PHR_REQUEST_FAILED";
  let retryable = false;
  if (error instanceof PhrProviderError) {
    status = error.statusCode;
    code = error.code;
    retryable = [PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED].includes(code);
  } else if (error instanceof AuthError) {
    status = error.statusCode;
    code = status === 401 ? PhrProviderErrorCode.AUTHENTICATION_REQUIRED : PhrProviderErrorCode.PATIENT_BINDING_MISMATCH;
  }
  sendProblem(response, {
    type: `urn:highpass:problem:${code.toLowerCase().replaceAll("_", "-")}`,
    title: "PHR request could not be completed",
    status,
    code,
    requestId: correlationId,
    traceId: correlationId,
    auditSessionId: correlationId,
    retryable,
  });
}

async function routeDicomweb(request, response, url) {
  // All gateway paths receive the same authenticated ingress and proof context.
  const meta = requestMeta(request);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/dicomweb/studies") {
    const result = await service.gatewayListStudies(getBearerToken(request), {
      ...meta,
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && !segments[3]) {
    const result = await service.gatewayListSeries(getBearerToken(request), segments[2], {
      ...meta,
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && !segments[4]) {
    const result = await service.gatewayListSeries(getBearerToken(request), segments[2], {
      ...meta,
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && segments[4] && !segments[5]) {
    const result = await service.gatewayListInstances(getBearerToken(request), segments[2], segments[4], {
      ...meta,
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && segments[4] && segments[5] === "instances") {
    const sopInstanceUid = segments[6] ?? null;
    if (!sopInstanceUid) {
      const result = await service.gatewayListInstances(getBearerToken(request), segments[2], segments[4], {
        ...meta,
      });
      sendJson(response, result.status, result.body);
      return;
    }
    if (segments[7] === "rendered") {
      const result = await service.gatewayRetrieveRenderedInstance(getBearerToken(request), segments[2], segments[4], sopInstanceUid, {
        ...meta,
      });
      if (result.contentType === "application/json") {
        sendJson(response, result.status, result.body);
        return;
      }
      response.writeHead(result.status, {
        "content-type": result.contentType,
        "content-disposition": "inline",
        "cache-control": "no-store",
      });
      response.end(result.body);
      return;
    }
    const isDownload = segments[7] === "download";
    const result = await (isDownload ? service.gatewayDownloadInstance : service.gatewayRetrieveInstance).call(service, getBearerToken(request), segments[2], segments[4], sopInstanceUid, {
      ...meta,
    });
    if (result.contentType === "application/json") {
      sendJson(response, result.status, result.body);
      return;
    }
    response.writeHead(result.status, {
      "content-type": result.contentType,
      "content-disposition": isDownload ? `attachment; filename="${sopInstanceUid}.dcm"` : "inline",
      "cache-control": "no-store",
    });
    response.end(result.body);
    return;
  }

  sendError(response, 404, "DICOMweb route not found");
}

async function routeGateway(request, response, url) {
  const principal = authenticateRequest(request);
  if(patientKeyReleasePaths.includes(url.pathname)){
    if(!patientGrantRuntime?.routeKeyRelease){request.resume();sendJson(response,503,{error:'PATIENT_KEY_RELEASE_DISABLED'});return;}
    await patientGrantRuntime.routeKeyRelease(request,response,url,principal);return;
  }
  if(['/gateway/patient-self-view/authorize','/gateway/patient-self-view/ready'].includes(url.pathname)){
    if(!patientGrantRuntime){request.resume();sendJson(response,503,{active:false,reason:'PATIENT_GRANT_DISABLED'});return;}
    requireInternalServiceScope(principal,'gateway:patient-self-view-authorize');
    if(request.method!=='POST' || url.search){request.resume();sendJson(response,400,{active:false,reason:'INVALID_REQUEST'});return;}
    const input=await readJson(request,{maxBytes:32768,strictUtf8:true});
    const result=await (url.pathname.endsWith('/ready')?patientGrantRuntime.authorizer.ready(input,principal):patientGrantRuntime.authorizer.authorize(input,principal));
    sendJson(response,result.statusCode,result);return;
  }
  if (keyReleasePaths.includes(url.pathname)) {
    if (!routeKeyRelease) { response.setHeader("cache-control", "no-store"); sendJson(response, 503, { error: "KEY_RELEASE_NOT_ENABLED" }); return; }
    await routeKeyRelease(request, response, url, principal);
    return;
  }
  if (request.method === "POST" && ["/gateway/data-plane/authorize", "/gateway/data-plane/ready"].includes(url.pathname)) {
    requireInternalServiceScope(principal, "gateway:data-plane-authorize");
    const operation = url.pathname.endsWith("/ready") ? recordDataPlaneReady : authorizeDataPlane;
    const result = await operation(service, await readJson(request, { maxBytes: 32768, strictUtf8: true }), {
      sourceHospitalId: process.env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID,
      publicBaseUrl: process.env.HIPASS_DATA_PLANE_PUBLIC_BASE_URL,
    });
    response.setHeader("cache-control", "no-store");
    sendJson(response, result.status, result.body);
    return;
  }
  if (request.method === "POST" && url.pathname === "/gateway/token/introspect") {
    requireRoles(principal, [PrincipalRole.INTERNAL_SERVICE, PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    if (principal.role === PrincipalRole.INTERNAL_SERVICE || principal.roles?.includes(PrincipalRole.INTERNAL_SERVICE)) {
      requireInternalServiceScope(principal, "gateway:introspect");
    }
    const body = await readJson(request);
    const rawToken = body.token ?? getBearerToken(request);
    if (!rawToken) return sendError(response, 400, "Missing required field(s): token");
    const result = await service.verifyDicomAccessToken(rawToken, body, {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.statusCode ?? 200, sanitizeTokenIntrospection(result));
    return;
  }

  if (request.method === "POST" && url.pathname === "/gateway/audit") {
    requireInternalServiceScope(principal, "audit:write");
    const body = await readJson(request);
    const validation = requireFields(body, ["actorType", "actorId", "action", "result"]);
    if (validation) return sendError(response, 400, validation);
    await service.writeAudit({
      ...body,
      ipAddress: body.ipAddress ?? request.socket.remoteAddress,
      userAgent: body.userAgent ?? request.headers["user-agent"],
    });
    await store.save();
    sendJson(response, 201, { ok: true });
    return;
  }

  if (["PUT", "PATCH", "DELETE"].includes(request.method) && url.pathname === "/gateway/audit") {
    await service.recordAuditMutationDenied(requestMeta(request, principal));
    sendError(response, 405, "Audit logs are append-only");
    return;
  }

  sendError(response, 404, "Gateway route not found");
}

function sanitizeTokenIntrospection(result) {
  if (!result.active) return result;
  return { active: true, claims: result.claims ?? result.token };
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
  return missing.length ? `Missing required field(s): ${missing.join(", ")}` : null;
}

function requestMeta(request, principal) {
  const ingress = ingressMeta(request, process.env.HIPASS_INGRESS_SECRET);
  const ipAddress = ingress.ipAddress;
  const userAgent = request.headers["user-agent"] || null;
  const ja3Fingerprint = ingress.ja3Fingerprint;
  const clientAttestationToken = request.headers["x-client-attestation"] || null;
  const dpopProof = request.headers["dpop"] || null;
  return {
    ingressTrusted: ingress.ingressTrusted,
    method: request.method,
    externalUrl: new URL(request.url, service.publicBaseUrl).href,
    authorizationScheme: String(request.headers.authorization ?? "").split(" ")[0],
    actorId: principalActorId(principal),
    actorType: principal?.actorType,
    hospitalId: principal?.hospitalId ?? null,
    ipAddress,
    userAgent,
    ja3Fingerprint,
    clientAttestationToken,
    dpopProof,
  };
}

function principalActorId(principal) {
  return principal?.doctorId ?? principal?.patientId ?? principal?.userId ?? "UNKNOWN";
}

function authorizeConsentRead(principal, consent) {
  if (principal.role === PrincipalRole.PATIENT) {
    assertPatientPrincipal(principal, consent.patientId);
    return;
  }
  if (principal.role === PrincipalRole.HOSPITAL_ADMIN && [consent.sourceHospitalId, consent.targetHospitalId].includes(principal.hospitalId)) return;
  if (isPrivilegedAdmin(principal)) return;
  throw new AuthError(403, "ROLE_NOT_ALLOWED", "Role is not allowed for this operation");
}

function authorizeGatewayRead(principal, hospitalId) {
  if (principal.role === PrincipalRole.HOSPITAL_ADMIN && principal.hospitalId === hospitalId) return;
  if (isPrivilegedAdmin(principal)) return;
  throw new AuthError(403, "ROLE_NOT_ALLOWED", "Role is not allowed for this operation");
}

function authorizeTransferRequestRead(principal, request) {
  if (principal.role === PrincipalRole.PATIENT) {
    assertPatientPrincipal(principal, request.patientId);
    return;
  }
  if (principal.role === PrincipalRole.DOCTOR) {
    const linkedHospital = [request.sourceHospitalId, request.targetHospitalId].includes(principal.hospitalId);
    const isRequester = principal.doctorId === request.requesterDoctorId;
    const isIssuedDoctor = Boolean(request.ticket) && principal.doctorId === request.ticket.redeemedDoctorId;
    if (!linkedHospital && !isRequester && !isIssuedDoctor) {
      throw new AuthError(403, "HOSPITAL_IDENTITY_MISMATCH", "Hospital identity mismatch");
    }
    return;
  }
  if (principal.role === PrincipalRole.HOSPITAL_ADMIN && [request.sourceHospitalId, request.targetHospitalId].includes(principal.hospitalId)) return;
  if (isPrivilegedAdmin(principal)) return;
  throw new AuthError(403, "ROLE_NOT_ALLOWED", "Role is not allowed for this operation");
}

async function getHealth() {
  try {
    const storeHealth = await store.health();
    return {
      status: storeHealth.database === "UP" ? "UP" : "DOWN",
      database: storeHealth.database,
    };
  } catch {
    return {
      status: "DOWN",
      database: "DOWN",
    };
  }
}
