export const PrivacyPurpose = Object.freeze({
  RESEARCH: "RESEARCH",
  TEACHING: "TEACHING",
  DEMO: "DEMO",
  AI_LOCAL: "AI_LOCAL",
});

export const PrivacyJobStatus = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNSUPPORTED: "UNSUPPORTED",
  CANCELLED: "CANCELLED",
});

export const PrivacyCurrentStage = Object.freeze({
  RESOLVE: "RESOLVE",
  EXTRACT: "EXTRACT",
  DETECT: "DETECT",
  TRANSFORM: "TRANSFORM",
  VALIDATE: "VALIDATE",
  FINALIZE: "FINALIZE",
});

export const PrivacyPolicyDecision = Object.freeze({
  UNDECIDED: "UNDECIDED",
  TRANSFORM_REQUIRED: "TRANSFORM_REQUIRED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  ALLOW: "ALLOW",
  DENY: "DENY",
});

export const PrivacyReviewStatus = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  STALE: "STALE",
});

export const PrivacyReleaseStatus = Object.freeze({
  NOT_READY: "NOT_READY",
  READY: "READY",
  SENDING: "SENDING",
  SENT: "SENT",
  UNKNOWN: "UNKNOWN",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
});

export const PrivacyArtifactState = Object.freeze({
  QUARANTINED: "QUARANTINED",
  VALIDATED: "VALIDATED",
  EXPIRED: "EXPIRED",
  PURGED: "PURGED",
});

export const PrivacyNativeLabel = Object.freeze({
  PRIVATE_PERSON: "private_person",
  PRIVATE_ADDRESS: "private_address",
  PRIVATE_EMAIL: "private_email",
  PRIVATE_PHONE: "private_phone",
  PRIVATE_URL: "private_url",
  PRIVATE_DATE: "private_date",
  ACCOUNT_NUMBER: "account_number",
  SECRET: "secret",
});

export const PrivacySystemType = Object.freeze({
  PERSON: "PERSON",
  ADDRESS: "ADDRESS",
  CONTACT: "CONTACT",
  URL_IDENTIFIER: "URL_IDENTIFIER",
  DATE: "DATE",
  FINANCIAL_ACCOUNT: "FINANCIAL_ACCOUNT",
  SECRET: "SECRET",
  KR_IDENTIFIER: "KR_IDENTIFIER",
  HOSPITAL_ID: "HOSPITAL_ID",
});

export const PrivacyFindingSource = Object.freeze({
  MODEL: "model",
  RULE: "rule",
  STRUCTURED_FIELD: "structured_field",
});

export const PrivacyAction = Object.freeze({
  REPLACE: "REPLACE",
  SHIFT: "SHIFT",
  REVIEW: "REVIEW",
});

export const PrivacyErrorCode = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  POLICY_DENIED: "POLICY_DENIED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  STATE_CONFLICT: "STATE_CONFLICT",
  INPUT_TOO_LARGE: "INPUT_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  OFFSET_MISMATCH: "OFFSET_MISMATCH",
  INVALID_CONTENT: "INVALID_CONTENT",
  QUEUE_FULL: "QUEUE_FULL",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  MODEL_TIMEOUT: "MODEL_TIMEOUT",
  MODEL_OUTPUT_INVALID: "MODEL_OUTPUT_INVALID",
});

export const PRIVACY_CONTRACT_VERSION = "1.0.0";
export const PRIVACY_SYNC_MAX_TOKENS = 2_048;
export const PRIVACY_SYNC_MAX_BYTES = 32 * 1024;
export const PRIVACY_ASYNC_MAX_TOKENS = 8_192;
export const PRIVACY_ASYNC_MAX_BYTES = 256 * 1024;

const NATIVE_TO_SYSTEM = Object.freeze({
  [PrivacyNativeLabel.PRIVATE_PERSON]: PrivacySystemType.PERSON,
  [PrivacyNativeLabel.PRIVATE_ADDRESS]: PrivacySystemType.ADDRESS,
  [PrivacyNativeLabel.PRIVATE_EMAIL]: PrivacySystemType.CONTACT,
  [PrivacyNativeLabel.PRIVATE_PHONE]: PrivacySystemType.CONTACT,
  [PrivacyNativeLabel.PRIVATE_URL]: PrivacySystemType.URL_IDENTIFIER,
  [PrivacyNativeLabel.PRIVATE_DATE]: PrivacySystemType.DATE,
  [PrivacyNativeLabel.ACCOUNT_NUMBER]: PrivacySystemType.FINANCIAL_ACCOUNT,
  [PrivacyNativeLabel.SECRET]: PrivacySystemType.SECRET,
});

export class PrivacyProcessingError extends Error {
  constructor(statusCode, code, message = code) {
    super(message);
    this.name = "PrivacyProcessingError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function mapNativeLabel(nativeLabel) {
  return NATIVE_TO_SYSTEM[nativeLabel] ?? null;
}

export function isPrivacyPurpose(value) {
  return Object.values(PrivacyPurpose).includes(value);
}

export function privacyContractEnums() {
  return {
    purpose: Object.values(PrivacyPurpose),
    job_status: Object.values(PrivacyJobStatus),
    current_stage: Object.values(PrivacyCurrentStage),
    policy_decision: Object.values(PrivacyPolicyDecision),
    review_status: Object.values(PrivacyReviewStatus),
    release_status: Object.values(PrivacyReleaseStatus),
    artifact_state: Object.values(PrivacyArtifactState),
    native_label: Object.values(PrivacyNativeLabel),
    system_type: Object.values(PrivacySystemType),
  };
}

export function reviewBindingChanged(previous, current) {
  const fields = [
    "artifactId",
    "artifactVersion",
    "manifestDigest",
    "policyVersion",
    "purpose",
    "recipientRef",
    "approvedUseRef",
  ];
  return fields.some((field) => previous?.[field] !== current?.[field]);
}

export function computeReleaseEligibility(state) {
  return Boolean(
    state?.jobStatus === PrivacyJobStatus.SUCCEEDED
      && state?.artifactState === PrivacyArtifactState.VALIDATED
      && state?.reviewStatus === PrivacyReviewStatus.APPROVED
      && state?.policyDecision === PrivacyPolicyDecision.ALLOW
      && state?.releaseStatus === PrivacyReleaseStatus.READY
      && state?.authorizationCurrent === true
      && state?.bindingCurrent === true,
  );
}
