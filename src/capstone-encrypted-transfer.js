import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AzureKeyVaultDataPlane } from "./azure-key-vault-data-plane.js";
import { buildEncryptedImagingPackage, canonicalJson, decryptAndVerifyImagingPackage } from "./mobile-package-crypto.js";
import { parseDataPlaneRequest } from "./data-plane-authorization.js";

export const encryptedDicomType = "application/vnd.highpass.encrypted-dicom+json";
// Includes two live B checks, Entra and Vault latency. Receipt/package expiry
// stays at <=30s and is revalidated before any plaintext consumption.
export const capstoneKeyOperationTimeoutMs = 25000;
const limit = 8 * 1024 * 1024;
const opaque = prefix => prefix + randomUUID().replaceAll("-", "");
const hash = value => createHash("sha256").update(value).digest("hex");
const types = /^(?:application\/(?:dicom|octet-stream)|multipart\/related|image\/(?:png|jpeg))(?:\s*;[^\r\n]*)?$/iu;
const encode = chunk => ({ ...chunk, ciphertext: chunk.ciphertext.toString("base64url"), nonce: chunk.nonce.toString("base64url"), tag: chunk.tag.toString("base64url") });
function decode(value, max) {
  if (typeof value !== "string" || value.length > max * 2 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("ENCRYPTED_TRANSFER_INVALID");
  const buffer = Buffer.from(value, "base64url");
  if (buffer.length > max || buffer.toString("base64url") !== value) throw new Error("ENCRYPTED_TRANSFER_INVALID");
  return buffer;
}
function receiptContext(receipt) {
  if (typeof receipt !== "string" || receipt.length > 16384 || receipt.split(".").length !== 2) throw new Error("ENCRYPTED_TRANSFER_INVALID");
  // NOT authentication: the Control Plane validates the original MAC/authority
  // before either wrap or plaintext consumption. Used only for binding checks.
  return JSON.parse(Buffer.from(receipt.split(".")[0], "base64url").toString("utf8"));
}
function packageBinding(payload) {
  return { packageId: payload.envelope.packageId, keyId: payload.wrapped.keyId,
    recipientHospitalId: payload.envelope.destinationInstitutionRef,
    wrappedKeyHash: hash(decode(payload.wrapped.wrappedKey, 512)),
    ciphertextHash: hash(canonicalJson(payload.chunks)),
    manifestHash: hash(canonicalJson({ envelope: payload.envelope, contentType: payload.contentType })) };
}

/** Required hospital-only crypto transport. control() uses that hospital's
 * dedicated service credential and strict bounded TLS. No boolean fallbacks.
 */
export function createCapstoneImageEncryptor({ keyId, tokenProvider, control, keyTransport, now = () => new Date() }) {
  return { async seal({ body, contentType, route, grant }) {
    if (!Buffer.isBuffer(body) || !body.length || body.length > limit || !types.test(contentType) || !route.sopInstanceUid) throw new Error("ENCRYPTED_TRANSFER_INVALID");
    const context = receiptContext(grant.receipt);
    const packageId = opaque("pkg_");
    const client = new AzureKeyVaultDataPlane({ keyId, tokenProvider, timeoutMs: capstoneKeyOperationTimeoutMs, ...(keyTransport ? { transport: keyTransport } : {}),
      authorizeOperation: async binding => {
        if (binding.operation !== "wrapkey" || binding.packageId !== packageId) return false;
        const result = await control("/gateway/data-plane/package/wrap-authorize", { receipt: grant.receipt, packageId, keyId });
        return result.status === 200 && result.body.authorized === true;
      } });
    const dek = randomBytes(32);
    try {
      const current = now();
      const ttl = Math.min(context.deadline, Date.parse(grant.expiresAt)) - current.getTime();
      if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 30000) throw new Error("ENCRYPTED_TRANSFER_EXPIRED");
      const encrypted = buildEncryptedImagingPackage({ packageId, transferId: opaque("trf_"), consentId: context.consentId,
        patientRef: opaque("pat_"), sourceInstitution: context.sourceHospitalId, destinationInstitution: context.targetHospitalId,
        purpose: context.purpose, scope: { studyRefs: [grant.studyInstanceUid], actions: [route.requestedAction] },
        objects: [{ studyRef: grant.studyInstanceUid, seriesRef: route.seriesInstanceUid, instanceRef: route.sopInstanceUid, data: body }],
        keyEnvelopeRefs: [opaque("kenv_")], dek, now: current, ttlMs: ttl });
      encrypted.dek.fill(0);
      const wrapped = await client.wrapDek({ packageId, dek });
      const payload = { version: 1, receipt: grant.receipt, contentType, wrapped, envelope: encrypted.envelope, chunks: encrypted.chunks.map(encode) };
      const prepared = await control("/gateway/data-plane/package/prepare", { receipt: grant.receipt, packageBinding: packageBinding(payload) });
      if (prepared.status !== 200 || typeof prepared.body.releaseId !== "string") throw new Error("ENCRYPTED_TRANSFER_POLICY_DENIED");
      return { contentType: encryptedDicomType, body: Buffer.from(JSON.stringify({ ...payload, releaseId: prepared.body.releaseId })) };
    } finally { dek.fill(0); }
  } };
}

export function createCapstoneImageDecryptor({ keyId, tokenProvider, control, publicBaseUrl, recipientHospitalId, keyTransport, now = () => new Date() }) {
  return { async open(result, requestPath) {
    if (result.contentType !== encryptedDicomType || !Buffer.isBuffer(result.body) || result.body.length > 12 * 1024 * 1024) throw new Error("ENCRYPTED_TRANSFER_REQUIRED");
    const payload = JSON.parse(result.body.toString("utf8"));
    if (Object.keys(payload).sort().join() !== ["version", "receipt", "contentType", "wrapped", "envelope", "chunks", "releaseId"].sort().join()
      || payload.version !== 1 || !types.test(payload.contentType) || payload.contentType.length > 1024
      || !Array.isArray(payload.chunks) || !payload.chunks.length || payload.chunks.length > 128
      || payload.wrapped?.keyId !== keyId || payload.envelope?.destinationInstitutionRef !== recipientHospitalId) throw new Error("ENCRYPTED_TRANSFER_INVALID");
    const binding = packageBinding(payload);
    const context = receiptContext(payload.receipt);
    const route = parseDataPlaneRequest({ method: "GET", path: requestPath }, publicBaseUrl);
    if (context.path !== requestPath || context.targetHospitalId !== recipientHospitalId || !route.sopInstanceUid) throw new Error("ENCRYPTED_TRANSFER_SCOPE_MISMATCH");
    const chunks = payload.chunks.map(chunk => ({ ...chunk, ciphertext: decode(chunk.ciphertext, limit), nonce: decode(chunk.nonce, 12), tag: decode(chunk.tag, 16) }));
    if (chunks.reduce((total, chunk) => total + chunk.ciphertext.length, 0) > limit) throw new Error("ENCRYPTED_TRANSFER_INVALID");
    let phase = 0, plaintext;
    const client = new AzureKeyVaultDataPlane({ keyId, tokenProvider, timeoutMs: capstoneKeyOperationTimeoutMs, ...(keyTransport ? { transport: keyTransport } : {}),
      authorizeOperation: async operation => {
        if (operation.operation !== "unwrapkey" || operation.packageId !== binding.packageId
          || Buffer.from(operation.wrappedKeyHash, "base64url").toString("hex") !== binding.wrappedKeyHash) return false;
        const decision = await control("/gateway/data-plane/package/authorize", { releaseId: payload.releaseId,
          receipt: payload.receipt, packageBinding: binding, phase: phase++ === 0 ? "BEFORE_UNWRAP" : "AFTER_UNWRAP" });
        return decision.status === 200 && decision.body.authorized === true;
      } });
    try {
      await client.consumeUnwrappedDek({ packageId: binding.packageId, envelope: payload.wrapped, consume: dek => {
        const verified = decryptAndVerifyImagingPackage({ envelope: payload.envelope, chunks, dek, now: now() });
        try {
          const manifest = verified.manifest;
          if (manifest.consentId !== context.consentId || manifest.sourceInstitution !== context.sourceHospitalId
            || manifest.destinationInstitution !== recipientHospitalId || manifest.purpose !== context.purpose
            || manifest.objects.length !== 1 || manifest.objects[0].studyRef !== route.studyInstanceUid
            || manifest.objects[0].seriesRef !== route.seriesInstanceUid || manifest.objects[0].instanceRef !== route.sopInstanceUid
            || canonicalJson(manifest.scope.actions) !== canonicalJson([route.requestedAction])) throw new Error("ENCRYPTED_TRANSFER_SCOPE_MISMATCH");
          plaintext = Buffer.concat(verified.plaintextChunks);
          if (createHash("sha256").update(plaintext).digest("base64url") !== manifest.objects[0].objectHash
            || manifest.objects[0].chunkStart !== 0 || manifest.objects[0].chunkEnd !== chunks.length - 1) throw new Error("ENCRYPTED_TRANSFER_INTEGRITY_FAILED");
        } finally { for (const chunk of verified.plaintextChunks) chunk.fill(0); }
      } });
      return { contentType: payload.contentType, body: plaintext };
    } catch (error) { plaintext?.fill(0); throw error; }
  } };
}
