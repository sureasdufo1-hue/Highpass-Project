import assert from "node:assert/strict";
import test from "node:test";
import {
  KeyReleaseAuthorizationError,
  KeyReleaseAuthorizationService,
  KeyReleaseDecision,
  validateKeyReleaseContext,
} from "../src/mobile-key-release.js";

const now = new Date("2026-09-12T00:00:00.000Z");
const manifestHash = "a".repeat(43);

function createService() {
  const events = [];
  const service = new KeyReleaseAuthorizationService({ clock: () => now, audit: (event) => events.push(event) });
  return { service, events };
}

function createInput(overrides = {}) {
  const base = {
    authorizationId: "kra_synthetic_001",
    packageId: "pkg_synthetic_001",
    envelopeId: "env_synthetic_001",
    handoffId: "hof_synthetic_001",
    consentId: "con_synthetic_001",
    deviceId: "dev_synthetic_001",
    targetInstitutionRef: "inst_hospital_b",
    consent: {
      consentId: "con_synthetic_001",
      status: "ACTIVE",
      targetInstitutionRef: "inst_hospital_b",
      validFrom: "2026-09-11T00:00:00.000Z",
      validUntil: "2026-09-12T00:30:00.000Z",
      scope: { studyRefs: ["study_synthetic_001"], seriesRefs: ["series_synthetic_001"], actions: ["VIEW"] },
    },
    handoff: {
      handoffId: "hof_synthetic_001",
      status: "AUTHORIZED",
      patientApproved: true,
      targetInstitutionRef: "inst_hospital_b",
      clinicianRef: "clinician_synthetic_b",
      ticketId: "ticket_synthetic_001",
      expiresAt: "2026-09-12T00:20:00.000Z",
    },
    ticket: {
      ticketId: "ticket_synthetic_001",
      status: "AUTHORIZED",
      expiresAt: "2026-09-12T00:20:00.000Z",
      usedAt: null,
      revokedAt: null,
    },
    package: {
      packageId: "pkg_synthetic_001",
      status: "VERIFIED",
      targetInstitutionRef: "inst_hospital_b",
      manifestHash,
      expiresAt: "2026-09-12T00:25:00.000Z",
      scope: { studyRefs: ["study_synthetic_001"], seriesRefs: ["series_synthetic_001"], actions: ["VIEW"] },
    },
    device: { deviceId: "dev_synthetic_001", status: "ACTIVE" },
    actor: { institutionRef: "inst_hospital_b", clinicianRef: "clinician_synthetic_b", mfaVerified: true },
    integrity: { verified: true, manifestHash },
  };
  return deepMerge(base, overrides);
}

test("authorizes a one-time B Gateway rewrap artifact after all policy conditions pass", () => {
  const { service, events } = createService();
  const result = service.authorize(createInput());
  assert.equal(result.decision, KeyReleaseDecision.ALLOW);
  assert.equal(result.reasonCode, "KEY_RELEASE_ALLOWED");
  assert.equal(result.rewrapRequest.recipientType, "B_GATEWAY");
  assert.equal(result.rewrapRequest.sourceEnvelopeRef, "env_synthetic_001");
  assert.equal(result.expiresAt, "2026-09-12T00:02:00.000Z");
  assert.doesNotMatch(JSON.stringify(result), /raw|plaintext|dek|private|secret|material/iu);
  assert.equal(events.at(-1).eventType, "KEY_RELEASE_DECISION");
  assert.equal(events.at(-1).decision, "ALLOW");
});

test("requires patient approval and B MFA before key release", () => {
  const { service } = createService();
  assert.deepEqual(service.authorize(createInput({ handoff: { patientApproved: false } })), {
    decision: "DENY",
    reasonCode: "HANDOFF_NOT_PATIENT_APPROVED",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_002", actor: { mfaVerified: false } })), {
    decision: "DENY",
    reasonCode: "MFA_REQUIRED",
  });
});

test("denies revoked or expired consent and mismatched institution or scope", () => {
  const { service } = createService();
  assert.deepEqual(service.authorize(createInput({ consent: { status: "REVOKED" } })), {
    decision: "DENY",
    reasonCode: "CONSENT_NOT_ACTIVE",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_002", targetInstitutionRef: "inst_hospital_c" })), {
    decision: "DENY",
    reasonCode: "ACTOR_INSTITUTION_MISMATCH",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_003", package: { scope: { studyRefs: ["study_other"], seriesRefs: ["series_synthetic_001"], actions: ["VIEW"] } } })), {
    decision: "DENY",
    reasonCode: "SCOPE_MISMATCH",
  });
});

test("denies unverified, expired, revoked, and inactive package/device paths", () => {
  const { service } = createService();
  assert.deepEqual(service.authorize(createInput({ package: { status: "RECEIVED" } })), {
    decision: "DENY",
    reasonCode: "PACKAGE_NOT_VERIFIED",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_002", integrity: { verified: false } })), {
    decision: "DENY",
    reasonCode: "PACKAGE_INTEGRITY_NOT_VERIFIED",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_003", device: { status: "LOST" } })), {
    decision: "DENY",
    reasonCode: "DEVICE_NOT_ACTIVE",
  });
  assert.deepEqual(service.authorize(createInput({ authorizationId: "kra_synthetic_004", ticket: { expiresAt: "2026-09-11T23:59:00.000Z" } })), {
    decision: "DENY",
    reasonCode: "TICKET_EXPIRED",
  });
});

test("prevents authorization replay and rejects malformed contracts", () => {
  const { service } = createService();
  assert.equal(service.authorize(createInput()).decision, KeyReleaseDecision.ALLOW);
  assert.deepEqual(service.authorize(createInput()), { decision: "DENY", reasonCode: "KEY_RELEASE_REPLAY" });
  assert.throws(() => service.authorize(null), (error) => error instanceof KeyReleaseAuthorizationError && error.code === "KEY_RELEASE_INPUT_INVALID");
});

test("context validator isolates clinician, ticket, consent-target, and manifest failures", () => {
  const base = createInput();
  assert.deepEqual(validateKeyReleaseContext({ ...base, actor: { ...base.actor, clinicianRef: "clinician_other" } }, { now }), { ok: false, reasonCode: "CLINICIAN_MISMATCH" });
  assert.deepEqual(validateKeyReleaseContext({ ...base, ticket: { ...base.ticket, ticketId: "ticket_other_001" } }, { now }), { ok: false, reasonCode: "TICKET_MISMATCH" });
  assert.deepEqual(validateKeyReleaseContext({ ...base, consent: { ...base.consent, targetInstitutionRef: "inst_hospital_c" } }, { now }), { ok: false, reasonCode: "CONSENT_TARGET_MISMATCH" });
  assert.deepEqual(validateKeyReleaseContext({ ...base, integrity: { ...base.integrity, manifestHash: "b".repeat(43) } }, { now }), { ok: false, reasonCode: "MANIFEST_HASH_MISMATCH" });
  assert.equal(validateKeyReleaseContext(base, { now }).ok, true);
});

function deepMerge(base, overrides) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
