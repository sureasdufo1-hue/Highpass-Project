import test from "node:test";
import assert from "node:assert/strict";
import { buildEncryptedImagingPackage, decryptAndVerifyImagingPackage, MobilePackageError } from "../src/mobile-package-crypto.js";

const base = {
  packageId: "pkg_abcdefghijklmnop",
  transferId: "trf_abcdefghijklmnop",
  consentId: "consent_demo",
  patientRef: "pat_abcdefghijklmnop",
  sourceInstitution: "inst_hospital_a",
  destinationInstitution: "inst_hospital_b",
  purpose: "TREATMENT",
  scope: { studyRefs: ["study-synthetic-1"], actions: ["VIEW", "MOBILE_STORE"] },
  objects: [{ studyRef: "study-synthetic-1", seriesRef: "series-synthetic-1", instanceRef: "instance-synthetic-1", data: Buffer.from("synthetic-dicom-payload") }],
  keyEnvelopeRefs: ["kenv_abcdefghijklmnop"],
  chunkSize: 65536,
  now: new Date("2026-09-12T00:00:00.000Z"),
  ttlMs: 600000,
};

test("package builder emits encrypted manifest and deterministic metadata without plaintext DICOM", () => {
  const result = buildEncryptedImagingPackage(base);
  assert.equal(result.envelope.manifestEncrypted, true);
  assert.equal(result.envelope.packageId, base.packageId);
  assert.equal(result.manifest.instanceCount, 1);
  assert.equal(result.manifest.state, "ENCRYPTED");
  assert.notEqual(result.envelope.manifestCiphertext, Buffer.from(JSON.stringify(result.manifest)).toString("base64url"));
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].ciphertext.includes(Buffer.from("synthetic-dicom-payload")), false);
});

test("AES-GCM package round trip verifies chunk and manifest hashes", () => {
  const packageData = buildEncryptedImagingPackage(base);
  const restored = decryptAndVerifyImagingPackage({ envelope: packageData.envelope, chunks: packageData.chunks, dek: packageData.dek, now: new Date("2026-09-12T00:01:00.000Z") });
  assert.equal(restored.manifest.manifestHash, packageData.manifest.manifestHash);
  assert.deepEqual(Buffer.concat(restored.plaintextChunks), Buffer.from("synthetic-dicom-payload"));
});

test("tampered chunk and authentication tag are denied", () => {
  const packageData = buildEncryptedImagingPackage(base);
  const tampered = { ...packageData.chunks[0], ciphertext: Buffer.from(packageData.chunks[0].ciphertext) };
  tampered.ciphertext[0] ^= 1;
  assert.throws(() => decryptAndVerifyImagingPackage({ envelope: packageData.envelope, chunks: [tampered], dek: packageData.dek, now: new Date("2026-09-12T00:01:00.000Z") }), (error) => error instanceof MobilePackageError && ["PACKAGE_CHUNK_TAMPERED", "CRYPTO_AUTH_FAILED"].includes(error.code));
});

test("expired package and invalid chunk size fail closed", () => {
  assert.throws(() => buildEncryptedImagingPackage({ ...base, chunkSize: 1024 }), (error) => error.code === "PACKAGE_CHUNK_SIZE_INVALID");
  const packageData = buildEncryptedImagingPackage(base);
  assert.throws(() => decryptAndVerifyImagingPackage({ envelope: packageData.envelope, chunks: packageData.chunks, dek: packageData.dek, now: new Date("2026-09-12T00:11:00.000Z") }), (error) => error.code === "PACKAGE_EXPIRED");
});

test("manifest remains scoped to opaque references and excludes patient identifiers", () => {
  const packageData = buildEncryptedImagingPackage(base);
  const serialized = JSON.stringify(packageData.envelope);
  assert.equal(serialized.includes("synthetic-dicom-payload"), false);
  assert.equal(serialized.includes("study-synthetic-1"), false);
  assert.equal(serialized.includes("patientRef"), false);
});

test("untrusted envelope cannot extend authenticated expiry or change recipient/key binding", () => {
  const packageData = buildEncryptedImagingPackage(base);
  const now = new Date("2026-09-12T00:01:00.000Z");
  for (const patch of [{ expiresAt: "2026-09-13T00:00:00.000Z" }, { destinationInstitutionRef: "inst_other" }, { createdAt: "2026-09-11T00:00:00.000Z" }, { packageSize: packageData.envelope.packageSize + 1 }, { keyEnvelopeRefs: ["kenv_foreignforeignforeign"] }]) {
    assert.throws(() => decryptAndVerifyImagingPackage({ envelope: { ...packageData.envelope, ...patch }, chunks: packageData.chunks, dek: packageData.dek, now }), error => error.code === "PACKAGE_ENVELOPE_BINDING_INVALID");
  }
  assert.throws(() => decryptAndVerifyImagingPackage({ envelope: { ...packageData.envelope, expiresAt: "invalid" }, chunks: packageData.chunks, dek: packageData.dek, now }), error => error.code === "PACKAGE_TTL_INVALID");
  packageData.dek.fill(0);
});

test("multi-chunk authentication failure returns no partial plaintext", () => {
  const packageData = buildEncryptedImagingPackage({ ...base, objects: [{ ...base.objects[0], data: Buffer.alloc(65537, 7) }] });
  const chunks = packageData.chunks.map(chunk => ({ ...chunk, tag: Buffer.from(chunk.tag) }));
  chunks[1].tag[0] ^= 1;
  assert.throws(() => decryptAndVerifyImagingPackage({ envelope: packageData.envelope, chunks, dek: packageData.dek, now: new Date("2026-09-12T00:01:00.000Z") }), error => error.code === "CRYPTO_AUTH_FAILED");
  packageData.dek.fill(0);
});

