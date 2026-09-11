import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const MIN_CHUNK_SIZE = 64 * 1024;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

export class MobilePackageError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MobilePackageError";
    this.code = code;
    this.details = details;
  }
}

export function buildEncryptedImagingPackage({
  packageId,
  transferId,
  consentId,
  patientRef,
  sourceInstitution,
  destinationInstitution,
  purpose,
  scope,
  objects,
  keyEnvelopeRefs,
  chunkSize = MIN_CHUNK_SIZE,
  now = new Date(),
  ttlMs = 10 * 60 * 1000,
  dek = randomBytes(KEY_BYTES),
}) {
  validatePackageRef(packageId, "packageId", /^pkg_[A-Za-z0-9_-]{16,80}$/u);
  validatePackageRef(transferId, "transferId", /^trf_[A-Za-z0-9_-]{16,80}$/u);
  validateNonEmptyRef(consentId, "consentId");
  validatePackageRef(patientRef, "patientRef", /^pat_[A-Za-z0-9_-]{16,96}$/u);
  validateNonEmptyRef(sourceInstitution, "sourceInstitution");
  validateNonEmptyRef(destinationInstitution, "destinationInstitution");
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(String(purpose ?? ""))) {
    throw new MobilePackageError("PACKAGE_PURPOSE_INVALID", "purpose must be an uppercase policy code");
  }
  if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
    throw new MobilePackageError("PACKAGE_CHUNK_SIZE_INVALID", "chunkSize is outside the contract bounds");
  }
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new MobilePackageError("PACKAGE_OBJECTS_REQUIRED", "at least one imaging object is required");
  }
  if (!Array.isArray(keyEnvelopeRefs) || keyEnvelopeRefs.length === 0 || keyEnvelopeRefs.length > 16) {
    throw new MobilePackageError("PACKAGE_KEY_ENVELOPE_REQUIRED", "at least one key envelope reference is required");
  }
  if (keyEnvelopeRefs.some((ref) => typeof ref !== "string" || !/^kenv_[A-Za-z0-9_-]{16,80}$/u.test(ref)) || new Set(keyEnvelopeRefs).size !== keyEnvelopeRefs.length) {
    throw new MobilePackageError("PACKAGE_KEY_ENVELOPE_INVALID", "key envelope references must be unique opaque references");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new MobilePackageError("PACKAGE_KEY_INVALID", "DEK must be a 256-bit Buffer");
  }
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + ttlMs);
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= createdAt) {
    throw new MobilePackageError("PACKAGE_TTL_INVALID", "package timestamps are invalid");
  }

  const chunks = [];
  const manifestObjects = [];
  let packageSize = 0;
  let frameCount = 0;
  for (const [index, input] of objects.entries()) {
    if (!input || !Buffer.isBuffer(input.data) || input.data.length === 0) {
      throw new MobilePackageError("PACKAGE_OBJECT_INVALID", "object data must be a non-empty Buffer", { index });
    }
    for (const [name, value] of [["studyRef", input.studyRef], ["seriesRef", input.seriesRef], ["instanceRef", input.instanceRef]]) {
      validateNonEmptyRef(value, `objects[${index}].${name}`);
    }
    const start = chunks.length;
    const objectHash = sha256Base64Url(input.data);
    const frames = Array.isArray(input.frames) ? [...new Set(input.frames)] : undefined;
    if (frames?.some((frame) => !Number.isInteger(frame) || frame < 1)) {
      throw new MobilePackageError("PACKAGE_FRAME_INVALID", "frame references must be positive integers", { index });
    }
    frameCount += frames?.length ?? 0;
    for (let offset = 0; offset < input.data.length; offset += chunkSize) {
      const plaintext = input.data.subarray(offset, Math.min(offset + chunkSize, input.data.length));
      const chunk = encryptAesGcm(plaintext, dek, Buffer.from(`${packageId}:${chunks.length}`, "utf8"));
      chunks.push({ chunkNo: chunks.length, ciphertext: chunk.ciphertext, nonce: chunk.nonce, tag: chunk.tag, hash: sha256Base64Url(chunk.ciphertext) });
      packageSize += chunk.ciphertext.length;
    }
    manifestObjects.push({ studyRef: input.studyRef, seriesRef: input.seriesRef, instanceRef: input.instanceRef, ...(frames ? { frames } : {}), size: input.data.length, objectHash, chunkStart: start, chunkEnd: chunks.length - 1 });
  }

  const manifestBase = {
    schemaVersion: "1.0",
    packageId,
    transferId,
    consentId,
    patientRef,
    sourceInstitution,
    destinationInstitution,
    purpose,
    scope: normalizeScope(scope),
    objects: manifestObjects,
    instanceCount: manifestObjects.length,
    frameCount,
    packageHash: sha256Base64Url(Buffer.concat(chunks.map((chunk) => chunk.ciphertext))),
    chunkHashes: chunks.map((chunk) => chunk.hash),
    encryption: { algorithm: "A256GCM", version: "enc-v1", keyEnvelopeRefs: [...keyEnvelopeRefs] },
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    state: "ENCRYPTED",
  };
  const manifestHash = sha256Base64Url(Buffer.from(canonicalJson(manifestBase), "utf8"));
  const manifest = { ...manifestBase, manifestHash };
  const encryptedManifest = encryptAesGcm(Buffer.from(canonicalJson(manifest), "utf8"), dek, Buffer.from(`${packageId}:manifest`, "utf8"));
  const envelope = {
    schemaVersion: "1.0",
    packageId,
    protocolVersion: "1.0",
    cipherSuite: "A256GCM-HIGH-PASS-V1",
    chunkCount: chunks.length,
    chunkSize,
    packageSize,
    createdAt: manifest.createdAt,
    expiresAt: manifest.expiresAt,
    destinationInstitutionRef: destinationInstitution,
    manifestEncrypted: true,
    manifestCiphertext: encodeBase64Url(packEncrypted(encryptedManifest)),
    keyEnvelopeRefs: [...keyEnvelopeRefs],
  };
  return { envelope, manifest, chunks, dek: Buffer.from(dek) };
}

export function decryptAndVerifyImagingPackage({ envelope, chunks, dek, now = new Date() }) {
  if (!envelope?.manifestEncrypted || envelope.cipherSuite !== "A256GCM-HIGH-PASS-V1") {
    throw new MobilePackageError("PACKAGE_ENVELOPE_INVALID", "unsupported or unencrypted package envelope");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) throw new MobilePackageError("PACKAGE_KEY_INVALID", "DEK must be a 256-bit Buffer");
  if (new Date(now) >= new Date(envelope.expiresAt)) throw new MobilePackageError("PACKAGE_EXPIRED", "package has expired");
  if (!Array.isArray(chunks) || chunks.length !== envelope.chunkCount) throw new MobilePackageError("PACKAGE_CHUNK_COUNT_MISMATCH", "chunk count does not match envelope");
  const manifestCipher = unpackEncrypted(Buffer.from(String(envelope.manifestCiphertext), "base64url"));
  const manifest = JSON.parse(decryptAesGcm(manifestCipher, dek, Buffer.from(`${envelope.packageId}:manifest`, "utf8")).toString("utf8"));
  const expectedManifestHash = sha256Base64Url(Buffer.from(canonicalJson({ ...manifest, manifestHash: undefined }), "utf8"));
  if (manifest.manifestHash !== expectedManifestHash) throw new MobilePackageError("PACKAGE_MANIFEST_TAMPERED", "manifest hash mismatch");
  const ciphertext = [];
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.chunkNo !== index || sha256Base64Url(chunk.ciphertext) !== manifest.chunkHashes[index]) throw new MobilePackageError("PACKAGE_CHUNK_TAMPERED", "chunk hash mismatch", { index });
    ciphertext.push(decryptAesGcm({ nonce: chunk.nonce, ciphertext: chunk.ciphertext, tag: chunk.tag }, dek, Buffer.from(`${envelope.packageId}:${index}`, "utf8")));
  }
  if (sha256Base64Url(Buffer.concat(chunks.map((chunk) => chunk.ciphertext))) !== manifest.packageHash) throw new MobilePackageError("PACKAGE_HASH_MISMATCH", "package hash mismatch");
  return { manifest, plaintextChunks: ciphertext };
}

export function encryptAesGcm(plaintext, key, aad = Buffer.alloc(0)) {
  if (!Buffer.isBuffer(plaintext) || !Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new MobilePackageError("CRYPTO_INPUT_INVALID", "plaintext and 256-bit key are required");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  return { nonce, ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]), tag: cipher.getAuthTag() };
}

export function decryptAesGcm({ nonce, ciphertext, tag }, key, aad = Buffer.alloc(0)) {
  if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES || !Buffer.isBuffer(ciphertext) || !Buffer.isBuffer(tag) || tag.length !== TAG_BYTES || !Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new MobilePackageError("CRYPTO_INPUT_INVALID", "invalid AES-GCM parameters");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new MobilePackageError("CRYPTO_AUTH_FAILED", "ciphertext authentication failed");
  }
}

export function canonicalJson(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function normalizeScope(scope) {
  if (!scope || !Array.isArray(scope.studyRefs) || scope.studyRefs.length === 0 || !Array.isArray(scope.actions) || scope.actions.length === 0) {
    throw new MobilePackageError("PACKAGE_SCOPE_INVALID", "scope must include studyRefs and actions");
  }
  const allowedActions = new Set(["VIEW", "DOWNLOAD", "MOBILE_STORE", "MOBILE_HANDOFF", "PACS_IMPORT"]);
  if (scope.actions.some((action) => !allowedActions.has(action)) || new Set(scope.actions).size !== scope.actions.length) {
    throw new MobilePackageError("PACKAGE_SCOPE_INVALID", "scope contains an unsupported or duplicate action");
  }
  return JSON.parse(canonicalJson(scope));
}

function validatePackageRef(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) throw new MobilePackageError("PACKAGE_REF_INVALID", `${name} does not match the opaque reference contract`, { name });
}

function validateNonEmptyRef(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\u0000-\u001f]/u.test(value)) throw new MobilePackageError("PACKAGE_REF_INVALID", `${name} is invalid`, { name });
}

function encodeBase64Url(value) { return Buffer.from(value).toString("base64url"); }
function packEncrypted({ nonce, ciphertext, tag }) { return Buffer.concat([nonce, tag, ciphertext]); }
function unpackEncrypted(value) { if (value.length < NONCE_BYTES + TAG_BYTES) throw new MobilePackageError("PACKAGE_MANIFEST_INVALID", "encrypted manifest is truncated"); return { nonce: value.subarray(0, NONCE_BYTES), tag: value.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES), ciphertext: value.subarray(NONCE_BYTES + TAG_BYTES) }; }
