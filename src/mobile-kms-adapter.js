/**
 * WBS-11 step 3: provider-neutral KMS envelope contract.
 *
 * The contract is asynchronous because a real KMS call is network-bound. The
 * local adapter below is test-only and never contains or returns raw DEKs.
 */

export class KmsAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KmsAdapterError";
    this.code = code;
  }
}

export class KmsEnvelopeAdapter {
  async rewrapEnvelope(_request) {
    throw new KmsAdapterError("KMS_ADAPTER_NOT_IMPLEMENTED", "KMS envelope adapter is not configured");
  }
}

/**
 * Synthetic adapter used by unit tests and the local MVP only.
 * It models KMS availability, envelope state and one-time authorization while
 * keeping key material outside the process contract.
 */
export class TestKmsEnvelopeAdapter extends KmsEnvelopeAdapter {
  #available;
  #sourceEnvelopes = new Map();
  #issued = new Set();
  #audit = [];
  #keyVersion;
  #clock;

  constructor({ available = true, keyRef = "kms-test-b-gateway-v1", keyVersion = 1, clock = () => new Date() } = {}) {
    super();
    this.#available = available;
    this.#keyVersion = keyVersion;
    this.#clock = clock;
    this.keyRef = keyRef;
  }

  setAvailable(available) {
    if (typeof available !== "boolean") throw new KmsAdapterError("KMS_AVAILABILITY_INVALID", "availability must be boolean");
    this.#available = available;
  }

  registerSourceEnvelope({ sourceEnvelopeRef, packageId, keyRef = "kms-test-a-escrow-v1", keyVersion = 1 } = {}) {
    assertRef(sourceEnvelopeRef, "SOURCE_ENVELOPE_REF_INVALID");
    assertRef(packageId, "PACKAGE_REF_INVALID");
    assertRef(keyRef, "KEY_REF_INVALID");
    if (!Number.isInteger(keyVersion) || keyVersion < 1) throw new KmsAdapterError("KEY_VERSION_INVALID", "key version must be positive");
    if (this.#sourceEnvelopes.has(sourceEnvelopeRef)) throw new KmsAdapterError("SOURCE_ENVELOPE_EXISTS", "source envelope already exists");
    this.#sourceEnvelopes.set(sourceEnvelopeRef, { sourceEnvelopeRef, packageId, keyRef, keyVersion, status: "ACTIVE" });
  }

  async rewrapEnvelope(request) {
    validateRewrapRequest(request);
    if (!this.#available) {
      this.#record(request, "DENY", "KMS_UNAVAILABLE");
      throw new KmsAdapterError("KMS_UNAVAILABLE", "KMS adapter is unavailable");
    }
    if (this.#issued.has(request.authorizationId)) {
      this.#record(request, "DENY", "KEY_RELEASE_REPLAY");
      throw new KmsAdapterError("KEY_RELEASE_REPLAY", "authorization has already been consumed");
    }
    const source = this.#sourceEnvelopes.get(request.sourceEnvelopeRef);
    if (!source || source.status !== "ACTIVE" || source.packageId !== request.packageId) {
      this.#record(request, "DENY", "SOURCE_ENVELOPE_DENIED");
      throw new KmsAdapterError("SOURCE_ENVELOPE_DENIED", "source envelope is unavailable");
    }
    const expiresAt = new Date(request.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= this.#now()) {
      this.#record(request, "DENY", "KEY_RELEASE_EXPIRED");
      throw new KmsAdapterError("KEY_RELEASE_EXPIRED", "key release authorization is expired");
    }

    this.#issued.add(request.authorizationId);
    const result = {
      status: "REWRAPPED",
      recipientEnvelopeRef: `env_${request.recipientType.toLowerCase()}_${request.authorizationId}`,
      recipientType: request.recipientType,
      recipientRef: request.recipientRef,
      keyRef: this.keyRef,
      keyVersion: this.#keyVersion,
      packageId: request.packageId,
      manifestHash: request.manifestHash,
      authorizationId: request.authorizationId,
      expiresAt: expiresAt.toISOString(),
    };
    this.#record(request, "ALLOW", "KEY_ENVELOPE_REWRAPPED", { recipientEnvelopeRef: result.recipientEnvelopeRef, keyRef: result.keyRef, keyVersion: result.keyVersion });
    return result;
  }

  auditEvents() {
    return this.#audit.map((event) => ({ ...event }));
  }

  #record(request, decision, reasonCode, details = {}) {
    const event = {
      eventType: "KMS_ENVELOPE_REWRAP",
      decision,
      reasonCode,
      authorizationId: request.authorizationId,
      packageId: request.packageId,
      sourceEnvelopeRef: request.sourceEnvelopeRef,
      recipientType: request.recipientType,
      recipientRef: request.recipientRef,
      manifestHash: request.manifestHash,
      ...details,
      occurredAt: this.#now().toISOString(),
    };
    this.#audit.push(event);
  }

  #now() {
    const value = this.#clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new KmsAdapterError("KMS_CLOCK_INVALID", "clock returned an invalid date");
    return date;
  }
}

function validateRewrapRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new KmsAdapterError("KMS_REQUEST_INVALID", "rewrap request is required");
  for (const name of ["authorizationId", "packageId", "sourceEnvelopeRef", "recipientRef"]) assertRef(request[name], `${name.toUpperCase()}_INVALID`);
  if (request.recipientType !== "B_GATEWAY") throw new KmsAdapterError("RECIPIENT_TYPE_INVALID", "only B_GATEWAY rewrap is supported");
  if (typeof request.manifestHash !== "string" || !/^[A-Za-z0-9_-]{43,128}$/u.test(request.manifestHash)) throw new KmsAdapterError("MANIFEST_HASH_INVALID", "manifest hash is invalid");
  if (typeof request.expiresAt !== "string" || !Number.isFinite(new Date(request.expiresAt).getTime())) throw new KmsAdapterError("EXPIRY_INVALID", "expiry is invalid");
  rejectKeyMaterial(request);
}

function rejectKeyMaterial(value, path = "request") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(dek|plaintextdek|rawdek|keymaterial|privatekey|secret|plaintext)$/iu.test(key)) {
      throw new KmsAdapterError("KEY_MATERIAL_REJECTED", `${path}.${key} is not accepted`);
    }
    if (child && typeof child === "object") rejectKeyMaterial(child, `${path}.${key}`);
  }
}

function assertRef(value, code) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{2,127}$/u.test(value)) throw new KmsAdapterError(code, "opaque reference is invalid");
}
