import assert from "node:assert/strict";
import test from "node:test";
import { buildEncryptedImagingPackage } from "../src/mobile-package-crypto.js";
import { MobileTransientDecryptor, TransientDecryptError } from "../src/mobile-transient-decrypt.js";

const now = new Date("2026-09-12T00:00:00.000Z");

function makePackage({ ttlMs = 10 * 60 * 1000 } = {}) {
  return buildEncryptedImagingPackage({
    packageId: "pkg_synthetic_flow_001",
    transferId: "trf_synthetic_flow_001",
    consentId: "con_synthetic_flow_001",
    patientRef: "pat_synthetic_flow_001",
    sourceInstitution: "inst_hospital_a",
    destinationInstitution: "inst_hospital_b",
    purpose: "TREATMENT",
    scope: { studyRefs: ["study_synthetic_flow_001"], seriesRefs: ["series_synthetic_flow_001"], actions: ["VIEW"] },
    objects: [{ studyRef: "study_synthetic_flow_001", seriesRef: "series_synthetic_flow_001", instanceRef: "instance_synthetic_flow_001", data: Buffer.from("synthetic CT payload") }],
    keyEnvelopeRefs: ["kenv_synthetic_flow_001"],
    now,
    ttlMs,
  });
}

function authorization(packageId, expiresAt = "2026-09-12T00:02:00.000Z") {
  return { decision: "ALLOW", authorizationId: "kra_synthetic_flow_001", packageId, envelopeId: "env_synthetic_flow_001", expiresAt };
}

function decryptor() {
  return new MobileTransientDecryptor({ clock: () => now });
}

test("decrypts only a VERIFIED package and zeroizes DEK and plaintext after consumption", async () => {
  const built = makePackage();
  const key = built.dek;
  const consumed = [];
  const result = await decryptor().decryptVerifiedPackage({
    packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" },
    envelope: built.envelope,
    chunks: built.chunks,
    authorization: authorization(built.envelope.packageId),
    resolveDek: async () => key,
    onPlaintextChunk: (plaintext, context) => { consumed.push({ bytes: Buffer.from(plaintext), context }); },
  });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.chunkCount, 1);
  assert.equal(result.bytesConsumed, "synthetic CT payload".length);
  assert.equal(consumed[0].bytes.toString(), "synthetic CT payload");
  assert.equal(key.equals(Buffer.alloc(key.length)), true);
});

test("denies non-VERIFIED or expired packages before asking the KMS resolver", async () => {
  const built = makePackage();
  let resolverCalls = 0;
  await assert.rejects(() => new MobileTransientDecryptor({ clock: () => new Date("2026-09-12T00:00:00.010Z") }).decryptVerifiedPackage({
    packageRecord: { packageId: built.envelope.packageId, status: "RECEIVED" },
    envelope: built.envelope,
    chunks: built.chunks,
    authorization: authorization(built.envelope.packageId),
    resolveDek: async () => { resolverCalls += 1; return built.dek; },
    onPlaintextChunk: () => {},
  }), (error) => error instanceof TransientDecryptError && error.code === "PACKAGE_NOT_VERIFIED");
  assert.equal(resolverCalls, 0);

  const expired = makePackage({ ttlMs: 1 });
  await assert.rejects(() => new MobileTransientDecryptor({ clock: () => new Date("2026-09-12T00:00:00.010Z") }).decryptVerifiedPackage({
    packageRecord: { packageId: expired.envelope.packageId, status: "VERIFIED" },
    envelope: expired.envelope,
    chunks: expired.chunks,
    authorization: authorization(expired.envelope.packageId),
    resolveDek: async () => { resolverCalls += 1; return expired.dek; },
    onPlaintextChunk: () => {},
  }), (error) => error.code === "PACKAGE_EXPIRED");
  assert.equal(resolverCalls, 0);
});

test("denies missing or mismatched key release authorization", async () => {
  const built = makePackage();
  await assert.rejects(() => decryptor().decryptVerifiedPackage({ packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" }, envelope: built.envelope, chunks: built.chunks, authorization: { decision: "DENY", packageId: built.envelope.packageId, authorizationId: "kra_synthetic_flow_002", envelopeId: "env_synthetic_flow_001" }, resolveDek: async () => built.dek, onPlaintextChunk: () => {} }), (error) => { assert.equal(error.code, "KEY_RELEASE_REQUIRED"); return true; });
  await assert.rejects(() => decryptor().decryptVerifiedPackage({ packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" }, envelope: built.envelope, chunks: built.chunks, authorization: authorization("pkg_other_flow_001"), resolveDek: async () => built.dek, onPlaintextChunk: () => {} }), (error) => { assert.equal(error.code, "KEY_RELEASE_PACKAGE_MISMATCH"); return true; });
});

test("zeroizes a transient key when KMS returns an invalid key or decryption fails", async () => {
  const built = makePackage();
  await assert.rejects(() => decryptor().decryptVerifiedPackage({ packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" }, envelope: built.envelope, chunks: built.chunks, authorization: authorization(built.envelope.packageId), resolveDek: async () => Buffer.alloc(8), onPlaintextChunk: () => {} }), (error) => error.code === "DEK_INVALID");

  const key = Buffer.from(built.dek);
  const tampered = built.chunks.map((chunk) => ({ ...chunk, ciphertext: Buffer.from(chunk.ciphertext) }));
  tampered[0].ciphertext[0] ^= 1;
  await assert.rejects(() => decryptor().decryptVerifiedPackage({ packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" }, envelope: built.envelope, chunks: tampered, authorization: authorization(built.envelope.packageId, "2026-09-12T00:02:00.000Z"), resolveDek: async () => key, onPlaintextChunk: () => {} }), (error) => error.code === "PACKAGE_CHUNK_TAMPERED");
  assert.equal(key.equals(Buffer.alloc(key.length)), true);
});

test("does not expose plaintext in the result or audit events", async () => {
  const built = makePackage();
  const value = decryptor();
  await value.decryptVerifiedPackage({ packageRecord: { packageId: built.envelope.packageId, status: "VERIFIED" }, envelope: built.envelope, chunks: built.chunks, authorization: authorization(built.envelope.packageId), resolveDek: async () => built.dek, onPlaintextChunk: () => {} });
  const serialized = JSON.stringify(value.auditEvents());
  assert.doesNotMatch(serialized, /synthetic CT payload|plaintext|dek|private|secret/iu);
});
