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
  QuarantineScope,
  QuarantineStatus,
  RequestedAction,
} from "../src/domain.js";

const STUDY_CT = "1.2.410.100.1.20260518.002"; // Chest CT
const HOSP_B_NAT_IP = "203.250.20.15"; // Falls in HOSP-B CIDR: 203.250.20.0/24
const EXTERNAL_UNTRUSTED_IP = "198.51.100.77"; // Unregistered external IP

async function createResilienceTestService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-resilience-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();

  let currentTime = new Date("2026-06-25T14:00:00.000Z");
  const clock = () => currentTime.toISOString();
  const advanceMinutes = (mins) => {
    currentTime = new Date(currentTime.getTime() + mins * 60_000);
  };

  const service = new HipassService(store, clock, {
    tokenSecret: "test-resilience-secret",
    anomalyRules: {
      repeatedFailureThreshold: 3,
      repeatedFailureWindowMinutes: 10,
      quarantineDurationMinutes: 15,
    },
  });

  return { dir, store, service, clock, advanceMinutes };
}

test("Hospital Egress Protection: NAT IP is NOT blocked; only offending actor is quarantined (ACTOR_ONLY)", async () => {
  const { dir, store, service } = await createResilienceTestService();
  try {
    const offendingDoctorId = "DOC-B-01";
    const colleagueDoctorId = "DOC-B-02";

    // 1. Setup legitimate consent for Hospital B
    const consent = await service.createConsent({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: Permission.VIEW_ONLY,
      validUntil: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      scopes: [{ studyInstanceUid: STUDY_CT }],
    });
    assert.equal(consent.status, ConsentStatus.ACTIVE);

    // 2. Offending doctor generates 3 consecutive failures from Hospital B NAT IP
    for (let i = 0; i < 3; i++) {
      await service.evaluateDicomAccessRequest(
        {
          consentId: "INVALID_CONSENT",
          doctorId: offendingDoctorId,
          requestingHospitalId: "HOSP-B",
          studyInstanceUid: STUDY_CT,
          purpose: "TREATMENT",
          requestedAction: RequestedAction.VIEW,
        },
        { ipAddress: HOSP_B_NAT_IP }
      );
    }

    // 3. Verify: Offending doctor is quarantined with ACTOR_ONLY scope
    const doctorCheck = service.isActorQuarantined(offendingDoctorId, HOSP_B_NAT_IP);
    assert.equal(doctorCheck.quarantined, true);
    assert.equal(doctorCheck.record.scope, QuarantineScope.ACTOR_ONLY);
    assert.equal(doctorCheck.record.isProtectedHospitalNetwork, true);
    assert.equal(doctorCheck.record.hospitalId, "HOSP-B");

    // Gate verification: Offending doctor is blocked
    const doctorAttempt = await service.evaluateDicomAccessRequest(
      {
        consentId: consent.consentId,
        doctorId: offendingDoctorId,
        requestingHospitalId: "HOSP-B",
        studyInstanceUid: STUDY_CT,
        purpose: "TREATMENT",
        requestedAction: RequestedAction.VIEW,
      },
      { ipAddress: HOSP_B_NAT_IP }
    );
    assert.equal(doctorAttempt.decision, AccessDecision.DENIED);
    assert.equal(doctorAttempt.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);

    // 4. CRITICAL: Colleague doctor from THE EXACT SAME NAT IP is NOT blocked!
    const colleagueCheck = service.isActorQuarantined(colleagueDoctorId, HOSP_B_NAT_IP);
    assert.equal(colleagueCheck.quarantined, false);

    // Add colleague doctor to store if not present
    const doctors = store.get("doctors");
    if (!doctors.some((d) => d.doctorId === colleagueDoctorId)) {
      doctors.push({
        doctorId: colleagueDoctorId,
        name: "동료의사-B-02",
        hospitalId: "HOSP-B",
        roles: ["Doctor"],
      });
    }

    const colleagueAttempt = await service.evaluateDicomAccessRequest(
      {
        consentId: consent.consentId,
        doctorId: colleagueDoctorId,
        requestingHospitalId: "HOSP-B",
        studyInstanceUid: STUDY_CT,
        purpose: "TREATMENT",
        requestedAction: RequestedAction.VIEW,
      },
      { ipAddress: HOSP_B_NAT_IP }
    );
    assert.equal(colleagueAttempt.decision, AccessDecision.ALLOWED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("External Network Quarantine: Untrusted external IP is quarantined under EXTERNAL_IP scope", async () => {
  const { dir, service } = await createResilienceTestService();
  try {
    // External attacker breaches policy from unregistered public IP
    const record = await service.quarantineActor({
      actorId: `IP:${EXTERNAL_UNTRUSTED_IP}`,
      ipAddress: EXTERNAL_UNTRUSTED_IP,
      reason: "ANOMALOUS_PORT_PROBE",
      durationMinutes: 15,
    });

    assert.equal(record.scope, QuarantineScope.EXTERNAL_IP);
    assert.equal(record.isProtectedHospitalNetwork, false);

    // Any request from this external IP is rejected regardless of actor identifier
    const checkAny = service.isActorQuarantined("ANY_RANDOM_DOCTOR", EXTERNAL_UNTRUSTED_IP);
    assert.equal(checkAny.quarantined, true);
    assert.equal(checkAny.record.scope, QuarantineScope.EXTERNAL_IP);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Sub-NAT Composite Device Fingerprinting: Unauthenticated brute-force isolates only offending client", async () => {
  const { dir, service } = await createResilienceTestService();
  try {
    const maliciousUa = "BadBot/1.0 (AutomatedScanner)";
    const legitimateUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";

    // Unauthenticated attack originating from Hospital B NAT IP
    const record = await service.quarantineActor({
      ipAddress: HOSP_B_NAT_IP,
      userAgent: maliciousUa,
      reason: "UNAUTHENTICATED_BRUTE_FORCE",
      durationMinutes: 15,
    });

    assert.equal(record.scope, QuarantineScope.COMPOSITE_DEVICE);
    assert.equal(record.isProtectedHospitalNetwork, true);
    assert.ok(record.compositeFingerprint);

    // 1. Offending client (same IP + same UserAgent) is quarantined
    const blockedCheck = service.isActorQuarantined(null, HOSP_B_NAT_IP, maliciousUa);
    assert.equal(blockedCheck.quarantined, true);

    // 2. Legitimate browser on the SAME Hospital B IP with different UserAgent is NOT quarantined
    const cleanCheck = service.isActorQuarantined(null, HOSP_B_NAT_IP, legitimateUa);
    assert.equal(cleanCheck.quarantined, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Emergency Break-Glass Protocol: Quarantined doctor activates emergency bypass with audit chain", async () => {
  const { dir, store, service, advanceMinutes } = await createResilienceTestService();
  try {
    const doctorId = "DOC-B-01";

    // 1. Create active consent
    const consent = await service.createConsent({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: Permission.VIEW_ONLY,
      validUntil: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      scopes: [{ studyInstanceUid: STUDY_CT }],
    });

    // 2. Doctor is quarantined
    await service.quarantineActor({
      actorId: doctorId,
      reason: "REPEATED_ACCESS_FAILURE",
      durationMinutes: 30,
    });
    assert.equal(service.isActorQuarantined(doctorId).quarantined, true);

    // Normal access is DENIED
    const deniedAttempt = await service.requestDicomAccessToken({
      consentId: consent.consentId,
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(deniedAttempt.decision, AccessDecision.DENIED);
    assert.equal(deniedAttempt.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);

    // 3. Doctor executes Break-Glass emergency override
    const overrideResult = await service.executeBreakGlassOverride(
      {
        doctorId,
        doctorLicenseNumber: "DOC-LIC-99281",
        clinicalReason: "ACUTE_INTRACRANIAL_HEMORRHAGE_EMERGENCY",
        patientId: "P-1001",
        studyInstanceUid: STUDY_CT,
      },
      { ipAddress: HOSP_B_NAT_IP, userAgent: "EmergencyWorkstation/1.0" }
    );

    assert.equal(overrideResult.overrideSuccess, true);
    assert.equal(overrideResult.gracePeriodMinutes, 15);
    assert.ok(overrideResult.gracePeriodExpiresAt);

    // 4. Verify Break-Glass audit record exists
    const bgAudit = store.get("auditLogs").find((l) => l.action === AuditAction.BREAK_GLASS_OVERRIDE);
    assert.ok(bgAudit);
    assert.equal(bgAudit.actorId, doctorId);
    assert.equal(bgAudit.reason, "ACUTE_INTRACRANIAL_HEMORRHAGE_EMERGENCY");
    assert.equal(bgAudit.patientId, "P-1001");

    // 5. During the 15-minute grace period, doctor is allowed immediate access!
    const activeCheck = service.isActorQuarantined(doctorId, HOSP_B_NAT_IP);
    assert.equal(activeCheck.quarantined, false);
    assert.equal(activeCheck.breakGlassActive, true);

    const allowedAttempt = await service.requestDicomAccessToken({
      consentId: consent.consentId,
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(allowedAttempt.decision, AccessDecision.ALLOWED);
    assert.ok(allowedAttempt.accessToken);

    // 6. Advance clock by 16 minutes (grace period expired, but original quarantine 30min remains)
    advanceMinutes(16);
    const postGraceCheck = service.isActorQuarantined(doctorId, HOSP_B_NAT_IP);
    assert.equal(postGraceCheck.quarantined, true); // Re-quarantined after grace period!

    const postGraceAttempt = await service.requestDicomAccessToken({
      consentId: consent.consentId,
      doctorId,
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: STUDY_CT,
      purpose: "TREATMENT",
      requestedAction: RequestedAction.VIEW,
    });
    assert.equal(postGraceAttempt.decision, AccessDecision.DENIED);
    assert.equal(postGraceAttempt.reasonCode, AccessDenyReason.ACTOR_QUARANTINED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Break-Glass REST API: POST /api/security/quarantines/break-glass validates parameters and doctor identity", async () => {
  const baseUrl = "http://localhost:3000";

  // 1. Missing fields rejection
  const badReqRes = await fetch(`${baseUrl}/api/security/quarantines/break-glass`, {
    method: "POST",
    headers: {
      "x-hipass-role": "DOCTOR",
      "x-hipass-doctor-id": "DOC-B-01",
      "x-hipass-hospital-id": "HOSP-B",
      "content-type": "application/json",
    },
    body: JSON.stringify({ doctorId: "DOC-B-01" }), // Missing license and clinical reason
  });
  assert.equal(badReqRes.status, 400);

  // 2. Non-doctor access rejection
  const nonDocRes = await fetch(`${baseUrl}/api/security/quarantines/break-glass`, {
    method: "POST",
    headers: {
      "x-hipass-role": "PATIENT",
      "x-hipass-patient-id": "P-1001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      doctorId: "DOC-B-01",
      doctorLicenseNumber: "LIC-123",
      clinicalReason: "EMERGENCY",
    }),
  });
  assert.equal(nonDocRes.status, 403);
});
