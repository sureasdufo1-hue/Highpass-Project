import https from "node:https";
import { checkServerIdentity } from "node:tls";
import { parseDataPlaneRequest } from "./data-plane-authorization.js";
import { beginRuntimeDiagnostic } from "./capstone-runtime-diagnostics.js";

export function requireHttpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("GATEWAY_HTTPS_ORIGIN_REQUIRED");
  return url.origin;
}

// Always verifies CA + hostname; there is no HTTP/insecure fallback.
export function boundedHttps(origin, pathname, { tls, method = "GET", headers = {}, body, maxBytes = 33554432, timeoutMs = 10000 }) {
  requireHttpsOrigin(origin);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 33554432 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error("GATEWAY_LIMIT_INVALID");
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, origin);
    if (target.origin !== origin || !pathname.startsWith("/")) return reject(new Error("GATEWAY_PATH_INVALID"));
    const request = https.request(target, { ...tls, rejectUnauthorized: true, checkServerIdentity, minVersion: "TLSv1.2", method, headers }, response => {
      const chunks = []; let total = 0;
      response.on("data", chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(Object.assign(new Error("limit"), { code: "RESPONSE_LIMIT" }));
          response.destroy(); request.destroy();
        }
        else chunks.push(chunk);
      });
      response.on("aborted", () => reject(Object.assign(new Error("aborted"), { code: "UPSTREAM_ABORTED" })));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, contentType: response.headers["content-type"] ?? "application/octet-stream", body: Buffer.concat(chunks) }));
    });
    const timer = setTimeout(() => request.destroy(Object.assign(new Error("deadline"), { code: "ETIMEDOUT" })), timeoutMs);
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(body);
  });
}

export function createDataPlaneHandler({ publicBaseUrl, controlOrigin, orthancOrigin, serviceToken, controlTls, orthancTls, transport = boundedHttps, encryptionRequired = false, imageEncryptionFactory, diagnosticFactory }) {
  publicBaseUrl = requireHttpsOrigin(publicBaseUrl);
  controlOrigin = requireHttpsOrigin(controlOrigin);
  orthancOrigin = requireHttpsOrigin(orthancOrigin);
  if (typeof serviceToken !== "string" || Buffer.byteLength(serviceToken) < 32 || /[\r\n]/u.test(serviceToken)) throw new Error("GATEWAY_SERVICE_CREDENTIAL_REQUIRED");
  const control = async (path, body) => {
    const result = await transport(controlOrigin, path, { method: "POST", tls: controlTls,
      headers: { "content-type": "application/json", "x-hipass-service-token": serviceToken },
      body: JSON.stringify(body), maxBytes: 32768, timeoutMs: 5000 });
    return { status: result.status, body: JSON.parse(result.body.toString("utf8")) };
  };
  const imageEncryption = imageEncryptionFactory?.(control);
  if (encryptionRequired && typeof imageEncryption?.seal !== "function") throw new Error("IMAGE_ENCRYPTION_REQUIRED");
  return async (request, response) => {
    const diagnostic = beginRuntimeDiagnostic(diagnosticFactory);
    const json = (status, error) => {
      if (response.destroyed) return;
      diagnostic.finish(status);
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error }));
    };
    let route;
    try { route = parseDataPlaneRequest({ method: request.method, path: request.url }, publicBaseUrl); }
    catch { return json(400, "DATA_PLANE_ROUTE_INVALID"); }
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || authorization.length > 16390) return json(401, "TOKEN_REQUIRED");
    const match = authorization.match(/^(DPoP|Bearer) ([A-Za-z0-9_.-]+)$/u);
    if (!match) return json(401, "TOKEN_INVALID");
    let grant;
    let sensitiveBody;
    try {
      diagnostic.stage("CONTROL_AUTHORIZATION");
      const decision = await control("/gateway/data-plane/authorize", { method: request.method,
        path: request.url, token: match[2], authorizationScheme: match[1],
        clientIp: String(request.socket.remoteAddress).replace(/^::ffff:/u, ""), dpopProof: request.headers.dpop });
      if (decision.status !== 200 || decision.body.active !== true) return json(decision.status >= 500 ? 503 : 403, "ACCESS_DENIED");
      grant = decision.body;
      if (!Array.isArray(grant.allowedSeriesUids) || typeof grant.receipt !== "string" || !/^[0-9]+(?:\.[0-9]+)+$/u.test(grant.studyInstanceUid) || grant.studyInstanceUid.length > 64 || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.now() >= Date.parse(grant.expiresAt)) throw new Error("INVALID_AUTHORIZATION");
      if (route.studyInstanceUid && route.studyInstanceUid !== grant.studyInstanceUid) return json(403, "SCOPE_MISMATCH");
      if (route.seriesInstanceUid && grant.allowedSeriesUids.length && !grant.allowedSeriesUids.includes(route.seriesInstanceUid)) return json(403, "SCOPE_MISMATCH");
      let path = route.kind === "studies" ? `/dicom-web/studies?StudyInstanceUID=${grant.studyInstanceUid}` : new URL(route.externalUrl).pathname.replace(/^\/dicomweb\//u, "/dicom-web/").replace(/\/download$/u, "");
      diagnostic.stage("ORTHANC_READ");
      const result = await transport(orthancOrigin, path, { tls: orthancTls, headers: { accept: ["studies", "series", "instances"].includes(route.kind) || request.url.endsWith("/metadata") ? "application/dicom+json" : request.url.endsWith("/rendered") ? "image/png" : "multipart/related; type=application/dicom" }, timeoutMs: 10000 });
      if (result.status !== 200) {
        await control("/gateway/data-plane/ready", { receipt: grant.receipt, bytesPrepared: 0, outcome: "UPSTREAM_FAILURE" });
        return json(result.status === 404 ? 404 : 502, "DICOM_UPSTREAM_FAILURE");
      }
      if (!/^(?:application\/(?:dicom|dicom\+json|json|octet-stream)|multipart\/related|image\/(?:png|jpeg))(?:\s*;|$)/iu.test(result.contentType)) throw new Error("INVALID_DICOM_CONTENT_TYPE");
      let body = result.body;
      const imageRoute = ["instance", "frame"].includes(route.kind) && !request.url.endsWith("/metadata");
      if (encryptionRequired && imageRoute) sensitiveBody = body;
      if (["studies", "series", "instances"].includes(route.kind) || request.url.endsWith("/metadata")) {
        const rows = JSON.parse(body.toString("utf8"));
        if (!Array.isArray(rows)) throw new Error("INVALID_DICOM_METADATA");
        const filtered = rows.filter(row => {
          const study = row["0020000D"]?.Value?.[0];
          const series = row["0020000E"]?.Value?.[0];
          // Studies and Series must explicitly identify themselves; never trust
          // an upstream returning all studies despite the query constraint.
          if (route.kind === "studies" && study !== grant.studyInstanceUid) return false;
          if (study && study !== grant.studyInstanceUid) return false;
          if (route.kind === "series" && !series) return false;
          if (series && grant.allowedSeriesUids.length && !grant.allowedSeriesUids.includes(series)) return false;
          return true;
        }).map(row => { const safe = { ...row }; delete safe["00100010"]; delete safe["00100030"]; return safe; });
        body = Buffer.from(JSON.stringify(filtered));
      }
      diagnostic.stage("IMAGE_ENCRYPTION");
      const output = encryptionRequired && imageRoute ? await imageEncryption.seal({ body, contentType: result.contentType, route, grant }) : { body, contentType: result.contentType };
      diagnostic.stage("CONTROL_READY");
      const ready = await control("/gateway/data-plane/ready", { receipt: grant.receipt, bytesPrepared: body.length, outcome: "READY" });
      if (ready.status !== 200 || ready.body.accepted !== true) return json(503, "AUTHORIZATION_OR_AUDIT_UNAVAILABLE");
      if (response.destroyed) return;
      diagnostic.finish(200);
      response.writeHead(200, { "content-type": output.contentType, "cache-control": "no-store", "content-disposition": request.url.endsWith("/download") ? "attachment" : "inline", "x-content-type-options": "nosniff" });
      response.end(output.body);
    } catch (error) {
      diagnostic.finish(503,error);
      // Never print exceptions, URLs, certificates, token/proof/receipt or body.
      return json(503, "DATA_PLANE_UNAVAILABLE");
    } finally { sensitiveBody?.fill(0); }
  };
}
