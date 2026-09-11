import { randomUUID } from "node:crypto";

export const MobileDeviceStatus = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
  LOST: "LOST",
  REVOKED: "REVOKED",
});

export const MobileDeviceRiskLevel = Object.freeze({
  UNKNOWN: "UNKNOWN",
  LOW: "LOW",
  HIGH: "HIGH",
});

const PLATFORMS = new Set(["ANDROID", "IOS"]);
const OPAQUE_REF = /^[A-Za-z][A-Za-z0-9_-]{7,95}$/u;
const HEX_DIGEST = /^[a-f0-9]{64}$/iu;
const PRIVATE_JWK_MEMBERS = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [MobileDeviceStatus.PENDING]: new Set([MobileDeviceStatus.ACTIVE, MobileDeviceStatus.BLOCKED, MobileDeviceStatus.REVOKED]),
  [MobileDeviceStatus.ACTIVE]: new Set([MobileDeviceStatus.BLOCKED, MobileDeviceStatus.LOST, MobileDeviceStatus.REVOKED]),
  [MobileDeviceStatus.BLOCKED]: new Set([MobileDeviceStatus.REVOKED]),
  [MobileDeviceStatus.LOST]: new Set([MobileDeviceStatus.REVOKED]),
  [MobileDeviceStatus.REVOKED]: new Set(),
});

export class MobileDeviceRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MobileDeviceRegistryError";
    this.code = code;
  }
}

export class MobileDeviceRegistry {
  constructor({ now = () => new Date(), audit = () => {} } = {}) {
    this.now = now;
    this.audit = audit;
    this.devices = new Map();
    this.keys = new Map();
  }

  registerDevice({ deviceId = `dev_${randomUUID().replaceAll("-", "")}`, patientRef, institutionId, platform, appVersion }) {
    assertOpaqueRef(deviceId, "DEVICE_ID_INVALID");
    assertOpaqueRef(patientRef, "PATIENT_REF_INVALID");
    assertOpaqueRef(institutionId, "INSTITUTION_REF_INVALID");
    if (!PLATFORMS.has(platform)) throw new MobileDeviceRegistryError("DEVICE_PLATFORM_INVALID", "Unsupported mobile platform");
    if (typeof appVersion !== "string" || appVersion.length < 1 || appVersion.length > 64) {
      throw new MobileDeviceRegistryError("DEVICE_APP_VERSION_INVALID", "Invalid app version");
    }
    if (this.devices.has(deviceId)) throw new MobileDeviceRegistryError("DEVICE_ALREADY_REGISTERED", "Device is already registered");
    const timestamp = this.now().toISOString();
    const device = {
      deviceId,
      patientRef,
      institutionId,
      platform,
      appVersion,
      status: MobileDeviceStatus.PENDING,
      riskLevel: MobileDeviceRiskLevel.UNKNOWN,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeenAt: null,
    };
    this.devices.set(deviceId, device);
    this.record(device, "DEVICE_REGISTERED", "ALLOW");
    return clone(device);
  }

  registerDeviceKey(deviceId, { keyVersion, publicJwk, attestationDigest }) {
    const device = this.requireDevice(deviceId);
    if (device.status === MobileDeviceStatus.REVOKED || device.status === MobileDeviceStatus.LOST) {
      throw new MobileDeviceRegistryError("DEVICE_NOT_ELIGIBLE", "Device cannot receive a key in its current state");
    }
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
      throw new MobileDeviceRegistryError("DEVICE_KEY_VERSION_INVALID", "Key version must be a positive integer");
    }
    validatePublicJwk(publicJwk);
    if (typeof attestationDigest !== "string" || !HEX_DIGEST.test(attestationDigest)) {
      throw new MobileDeviceRegistryError("ATTESTATION_DIGEST_INVALID", "Attestation digest must be SHA-256 hex");
    }
    const keyId = `${deviceId}:${keyVersion}`;
    if (this.keys.has(keyId)) throw new MobileDeviceRegistryError("DEVICE_KEY_ALREADY_REGISTERED", "Device key version already exists");
    const timestamp = this.now().toISOString();
    const key = { deviceId, keyVersion, publicJwk: clone(publicJwk), attestationDigest: attestationDigest.toLowerCase(), status: "ACTIVE", createdAt: timestamp, revokedAt: null };
    this.keys.set(keyId, key);
    device.updatedAt = timestamp;
    device.version += 1;
    this.record(device, "DEVICE_KEY_REGISTERED", "ALLOW", { keyVersion });
    return clone(key);
  }

  activateDevice(deviceId) {
    const device = this.requireDevice(deviceId);
    if (![...this.keys.values()].some((key) => key.deviceId === deviceId && key.status === "ACTIVE")) {
      throw new MobileDeviceRegistryError("DEVICE_KEY_REQUIRED", "An active device key is required before activation");
    }
    return this.transition(device, MobileDeviceStatus.ACTIVE, "DEVICE_ACTIVATED");
  }

  blockDevice(deviceId, reasonCode = "DEVICE_RISK") {
    return this.transition(this.requireDevice(deviceId), MobileDeviceStatus.BLOCKED, "DEVICE_BLOCKED", { reasonCode });
  }

  reportLost(deviceId) {
    return this.transition(this.requireDevice(deviceId), MobileDeviceStatus.LOST, "DEVICE_LOST", { reasonCode: "DEVICE_LOST_REPORTED" });
  }

  revokeDevice(deviceId, reasonCode = "DEVICE_REVOKED") {
    const device = this.requireDevice(deviceId);
    const result = this.transition(device, MobileDeviceStatus.REVOKED, "DEVICE_REVOKED", { reasonCode });
    for (const key of this.keys.values()) {
      if (key.deviceId !== deviceId || key.status !== "ACTIVE") continue;
      key.status = "REVOKED";
      key.revokedAt = result.updatedAt;
    }
    return result;
  }

  getDevice(deviceId) {
    return clone(this.requireDevice(deviceId));
  }

  getDeviceKey(deviceId, keyVersion) {
    const key = this.keys.get(`${deviceId}:${keyVersion}`);
    if (!key) throw new MobileDeviceRegistryError("DEVICE_KEY_NOT_FOUND", "Device key not found");
    return clone(key);
  }

  requireDevice(deviceId) {
    assertOpaqueRef(deviceId, "DEVICE_ID_INVALID");
    const device = this.devices.get(deviceId);
    if (!device) throw new MobileDeviceRegistryError("DEVICE_NOT_FOUND", "Device not found");
    return device;
  }

  transition(device, nextStatus, eventType, details = {}) {
    if (!ALLOWED_TRANSITIONS[device.status]?.has(nextStatus)) {
      throw new MobileDeviceRegistryError("DEVICE_STATE_TRANSITION_DENIED", "Device state transition is not allowed");
    }
    const timestamp = this.now().toISOString();
    device.status = nextStatus;
    device.updatedAt = timestamp;
    device.version += 1;
    if (nextStatus === MobileDeviceStatus.BLOCKED || nextStatus === MobileDeviceStatus.LOST) device.riskLevel = MobileDeviceRiskLevel.HIGH;
    this.record(device, eventType, "ALLOW", details);
    return clone(device);
  }

  record(device, eventType, decision, details = {}) {
    this.audit({
      eventType,
      decision,
      deviceId: device.deviceId,
      patientRef: device.patientRef,
      institutionId: device.institutionId,
      status: device.status,
      version: device.version,
      occurredAt: this.now().toISOString(),
      ...details,
    });
  }
}

function validatePublicJwk(publicJwk) {
  if (!publicJwk || typeof publicJwk !== "object" || Array.isArray(publicJwk) || typeof publicJwk.kty !== "string") {
    throw new MobileDeviceRegistryError("PUBLIC_JWK_INVALID", "A public JWK is required");
  }
  for (const member of PRIVATE_JWK_MEMBERS) {
    if (Object.hasOwn(publicJwk, member)) throw new MobileDeviceRegistryError("PRIVATE_KEY_MATERIAL_REJECTED", "Private key material is not accepted");
  }
}

function assertOpaqueRef(value, code) {
  if (typeof value !== "string" || !OPAQUE_REF.test(value)) throw new MobileDeviceRegistryError(code, "Opaque reference is invalid");
}

function clone(value) {
  return structuredClone(value);
}
