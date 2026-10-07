import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { createSeedData } from "../src/seed.js";
import { AuditAction, Permission } from "../src/domain.js";

async function setupTestEnvironment() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-patient-self-view-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  store.data = createSeedData();
  await store.save();

  const service = new HipassService(store, () => new Date().toISOString(), {
    tokenSecret: "test-token-secret-for-patient-view",
  });

  return { store, service, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("Patient Self-View: P-1001 records self-view audit and returns safe viewer policy", async () => {
  const { store, service, cleanup } = await setupTestEnvironment();
  try {
    const studies = service.listStudies("P-1001", { includeSeries: true });
    assert.ok(studies.length > 0, "Patient P-1001 must have imaging studies");
    const targetStudy = studies[0];

    const result = await service.recordPatientSelfView("P-1001", targetStudy.studyInstanceUid, {
      ipAddress: "192.168.1.100",
      userAgent: "HiPass-PatientMobile/3.0.0",
    });

    assert.equal(result.status, "ALLOWED");
    assert.equal(result.study.studyInstanceUid, targetStudy.studyInstanceUid);
    assert.equal(result.viewerPolicy.permission, Permission.VIEW_ONLY);
    assert.match(result.viewerPolicy.watermark, /P-1001/);

    // Verify audit log
    const auditLogs = store.get("auditLogs");
    const selfViewLog = auditLogs.find(
      (log) => log.action === AuditAction.STUDY_VIEW && log.actorId === "P-1001" && log.reason === "PATIENT_SELF_VIEW"
    );
    assert.ok(selfViewLog, "Audit log must contain PATIENT_SELF_VIEW");
    assert.equal(selfViewLog.studyInstanceUid, targetStudy.studyInstanceUid);
    assert.equal(selfViewLog.result, "SUCCESS");
    assert.equal(selfViewLog.actorType, "PATIENT");
  } finally {
    await cleanup();
  }
});

test("Patient Self-View: Rejects request for non-existent study with STUDY_NOT_FOUND", async () => {
  const { service, cleanup } = await setupTestEnvironment();
  try {
    await assert.rejects(
      async () => {
        await service.recordPatientSelfView("P-1001", "1.2.999.NON_EXISTENT_STUDY_UID");
      },
      (err) => err.code === "STUDY_NOT_FOUND"
    );
  } finally {
    await cleanup();
  }
});
