import test from "node:test";
import assert from "node:assert/strict";
import { buildEncryptedImagingPackage, sha256Base64Url } from "../src/mobile-package-crypto.js";
import { MobilePackageReceiver, MobileReceiverError, ReceiverState } from "../src/mobile-receiver.js";

function fixture() {
  return buildEncryptedImagingPackage({
    packageId: "pkg_abcdefghijklmnop",
    transferId: "trf_abcdefghijklmnop",
    consentId: "consent_demo",
    patientRef: "pat_abcdefghijklmnop",
    sourceInstitution: "inst_hospital_a",
    destinationInstitution: "inst_hospital_b",
    purpose: "TREATMENT",
    scope: { studyRefs: ["study-synthetic-1"], actions: ["VIEW", "MOBILE_STORE"] },
    objects: [{ studyRef: "study-synthetic-1", seriesRef: "series-synthetic-1", instanceRef: "instance-synthetic-1", data: Buffer.alloc(70000, 7) }],
    keyEnvelopeRefs: ["kenv_abcdefghijklmnop"],
    chunkSize: 65536,
    now: new Date("2026-09-12T00:00:00.000Z"),
    ttlMs: 600000,
  });
}

test("receiver accepts out-of-order ciphertext chunks and verifies receipt", () => {
  const packageData = fixture();
  const receiver = new MobilePackageReceiver({ clock: () => new Date("2026-09-12T00:01:00.000Z") });
  receiver.startUpload({ uploadId: "upl_abcdefghijklmnop", packageId: packageData.envelope.packageId, envelope: packageData.envelope, expectedPackageHash: packageData.manifest.packageHash, handoffId: "hof_abcdefghijklmnop", receiverInstitutionRef: "inst_hospital_b" });
  for (const chunk of [...packageData.chunks].reverse()) receiver.receiveChunk("upl_abcdefghijklmnop", chunk);
  const duplicate = receiver.receiveChunk("upl_abcdefghijklmnop", packageData.chunks[0]);
  assert.equal(duplicate.status, "DUPLICATE");
  const receipt = receiver.completeUpload("upl_abcdefghijklmnop", { dek: packageData.dek });
  assert.equal(receipt.result, ReceiverState.VERIFIED);
  assert.equal(receipt.tagVerified, true);
  assert.equal(receipt.manifestHash, packageData.manifest.manifestHash);
  assert.match(receipt.integrityDigest, /^[A-Za-z0-9_-]{43}$/u);
});

test("missing, tampered, and conflicting chunks fail closed", () => {
  const packageData = fixture();
  const receiver = new MobilePackageReceiver();
  receiver.startUpload({ uploadId: "upl_abcdefghijklmnop", packageId: packageData.envelope.packageId, envelope: packageData.envelope, expectedPackageHash: packageData.manifest.packageHash, handoffId: "hof_abcdefghijklmnop", receiverInstitutionRef: "inst_hospital_b" });
  assert.throws(() => receiver.receiveChunk("upl_abcdefghijklmnop", { ...packageData.chunks[0], hash: sha256Base64Url(Buffer.from("tampered")) }), (error) => error.code === "CHUNK_HASH_MISMATCH");
  receiver.receiveChunk("upl_abcdefghijklmnop", packageData.chunks[0]);
  assert.throws(() => receiver.completeUpload("upl_abcdefghijklmnop"), (error) => error.code === "UPLOAD_INCOMPLETE");
  const conflict = { ...packageData.chunks[0], hash: packageData.chunks[0].hash, ciphertext: Buffer.from(packageData.chunks[0].ciphertext) };
  conflict.ciphertext[0] ^= 1;
  assert.throws(() => receiver.receiveChunk("upl_abcdefghijklmnop", conflict), (error) => error.code === "CHUNK_HASH_MISMATCH");
});

test("reassembly hash mismatch produces failed upload and no verified receipt", () => {
  const packageData = fixture();
  const receiver = new MobilePackageReceiver();
  receiver.startUpload({ uploadId: "upl_abcdefghijklmnop", packageId: packageData.envelope.packageId, envelope: packageData.envelope, expectedPackageHash: "A".repeat(43), handoffId: "hof_abcdefghijklmnop", receiverInstitutionRef: "inst_hospital_b" });
  for (const chunk of packageData.chunks) receiver.receiveChunk("upl_abcdefghijklmnop", chunk);
  assert.throws(() => receiver.completeUpload("upl_abcdefghijklmnop"), (error) => error.code === "PACKAGE_HASH_MISMATCH");
  assert.equal(receiver.getUpload("upl_abcdefghijklmnop").state, ReceiverState.FAILED);
  assert.equal(receiver.receipts().length, 0);
});

test("expired upload and invalid envelope are denied", () => {
  const packageData = fixture();
  const receiver = new MobilePackageReceiver({ clock: () => new Date("2026-09-12T00:11:00.000Z") });
  assert.throws(() => receiver.startUpload({ uploadId: "upl_abcdefghijklmnop", packageId: packageData.envelope.packageId, envelope: packageData.envelope, expectedPackageHash: packageData.manifest.packageHash, handoffId: "hof_abcdefghijklmnop", receiverInstitutionRef: "inst_hospital_b" }), (error) => error instanceof MobileReceiverError && error.code === "UPLOAD_EXPIRED");
});

