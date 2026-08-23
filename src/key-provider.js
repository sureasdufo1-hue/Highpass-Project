import { createHmac } from "node:crypto";

export class KeyProvider {
  currentKey() {
    throw new Error("KeyProvider#currentKey must be implemented");
  }

  getKey() {
    throw new Error("KeyProvider#getKey must be implemented");
  }
}

export class LocalDevelopmentKeyProvider extends KeyProvider {
  constructor(secret, keyId = "local-dev-key-v1", keys = null) {
    super();
    this.keys = keys ?? [{
      kid: keyId,
      material: secret,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      activatedAt: "2026-01-01T00:00:00.000Z",
      retiredAt: null,
      provider: "LOCAL_DEVELOPMENT",
    }];
  }

  currentKey() {
    return this.keys.find((key) => key.status === "ACTIVE" && !key.retiredAt) ?? null;
  }

  getKey(kid) {
    const key = this.keys.find((item) => item.kid === kid) ?? null;
    if (!key || key.status === "RETIRED" || key.retiredAt) return null;
    return key;
  }

  rotate(nextKey) {
    this.keys = this.keys.map((key) => key.status === "ACTIVE" ? { ...key, status: "VERIFY_ONLY" } : key);
    this.keys.push({
      ...nextKey,
      status: "ACTIVE",
      provider: nextKey.provider ?? "LOCAL_DEVELOPMENT",
      createdAt: nextKey.createdAt ?? new Date().toISOString(),
      activatedAt: nextKey.activatedAt ?? new Date().toISOString(),
      retiredAt: null,
    });
  }

  retire(kid, retiredAt = new Date().toISOString()) {
    this.keys = this.keys.map((key) => key.kid === kid ? { ...key, status: "RETIRED", retiredAt } : key);
  }
}

export class TestKeyProvider extends LocalDevelopmentKeyProvider {
  constructor(secret = "test-key-provider-secret", keyId = "test-key-v1") {
    super(secret, keyId);
    this.keys[0].provider = "TEST";
  }
}

export class KmsKeyProvider extends KeyProvider {
  constructor() {
    super();
    this.provider = "KMS_INTERFACE";
  }

  currentKey() {
    throw new Error("KMS integration is NOT VERIFIED in local MVP");
  }

  getKey() {
    throw new Error("KMS integration is NOT VERIFIED in local MVP");
  }
}

export class ExternalHttpKeyProvider extends KeyProvider {
  constructor(baseUrl, fetchImpl = globalThis.fetch) {
    super();
    if (!baseUrl) throw new Error("EXTERNAL_KEY_PROVIDER_URL_REQUIRED");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.provider = "EXTERNAL_HTTP_KMS_COMPATIBLE";
  }

  currentKey() {
    throw new Error("External HTTP key provider requires async currentKeyAsync");
  }

  getKey() {
    throw new Error("External HTTP key provider requires async getKeyAsync");
  }

  async currentKeyAsync() {
    return this.fetchKey(`${this.baseUrl}/keys/current`);
  }

  async getKeyAsync(kid) {
    return this.fetchKey(`${this.baseUrl}/keys/${encodeURIComponent(kid)}`);
  }

  async fetchKey(url) {
    const response = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("EXTERNAL_KEY_PROVIDER_UNAVAILABLE");
    const key = await response.json();
    if (!key.kid || !key.material || key.status === "RETIRED") throw new Error("EXTERNAL_KEY_PROVIDER_INVALID_KEY");
    return { ...key, provider: this.provider };
  }
}

export function createKeyProvider(secret, env = process.env) {
  if (env.KEY_PROVIDER === "KMS") return new KmsKeyProvider();
  if (env.KEY_PROVIDER === "EXTERNAL_HTTP") return new ExternalHttpKeyProvider(env.EXTERNAL_KEY_PROVIDER_URL);
  if (env.NODE_ENV === "test") return new TestKeyProvider(secret);
  return new LocalDevelopmentKeyProvider(secret, env.DICOM_TOKEN_KEY_ID ?? "dicom-local-key-v1");
}

export function hmacWithKey(key, value) {
  return createHmac("sha256", key.material).update(String(value)).digest("hex");
}
