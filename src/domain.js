export const ConsentStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
});

export const Permission = Object.freeze({
  VIEW_ONLY: "VIEW_ONLY",
  DOWNLOAD_ALLOWED: "DOWNLOAD_ALLOWED",
});

export const ConsentPurpose = Object.freeze({
  TREATMENT: "TREATMENT",
  TRANSFER: "TRANSFER",
  CONSULTATION: "CONSULTATION",
  RESEARCH: "RESEARCH",
});

export const HospitalStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});

export const GatewayStatus = Object.freeze({
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  DEGRADED: "DEGRADED",
});

export const TransferRequestStatus = Object.freeze({
  PENDING_CONSENT: "PENDING_CONSENT",
  TICKET_ISSUED: "TICKET_ISSUED",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
});

export const TransferTicketStatus = Object.freeze({
  ISSUED: "ISSUED",
  USED: "USED",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
});

export const AccessTokenStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
  INVALID: "INVALID",
});

export const AuditAction = Object.freeze({
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  CONSENT_CREATED: "CONSENT_CREATED",
  CONSENT_VIEWED: "CONSENT_VIEWED",
  CONSENT_REVOKED: "CONSENT_REVOKED",
  CONSENT_CREATE_FAILED: "CONSENT_CREATE_FAILED",
  CONSENT_CREATE: "CONSENT_CREATE",
  ACCESS_ALLOWED: "ACCESS_ALLOWED",
  ACCESS_DENIED: "ACCESS_DENIED",
  TOKEN_ISSUED: "TOKEN_ISSUED",
  TOKEN_DENIED: "TOKEN_DENIED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_ISSUE: "TOKEN_ISSUE",
  IMAGE_VIEWED: "IMAGE_VIEWED",
  IMAGE_DOWNLOADED: "IMAGE_DOWNLOADED",
  BULK_ACCESS_DETECTED: "BULK_ACCESS_DETECTED",
  REPEATED_ACCESS_FAILURE: "REPEATED_ACCESS_FAILURE",
  EXPIRED_TOKEN_ABUSE: "EXPIRED_TOKEN_ABUSE",
  UNUSUAL_DOWNLOAD_PATTERN: "UNUSUAL_DOWNLOAD_PATTERN",
  AUDIT_LOG_MUTATION_DENIED: "AUDIT_LOG_MUTATION_DENIED",
  RESEARCH_DATASET_PREPARED: "RESEARCH_DATASET_PREPARED",
  RESEARCH_EXPORT_REQUESTED: "RESEARCH_EXPORT_REQUESTED",
  RESEARCH_EXPORT_APPROVED: "RESEARCH_EXPORT_APPROVED",
  RESEARCH_EXPORT_REJECTED: "RESEARCH_EXPORT_REJECTED",
  RESEARCH_EXPORT_BLOCKED: "RESEARCH_EXPORT_BLOCKED",
  RESEARCH_EXPORT_COMPLETED: "RESEARCH_EXPORT_COMPLETED",
  STUDY_VIEW: "STUDY_VIEW",
  SERIES_VIEW: "SERIES_VIEW",
  INSTANCE_DOWNLOAD: "INSTANCE_DOWNLOAD",
  REVOKE: "REVOKE",
  TRANSFER_REQUEST_CREATED: "TRANSFER_REQUEST_CREATED",
  TICKET_ISSUED: "TICKET_ISSUED",
  TICKET_REDEEMED: "TICKET_REDEEMED",
  TICKET_DENIED: "TICKET_DENIED",
  TICKET_REVOKED: "TICKET_REVOKED",
});

export const ResearchExportStatus = Object.freeze({
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPORTED: "EXPORTED",
});

export const ResearchRiskLevel = Object.freeze({
  LOW: "LOW",
  HIGH_RISK_IMAGE: "HIGH_RISK_IMAGE",
});

export const DatePolicy = Object.freeze({
  YEAR_ONLY: "YEAR_ONLY",
  YEAR_MONTH: "YEAR_MONTH",
});

export const UidPolicy = Object.freeze({
  REGENERATE_UID: "REGENERATE_UID",
});

export const ReleaseDecision = Object.freeze({
  RELEASE_ALLOWED: "RELEASE_ALLOWED",
  RELEASE_BLOCKED: "RELEASE_BLOCKED",
  HUMAN_REVIEW_REQUIRED: "HUMAN_REVIEW_REQUIRED",
});

export const AccessDecision = Object.freeze({
  ALLOWED: "ALLOWED",
  DENIED: "DENIED",
});

export const RequestedAction = Object.freeze({
  VIEW: "VIEW",
  DOWNLOAD: "DOWNLOAD",
});

export const AccessDenyReason = Object.freeze({
  ACCESS_DENIED_NO_CONSENT: "ACCESS_DENIED_NO_CONSENT",
  CONSENT_REVOKED: "CONSENT_REVOKED",
  CONSENT_EXPIRED: "CONSENT_EXPIRED",
  CONSENT_NOT_YET_VALID: "CONSENT_NOT_YET_VALID",
  HOSPITAL_MISMATCH: "HOSPITAL_MISMATCH",
  DOCTOR_HOSPITAL_MISMATCH: "DOCTOR_HOSPITAL_MISMATCH",
  STUDY_SCOPE_MISMATCH: "STUDY_SCOPE_MISMATCH",
  SERIES_SCOPE_MISMATCH: "SERIES_SCOPE_MISMATCH",
  PURPOSE_MISMATCH: "PURPOSE_MISMATCH",
  DOWNLOAD_NOT_ALLOWED: "DOWNLOAD_NOT_ALLOWED",
  INVALID_REQUEST: "INVALID_REQUEST",
  ACCESS_DENIED_NO_TICKET: "ACCESS_DENIED_NO_TICKET",
  TICKET_ALREADY_USED: "TICKET_ALREADY_USED",
  TICKET_EXPIRED: "TICKET_EXPIRED",
  TICKET_REVOKED: "TICKET_REVOKED",
  TICKET_INVALID: "TICKET_INVALID",
});

export const TransferMode = Object.freeze({
  DIRECT: "DIRECT",
  TUNNEL: "TUNNEL",
  CACHE: "CACHE",
  PROXY: "PROXY",
});

export const ActorType = Object.freeze({
  PATIENT: "PATIENT",
  DOCTOR: "DOCTOR",
  GATEWAY: "GATEWAY",
  SYSTEM: "SYSTEM",
});

export const Role = Object.freeze({
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  HOSPITAL_ADMIN: "HospitalAdmin",
  GATEWAY: "Gateway",
  PLATFORM_ADMIN: "PlatformAdmin",
});

export const tokenTtlByPurposeMinutes = Object.freeze({
  treatment: 10,
  referral: 10,
  consultation: 5,
  research: 5,
  TREATMENT: 10,
  TRANSFER: 10,
  CONSULTATION: 5,
  RESEARCH: 5,
});

export function normalizePurpose(value) {
  const aliases = {
    treatment: ConsentPurpose.TREATMENT,
    transfer: ConsentPurpose.TRANSFER,
    referral: ConsentPurpose.TRANSFER,
    consultation: ConsentPurpose.CONSULTATION,
    research: ConsentPurpose.RESEARCH,
  };
  return aliases[value] ?? value;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutesIso(minutes, base = new Date()) {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

export function isWithinWindow(now, start, end) {
  const at = new Date(now).getTime();
  return new Date(start).getTime() <= at && at <= new Date(end).getTime();
}

export function makeId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${random[0].toString(16)}${random[1].toString(16)}`;
}
