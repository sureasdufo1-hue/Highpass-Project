import https from "node:https";
import { createHash } from "node:crypto";

export class AzureKeyVaultError extends Error {
  constructor(code) { super(code); this.name = "AzureKeyVaultError"; this.code = code; }
}

/** Gateway-only protocol component, NOT a Control API rewrap adapter or route.
 * authorizeOperation must query current server-side authority and the persisted
 * package/envelope binding. A caller-supplied boolean/claim is not sufficient.
 * Access token acquisition is injected; no credentials or fallback keys here.
 */
export class AzureKeyVaultDataPlane {
  #keyId; #tokenProvider; #authorize; #transport; #timeoutMs;
  constructor({ keyId, tokenProvider, authorizeOperation, transport = keyVaultHttpsRequest, timeoutMs = 10000 } = {}) {
    if (typeof keyId !== "string" || !/^https:\/\/[a-z0-9][a-z0-9-]{1,22}[a-z0-9]\.vault\.azure\.net\/keys\/[A-Za-z0-9-]{1,127}\/[a-f0-9]{32}$/u.test(keyId)) throw new AzureKeyVaultError("KV_VERSIONED_KEY_REQUIRED");
    if (typeof tokenProvider !== "function" || typeof authorizeOperation !== "function" || typeof transport !== "function") throw new AzureKeyVaultError("KV_DEPENDENCIES_REQUIRED");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new AzureKeyVaultError("KV_TIMEOUT_INVALID");
    this.#keyId = keyId; this.#tokenProvider = tokenProvider; this.#authorize = authorizeOperation; this.#transport = transport; this.#timeoutMs = timeoutMs;
  }

  async wrapDek({ packageId, dek }) {
    validatePackageId(packageId);
    if (!Buffer.isBuffer(dek) || dek.length !== 32) throw new AzureKeyVaultError("KV_DEK_INVALID");
    const temporaryKey = Buffer.from(dek);
    try {
      return await this.#bounded(async (signal) => {
        await this.#authorizeBound({ operation: "wrapkey", packageId, keyId: this.#keyId }, signal);
        const response = await this.#operation("wrapkey", temporaryKey.toString("base64url"), signal);
        const wrapped = decodeCanonical(response.value);
        if (![256, 384, 512].includes(wrapped.length)) throw new AzureKeyVaultError("KV_RESPONSE_INVALID");
        return { provider: "AZURE_KEY_VAULT", algorithm: "RSA-OAEP-256", keyId: this.#keyId, packageId, wrappedKey: response.value };
      });
    } finally { temporaryKey.fill(0); }
  }

  async consumeUnwrappedDek({ packageId, envelope, consume }) {
    validatePackageId(packageId);
    if (typeof consume !== "function" || consume.constructor?.name === "AsyncFunction" || !envelope || envelope.provider !== "AZURE_KEY_VAULT" || envelope.algorithm !== "RSA-OAEP-256" || envelope.keyId !== this.#keyId || envelope.packageId !== packageId) throw new AzureKeyVaultError("KV_ENVELOPE_BINDING_INVALID");
    const wrapped = decodeCanonical(envelope.wrappedKey);
    if (![256, 384, 512].includes(wrapped.length)) throw new AzureKeyVaultError("KV_ENVELOPE_INVALID");
    // Snapshot all inputs before asynchronous checks; no mutable envelope TOCTOU.
    const value = wrapped.toString("base64url");
    const binding = Object.freeze({ operation: "unwrapkey", packageId, keyId: this.#keyId, wrappedKeyHash: createHash("sha256").update(wrapped).digest("base64url") });
    return this.#bounded(async (signal) => {
      await this.#authorizeBound(binding, signal);
      const response = await this.#operation("unwrapkey", value, signal);
      // Do not allocate a decoded DEK across an awaited authorization callback.
      await this.#authorizeBound(binding, signal);
      const dek = decodeCanonical(response.value);
      try {
        if (dek.length !== 32) throw new AzureKeyVaultError("KV_RESPONSE_INVALID");
        // Recheck revocation/expiry after network latency, before plaintext use.
        // Do not race/cancel a consumer while it holds this buffer: synchronous
        // consumption only. The HTTP/auth budget ends before invoking consumer.
        if (signal.aborted) throw new AzureKeyVaultError("KV_TIMEOUT");
        const result = consume(dek);
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch(() => {});
          throw new AzureKeyVaultError("KV_ASYNC_CONSUMER_NOT_SUPPORTED");
        }
        return { provider: "AZURE_KEY_VAULT", packageId, keyId: this.#keyId, status: "CONSUMED" };
      } finally { dek.fill(0); }
    });
  }

  async #authorizeBound(binding, signal) {
    if (signal.aborted) throw new AzureKeyVaultError("KV_TIMEOUT");
    if (await this.#authorize(Object.freeze({ ...binding }), { signal }) !== true) throw new AzureKeyVaultError("KV_POLICY_DENIED");
    if (signal.aborted) throw new AzureKeyVaultError("KV_TIMEOUT");
  }

  async #operation(operation, value, signal) {
    const token = await this.#tokenProvider({ resource: "https://vault.azure.net", signal });
    if (signal.aborted) throw new AzureKeyVaultError("KV_TIMEOUT");
    if (typeof token !== "string" || !/^[A-Za-z0-9._~-]{1,8192}$/u.test(token)) throw new AzureKeyVaultError("KV_TOKEN_INVALID");
    const response = await this.#transport({ url: `${this.#keyId}/${operation}?api-version=2025-07-01`, token, body: { alg: "RSA-OAEP-256", value }, signal });
    if (signal.aborted) throw new AzureKeyVaultError("KV_TIMEOUT");
    if (response?.kid !== this.#keyId || typeof response.value !== "string") throw new AzureKeyVaultError("KV_RESPONSE_BINDING_INVALID");
    return response;
  }

  async #bounded(work) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new AzureKeyVaultError("KV_TIMEOUT")); }, this.#timeoutMs);
    });
    try { return await Promise.race([work(controller.signal), deadline]); }
    catch (error) { throw error instanceof AzureKeyVaultError ? error : new AzureKeyVaultError("KV_OPERATION_FAILED"); }
    finally { clearTimeout(timer); controller.abort(); }
  }
}

function validatePackageId(value) {
  if (typeof value !== "string" || !/^pkg_[A-Za-z0-9_-]{16,80}$/u.test(value)) throw new AzureKeyVaultError("KV_PACKAGE_INVALID");
}
function decodeCanonical(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/u.test(value)) throw new AzureKeyVaultError("KV_ENCODING_INVALID");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) { decoded.fill(0); throw new AzureKeyVaultError("KV_ENCODING_INVALID"); }
  return decoded;
}

// No redirects, no proxy-derived destination, no insecure TLS switches.
export function keyVaultHttpsRequest({ url, token, body, signal }) {
  return new Promise((resolve, reject) => {
    if (typeof url !== "string" || !/^https:\/\/[a-z0-9][a-z0-9-]{1,22}[a-z0-9]\.vault\.azure\.net\/keys\/[A-Za-z0-9-]{1,127}\/[a-f0-9]{32}\/(wrapkey|unwrapkey)\?api-version=2025-07-01$/u.test(url)) { reject(new AzureKeyVaultError("KV_VERSIONED_KEY_REQUIRED")); return; }
    const payload = JSON.stringify(body);
    const request = https.request(url, { method: "POST", rejectUnauthorized: true, signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 16384) { request.destroy(new AzureKeyVaultError("KV_RESPONSE_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      response.on("error", () => reject(new AzureKeyVaultError("KV_RESPONSE_FAILED")));
      response.on("close", () => { for (const chunk of chunks) chunk.fill(0); });
      response.on("end", () => {
        const status = response.statusCode;
        if (status !== 200) { reject(new AzureKeyVaultError(status === 401 || status === 403 ? "KV_AUTH_DENIED" : status === 429 ? "KV_RATE_LIMITED" : status === 404 ? "KV_KEY_NOT_FOUND" : "KV_HTTP_FAILED")); return; }
        const buffer = Buffer.concat(chunks);
        try { resolve(JSON.parse(buffer.toString("utf8"))); }
        catch { reject(new AzureKeyVaultError("KV_RESPONSE_INVALID")); }
        finally { buffer.fill(0); for (const chunk of chunks) chunk.fill(0); }
      });
    });
    const deadline = setTimeout(() => request.destroy(new AzureKeyVaultError("KV_TIMEOUT")), 10000);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", (error) => {
      const code = error instanceof AzureKeyVaultError ? error.code : signal?.aborted ? "KV_TIMEOUT" : ["ENOTFOUND", "EAI_AGAIN"].includes(error.code) ? "KV_DNS_FAILURE" : error.code === "ECONNREFUSED" ? "KV_CONNECTION_REFUSED" : /CERT|TLS|SSL/u.test(error.code ?? "") ? "KV_TLS_FAILED" : "KV_CONNECTION_FAILED";
      reject(new AzureKeyVaultError(code));
    });
    request.end(payload);
  });
}
