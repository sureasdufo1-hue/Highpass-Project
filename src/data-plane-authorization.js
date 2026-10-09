// Metadata-only policy contract. No Orthanc connection or image bytes here.
import { isIP } from "node:net";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function isLegacyImageOperation(pathname) {
  return pathname === "/dicomweb" || pathname.startsWith("/dicomweb/")
    || pathname === '/patient-dicomweb' || pathname.startsWith('/patient-dicomweb/')
    || pathname.startsWith("/assets/clinical/")
    || pathname === "/api/transfers/pacs-import"
    || pathname === "/api/research/datasets/prepare"
    || /^\/api\/research\/exports\/[^/]+\/export$/u.test(pathname);
}

export function parseDataPlaneRequest(input, publicBaseUrl) {
  const base = new URL(publicBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("DATA_PLANE_HTTPS_ORIGIN_REQUIRED");
  if (!input || input.method !== "GET" || typeof input.path !== "string" || input.path.length > 1024 || /[%\\#]/u.test(input.path)) throw new Error("DATA_PLANE_ROUTE_INVALID");
  const url = new URL(input.path, base);
  if (!input.path.startsWith("/dicomweb/") || url.origin !== base.origin) throw new Error("DATA_PLANE_ROUTE_INVALID");
  const uid = "([0-9]+(?:\\.[0-9]+)+)";
  const routes = [
    [new RegExp(`^/dicomweb/studies$`), "studies"],
    [new RegExp(`^/dicomweb/studies/${uid}/series$`), "series"],
    [new RegExp(`^/dicomweb/studies/${uid}/series/${uid}/instances$`), "instances"],
    [new RegExp(`^/dicomweb/studies/${uid}/series/${uid}/instances/${uid}(?:/(metadata|rendered|download))?$`), "instance"],
    [new RegExp(`^/dicomweb/studies/${uid}/series/${uid}/instances/${uid}/frames/([1-9][0-9]{0,5})$`), "frame"],
  ];
  for (const [pattern, kind] of routes) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    if (match.slice(1, 4).some(value => value && value.length > 64)) throw new Error("DATA_PLANE_UID_INVALID");
    const queries = [...url.searchParams];
    if (queries.length && (kind !== "studies" || queries.length !== 1 || queries[0][0] !== "StudyInstanceUID" || !new RegExp(`^${uid}$`).test(queries[0][1]) || queries[0][1].length > 64)) throw new Error("DATA_PLANE_QUERY_INVALID");
    return { kind, studyInstanceUid: match[1] ?? url.searchParams.get("StudyInstanceUID") ?? null,
      seriesInstanceUid: match[2] ?? null, sopInstanceUid: match[3] ?? null,
      requestedAction: match[4] === "download" ? "DOWNLOAD" : "VIEW", externalUrl: url.href };
  }
  throw new Error("DATA_PLANE_ROUTE_INVALID");
}

export async function authorizeDataPlane(service, input, configuration) {
  const denied = async (status, reason, claims = {}) => {
    await service.writeAudit({ actorType: "GATEWAY", actorId: "data-plane-gateway",
      action: "ACCESS_DENIED", result: "FAIL", reason,
      consentId: claims.consentId ?? null, auditSessionId: claims.auditSessionId ?? null,
      studyInstanceUid: claims.studyInstanceUid ?? null, targetHospitalId: claims.targetHospitalId ?? null });
    await service.store.save();
    return { status, body: { active: false, reason } };
  };
  let route;
  try {
    if (!configuration.sourceHospitalId || !configuration.publicBaseUrl) throw new Error("DATA_PLANE_NOT_CONFIGURED");
    route = parseDataPlaneRequest(input, configuration.publicBaseUrl);
    if (!isIP(input.clientIp) || !["DPoP", "Bearer"].includes(input.authorizationScheme) || typeof input.token !== "string" || input.token.length > 16384 || (input.dpopProof && (typeof input.dpopProof !== "string" || input.dpopProof.length > 16384))) throw new Error("DATA_PLANE_CONTEXT_INVALID");
  } catch {
    return denied(400, "DATA_PLANE_REQUEST_INVALID");
  }
  // This context is accepted ONLY after the dedicated service principal check
  // in the internal route. An Internet caller cannot supply ingressTrusted.
  const meta = { ingressTrusted: true, ipAddress: input.clientIp, userAgent: null,
    method: input.method, externalUrl: route.externalUrl,
    authorizationScheme: input.authorizationScheme, dpopProof: input.dpopProof ?? null };
  const verified = await service.verifyDicomAccessToken(input.token, route, meta);
  if (!verified.active) return { status: verified.statusCode ?? 403, body: { active: false, reason: verified.reason } };
  const claims = verified.claims;
  const consent = service.store.get("consents").find(item => item.consentId === claims.consentId);
  if (!consent || consent.sourceHospitalId !== configuration.sourceHospitalId) return denied(403, "GATEWAY_SOURCE_HOSPITAL_MISMATCH", claims);
  const hospitals = service.store.get("hospitals");
  if (![consent.sourceHospitalId, claims.targetHospitalId].every(id => hospitals.some(hospital => hospital.hospitalId === id && hospital.status === "ACTIVE"))) return denied(403, "GATEWAY_HOSPITAL_INACTIVE", claims);
  const policy = await service.evaluateDicomAccessRequest({ consentId: claims.consentId,
    doctorId: claims.doctorId, requestingHospitalId: claims.targetHospitalId,
    studyInstanceUid: route.studyInstanceUid ?? claims.studyInstanceUid,
    seriesInstanceUid: route.seriesInstanceUid ?? undefined,
    purpose: claims.purpose, requestedAction: route.requestedAction }, meta);
  if (policy.decision !== "ALLOWED") return { status: policy.statusCode ?? 403, body: { active: false, reason: policy.reasonCode } };
  const liveScopes = service.store.get("consentScopes").filter(scope => scope.consentId === claims.consentId && scope.studyInstanceUid === claims.studyInstanceUid && scope.allowed);
  const tokenSeries = claims.allowedSeriesUids ?? [];
  const liveSeries = liveScopes.map(scope => scope.seriesInstanceUid).filter(Boolean);
  const studyWide = liveScopes.some(scope => !scope.seriesInstanceUid);
  const allowedSeriesUids = studyWide ? tokenSeries : tokenSeries.length ? tokenSeries.filter(uid => liveSeries.includes(uid)) : liveSeries;
  if (!studyWide && !allowedSeriesUids.length) return denied(403, "TOKEN_SERIES_MISMATCH", claims);
  const scope = { active: true, tokenId: claims.jti, consentId: claims.consentId,
    doctorId: claims.doctorId, sourceHospitalId: consent.sourceHospitalId,
    targetHospitalId: claims.targetHospitalId, studyInstanceUid: claims.studyInstanceUid,
    allowedSeriesUids, permission: consent.permission === "VIEW_ONLY" ? "VIEW_ONLY" : claims.permission,
    expiresAt: claims.expiresAt, auditSessionId: claims.auditSessionId };
  const grant = { ...scope, receiptId: randomUUID(), path: input.path, clientIp: input.clientIp,
    purpose: claims.purpose, deadline: Math.min(Date.parse(claims.expiresAt), Date.parse(service.clock()) + 30000) };
  const encoded = Buffer.from(JSON.stringify(grant)).toString("base64url");
  const mac = createHmac("sha256", service.tokenSecret).update("data-plane-receipt-v1:" + encoded).digest("base64url");
  return { status: 200, body: { ...scope, receipt: `${encoded}.${mac}` } };
}

// A signed short-lived receipt prevents the Gateway from choosing audit actor,
// hospital, scope or result context. Never accepts a raw token/image in this API.
export async function revalidateDataPlaneReceipt(service, receipt, configuration) {
  const denied = async reason => {
    await service.writeAudit({ actorType: "GATEWAY", actorId: "data-plane-gateway", action: "ACCESS_DENIED", result: "FAIL", reason });
    await service.store.save();
    return { status: 403, body: { accepted: false, reason } };
  };
  let grant;
  let route;
  try {
    const now = Date.parse(service.clock());
    if (!Number.isFinite(now) || typeof receipt !== "string" || receipt.length > 16384) throw new Error("INVALID_REPORT");
    const parts = receipt.split(".");
    if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error("INVALID_REPORT");
    const expected = createHmac("sha256", service.tokenSecret).update("data-plane-receipt-v1:" + parts[0]).digest("base64url");
    if (parts[1].length !== expected.length || !timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) throw new Error("INVALID_REPORT");
    grant = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!Number.isSafeInteger(grant.deadline) || now >= grant.deadline || grant.deadline > now + 30000 || grant.sourceHospitalId !== configuration.sourceHospitalId || !Array.isArray(grant.allowedSeriesUids)) throw new Error("INVALID_REPORT");
    route = parseDataPlaneRequest({ method: "GET", path: grant.path }, configuration.publicBaseUrl);
  } catch { return denied("DATA_PLANE_RECEIPT_INVALID"); }
  const token = service.store.get("dicomAccessTokenLogs").find(item => item.tokenId === grant.tokenId);
  const hospitals = service.store.get("hospitals");
  if (!token || token.status !== "ACTIVE" || !Number.isFinite(Date.parse(token.expiresAt)) || Date.parse(token.expiresAt) <= Date.parse(service.clock()) || ![grant.sourceHospitalId, grant.targetHospitalId].every(id => hospitals.some(item => item.hospitalId === id && item.status === "ACTIVE"))) return denied("DATA_PLANE_AUTHORIZATION_INACTIVE");
  if (["consentId", "doctorId", "targetHospitalId", "studyInstanceUid", "purpose", "auditSessionId"].some(field => token[field] !== grant[field]) || Date.parse(grant.expiresAt) !== Date.parse(token.expiresAt) || grant.deadline > Date.parse(token.expiresAt)) return denied("DATA_PLANE_TOKEN_BINDING_CHANGED");
  const consent = service.store.get("consents").find(item => item.consentId === grant.consentId);
  if (!consent || consent.sourceHospitalId !== grant.sourceHospitalId || consent.targetHospitalId !== grant.targetHospitalId) return denied("DATA_PLANE_CONSENT_BINDING_CHANGED");
  if (!Array.isArray(token.allowedSeriesUids) || (token.allowedSeriesUids.length && (grant.allowedSeriesUids.some(uid => !token.allowedSeriesUids.includes(uid)) || (route.seriesInstanceUid && !token.allowedSeriesUids.includes(route.seriesInstanceUid)))) || (route.requestedAction === "DOWNLOAD" && token.permission !== "DOWNLOAD_ALLOWED")) return denied("DATA_PLANE_TOKEN_BINDING_CHANGED");
  const policy = await service.evaluateDicomAccessRequest({ consentId: grant.consentId, doctorId: grant.doctorId,
    requestingHospitalId: grant.targetHospitalId, studyInstanceUid: grant.studyInstanceUid,
    seriesInstanceUid: route.seriesInstanceUid ?? undefined, purpose: grant.purpose,
    requestedAction: route.requestedAction }, { ipAddress: grant.clientIp });
  if (policy.decision !== "ALLOWED") return { status: 403, body: { accepted: false, reason: policy.reasonCode } };
  const scopes = service.store.get("consentScopes").filter(item => item.consentId === grant.consentId && item.studyInstanceUid === grant.studyInstanceUid && item.allowed);
  if (!scopes.some(item => !item.seriesInstanceUid) && (!grant.allowedSeriesUids.length || grant.allowedSeriesUids.some(uid => !scopes.some(item => item.seriesInstanceUid === uid)))) return denied("DATA_PLANE_SCOPE_CHANGED");
  return { status: 200, body: { accepted: true }, grant, route };
}

export async function recordDataPlaneReady(service, input, configuration) {
  if (!input || !Number.isSafeInteger(input.bytesPrepared) || input.bytesPrepared < 0 || input.bytesPrepared > 33554432 || !["READY", "UPSTREAM_FAILURE"].includes(input.outcome)) {
    await service.writeAudit({ actorType: "GATEWAY", actorId: "data-plane-gateway", action: "ACCESS_DENIED", result: "FAIL", reason: "DATA_PLANE_RECEIPT_INVALID" });
    await service.store.save();
    return { status: 403, body: { accepted: false, reason: "DATA_PLANE_RECEIPT_INVALID" } };
  }
  const validation = await revalidateDataPlaneReceipt(service, input.receipt, configuration);
  if (validation.status !== 200) return validation;
  const { grant, route } = validation;
  // READY means response prepared + authorization rechecked, NOT delivered to Viewer.
  // Receipt id groups retries without claiming exactly-once across API replicas.
  const reason = input.outcome === "READY" ? "DATA_PLANE_RESPONSE_PREPARED" : "DATA_PLANE_UPSTREAM_FAILED";
  await service.writeAudit({ actorType: "GATEWAY", actorId: `gateway:${grant.receiptId}`,
    auditSessionId: grant.auditSessionId, consentId: grant.consentId,
    sourceHospitalId: grant.sourceHospitalId, targetHospitalId: grant.targetHospitalId,
    action: input.outcome === "READY" ? "DATA_PLANE_RESPONSE_PREPARED" : "DATA_PLANE_UPSTREAM_FAILED",
    studyInstanceUid: grant.studyInstanceUid, seriesInstanceUid: route.seriesInstanceUid,
    sopInstanceUid: route.sopInstanceUid, ipAddress: grant.clientIp,
    result: input.outcome === "READY" ? "SUCCESS" : "FAIL", reason });
  await service.store.save();
  return { status: 200, body: { accepted: true, receiptId: grant.receiptId, delivery: "NOT VERIFIED" } };
}
