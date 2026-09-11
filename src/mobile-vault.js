import { createHash } from "node:crypto";

export class MobileVaultError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MobileVaultError";
    this.code = code;
  }
}

export const MobileVaultStatus = Object.freeze({
  STORED_ON_DEVICE: "STORED_ON_DEVICE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
  DELETED: "DELETED",
});

export class MobileVault {
  #packages = new Map();
  #audit = [];
  #clock;

  constructor({ clock = () => new Date() } = {}) {
    this.#clock = clock;
  }

  storePackage({ packageId, envelope, chunks }) {
    if (typeof packageId !== "string" || packageId !== envelope?.packageId) throw new MobileVaultError("VAULT_PACKAGE_INVALID", "package identity is invalid");
    if (!Array.isArray(chunks) || chunks.length !== envelope.chunkCount || chunks.some((chunk) => !Buffer.isBuffer(chunk.ciphertext) || !Buffer.isBuffer(chunk.nonce) || !Buffer.isBuffer(chunk.tag))) {
      throw new MobileVaultError("VAULT_CIPHERTEXT_REQUIRED", "vault accepts encrypted chunks only");
    }
    const now = this.#now();
    const expiresAt = new Date(envelope.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new MobileVaultError("VAULT_PACKAGE_EXPIRED", "expired package cannot be stored");
    if (this.#packages.has(packageId)) throw new MobileVaultError("VAULT_PACKAGE_EXISTS", "package is already stored");
    this.#packages.set(packageId, {
      packageId,
      envelope: cloneEnvelope(envelope),
      chunks: chunks.map(cloneChunk),
      status: MobileVaultStatus.STORED_ON_DEVICE,
      storedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    this.#record("PACKAGE_STORED", packageId);
    return this.getPackage(packageId);
  }

  getPackage(packageId) {
    const entry = this.#require(packageId);
    this.#expireIfNeeded(entry);
    if (entry.status !== MobileVaultStatus.STORED_ON_DEVICE) throw new MobileVaultError("VAULT_PACKAGE_UNAVAILABLE", `package is ${entry.status}`);
    return { packageId: entry.packageId, envelope: cloneEnvelope(entry.envelope), chunks: entry.chunks.map(cloneChunk), status: entry.status, expiresAt: entry.expiresAt };
  }

  revokePackage(packageId, reason = "POLICY_REVOKED") {
    const entry = this.#require(packageId);
    if (entry.status === MobileVaultStatus.DELETED) throw new MobileVaultError("VAULT_PACKAGE_DELETED", "deleted package cannot be revoked");
    entry.status = MobileVaultStatus.REVOKED;
    this.#record("PACKAGE_REVOKED", packageId, reason);
    return { packageId, status: entry.status };
  }

  deletePackage(packageId, method = "CRYPTO_ERASE") {
    const entry = this.#require(packageId);
    if (!['CRYPTO_ERASE', 'USER_REQUEST', 'TTL_EXPIRY'].includes(method)) throw new MobileVaultError("VAULT_DELETE_METHOD_INVALID", "unsupported deletion method");
    const completedAt = this.#now().toISOString();
    entry.chunks = [];
    entry.status = MobileVaultStatus.DELETED;
    const evidenceDigest = createHash("sha256").update(`${packageId}:${completedAt}:${method}`).digest("base64url");
    this.#record("PACKAGE_DELETED", packageId, method);
    return { packageId, status: entry.status, method, completedAt, evidenceDigest };
  }

  requestBackup() { throw new MobileVaultError("VAULT_EXPORT_BLOCKED", "backup export is disabled for the MVP vault"); }
  sharePackage() { throw new MobileVaultError("VAULT_EXPORT_BLOCKED", "package sharing is disabled; use an authorized handoff"); }

  listPackages() {
    for (const entry of this.#packages.values()) this.#expireIfNeeded(entry);
    return [...this.#packages.values()].map(({ packageId, status, storedAt, expiresAt }) => ({ packageId, status, storedAt, expiresAt }));
  }

  auditEvents() { return this.#audit.map((event) => ({ ...event })); }

  #require(packageId) {
    const entry = this.#packages.get(packageId);
    if (!entry) throw new MobileVaultError("VAULT_PACKAGE_NOT_FOUND", "package is not present in the vault");
    return entry;
  }

  #expireIfNeeded(entry) {
    if (entry.status === MobileVaultStatus.STORED_ON_DEVICE && new Date(entry.expiresAt) <= this.#now()) {
      entry.status = MobileVaultStatus.EXPIRED;
      entry.chunks = [];
      this.#record("PACKAGE_EXPIRED", entry.packageId, "TTL_EXPIRY");
    }
  }

  #now() { const value = this.#clock(); return value instanceof Date ? value : new Date(value); }
  #record(action, packageId, reason = null) { this.#audit.push({ action, packageId, ...(reason ? { reason } : {}), eventTime: this.#now().toISOString() }); }
}

function cloneEnvelope(envelope) { return JSON.parse(JSON.stringify(envelope)); }
function cloneChunk(chunk) { return { chunkNo: chunk.chunkNo, nonce: Buffer.from(chunk.nonce), ciphertext: Buffer.from(chunk.ciphertext), tag: Buffer.from(chunk.tag), hash: chunk.hash }; }

