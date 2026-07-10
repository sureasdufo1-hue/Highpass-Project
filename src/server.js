import { createServer } from "node:http";
import { HipassService, ServiceValidationError } from "./services.js";
import { createStoreFromEnv } from "./store-factory.js";
import { getBearerToken, readJson, sendError, sendJson, serveStatic } from "./http-utils.js";

const port = Number(process.env.PORT ?? 3000);
const store = createStoreFromEnv();
await store.load();
const service = new HipassService(store);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
    console.error(error);
    sendError(response, 500, "Internal server error");
  }
});

server.listen(port, () => {
  console.log(`HiPass MVP is running at http://localhost:${port}`);
});

async function routeApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (method === "GET" && url.pathname === "/api/health") {
    const health = await getHealth();
    sendJson(response, health.status === "UP" ? 200 : 503, health);
    return;
  }

  if (method === "POST" && url.pathname === "/api/consents") {
    const body = await readJson(request);
    const validation = requireFields(body, ["patientId", "sourceHospitalId", "targetHospitalId", "purpose", "permission", "validUntil"]);
    if (validation) return sendError(response, 400, validation);
    try {
      sendJson(response, 201, await service.createConsent(body));
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
    const consent = await service.viewConsent(segments[2], url.searchParams.get("actorId") ?? "system", {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    if (!consent) return sendError(response, 404, "Consent not found");
    sendJson(response, 200, consent);
    return;
  }

  if (method === "GET" && segments[1] === "patients" && segments[2] && segments[3] === "consents") {
    sendJson(response, 200, service.listConsentsByPatient(segments[2]));
    return;
  }

  if (method === "POST" && segments[1] === "consents" && segments[2] && segments[3] === "revoke") {
    const body = await readJson(request);
    let consent;
    try {
      consent = await service.revokeConsent(segments[2], body.actorId);
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
    sendJson(response, 200, service.listStudies(url.searchParams.get("patientId"), {
      includeSeries: url.searchParams.get("includeSeries") === "true",
    }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/dicom-access/request") {
    const body = await readJson(request);
    const result = await service.requestDicomAccessToken(body, {
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendJson(response, result.decision === "ALLOWED" ? 200 : 403, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/policies/access-check") {
    const body = await readJson(request);
    sendJson(response, 200, service.checkAccess(body));
    return;
  }

  if (method === "POST" && url.pathname === "/api/audit-logs") {
    await service.writeAudit(await readJson(request));
    await store.save();
    sendJson(response, 201, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/audit-logs") {
    sendJson(response, 200, service.listAuditLogs({
      action: url.searchParams.get("action"),
      result: url.searchParams.get("result"),
      actorId: url.searchParams.get("actorId"),
      hospitalId: url.searchParams.get("hospitalId"),
      reasonCode: url.searchParams.get("reasonCode"),
      limit: Number(url.searchParams.get("limit") ?? 64),
    }));
    return;
  }

  if (["PUT", "PATCH", "DELETE"].includes(method) && url.pathname.startsWith("/api/audit-logs")) {
    await service.recordAuditMutationDenied({
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
    sendError(response, 405, "Audit logs are append-only");
    return;
  }

  if (method === "GET" && url.pathname === "/api/anomaly-alerts") {
    sendJson(response, 200, service.listAnomalyAlerts());
    return;
  }

  if (method === "GET" && url.pathname === "/api/audit-integrity") {
    sendJson(response, 200, service.verifyAuditIntegrity());
    return;
  }

  if (method === "GET" && url.pathname === "/api/transfer-usage") {
    sendJson(response, 200, store.get("transferUsageLogs").slice(-64).reverse());
    return;
  }

  if (method === "GET" && segments[1] === "hospitals" && segments[2] && segments[3] === "gateway") {
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
  if (request.method === "POST" && url.pathname === "/gateway/token/introspect") {
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
    await service.recordAuditMutationDenied({
      actorId: "gateway",
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    });
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
