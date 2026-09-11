import assert from "node:assert/strict";
import test from "node:test";
import { MobileDeviceRegistry, MobileDeviceRegistryError, MobileDeviceStatus } from "../src/mobile-device-registry.js";

const base = {
  deviceId: "dev_synthetic_a_001",
  patientRef: "pat_synthetic_a_001",
  institutionId: "inst_hospital_a",
  platform: "ANDROID",
  appVersion: "0.1.0",
};
const publicJwk = { kty: "EC", crv: "P-256", x: "x-synthetic", y: "y-synthetic" };
const attestationDigest = "a".repeat(64);

function registryWithAudit() {
  const events = [];
  const registry = new MobileDeviceRegistry({ now: () => new Date("2026-09-12T00:00:00.000Z"), audit: (event) => events.push(event) });
  return { registry, events };
}

test("registers a synthetic device in PENDING state and emits an audit event", () => {
  const { registry, events } = registryWithAudit();
  const device = registry.registerDevice(base);
  assert.equal(device.status, MobileDeviceStatus.PENDING);
  assert.equal(device.riskLevel, "UNKNOWN");
  assert.equal(events.at(-1).eventType, "DEVICE_REGISTERED");
  assert.equal(events.at(-1).decision, "ALLOW");
});

test("rejects invalid references, platform, and duplicate registration", () => {
  const { registry } = registryWithAudit();
  assert.throws(() => registry.registerDevice({ ...base, patientRef: "patient" }), (error) => error.code === "PATIENT_REF_INVALID");
  assert.throws(() => registry.registerDevice({ ...base, platform: "WINDOWS" }), (error) => error.code === "DEVICE_PLATFORM_INVALID");
  registry.registerDevice(base);
  assert.throws(() => registry.registerDevice(base), (error) => error.code === "DEVICE_ALREADY_REGISTERED");
});

test("rejects private JWK material and invalid attestation digest", () => {
  const { registry } = registryWithAudit();
  registry.registerDevice(base);
  assert.throws(() => registry.registerDeviceKey(base.deviceId, { keyVersion: 1, publicJwk: { ...publicJwk, d: "private" }, attestationDigest }), (error) => error.code === "PRIVATE_KEY_MATERIAL_REJECTED");
  assert.throws(() => registry.registerDeviceKey(base.deviceId, { keyVersion: 1, publicJwk, attestationDigest: "not-a-digest" }), (error) => error.code === "ATTESTATION_DIGEST_INVALID");
});

test("requires an active device key before activation", () => {
  const { registry } = registryWithAudit();
  registry.registerDevice(base);
  assert.throws(() => registry.activateDevice(base.deviceId), (error) => error.code === "DEVICE_KEY_REQUIRED");
  registry.registerDeviceKey(base.deviceId, { keyVersion: 1, publicJwk, attestationDigest });
  assert.equal(registry.activateDevice(base.deviceId).status, MobileDeviceStatus.ACTIVE);
});

test("lost and revoked devices fail closed and revoke active keys", () => {
  const { registry } = registryWithAudit();
  registry.registerDevice(base);
  registry.registerDeviceKey(base.deviceId, { keyVersion: 1, publicJwk, attestationDigest });
  registry.activateDevice(base.deviceId);
  assert.equal(registry.reportLost(base.deviceId).status, MobileDeviceStatus.LOST);
  assert.throws(() => registry.activateDevice(base.deviceId), (error) => error.code === "DEVICE_STATE_TRANSITION_DENIED");
  assert.equal(registry.revokeDevice(base.deviceId).status, MobileDeviceStatus.REVOKED);
  assert.equal(registry.getDeviceKey(base.deviceId, 1).status, "REVOKED");
  assert.throws(() => registry.blockDevice(base.deviceId), (error) => error.code === "DEVICE_STATE_TRANSITION_DENIED");
});

test("audit records contain only opaque identifiers and no private key material", () => {
  const { registry, events } = registryWithAudit();
  registry.registerDevice(base);
  registry.registerDeviceKey(base.deviceId, { keyVersion: 1, publicJwk, attestationDigest });
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /private|secret|BEGIN|"d"/iu);
  assert.match(events[0].patientRef, /^pat_/u);
});

test("uses typed registry errors for missing devices", () => {
  const { registry } = registryWithAudit();
  assert.throws(() => registry.getDevice("dev_missing_001"), (error) => error instanceof MobileDeviceRegistryError && error.code === "DEVICE_NOT_FOUND");
});
