import assert from "node:assert/strict";
import test from "node:test";
import { KeyReleaseAuthorizationService } from "../src/mobile-key-release.js";
import { TestKmsEnvelopeAdapter } from "../src/mobile-kms-adapter.js";
import { KeyEnvelopeStatus, KeyEnvelopeStore } from "../src/mobile-key-envelope-store.js";
import { MobileKeyReleaseFlow } from "../src/mobile-key-release-flow.js";

const fixedNow = new Date("2026-09-12T00:00:00.000Z");
const manifestHash = "a".repeat(43);

function createInput(overrides = {}) {
  const base = {
    authorizationId: "kra_flow_001",
    packageId: "pkg_flow_001",
    envelopeId: "env_flow_001",
    handoffId: "hof_flow_001",
    consentId: "con_flow_001",
    deviceId: "dev_flow_001",
    targetInstitutionRef: "inst_hospital_b",
    consent: { consentId: "con_flow_001", status: "ACTIVE", targetInstitutionRef: "inst_hospital_b", validFrom: "2026-09-11T00:00:00.000Z", validUntil: "2026-09-12T00:30:00.000Z", scope: { studyRefs: ["study_flow_001"], seriesRefs: ["series_flow_001"], actions: ["VIEW"] } },
    handoff: { handoffId: "hof_flow_001", status: "AUTHORIZED", patientApproved: true, targetInstitutionRef: "inst_hospital_b", clinicianRef: "clinician_flow_b", ticketId: "ticket_flow_001", expiresAt: "2026-09-12T00:20:00.000Z" },
    ticket: { ticketId: "ticket_flow_001", status: "AUTHORIZED", expiresAt: "2026-09-12T00:20:00.000Z", usedAt: null, revokedAt: null },
    package: { packageId: "pkg_flow_001", status: "VERIFIED", targetInstitutionRef: "inst_hospital_b", manifestHash, expiresAt: "2026-09-12T00:25:00.000Z", scope: { studyRefs: ["study_flow_001"], seriesRefs: ["series_flow_001"], actions: ["VIEW"] } },
    device: { deviceId: "dev_flow_001", status: "ACTIVE" },
    actor: { institutionRef: "inst_hospital_b", clinicianRef: "clinician_flow_b", mfaVerified: true },
    integrity: { verified: true, manifestHash },
  };
  return merge(base, overrides);
}

function createFlow({ available = true, adapter = null } = {}) {
  const authorizationService = new KeyReleaseAuthorizationService({ clock: () => fixedNow });
  const kmsAdapter = adapter ?? new TestKmsEnvelopeAdapter({ available, clock: () => fixedNow });
  const envelopeStore = new KeyEnvelopeStore({ clock: () => fixedNow });
  if (typeof kmsAdapter.registerSourceEnvelope === "function") kmsAdapter.registerSourceEnvelope({ sourceEnvelopeRef: "env_flow_001", packageId: "pkg_flow_001" });
  envelopeStore.register({ envelopeId: "env_flow_001", packageId: "pkg_flow_001", recipientType: "KMS_ESCROW", recipientRef: "inst_hospital_a", keyRef: "kms-test-a-escrow-v1" });
  return { flow: new MobileKeyReleaseFlow({ authorizationService, kmsAdapter, envelopeStore }), envelopeStore };
}

test("executes policy authorization through rewrap and persists only destination envelope metadata", async () => {
  const { flow, envelopeStore } = createFlow();
  const result = await flow.execute(createInput());
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.reasonCode, "KEY_RELEASE_REWRAPPED");
  assert.equal(result.envelope.status, KeyEnvelopeStatus.ACTIVE);
  assert.equal(result.envelope.recipientType, "B_GATEWAY");
  assert.equal(result.envelope.packageId, "pkg_flow_001");
  assert.doesNotMatch(JSON.stringify(result), /dek|plaintext|private|secret|material/iu);
  assert.equal(envelopeStore.list().length, 2);
});

test("returns a safe denial and does not create an envelope when KMS is unavailable", async () => {
  const { flow, envelopeStore } = createFlow({ available: false });
  const result = await flow.execute(createInput());
  assert.deepEqual(result, { decision: "DENY", reasonCode: "KMS_UNAVAILABLE" });
  assert.equal(envelopeStore.list().length, 1);
});

test("rejects a KMS response containing raw key material or a wrong package binding", async () => {
  const rawAdapter = { rewrapEnvelope: async () => ({ recipientEnvelopeRef: "env_b_001", recipientType: "B_GATEWAY", recipientRef: "inst_hospital_b", keyRef: "kms-test-b-v1", keyVersion: 1, packageId: "pkg_flow_001", authorizationId: "kra_flow_001", expiresAt: "2026-09-12T00:02:00.000Z", dek: "forbidden" }) };
  const raw = await createFlow({ adapter: rawAdapter });
  assert.deepEqual(await raw.flow.execute(createInput()), { decision: "DENY", reasonCode: "KEY_MATERIAL_REJECTED" });
  assert.equal(raw.envelopeStore.list().length, 1);

  const bindingAdapter = { rewrapEnvelope: async () => ({ recipientEnvelopeRef: "env_b_002", recipientType: "B_GATEWAY", recipientRef: "inst_hospital_b", keyRef: "kms-test-b-v1", keyVersion: 1, packageId: "pkg_other_001", authorizationId: "kra_flow_001", expiresAt: "2026-09-12T00:02:00.000Z" }) };
  const binding = await createFlow({ adapter: bindingAdapter });
  assert.deepEqual(await binding.flow.execute(createInput({ authorizationId: "kra_flow_002" })), { decision: "DENY", reasonCode: "KMS_RESPONSE_BINDING_MISMATCH" });
  assert.equal(binding.envelopeStore.list().length, 1);

  const recipientAdapter = { rewrapEnvelope: async () => ({ recipientEnvelopeRef: "env_b_003", recipientType: "B_GATEWAY", recipientRef: "inst_hospital_c", keyRef: "kms-test-b-v1", keyVersion: 1, packageId: "pkg_flow_001", authorizationId: "kra_flow_003", manifestHash, expiresAt: "2026-09-12T00:02:00.000Z" }) };
  const recipient = await createFlow({ adapter: recipientAdapter });
  assert.deepEqual(await recipient.flow.execute(createInput({ authorizationId: "kra_flow_003" })), { decision: "DENY", reasonCode: "KMS_RESPONSE_BINDING_MISMATCH" });
});

test("envelope store supports disable and destroy transitions with audit events", () => {
  const { envelopeStore } = createFlow();
  assert.equal(envelopeStore.disable("env_flow_001", "DEVICE_REVOKED").status, KeyEnvelopeStatus.DISABLED);
  assert.equal(envelopeStore.destroy("env_flow_001").status, KeyEnvelopeStatus.DESTROYED);
  assert.throws(() => envelopeStore.disable("env_flow_001"), (error) => error.code === "ENVELOPE_DESTROYED");
  assert.equal(envelopeStore.auditEvents().filter((event) => event.eventType.includes("KEY_ENVELOPE_")).length, 3);
});

test("envelope store rejects raw key material at the storage boundary", () => {
  const { envelopeStore } = createFlow();
  assert.throws(() => envelopeStore.register({ envelopeId: "env_forbidden_001", packageId: "pkg_flow_001", recipientType: "B_GATEWAY", recipientRef: "inst_hospital_b", keyRef: "kms-test-b-v1", dek: "forbidden" }), (error) => error.code === "KEY_MATERIAL_REJECTED");
});

function merge(base, overrides) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) result[key] = merge(result[key], value);
    else result[key] = value;
  }
  return result;
}
