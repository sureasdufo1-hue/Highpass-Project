/**
 * WBS-11 steps 1-2: Key Release Authorization policy service and context
 * validation contract.
 *
 * This module decides whether a verified package may request a one-time
 * rewrap for the receiving gateway. It deliberately does not call a KMS and
 * never accepts or returns raw key material.
 */

export const KeyReleaseDecision = Object.freeze({
  ALLOW: "ALLOW",
  DENY: "DENY",
});

export class KeyReleaseAuthorizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KeyReleaseAuthorizationError";
    this.code = code;
  }
}

const ALLOWED_TICKET_STATES = new Set(["ISSUED", "AUTHORIZED"]);
const ACTIVE_DEVICE_STATES = new Set(["ACTIVE"]);
const REF_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{2,127}$/u;
const HASH_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;

export class KeyReleaseAuthorizationService {
  #clock;
  #audit;
  #maxTtlMs;
  #issued = new Set();
  #events = [];

  constructor({ clock = () => new Date(), audit = () => {}, maxTtlMs = 120_000 } = {}) {
    this.#clock = clock;
    this.#audit = audit;
    this.#maxTtlMs = maxTtlMs;
    if (!Number.isInteger(maxTtlMs) || maxTtlMs <= 0) {
      throw new KeyReleaseAuthorizationError("KEY_RELEASE_TTL_INVALID", "authorization TTL must be positive");
    }
  }

  /**
   * Evaluate the dual-condition release policy.
   *
   * A successful result is an opaque authorization artifact for a future KMS
   * adapter call. It contains references and hashes only; no DEK or private
   * key material is accepted or returned.
   */
  authorize(input) {
    validateInput(input);
    if (this.#issued.has(input.authorizationId)) {
      return this.#deny(input, "KEY_RELEASE_REPLAY");
    }

    const validation = validateKeyReleaseContext(input, { now: this.#now(), maxTtlMs: this.#maxTtlMs });
    if (!validation.ok) return this.#deny(input, validation.reasonCode);
    const expiresAt = validation.expiresAt;
    this.#issued.add(input.authorizationId);
    const result = {
      decision: KeyReleaseDecision.ALLOW,
      reasonCode: "KEY_RELEASE_ALLOWED",
      authorizationId: input.authorizationId,
      packageId: input.packageId,
      envelopeId: input.envelopeId,
      handoffId: input.handoffId,
      ticketId: input.ticket.ticketId,
      targetInstitutionRef: input.targetInstitutionRef,
      manifestHash: input.package.manifestHash,
      expiresAt,
      // The next WBS step passes this reference-only artifact to a KMS adapter.
      rewrapRequest: {
        packageId: input.packageId,
        sourceEnvelopeRef: input.envelopeId,
        recipientType: "B_GATEWAY",
        recipientRef: input.targetInstitutionRef,
        authorizationId: input.authorizationId,
        manifestHash: input.package.manifestHash,
        expiresAt,
      },
    };
    this.#record(input, "ALLOW", "KEY_RELEASE_ALLOWED");
    return result;
  }

  auditEvents() {
    return this.#events.map((event) => ({ ...event }));
  }

  #deny(input, reasonCode) {
    this.#record(input, "DENY", reasonCode);
    return { decision: KeyReleaseDecision.DENY, reasonCode };
  }

  #record(input, decision, reasonCode) {
    const event = {
      eventType: "KEY_RELEASE_DECISION",
      decision,
      reasonCode,
      authorizationId: input.authorizationId,
      packageId: input.packageId,
      envelopeId: input.envelopeId,
      handoffId: input.handoffId,
      ticketId: input.ticket.ticketId,
      targetInstitutionRef: input.targetInstitutionRef,
      manifestHash: input.package.manifestHash,
      occurredAt: this.#now().toISOString(),
    };
    this.#events.push(event);
    this.#audit(event);
  }

  #now() {
    const value = this.#clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new KeyReleaseAuthorizationError("KEY_RELEASE_CLOCK_INVALID", "clock returned an invalid date");
    return date;
  }
}

/**
 * Validate all cross-object release conditions without invoking a KMS.
 * The returned object is safe to pass to an adapter because it contains only
 * decision metadata and opaque references.
 */
export function validateKeyReleaseContext(input, { now = new Date(), maxTtlMs = 120_000 } = {}) {
  validateInput(input);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_CLOCK_INVALID", "clock returned an invalid date");
  }
  if (!Number.isInteger(maxTtlMs) || maxTtlMs <= 0) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_TTL_INVALID", "authorization TTL must be positive");
  }
  const checks = [
    [input.consent.status === "ACTIVE", "CONSENT_NOT_ACTIVE"],
    [input.handoff.status === "AUTHORIZED" && input.handoff.patientApproved === true, "HANDOFF_NOT_PATIENT_APPROVED"],
    [ALLOWED_TICKET_STATES.has(input.ticket.status), "TICKET_NOT_USABLE"],
    [input.ticket.ticketId === input.handoff.ticketId, "TICKET_MISMATCH"],
    [input.package.status === "VERIFIED", "PACKAGE_NOT_VERIFIED"],
    [input.integrity.verified === true, "PACKAGE_INTEGRITY_NOT_VERIFIED"],
    [input.integrity.manifestHash === input.package.manifestHash, "MANIFEST_HASH_MISMATCH"],
    [ACTIVE_DEVICE_STATES.has(input.device.status), "DEVICE_NOT_ACTIVE"],
    [input.actor.mfaVerified === true, "MFA_REQUIRED"],
    [input.actor.institutionRef === input.targetInstitutionRef, "ACTOR_INSTITUTION_MISMATCH"],
    [input.actor.clinicianRef === input.handoff.clinicianRef, "CLINICIAN_MISMATCH"],
    [input.consent.targetInstitutionRef === input.targetInstitutionRef, "CONSENT_TARGET_MISMATCH"],
    [input.handoff.targetInstitutionRef === input.targetInstitutionRef, "HANDOFF_TARGET_MISMATCH"],
    [input.package.targetInstitutionRef === input.targetInstitutionRef, "PACKAGE_TARGET_MISMATCH"],
    [input.package.packageId === input.packageId, "PACKAGE_MISMATCH"],
    [input.handoff.handoffId === input.handoffId, "HANDOFF_MISMATCH"],
    [input.consent.consentId === input.consentId, "CONSENT_MISMATCH"],
    [input.device.deviceId === input.deviceId, "DEVICE_MISMATCH"],
    [scopedByConsent(input.consent.scope, input.package.scope), "SCOPE_MISMATCH"],
    [notExpired(input.consent.validFrom, input.consent.validUntil, current), "CONSENT_EXPIRED"],
    [notExpired(null, input.handoff.expiresAt, current), "HANDOFF_EXPIRED"],
    [notExpired(null, input.ticket.expiresAt, current), "TICKET_EXPIRED"],
    [notExpired(null, input.package.expiresAt, current), "PACKAGE_EXPIRED"],
    [input.ticket.usedAt == null && input.ticket.revokedAt == null, "TICKET_REVOKED_OR_CONSUMED"],
  ];
  const failed = checks.find(([passed]) => !passed);
  if (failed) return { ok: false, reasonCode: failed[1] };
  return {
    ok: true,
    expiresAt: earliestExpiry(
      input.consent.validUntil,
      input.handoff.expiresAt,
      input.ticket.expiresAt,
      input.package.expiresAt,
      new Date(current.getTime() + maxTtlMs).toISOString(),
    ),
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", "authorization input is required");
  }
  for (const name of ["authorizationId", "packageId", "envelopeId", "handoffId", "consentId", "deviceId", "targetInstitutionRef"]) {
    if (typeof input[name] !== "string" || !REF_PATTERN.test(input[name])) {
      throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", `${name} is invalid`);
    }
  }
  for (const name of ["consent", "handoff", "ticket", "package", "device", "actor", "integrity"]) {
    if (!input[name] || typeof input[name] !== "object" || Array.isArray(input[name])) {
      throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", `${name} context is required`);
    }
  }
  if (typeof input.package.manifestHash !== "string" || !HASH_PATTERN.test(input.package.manifestHash)) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", "package manifest hash is invalid");
  }
  if (typeof input.integrity.manifestHash !== "string" || !HASH_PATTERN.test(input.integrity.manifestHash)) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", "integrity manifest hash is invalid");
  }
  if (typeof input.ticket.ticketId !== "string" || !REF_PATTERN.test(input.ticket.ticketId)) {
    throw new KeyReleaseAuthorizationError("KEY_RELEASE_INPUT_INVALID", "ticket id is invalid");
  }
}

function notExpired(validFrom, validUntil, now) {
  const from = validFrom == null ? null : new Date(validFrom);
  const until = new Date(validUntil);
  return (!from || Number.isFinite(from.getTime())) && Number.isFinite(until.getTime()) && from <= now && now < until;
}

function earliestExpiry(...values) {
  const dates = values.map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime()));
  return new Date(Math.min(...dates.map((value) => value.getTime()))).toISOString();
}

function scopedByConsent(consentScope, packageScope) {
  if (!consentScope || !packageScope || typeof consentScope !== "object" || typeof packageScope !== "object") return false;
  for (const key of ["studyRefs", "seriesRefs", "instanceRefs", "frameRefs"]) {
    const requested = packageScope[key] ?? [];
    const allowed = new Set(consentScope[key] ?? []);
    if (!Array.isArray(requested) || requested.some((ref) => typeof ref !== "string" || !allowed.has(ref))) return false;
  }
  const requestedActions = packageScope.actions ?? [];
  const allowedActions = new Set(consentScope.actions ?? []);
  return Array.isArray(requestedActions) && requestedActions.every((action) => allowedActions.has(action));
}
