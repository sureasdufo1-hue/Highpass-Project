import { createServer } from "node:http";
import {
  AuthError,
  PrincipalRole,
  applyAuditScope,
  assertDoctorPrincipal,
  assertPatientPrincipal,
  authenticateRequest,
  canReadAuditLogs,
  isPrivilegedAdmin,
  requireInternalService,
  requireRoles,
  validateAuthConfiguration,
} from "./auth.js";
import { HipassService, ServiceValidationError } from "./services.js";
import { createStoreFromEnv } from "./store-factory.js";
import { getBearerToken, readJson, RequestBodyError, sendError, sendJson, serveStatic } from "./http-utils.js";
import { OpfLocalAdapter } from "./privacy-adapter.js";
import { PrivacyProcessingError } from "./privacy-contracts.js";
import { PrivacyTextInspectionService } from "./privacy-service.js";

const port = Number(process.env.PORT ?? 3000);
validateAuthConfiguration(process.env);
const store = createStoreFromEnv();
await store.load();
const service = new HipassService(store);
const privacyService = new PrivacyTextInspectionService({ adapter: new OpfLocalAdapter() });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
    await serveStatic(response, url.pathname);
  } catch (error) {
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

async function routePrivacy(request, response, url) {
  let principal;
  try {
    principal = authenticateRequest(request);
    requireInternalService(principal);
  } catch (error) {
    if (error instanceof AuthError) {
      throw new PrivacyProcessingError(error.statusCode === 401 ? 401 : 403, "AUTH_REQUIRED", "AUTH_REQUIRED");
    }
    throw error;
  }
  if (request.method === "GET" && url.pathname === "/internal/privacy/health/ready") {
    const readiness = await privacyService.readiness();
    sendJson(response, readiness.status === "READY" ? 200 : 503, readiness);
    return;
  }
  if (request.method === "POST" && url.pathname === "/internal/privacy/text-inspections") {
    const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new PrivacyProcessingError(415, "UNSUPPORTED_MEDIA_TYPE", "UNSUPPORTED_MEDIA_TYPE");
    }
    const body = await readJson(request, { maxBytes: 40 * 1024, strictUtf8: true });
    sendJson(response, 200, await privacyService.inspect(body, principal));
    return;
  }
  sendError(response, 404, "Privacy route not found");
}

async function routeApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (method === "GET" && url.pathname === "/api/health") {
    const health = await getHealth();
    sendJson(response, health.status === "UP" ? 200 : 503, health);
    return;
  }

  const principal = authenticateRequest(request);

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

  if (method === "GET" && segments[1] === "consents" && segments[2]) {
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

  if (method === "GET" && url.pathname === "/api/imaging-studies") {
    const patientId = url.searchParams.get("patientId");
    if (patientId) assertPatientPrincipal(principal, patientId);
    sendJson(response, 200, service.listStudies(url.searchParams.get("patientId"), {
      includeSeries: url.searchParams.get("includeSeries") === "true",
    }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/dicom-access/request") {
    const body = await readJson(request);
    assertDoctorPrincipal(principal, {
      doctorId: body.doctorId,
      hospitalId: body.requestingHospitalId,
    });
    const result = await service.requestDicomAccessToken(body, requestMeta(request, principal));
    sendJson(response, result.decision === "ALLOWED" ? 200 : 403, result);
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
    requireInternalService(principal);
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

async function routeDicomweb(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/dicomweb/studies") {
    const result = await service.gatewayListStudies(getBearerToken(request), {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && !segments[3]) {
    const result = await service.gatewayListSeries(getBearerToken(request), segments[2], {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && !segments[4]) {
    const result = await service.gatewayListSeries(getBearerToken(request), segments[2], {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && segments[4] && !segments[5]) {
    const result = await service.gatewayListInstances(getBearerToken(request), segments[2], segments[4], {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (request.method === "GET" && segments[0] === "dicomweb" && segments[1] === "studies" && segments[2] && segments[3] === "series" && segments[4] && segments[5] === "instances") {
    const sopInstanceUid = segments[6] ?? null;
    if (!sopInstanceUid) {
      const result = await service.gatewayListInstances(getBearerToken(request), segments[2], segments[4], {
        ipAddress: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
      sendJson(response, result.status, result.body);
      return;
    }
    const isDownload = segments[7] === "download";
    const result = await (isDownload ? service.gatewayDownloadInstance : service.gatewayRetrieveInstance).call(service, getBearerToken(request), segments[2], segments[4], sopInstanceUid, {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
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
  if (request.method === "POST" && url.pathname === "/gateway/token/introspect") {
    requireRoles(principal, [PrincipalRole.INTERNAL_SERVICE, PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN]);
    const body = await readJson(request);
    const rawToken = body.token ?? getBearerToken(request);
    if (!rawToken) return sendError(response, 400, "Missing required field(s): token");
    const result = await service.verifyDicomAccessToken(rawToken, body, {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, 200, sanitizeTokenIntrospection(result));
    return;
  }

  if (request.method === "POST" && url.pathname === "/gateway/audit") {
    requireInternalService(principal);
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
  return {
    actorId: principalActorId(principal),
    actorType: principal?.actorType,
    hospitalId: principal?.hospitalId ?? null,
    ipAddress: request.socket.remoteAddress,
    userAgent: request.headers["user-agent"],
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
