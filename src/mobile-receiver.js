import { createHash, randomBytes } from "node:crypto";
import { decryptAndVerifyImagingPackage, MobilePackageError } from "./mobile-package-crypto.js";

export const ReceiverState = Object.freeze({
  UPLOADING: "UPLOADING",
  RECEIVED: "RECEIVED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
});

export class MobileReceiverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MobileReceiverError";
    this.code = code;
    this.details = details;
  }
}

export class MobilePackageReceiver {
  #uploads = new Map();
  #receipts = [];
  #clock;

  constructor({ clock = () => new Date() } = {}) { this.#clock = clock; }

  startUpload({ uploadId, packageId, envelope, handoffId, receiverInstitutionRef, expectedPackageHash }) {
    if ([uploadId, packageId, handoffId, receiverInstitutionRef].some((value) => typeof value !== "string" || value.length === 0 || value.length > 128)) {
      throw new MobileReceiverError("UPLOAD_INPUT_INVALID", "upload references are invalid");
    }
    if (!envelope || envelope.packageId !== packageId || envelope.manifestEncrypted !== true || envelope.chunkCount < 1) throw new MobileReceiverError("UPLOAD_ENVELOPE_INVALID", "encrypted package envelope is required");
    const expiresAt = new Date(envelope.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= this.#now()) throw new MobileReceiverError("UPLOAD_EXPIRED", "package upload is expired");
    if (this.#uploads.has(uploadId)) throw new MobileReceiverError("UPLOAD_EXISTS", "upload already exists");
    if (typeof expectedPackageHash !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(expectedPackageHash)) throw new MobileReceiverError("UPLOAD_HASH_REQUIRED", "expected package hash is required");
    this.#uploads.set(uploadId, { uploadId, packageId, envelope: clone(envelope), expectedPackageHash, handoffId, receiverInstitutionRef, expiresAt: expiresAt.toISOString(), chunks: new Map(), state: ReceiverState.UPLOADING, createdAt: this.#now().toISOString() });
    return this.getUpload(uploadId);
  }

  receiveChunk(uploadId, { chunkNo, ciphertext, nonce, tag, hash }) {
    const upload = this.#require(uploadId);
    this.#ensureActive(upload);
    if (!Number.isInteger(chunkNo) || chunkNo < 0 || chunkNo >= upload.envelope.chunkCount) throw new MobileReceiverError("CHUNK_NUMBER_INVALID", "chunk number is outside the envelope");
    if (![ciphertext, nonce, tag].every(Buffer.isBuffer) || nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new MobileReceiverError("CHUNK_CIPHERTEXT_INVALID", "encrypted chunk format is invalid");
    const computedHash = sha256Base64Url(ciphertext);
    if (typeof hash !== "string" || hash !== computedHash) throw new MobileReceiverError("CHUNK_HASH_MISMATCH", "chunk hash does not match ciphertext", { chunkNo });
    const existing = upload.chunks.get(chunkNo);
    if (existing) {
      if (existing.hash !== hash) throw new MobileReceiverError("CHUNK_CONFLICT", "chunk number was already received with different ciphertext", { chunkNo });
      return { uploadId, chunkNo, status: "DUPLICATE", receivedCount: upload.chunks.size, expectedCount: upload.envelope.chunkCount };
    }
    upload.chunks.set(chunkNo, { chunkNo, ciphertext: Buffer.from(ciphertext), nonce: Buffer.from(nonce), tag: Buffer.from(tag), hash });
    return { uploadId, chunkNo, status: "RECEIVED", receivedCount: upload.chunks.size, expectedCount: upload.envelope.chunkCount };
  }

  completeUpload(uploadId, { dek = null } = {}) {
    const upload = this.#require(uploadId);
    this.#ensureActive(upload);
    if (upload.chunks.size !== upload.envelope.chunkCount) throw new MobileReceiverError("UPLOAD_INCOMPLETE", "not all chunks have been received", { received: upload.chunks.size, expected: upload.envelope.chunkCount });
    const chunks = [...upload.chunks.values()].sort((left, right) => left.chunkNo - right.chunkNo);
    const packageHash = sha256Base64Url(Buffer.concat(chunks.map((chunk) => chunk.ciphertext)));
    if (packageHash !== upload.expectedPackageHash) {
      upload.state = ReceiverState.FAILED;
      throw new MobileReceiverError("PACKAGE_HASH_MISMATCH", "reassembled package hash does not match envelope");
    }
    let manifestHash = null;
    let tagVerified = false;
    if (dek) {
      try {
        const verified = decryptAndVerifyImagingPackage({ envelope: upload.envelope, chunks, dek, now: this.#now() });
        manifestHash = verified.manifest.manifestHash;
        tagVerified = true;
      } catch (error) {
        upload.state = ReceiverState.FAILED;
        if (error instanceof MobilePackageError) throw new MobileReceiverError(`PACKAGE_${error.code}`, error.message);
        throw error;
      }
    }
    upload.state = dek ? ReceiverState.VERIFIED : ReceiverState.RECEIVED;
    const receipt = {
      receiptId: `rcpt_${randomOpaque(16)}`,
      uploadId,
      packageId: upload.packageId,
      handoffId: upload.handoffId,
      receiverInstitutionRef: upload.receiverInstitutionRef,
      packageHash,
      manifestHash,
      result: upload.state,
      tagVerified,
      receivedAt: this.#now().toISOString(),
      integrityDigest: createHash("sha256").update(`${upload.uploadId}:${packageHash}:${upload.state}`).digest("base64url"),
    };
    this.#receipts.push(receipt);
    return { ...receipt, chunks: chunks.map(cloneChunk) };
  }

  getUpload(uploadId) {
    const upload = this.#require(uploadId);
    return { uploadId: upload.uploadId, packageId: upload.packageId, handoffId: upload.handoffId, receiverInstitutionRef: upload.receiverInstitutionRef, state: upload.state, expiresAt: upload.expiresAt, receivedCount: upload.chunks.size, expectedCount: upload.envelope.chunkCount };
  }

  receipts() { return this.#receipts.map((receipt) => ({ ...receipt })); }

  #require(uploadId) { const upload = this.#uploads.get(uploadId); if (!upload) throw new MobileReceiverError("UPLOAD_NOT_FOUND", "upload is not found"); return upload; }
  #ensureActive(upload) {
    if (upload.state !== ReceiverState.UPLOADING) throw new MobileReceiverError("UPLOAD_STATE_DENIED", `upload is ${upload.state}`);
    if (new Date(upload.expiresAt) <= this.#now()) { upload.state = ReceiverState.EXPIRED; throw new MobileReceiverError("UPLOAD_EXPIRED", "upload has expired"); }
  }
  #now() { const value = this.#clock(); return value instanceof Date ? value : new Date(value); }
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cloneChunk(chunk) { return { chunkNo: chunk.chunkNo, ciphertext: Buffer.from(chunk.ciphertext), nonce: Buffer.from(chunk.nonce), tag: Buffer.from(chunk.tag), hash: chunk.hash }; }
function sha256Base64Url(value) { return createHash("sha256").update(value).digest("base64url"); }
function randomOpaque(bytes) { return randomBytes(bytes).toString("base64url"); }
