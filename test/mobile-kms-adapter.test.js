import assert from "node:assert/strict";
import test from "node:test";
import { KmsAdapterError, KmsEnvelopeAdapter, TestKmsEnvelopeAdapter } from "../src/mobile-kms-adapter.js";

const clock = () => new Date("2026-09-12T00:00:00.000Z");
const request = {
  authorizationId: "kra_synthetic_001",
  packageId: "pkg_synthetic_001",
  sourceEnvelopeRef: "env_kms_escrow_001",
  recipientType: "B_GATEWAY",
  recipientRef: "inst_hospital_b",
  manifestHash: "a".repeat(43),
  expiresAt: "2026-09-12T00:02:00.000Z",
};

function adapter(options = {}) {
  const value = new TestKmsEnvelopeAdapter({ clock, ...options });
  value.registerSourceEnvelope({ sourceEnvelopeRef: request.sourceEnvelopeRef, packageId: request.packageId });
  return value;
}

test("base KMS adapter is an explicit contract and does not silently fall back", async () => {
  await assert.rejects(() => new KmsEnvelopeAdapter().rewrapEnvelope(request), (error) => error instanceof KmsAdapterError && error.code === "KMS_ADAPTER_NOT_IMPLEMENTED");
});

test("test adapter rewraps an active source envelope into a reference-only B Gateway envelope", async () => {
  const value = await adapter().rewrapEnvelope(request);
  assert.equal(value.status, "REWRAPPED");
  assert.equal(value.recipientType, "B_GATEWAY");
  assert.equal(value.keyRef, "kms-test-b-gateway-v1");
  assert.equal(value.keyVersion, 1);
  assert.equal(value.manifestHash, request.manifestHash);
  assert.doesNotMatch(JSON.stringify(value), /dek|plaintext|private|secret|material/iu);
});

test("adapter denies unavailable KMS, source mismatch, expired authorization, and replay", async () => {
  await assert.rejects(() => adapter({ available: false }).rewrapEnvelope(request), (error) => error.code === "KMS_UNAVAILABLE");
  await assert.rejects(() => adapter().rewrapEnvelope({ ...request, packageId: "pkg_other_001" }), (error) => error.code === "SOURCE_ENVELOPE_DENIED");
  await assert.rejects(() => adapter().rewrapEnvelope({ ...request, expiresAt: "2026-09-11T23:59:00.000Z" }), (error) => error.code === "KEY_RELEASE_EXPIRED");
  const value = adapter();
  await value.rewrapEnvelope(request);
  await assert.rejects(() => value.rewrapEnvelope(request), (error) => error.code === "KEY_RELEASE_REPLAY");
});

test("adapter rejects key material and unsupported recipient types", async () => {
  await assert.rejects(() => adapter().rewrapEnvelope({ ...request, dek: "never-accepted" }), (error) => error.code === "KEY_MATERIAL_REJECTED");
  await assert.rejects(() => adapter().rewrapEnvelope({ ...request, recipientType: "MOBILE_DEVICE" }), (error) => error.code === "RECIPIENT_TYPE_INVALID");
});

test("KMS audit records contain references and no key material", async () => {
  const value = adapter();
  await value.rewrapEnvelope(request);
  const events = value.auditEvents();
  assert.equal(events.at(-1).reasonCode, "KEY_ENVELOPE_REWRAPPED");
  assert.equal(events.at(-1).sourceEnvelopeRef, request.sourceEnvelopeRef);
  assert.doesNotMatch(JSON.stringify(events), /dek|plaintext|private|secret|material/iu);
});
