import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { Permission, ConsentStatus } from "../src/domain.js";
import { readArchivedDicomBuffer, getHospitalBArchivedStudy } from "../src/pacs-import-engine.js";
import { PacsCryptoError } from "../src/pacs-crypto-engine.js";

const STUDY_CT = "1.2.410.100.1.20260518.002"; // Chest CT

async function createService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-pacs-enc-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  const destDir = path.join(dir, "hospital-b-pacs");
  const service = new HipassService(store, () => new Date().toISOString(), { tokenSecret: "test-secret" });
  return { dir, destDir, store, service };
}

test("PACS At-Rest Encryption: AES-256-GCM Envelope Encryption and On-Demand Decryption", async () => {
  const { dir, destDir, service } = await createService();
  try {
    // 1. Consent with DOWNLOAD_ALLOWED
    const consent = await service.createConsent({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: Permission.DOWNLOAD_ALLOWED,
      validUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
      scopes: [{ studyInstanceUid: STUDY_CT }],
    });
    assert.equal(consent.status, ConsentStatus.ACTIVE);

    // 2. Execute PACS Import into Hospital B
    const importResult = await service.executePacsImport({
      consentId: consent.consentId,
      doctorId: "DOC-B-01",
      targetHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      destDir,
    });
    assert.equal(importResult.status, "COMPLETED");
    assert.equal(importResult.encryptedAtRest, true);
    assert.equal(importResult.cipherSuite, "AES-256-GCM");

    // 3. Inspect Disk Files (.dcm.enc)
    const archivedStudy = getHospitalBArchivedStudy(STUDY_CT, destDir);
    assert.ok(archivedStudy);
    assert.equal(archivedStudy.encryptedAtRest, true);
    assert.equal(archivedStudy.cipherSuite, "AES-256-GCM");
    assert.ok(archivedStudy.keyEnvelope);
    assert.equal(archivedStudy.keyEnvelope.algorithm, "AES-256-GCM");
    assert.match(archivedStudy.keyEnvelope.wrappedDek, /^[A-Za-z0-9_-]+$/);

    const inst = archivedStudy.instances[0];
    assert.ok(inst);
    assert.equal(inst.encrypted, true);
    assert.match(inst.storedPath, /\.dcm\.enc$/);

    const fullCipherPath = path.resolve(inst.storedPath);
    assert.ok(fs.existsSync(fullCipherPath));
    const cipherBytes = fs.readFileSync(fullCipherPath);
    assert.equal(cipherBytes.length, inst.cipherBytes);

    // Verify plaintext DICOM signature "DICM" is NOT present at byte 128 (At-Rest Confidentiality)
    assert.notEqual(cipherBytes.subarray(128, 132).toString("utf8"), "DICM");

    // 4. On-demand In-Memory Decryption (Zero Plaintext on Disk)
    const plainBuffer = readArchivedDicomBuffer({
      studyInstanceUid: STUDY_CT,
      seriesInstanceUid: inst.seriesInstanceUid,
      sopInstanceUid: inst.sopInstanceUid,
      baseDestDir: destDir,
    });

    assert.ok(Buffer.isBuffer(plainBuffer));
    assert.equal(plainBuffer.length, inst.plainBytes);
    const plainHash = crypto.createHash("sha256").update(plainBuffer).digest("hex");
    assert.equal(plainHash, inst.sha256);
    // Plaintext Part 10 starts with 128 bytes preamble + "DICM"
    assert.equal(plainBuffer.subarray(128, 132).toString("utf8"), "DICM");

    // 5. Fail-Closed Security: Tampering with Encrypted File Throws AEAD_TAG_MISMATCH
    const tamperedBytes = Buffer.from(cipherBytes);
    tamperedBytes[tamperedBytes.length - 1] ^= 0x01; // flip 1 bit
    fs.writeFileSync(fullCipherPath, tamperedBytes);

    assert.throws(
      () => {
        readArchivedDicomBuffer({
          studyInstanceUid: STUDY_CT,
          seriesInstanceUid: inst.seriesInstanceUid,
          sopInstanceUid: inst.sopInstanceUid,
          baseDestDir: destDir,
        });
      },
      (err) => {
        return err instanceof PacsCryptoError && err.code === "AEAD_TAG_MISMATCH";
      }
    );

    // Restore valid ciphertext
    fs.writeFileSync(fullCipherPath, cipherBytes);

    // 6. Fail-Closed Security: Wrong Master KEK Throws KEY_UNWRAP_FAILED
    const bogusKek = crypto.randomBytes(32);
    assert.throws(
      () => {
        readArchivedDicomBuffer({
          studyInstanceUid: STUDY_CT,
          seriesInstanceUid: inst.seriesInstanceUid,
          sopInstanceUid: inst.sopInstanceUid,
          baseDestDir: destDir,
          kek: bogusKek,
        });
      },
      (err) => {
        return err instanceof PacsCryptoError && err.code === "KEY_UNWRAP_FAILED";
      }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
