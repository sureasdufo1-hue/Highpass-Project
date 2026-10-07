import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import { HipassService, ServiceValidationError } from "../src/services.js";
import {
  AccessDecision,
  AccessDenyReason,
  AuditAction,
  ConsentStatus,
  Permission,
  QuarantineStatus,
  RequestedAction,
} from "../src/domain.js";

const STUDY_CT = "1.2.410.100.1.20260518.002"; // Chest CT

async function createTestService(options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-quarantine-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();

  let currentTime = new Date("2026-06-25T10:00:00.000Z");
  const clock = () => currentTime.toISOString();
  const advanceMinutes = (mins) => {
    currentTime = new Date(currentTime.getTime() + mins * 60_000);
  };

  const service = new HipassService(store, clock, {
    tokenSecret: "test-secret-quarantine-engine",
    anomalyRules: {
      repeatedFailureThreshold: 3,
      repeatedFailureWindowMinutes: 10,
      expiredTokenThreshold: 2,
      expiredTokenWindowMinutes: 10,
      quarantineDurationMinutes: 15,
      ...options.anomalyRules,
    },
    ...options,
  });

  return { dir, store, service, clock, advanceMinutes };
}

test("Active Threat Mitigation: Threshold breach triggers automatic quarantine of offending actor", async () => {
  const { dir, store, service } = await createTestService();
  try {
    const offendingDoctorId = "DOC-B-01";

    // Baseline: Actor is NOT quarantined
    assert.equal(service.isActorQuarantined(offendingDoctorId).quarantined, false);
    assert.equal(service.listQuarantines().length, 0);

    // Simulate 3 consecutive access failures (e.g. invalid consent access requests)
    for (let i = 0; i < 3; i++) {
      await service.evaluateDicomAccessRequest({
        consentId: "NON_EXISTENT_CONSENT",
        doctorId: offendingDoctorId,
        requestingHospitalId: "HOSP-B",
        studyInstanceUid: STUDY_CT,
        purpose: "TREATMENT",
        requestedAction: RequestedAction.VIEW,
      });
    }

    // Verify: Anomaly detected and actor auto-quarantined
    const alertLogs = service.listAnomalyAlerts();
    assert.ok(alertLogs.some((l) => l.action === AuditAction.REPEATED_ACCESS_FAILURE));

    const check = service.isActorQuarantined(offendingDoctorId);
    assert.equal(check.quarantined, true);
    assert.equal(check.record.actorId, offendingDoctorId);
    assert.equal(check.record.status, QuarantineStatus.QUARANTINED);
    assert.equal(check.record.reason, "REPEATED_ACCESS_FAILURE");
    assert.equal(check.record.durationMinutes, 15);

    // Verify audit record for quarantine
    const quarantineAudit = store.get("auditLogs").find((l) => l.action === AuditAction.ACTOR_QUARANTINED);
    assert.ok(quarantineAudit);
    assert.equal(quarantineAudit.result, "SUCCESS");
    assert.equal(quarantineAudit.reason, "REPEATED_ACCESS_FAILURE");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Fail-Closed Gate: Quarantined actor is blocked across token issue, checkAccess, ticket redeem, and PACS import", async () => {
  const { dir, service, store } = await createTestService();
  try {
    const doctorId = "DOC-B-01";

    // 1. Create a legitimate active consent
    const consent = await service.createConsent({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: Permission.DOWNLOAD_ALLOWED,
      validUntil: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      scopes: [{ studyInstanceUid: STUDY_CT }],
    });
    assert.equal(consent.status, ConsentStatus.ACTIVE);

    // 2. Issue a token BEFORE quarantine
    const tokenResult = await service.requestDicomAccessToken({
      consentId: consent.consentId,
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(tokenResult.decision, AccessDecision.ALLOWED);
    const existingRawToken = tokenResult.accessToken;

    // 3. Manually quarantine the doctor
    await service.quarantineActor({
      actorId: doctorId,
      reason: "MANUAL_SECURITY_INCIDENT",
      durationMinutes: 15,
    });

    assert.equal(service.isActorQuarantined(doctorId).quarantined, true);

    // Gate A: requestDicomAccessToken MUST be DENIED with ACTOR_QUARANTINED
    const blockedTokenResult = await service.requestDicomAccessToken({
      consentId: consent.consentId,
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(blockedTokenResult.decision, AccessDecision.DENIED);
    assert.equal(blockedTokenResult.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);

    // Gate B: checkAccess MUST return allowed: false with ACTOR_QUARANTINED
    const accessCheck = service.checkAccess({
      doctorId,
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      permission: Permission.VIEW_ONLY,
    });
    assert.equal(accessCheck.allowed, false);
    assert.equal(accessCheck.reason, AccessDenyReason.ACTOR_QUARANTINED);

    // Gate C: verifyDicomAccessToken using existing active token MUST be rejected
    const verifyResult = await service.verifyDicomAccessToken(existingRawToken, {
      studyInstanceUid: STUDY_CT,
      targetHospitalId: "HOSP-B",
    });
    assert.equal(verifyResult.active, false);
    assert.equal(verifyResult.reason, AccessDenyReason.ACTOR_QUARANTINED);

    // Gate D: introspectToken MUST return active: false with ACTOR_QUARANTINED
    const introspect = service.introspectToken(existingRawToken, STUDY_CT);
    assert.equal(introspect.active, false);
    assert.equal(introspect.reason, AccessDenyReason.ACTOR_QUARANTINED);

    // Gate E: executePacsImport MUST throw ServiceValidationError(ACTOR_QUARANTINED, 403)
    await assert.rejects(
      async () => {
        await service.executePacsImport({
          consentId: consent.consentId,
          doctorId,
          targetHospitalId: "HOSP-B",
          studyInstanceUid: STUDY_CT,
        });
      },
      (err) => {
        assert.ok(err instanceof ServiceValidationError);
        assert.equal(err.code, AccessDenyReason.ACTOR_QUARANTINED);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Gate F: redeemTransferTicket MUST return AccessDenyReason.ACTOR_QUARANTINED
    const handoff = await service.issueConsentHandoffTicket(consent.consentId, "P-1001");
    const nonce = handoff.qr.payload.split("/").pop();
    const redeemResult = await service.redeemTransferTicket(nonce, {
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(redeemResult.decision, AccessDecision.DENIED);
    assert.equal(redeemResult.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("IP-Level Quarantine: Quarantined IP address fails closed regardless of actor identifier", async () => {
  const { dir, service } = await createTestService();
  try {
    const maliciousIp = "198.51.100.42";

    // Quarantine the IP directly
    await service.quarantineActor({
      actorId: `IP:${maliciousIp}`,
      ipAddress: maliciousIp,
      reason: "UNUSUAL_GEO_BRUTE_FORCE",
      durationMinutes: 10,
    });

    const ipCheck = service.isActorQuarantined("ANY_DOCTOR", maliciousIp);
    assert.equal(ipCheck.quarantined, true);
    assert.equal(ipCheck.record.ipAddress, maliciousIp);

    // Token evaluation from this IP must fail closed
    const tokenAttempt = await service.evaluateDicomAccessRequest(
      {
        consentId: "CONSENT-DEMO-ACTIVE",
        doctorId: "DOC-B-01",
        requestingHospitalId: "HOSP-B",
        studyInstanceUid: "1.2.410.100.1.20260620.001",
        purpose: "TREATMENT",
        requestedAction: RequestedAction.VIEW,
      },
      { ipAddress: maliciousIp }
    );
    assert.equal(tokenAttempt.decision, AccessDecision.DENIED);
    assert.equal(tokenAttempt.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);

    // Same request from a clean IP succeeds
    const cleanAttempt = await service.evaluateDicomAccessRequest(
      {
        consentId: "CONSENT-DEMO-ACTIVE",
        doctorId: "DOC-B-01",
        requestingHospitalId: "HOSP-B",
        studyInstanceUid: "1.2.410.100.1.20260620.001",
        purpose: "TREATMENT",
        requestedAction: RequestedAction.VIEW,
      },
      { ipAddress: "10.0.0.1" }
    );
    assert.equal(cleanAttempt.decision, AccessDecision.ALLOWED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Automatic Expiration & Manual Admin Release Lifecycle", async () => {
  const { dir, service, advanceMinutes } = await createTestService();
  try {
    const doctorId = "DOC-C-01";

    // 1. Quarantine actor for 10 minutes
    const record = await service.quarantineActor({
      actorId: doctorId,
      reason: "TEMPORARY_TEST_BAN",
      durationMinutes: 10,
    });
    assert.equal(record.status, QuarantineStatus.QUARANTINED);
    assert.equal(service.listQuarantines().length, 1);

    // 2. Advance clock by 5 minutes: Still quarantined
    advanceMinutes(5);
    assert.equal(service.isActorQuarantined(doctorId).quarantined, true);

    // 3. Admin manually releases quarantine before expiry
    const released = await service.releaseQuarantine(record.quarantineId, "SEC-ADMIN-01", "INVESTIGATION_CLEARED");
    assert.equal(released.status, QuarantineStatus.RELEASED);
    assert.equal(released.releasedBy, "SEC-ADMIN-01");
    assert.equal(released.releaseReason, "INVESTIGATION_CLEARED");

    // Actor is immediately unblocked
    assert.equal(service.isActorQuarantined(doctorId).quarantined, false);
    assert.equal(service.listQuarantines(false).length, 0); // No active quarantines
    assert.equal(service.listQuarantines(true).length, 1); // 1 historical record

    // 4. Now quarantine again for 10 minutes, and test automatic expiration
    const record2 = await service.quarantineActor({
      actorId: doctorId,
      reason: "SECOND_OFFENSE",
      durationMinutes: 10,
    });
    assert.equal(service.isActorQuarantined(doctorId).quarantined, true);

    // Advance clock past expiration (11 minutes)
    advanceMinutes(11);
    const expiredCheck = service.isActorQuarantined(doctorId);
    assert.equal(expiredCheck.quarantined, false);
    assert.equal(record2.status, QuarantineStatus.EXPIRED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Security Admin REST API: /api/security/quarantines endpoints enforce RBAC and life-cycle", async () => {
  const baseUrl = "http://localhost:3000";

  // 1. Unauthorized attempt (patient cannot read admin quarantines)
  const unauthRes = await fetch(`${baseUrl}/api/security/quarantines`, {
    headers: { "x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001" },
  });
  assert.equal(unauthRes.status, 403);

  // 2. Admin GET active quarantines
  const adminHeaders = {
    "x-hipass-role": "SECURITY_ADMIN",
    "x-hipass-user-id": "SEC-ADMIN-99",
    "content-type": "application/json",
  };
  const listRes = await fetch(`${baseUrl}/api/security/quarantines?all=true`, { headers: adminHeaders });
  assert.equal(listRes.status, 200);
  const initialList = await listRes.json();
  assert.ok(Array.isArray(initialList));

  // 3. Admin POST to create quarantine
  const testTargetId = `TEST-THREAT-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/security/quarantines`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      actorId: testTargetId,
      actorType: "DOCTOR",
      reason: "INTEGRATION_TEST_QUARANTINE",
      durationMinutes: 20,
    }),
  });
  assert.equal(createRes.status, 201);
  const createdRecord = await createRes.json();
  assert.equal(createdRecord.actorId, testTargetId);
  assert.equal(createdRecord.status, "QUARANTINED");
  assert.ok(createdRecord.quarantineId);

  // 4. Verify presence in list
  const listRes2 = await fetch(`${baseUrl}/api/security/quarantines`, { headers: adminHeaders });
  const activeList = await listRes2.json();
  assert.ok(activeList.some((q) => q.quarantineId === createdRecord.quarantineId));

  // 5. Admin POST release
  const releaseRes = await fetch(`${baseUrl}/api/security/quarantines/${encodeURIComponent(createdRecord.quarantineId)}/release`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ reason: "CLEARED_BY_TEST" }),
  });
  assert.equal(releaseRes.status, 200);
  const releasedRecord = await releaseRes.json();
  assert.equal(releasedRecord.status, "RELEASED");
  assert.equal(releasedRecord.releaseReason, "CLEARED_BY_TEST");
});

