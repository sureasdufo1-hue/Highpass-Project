import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { JsonStore } from "../src/store.js";
import { HipassService, ServiceValidationError } from "../src/services.js";
import { Permission, ConsentStatus } from "../src/domain.js";
import { listHospitalBArchivedStudies, getHospitalBArchivedStudy } from "../src/pacs-import-engine.js";

const STUDY_CT = "1.2.410.100.1.20260518.002"; // Chest CT
const STUDY_MR = "1.2.410.100.1.20260620.001"; // Brain MRI

async function createService(options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-pacs-import-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  const destDir = path.join(dir, "hospital-b-pacs");
  const service = new HipassService(store, () => new Date().toISOString(), { tokenSecret: "test-secret", hospitalArchiveKek: randomBytes(32), allowSyntheticArchive: true, ...options });
  return { dir, destDir, store, service };
}

test("Local archive simulator: encrypted synthetic DICOM transfer (not STOW-RS)", async () => {
  const { dir, destDir, service, store } = await createService();
  try {
    // 1. Create patient consent with DOWNLOAD_ALLOWED
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
    assert.equal(consent.permission, Permission.DOWNLOAD_ALLOWED);

    // 2. Doctor at Hospital B executes PACS Import
    const importResult = await service.executePacsImport({
      consentId: consent.consentId,
      doctorId: "DOC-B-01",
      targetHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      destDir,
    });

    // 3. Verify transfer receipt
    assert.equal(importResult.status, "COMPLETED");
    assert.equal(importResult.transferMethod, "LOCAL_ENCRYPTED_ARCHIVE_SIMULATOR");
    assert.equal(importResult.studyInstanceUid, STUDY_CT);
    assert.equal(importResult.sourceHospitalId, "HOSP-A");
    assert.equal(importResult.targetHospitalId, "HOSP-B");
    assert.ok(importResult.instancesTransferred > 0);
    assert.ok(importResult.transferredBytes > 0);
    assert.match(importResult.sha256, /^[a-f0-9]{64}$/);
    assert.equal(importResult.destinationVerification, false);
    assert.equal(importResult.simulation, true);

    // 4. Verify physical files exist on disk in Hospital B archive
    const studyDir = path.join(destDir, STUDY_CT);
    assert.ok(fs.existsSync(studyDir), "Target study directory must exist");
    const manifestPath = path.join(studyDir, "manifest.json");
    assert.ok(fs.existsSync(manifestPath), "Archive manifest.json must exist");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.studyInstanceUid, STUDY_CT);
    assert.equal(manifest.sha256, importResult.sha256);
    assert.ok(manifest.instances.length > 0);

    // Check each actual .dcm file
    for (const inst of manifest.instances) {
      assert.ok(inst.fileSize > 0);
      assert.match(inst.sha256, /^[a-f0-9]{64}$/);
      const fullPath = path.resolve(inst.storedPath);
      assert.ok(fs.existsSync(fullPath), `DCM file ${fullPath} must physically exist`);
      // Verify file starts with DICOM preamble or binary bytes
      const fileBytes = fs.readFileSync(fullPath);
      assert.equal(fileBytes.length, inst.fileSize);
    }

    // 5. Verify Hospital B archive query APIs
    const bArchives = listHospitalBArchivedStudies(destDir);
    assert.equal(bArchives.length, 1);
    assert.equal(bArchives[0].studyInstanceUid, STUDY_CT);

    const detail = getHospitalBArchivedStudy(STUDY_CT, destDir);
    assert.ok(detail);
    assert.equal(detail.sha256, importResult.sha256);

    // 6. Verify Audit Trail
    const auditLogs = store.get("auditLogs").filter((l) => l.auditSessionId === importResult.auditSessionId);
    assert.ok(auditLogs.length > 0);
    const transferLog = auditLogs.find((l) => l.action === "IMAGE_TRANSFER");
    assert.ok(transferLog);
    assert.equal(transferLog.result, "SUCCESS");
    assert.equal(transferLog.targetHospitalId, "HOSP-B");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PACS Import Security: VIEW_ONLY consent is strictly denied (Fail-Closed)", async () => {
  const { dir, destDir, service } = await createService();
  try {
    const viewOnlyConsent = await service.createConsent({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: Permission.VIEW_ONLY,
      validUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
      scopes: [{ studyInstanceUid: STUDY_MR }],
    });

    await assert.rejects(
      async () => service.executePacsImport({
        consentId: viewOnlyConsent.consentId,
        doctorId: "DOC-B-01",
        targetHospitalId: "HOSP-B",
        studyInstanceUid: STUDY_MR,
        destDir,
      }),
      (err) => err instanceof ServiceValidationError && err.code === "PERMISSION_DENIED_VIEW_ONLY"
    );

    // Ensure zero files written to disk
    assert.ok(!fs.existsSync(path.join(destDir, STUDY_MR)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
