import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const DEFAULT_KEK_REF = "HOSP-B-KEK-v1";

export class PacsCryptoError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PacsCryptoError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Get Hospital Master Key (KEK) for Hospital B
 */
export function getHospitalMasterKek(hospitalId = "HOSP-B") {
  const envVal = process.env.HIPASS_HOSPITAL_B_KEK;
  if (envVal) {
    if (envVal.length === 64 && /^[0-9a-fA-F]{64}$/.test(envVal)) {
      return Buffer.from(envVal, "hex");
    }
    throw new PacsCryptoError("INVALID_KEK_CONFIGURATION", "Hospital KEK must be exactly 32 bytes encoded as 64 hexadecimal characters");
  }
  throw new PacsCryptoError("KEK_NOT_CONFIGURED", "Hospital archive encryption key is not configured");
}

/**
 * Generate a 256-bit CSPRNG Data Encryption Key (DEK)
 */
export function generateDek() {
  return randomBytes(KEY_BYTES);
}

/**
 * Encrypt a DICOM Part 10 binary Buffer using AES-256-GCM
 */
export function encryptDicomBuffer(plainBuffer, dek, sopInstanceUid) {
  if (!Buffer.isBuffer(plainBuffer) || plainBuffer.length === 0) {
    throw new PacsCryptoError("INVALID_BUFFER", "plainBuffer must be a non-empty Buffer");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new PacsCryptoError("INVALID_DEK", `DEK must be a ${KEY_BYTES}-byte Buffer`);
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  const aad = Buffer.from(`HOSP-B:SOP:${sopInstanceUid}`, "utf8");
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    nonce: nonce.toString("base64url"),
    tag: tag.toString("base64url"),
    plainSha256: createHash("sha256").update(plainBuffer).digest("hex"),
    cipherSha256: createHash("sha256").update(ciphertext).digest("hex"),
    plainBytes: plainBuffer.length,
    cipherBytes: ciphertext.length,
  };
}

/**
 * Decrypt an AES-256-GCM encrypted DICOM Part 10 buffer
 */
export function decryptDicomBuffer(ciphertext, dek, nonceBase64Url, tagBase64Url, sopInstanceUid) {
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
    throw new PacsCryptoError("INVALID_CIPHERTEXT", "ciphertext must be a non-empty Buffer");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new PacsCryptoError("INVALID_DEK", `DEK must be a ${KEY_BYTES}-byte Buffer`);
  }

  try {
    const nonce = Buffer.from(nonceBase64Url, "base64url");
    const tag = Buffer.from(tagBase64Url, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
    const aad = Buffer.from(`HOSP-B:SOP:${sopInstanceUid}`, "utf8");
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new PacsCryptoError(
      "AEAD_TAG_MISMATCH",
      `Failed to decrypt DICOM object: authentication tag mismatch or invalid key (${err.message})`,
      { sopInstanceUid }
    );
  }
}

/**
 * Wrap (encrypt) the per-study DEK using Hospital Master KEK
 */
export function wrapDek(dek, kek = getHospitalMasterKek(), studyInstanceUid) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new PacsCryptoError("INVALID_DEK", `DEK must be a ${KEY_BYTES}-byte Buffer`);
  }
  if (!Buffer.isBuffer(kek) || kek.length !== KEY_BYTES) {
    throw new PacsCryptoError("INVALID_KEK", `KEK must be a ${KEY_BYTES}-byte Buffer`);
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, nonce);
  const aad = Buffer.from(`HOSP-B:STUDY:${studyInstanceUid}`, "utf8");
  cipher.setAAD(aad);

  const wrappedDek = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "AES-256-GCM",
    keyRef: DEFAULT_KEK_REF,
    wrappedDek: wrappedDek.toString("base64url"),
    nonce: nonce.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

/**
 * Unwrap (decrypt) the per-study DEK using Hospital Master KEK
 */
export function unwrapDek(keyEnvelope, kek = getHospitalMasterKek(), studyInstanceUid) {
  if (!keyEnvelope || typeof keyEnvelope !== "object") {
    throw new PacsCryptoError("INVALID_KEY_ENVELOPE", "keyEnvelope is missing or invalid");
  }
  if (!Buffer.isBuffer(kek) || kek.length !== KEY_BYTES) {
    throw new PacsCryptoError("INVALID_KEK", `KEK must be a ${KEY_BYTES}-byte Buffer`);
  }

  try {
    const wrappedDek = Buffer.from(keyEnvelope.wrappedDek, "base64url");
    const nonce = Buffer.from(keyEnvelope.nonce, "base64url");
    const tag = Buffer.from(keyEnvelope.tag, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", kek, nonce);
    const aad = Buffer.from(`HOSP-B:STUDY:${studyInstanceUid}`, "utf8");
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    const dek = Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
    if (dek.length !== KEY_BYTES) {
      throw new PacsCryptoError("UNWRAPPED_DEK_SIZE_MISMATCH", `Unwrapped DEK size is ${dek.length}, expected ${KEY_BYTES}`);
    }
    return dek;
  } catch (err) {
    throw new PacsCryptoError(
      "KEY_UNWRAP_FAILED",
      `Failed to unwrap DEK: Master KEK mismatch or corrupted envelope (${err.message})`,
      { studyInstanceUid }
    );
  }
}
