/**
 * Local domain model for key_envelopes. This is not a PostgreSQL runtime
 * implementation; it mirrors the state contract for WBS-11 tests.
 */

export const KeyEnvelopeStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  DESTROYED: "DESTROYED",
});

export class KeyEnvelopeStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KeyEnvelopeStoreError";
    this.code = code;
  }
}

export class KeyEnvelopeStore {
  #envelopes = new Map();
  #audit = [];
  #clock;

  constructor({ clock = () => new Date(), audit = () => {} } = {}) {
    this.#clock = clock;
    this.#auditSink = audit;
  }

  #auditSink;

  register(input = {}) {
    rejectKeyMaterial(input);
    const { envelopeId, packageId, recipientType, recipientRef, keyRef, keyVersion = 1, status = KeyEnvelopeStatus.ACTIVE, expiresAt = null } = input;
    for (const [name, value] of Object.entries({ envelopeId, packageId, recipientType, recipientRef, keyRef })) {
      if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{2,127}$/u.test(value)) throw new KeyEnvelopeStoreError("ENVELOPE_INPUT_INVALID", `${name} is invalid`);
    }
    if (!Number.isInteger(keyVersion) || keyVersion < 1) throw new KeyEnvelopeStoreError("KEY_VERSION_INVALID", "key version must be positive");
    if (!Object.values(KeyEnvelopeStatus).includes(status)) throw new KeyEnvelopeStoreError("ENVELOPE_STATUS_INVALID", "unsupported envelope status");
    if (this.#envelopes.has(envelopeId)) throw new KeyEnvelopeStoreError("ENVELOPE_EXISTS", "envelope already exists");
    const expiry = expiresAt == null ? null : new Date(expiresAt);
    if (expiry && !Number.isFinite(expiry.getTime())) throw new KeyEnvelopeStoreError("ENVELOPE_EXPIRY_INVALID", "envelope expiry is invalid");
    const envelope = {
      envelopeId,
      packageId,
      recipientType,
      recipientRef,
      keyRef,
      keyVersion,
      algorithm: "AES-256-GCM",
      status,
      expiresAt: expiry?.toISOString() ?? null,
      createdAt: this.#now().toISOString(),
      disabledAt: null,
      destroyedAt: null,
    };
    this.#envelopes.set(envelopeId, envelope);
    this.#record("KEY_ENVELOPE_REGISTERED", envelope, "ALLOW");
    return clone(envelope);
  }

  createRewrapped({ sourceEnvelopeId, recipientEnvelopeRef, packageId, recipientType, recipientRef, keyRef, keyVersion, expiresAt }) {
    const source = this.#require(sourceEnvelopeId);
    if (source.status !== KeyEnvelopeStatus.ACTIVE) throw new KeyEnvelopeStoreError("SOURCE_ENVELOPE_NOT_ACTIVE", "source envelope is not active");
    if (source.packageId !== packageId) throw new KeyEnvelopeStoreError("SOURCE_PACKAGE_MISMATCH", "source envelope package does not match");
    const envelope = this.register({ envelopeId: recipientEnvelopeRef, packageId, recipientType, recipientRef, keyRef, keyVersion, expiresAt });
    this.#record("KEY_ENVELOPE_REWRAPPED", envelope, "ALLOW", { sourceEnvelopeId });
    return envelope;
  }

  disable(envelopeId, reasonCode = "KEY_ENVELOPE_DISABLED") {
    const envelope = this.#require(envelopeId);
    if (envelope.status === KeyEnvelopeStatus.DESTROYED) throw new KeyEnvelopeStoreError("ENVELOPE_DESTROYED", "destroyed envelope cannot be disabled");
    envelope.status = KeyEnvelopeStatus.DISABLED;
    envelope.disabledAt = this.#now().toISOString();
    this.#record("KEY_ENVELOPE_DISABLED", envelope, "ALLOW", { reasonCode });
    return clone(envelope);
  }

  destroy(envelopeId, reasonCode = "KEY_LIFECYCLE_ENDED") {
    const envelope = this.#require(envelopeId);
    envelope.status = KeyEnvelopeStatus.DESTROYED;
    envelope.destroyedAt = this.#now().toISOString();
    this.#record("KEY_ENVELOPE_DESTROYED", envelope, "ALLOW", { reasonCode });
    return clone(envelope);
  }

  get(envelopeId) { return clone(this.#require(envelopeId)); }
  list() { return [...this.#envelopes.values()].map(clone); }
  auditEvents() { return this.#audit.map((event) => ({ ...event })); }

  #require(envelopeId) {
    const envelope = this.#envelopes.get(envelopeId);
    if (!envelope) throw new KeyEnvelopeStoreError("ENVELOPE_NOT_FOUND", "envelope is not found");
    return envelope;
  }

  #record(eventType, envelope, decision, details = {}) {
    const event = {
      eventType,
      decision,
      envelopeId: envelope.envelopeId,
      packageId: envelope.packageId,
      recipientType: envelope.recipientType,
      recipientRef: envelope.recipientRef,
      keyRef: envelope.keyRef,
      keyVersion: envelope.keyVersion,
      status: envelope.status,
      ...details,
      occurredAt: this.#now().toISOString(),
    };
    this.#audit.push(event);
    this.#auditSink(event);
  }

  #now() {
    const value = this.#clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new KeyEnvelopeStoreError("ENVELOPE_CLOCK_INVALID", "clock returned an invalid date");
    return date;
  }
}

function clone(value) { return structuredClone(value); }

function rejectKeyMaterial(value, path = "envelope") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(dek|plaintextdek|rawdek|keymaterial|privatekey|secret|plaintext)$/iu.test(key)) throw new KeyEnvelopeStoreError("KEY_MATERIAL_REJECTED", `${path}.${key} is not accepted`);
    if (child && typeof child === "object") rejectKeyMaterial(child, `${path}.${key}`);
  }
}
