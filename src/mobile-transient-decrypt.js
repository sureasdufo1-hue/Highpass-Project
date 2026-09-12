import { decryptAndVerifyImagingPackage, MobilePackageError } from "./mobile-package-crypto.js";

export class TransientDecryptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TransientDecryptError";
    this.code = code;
  }
}

/**
 * B Edge transient decrypt boundary (WBS-12).
 *
 * The key resolver represents a future KMS/HSM decrypt operation. A raw DEK
 * exists only for the duration of this call and is zeroized in all paths.
 * Plaintext is delivered to a consumer callback and is zeroized immediately
 * after the callback returns.
 */
export class MobileTransientDecryptor {
  #clock;
  #audit;

  constructor({ clock = () => new Date(), audit = () => {} } = {}) {
    this.#clock = clock;
    this.#audit = audit;
    this.#events = [];
  }

  #events;

  async decryptVerifiedPackage({ packageRecord, envelope, chunks, authorization, resolveDek, onPlaintextChunk }) {
    validateRequest({ packageRecord, envelope, chunks, authorization, resolveDek, onPlaintextChunk });
    const now = this.#now();
    const denial = preconditionFailure({ packageRecord, envelope, authorization, now });
    if (denial) {
      this.#record({ packageRecord, authorization }, "DENY", denial);
      throw new TransientDecryptError(denial, "transient decrypt precondition denied");
    }

    this.#record({ packageRecord, authorization }, "ALLOW", "B_DECRYPT_STARTED");
    let resolvedKey;
    let plaintextChunks = [];
    try {
      resolvedKey = await resolveDek({
        packageId: packageRecord.packageId,
        envelopeId: authorization.envelopeId,
        authorizationId: authorization.authorizationId,
      });
      if (!Buffer.isBuffer(resolvedKey) || resolvedKey.length !== 32) throw new TransientDecryptError("DEK_INVALID", "KMS/HSM returned an invalid transient key");
      const verified = decryptAndVerifyImagingPackage({ envelope, chunks, dek: resolvedKey, now });
      plaintextChunks = verified.plaintextChunks;
      let totalBytes = 0;
      for (const [chunkNo, plaintext] of plaintextChunks.entries()) {
        try {
          await onPlaintextChunk(plaintext, { chunkNo, packageId: packageRecord.packageId, manifestHash: verified.manifest.manifestHash });
          totalBytes += plaintext.length;
        } finally {
          plaintext.fill(0);
        }
      }
      const result = {
        decision: "ALLOW",
        reasonCode: "B_DECRYPT_COMPLETED",
        packageId: packageRecord.packageId,
        authorizationId: authorization.authorizationId,
        manifestHash: verified.manifest.manifestHash,
        chunkCount: plaintextChunks.length,
        bytesConsumed: totalBytes,
        expiresAt: envelope.expiresAt,
      };
      this.#record({ packageRecord, authorization }, "ALLOW", "B_DECRYPT_COMPLETED", { chunkCount: result.chunkCount, bytesConsumed: totalBytes, manifestHash: result.manifestHash });
      return result;
    } catch (error) {
      const safeCode = error instanceof TransientDecryptError ? error.code : error instanceof MobilePackageError ? (error.code.startsWith("PACKAGE_") ? error.code : `PACKAGE_${error.code}`) : "B_DECRYPT_FAILED";
      this.#record({ packageRecord, authorization }, "DENY", safeCode);
      if (error instanceof TransientDecryptError) throw error;
      throw new TransientDecryptError(safeCode, "transient decrypt failed");
    } finally {
      for (const plaintext of plaintextChunks) {
        if (Buffer.isBuffer(plaintext)) plaintext.fill(0);
      }
      if (Buffer.isBuffer(resolvedKey)) resolvedKey.fill(0);
    }
  }

  auditEvents() { return this.#events.map((event) => ({ ...event })); }

  #record({ packageRecord, authorization }, decision, reasonCode, details = {}) {
    const event = {
      eventType: "B_TRANSIENT_DECRYPT",
      decision,
      reasonCode,
      packageId: packageRecord.packageId,
      authorizationId: authorization.authorizationId,
      envelopeId: authorization.envelopeId,
      ...details,
      occurredAt: this.#now().toISOString(),
    };
    this.#events.push(event);
    this.#audit(event);
  }

  #now() {
    const value = this.#clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TransientDecryptError("DECRYPT_CLOCK_INVALID", "clock returned an invalid date");
    return date;
  }
}

function validateRequest({ packageRecord, envelope, chunks, authorization, resolveDek, onPlaintextChunk }) {
  if (!packageRecord || typeof packageRecord !== "object" || typeof packageRecord.packageId !== "string" || packageRecord.packageId.length === 0) throw new TransientDecryptError("PACKAGE_CONTEXT_INVALID", "package context is required");
  if (!envelope || typeof envelope !== "object" || envelope.packageId !== packageRecord.packageId) throw new TransientDecryptError("ENVELOPE_CONTEXT_INVALID", "envelope is not bound to package");
  if (!Array.isArray(chunks)) throw new TransientDecryptError("CHUNKS_REQUIRED", "encrypted chunks are required");
  if (!authorization || typeof authorization !== "object" || authorization.decision !== "ALLOW" || typeof authorization.authorizationId !== "string" || typeof authorization.envelopeId !== "string" || typeof authorization.packageId !== "string") {
    throw new TransientDecryptError("KEY_RELEASE_REQUIRED", "an allowed key release authorization is required");
  }
  if (typeof resolveDek !== "function") throw new TransientDecryptError("DEK_RESOLVER_REQUIRED", "a transient DEK resolver is required");
  if (typeof onPlaintextChunk !== "function") throw new TransientDecryptError("PLAINTEXT_CONSUMER_REQUIRED", "a plaintext consumer is required");
  rejectKeyMaterial({ packageRecord, envelope, authorization });
}

function preconditionFailure({ packageRecord, envelope, authorization, now }) {
  if (packageRecord.status !== "VERIFIED") return "PACKAGE_NOT_VERIFIED";
  if (authorization.packageId !== packageRecord.packageId) return "KEY_RELEASE_PACKAGE_MISMATCH";
  if (authorization.envelopeId.length === 0) return "KEY_RELEASE_ENVELOPE_INVALID";
  if (authorization.expiresAt && !isActiveWindow(authorization.expiresAt, now)) return "KEY_RELEASE_EXPIRED";
  if (!isActiveWindow(envelope.expiresAt, now)) return "PACKAGE_EXPIRED";
  if (envelope.manifestEncrypted !== true) return "ENVELOPE_NOT_ENCRYPTED";
  return null;
}

function isActiveWindow(expiresAt, now) {
  const expiry = new Date(expiresAt);
  return Number.isFinite(expiry.getTime()) && now < expiry;
}

function rejectKeyMaterial(value, path = "request") {
  for (const [key, child] of Object.entries(value)) {
    if (/^(dek|plaintextdek|rawdek|keymaterial|privatekey|secret|plaintext)$/iu.test(key)) throw new TransientDecryptError("KEY_MATERIAL_REJECTED", `${path}.${key} is not accepted`);
    if (child && typeof child === "object" && !Buffer.isBuffer(child)) rejectKeyMaterial(child, `${path}.${key}`);
  }
}
