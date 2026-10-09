// Fixed enums only. Never serialize response bodies, exception text or stacks.
export function safeViewerState(input) {
  const result = {};
  for (const field of ['tokenPresent','consentPending','tokenPending','consentReady','seriesSelected']) {
    result[field] = typeof input?.[field] === 'boolean' ? input[field] : null;
  }
  for (const field of ['line','instanceCount']) {
    result[field] = Number.isSafeInteger(input?.[field]) && input[field] >= 0 && input[field] <= 1000000 ? input[field] : null;
  }
  return result;
}

export function safeException(event) {
  const allowedNames = new Set(["TypeError", "ReferenceError", "Error", "DOMException", "SyntaxError", "RangeError"]);
  const description = event.data?.description ?? "";
  const frame = event.callFrames?.[0]?.functionName;
  return {
    type: allowedNames.has(event.data?.className) ? event.data.className : "OTHER",
    stage: ["createPatientConsent", "loadDashboard", "fetchJson", "safeJson", "navigatePatientPage", "renderPatientStudyOptions", "renderStudies", "renderDoctorStudies", "renderMetrics"].includes(frame) ? frame : "OTHER",
    code: description.includes("Invalid time value") ? "INVALID_DATE" : description.includes("Cannot read properties of") ? "NULL_PROPERTY" : description.includes("is not defined") ? "UNDEFINED_REFERENCE" : "OTHER",
  };
}

export function apiOperation(url, method) {
  const path = new URL(url).pathname;
  if (path === "/api/consents" && method === "POST") return "CONSENT_CREATE";
  if (path === "/api/dicom-access/request" && method === "POST") return "TOKEN_REQUEST";
  if (path === "/api/security/proof-policy" && method === "GET") return "PROOF_POLICY";
  if (path === "/dicomweb/studies" && method === "GET") return "QIDO_STUDIES";
  if (/^\/dicomweb\/studies\/[^/]+\/series$/.test(path) && method === "GET") return "QIDO_SERIES";
  if (/^\/dicomweb\/studies\/[^/]+\/series\/[^/]+\/instances$/.test(path) && method === "GET") return "QIDO_INSTANCES";
  if (/^\/dicomweb\/studies\/[^/]+\/series\/[^/]+\/instances\/[^/]+\/rendered$/.test(path) && method === "GET") return "WADO_RENDERED";
  if (/^\/api\/consents\/[^/]+\/handoff-ticket$/.test(path)) return "HANDOFF_TICKET";
  if (/^\/api\/patients\/[^/]+\/consents$/.test(path)) return "CONSENT_LIST";
  if (path === "/api/imaging-studies") return "IMAGING_LIST";
  if (path === "/api/audit-logs") return "AUDIT_LIST";
  if (path === "/api/health") return "HEALTH";
  if (path === "/api/transfer-usage") return "TRANSFER_USAGE";
  if (path === "/api/anomaly-alerts") return "ANOMALY_LIST";
  if (path === "/api/security/quarantines") return "QUARANTINE_LIST";
  if (path === "/api/transfers/pacs-archive") return "PACS_ARCHIVE";
  if (path === "/api/v1/me/phr/summary") return "PHR_SUMMARY";
  if (path === "/api/v1/me/phr/imaging-studies") return "PHR_IMAGING";
  return null;
}
