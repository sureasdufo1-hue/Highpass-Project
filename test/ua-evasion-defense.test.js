import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import {
  AuditAction,
  QuarantineScope,
  QuarantineStatus,
  AccessDenyReason,
} from "../src/domain.js";

async function setupService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-ua-evasion-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();

  const service = new HipassService(store, () => new Date().toISOString(), {
    tokenSecret: "test-token-secret-32-chars-long!",
    anomalyRules: {
      headerChurnWindowMinutes: 1,
      headerChurnThreshold: 5,
      tarpitWindowMinutes: 5,
      tarpitThreshold: 3,
      tarpitBaseDelayMs: 1000,
      tarpitMaxDelayMs: 5000,
      quarantineDurationMinutes: 15,
    },
  });

  return { service, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("Layer 1: JA3 TLS fingerprinting defeats randomized User-Agent evasion within trusted hospital NAT", async () => {
  const { service, cleanup } = await setupService();
  try {
    const hospitalIp = "203.250.20.50"; // Hospital B trusted egress IP (in 203.250.20.0/24)
    const attackerJa3 = "ja3_hash_python_requests_4a5b6c";
    const doctorId = "DOC-B-01";

    // 1. Attacker is quarantined using their JA3 TLS fingerprint
    await service.quarantineActor({
      actorId: `IP:${hospitalIp}`,
      ipAddress: hospitalIp,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InitialUA",
      ja3Fingerprint: attackerJa3,
      scope: QuarantineScope.COMPOSITE_DEVICE,
      reason: "MALICIOUS_SCANNER_DETECTED",
    });

    // 2. Attacker alters their User-Agent randomly on subsequent calls
    const randomizedUserAgents = [
      "curl/7.88.1",
      "PostmanRuntime/7.32.2",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)",
      "CustomBot/1.0",
      "Go-http-client/1.1",
    ];

    for (const fakeUa of randomizedUserAgents) {
      const check = service.isActorQuarantined(null, hospitalIp, fakeUa, attackerJa3);
      assert.equal(
        check.quarantined,
        true,
        `Attacker with randomized UA '${fakeUa}' must be quarantined due to matching JA3 socket fingerprint`
      );
      assert.equal(check.record.reason, "MALICIOUS_SCANNER_DETECTED");
    }

    // 3. Normal doctor from the same hospital IP using authentic browser (different JA3) must NOT be blocked
    const doctorLegitimateJa3 = "ja3_hash_chrome_desktop_e1f2a3";
    const doctorCheck = service.isActorQuarantined(
      doctorId,
      hospitalIp,
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      doctorLegitimateJa3
    );
    assert.equal(
      doctorCheck.quarantined,
      false,
      "Legitimate doctor from the same NAT IP with different JA3 must NOT be quarantined (Prevents Hospital DoS)"
    );
  } finally {
    await cleanup();
  }
});

test("Layer 2: Header Churn Anomaly Detector catches rapid UA churn within 1 minute window", async () => {
  const { service, cleanup } = await setupService();
  try {
    const attackIp = "203.250.30.99"; // Hospital C egress IP

    // Simulate attacker sending 5 requests with 5 different User-Agents rapidly
    const churnedUas = [
      "UserAgent-Alpha/1.0",
      "UserAgent-Beta/2.0",
      "UserAgent-Gamma/3.0",
      "UserAgent-Delta/4.0",
      "UserAgent-Epsilon/5.0",
    ];

    for (let i = 0; i < churnedUas.length; i++) {
      await service.writeAudit({
        actorType: "DOCTOR",
        actorId: `DOC-UNKNOWN-${i}`,
        hospitalId: "HOSP-C",
        action: AuditAction.ACCESS_DENIED,
        result: "FAIL",
        reason: "TOKEN_INVALID",
        ipAddress: attackIp,
        userAgent: churnedUas[i],
      });
    }

    // Verify Audit log contains HEADER_CHURN_DETECTED alert
    const alerts = service.listAnomalyAlerts();
    const churnAlert = alerts.find((a) => a.action === AuditAction.HEADER_CHURN_DETECTED);
    assert.ok(churnAlert, "HEADER_CHURN_DETECTED alert must be recorded in audit log");
    assert.equal(churnAlert.ipAddress, attackIp);
    assert.equal(churnAlert.reason, "HEADER_CHURN_EVASION_ATTEMPT");

    // Verify attacker source was quarantined under COMPOSITE_DEVICE scope
    const quarantines = service.listQuarantines();
    const quarantined = quarantines.find((q) => q.sourceAction === AuditAction.HEADER_CHURN_DETECTED);
    assert.ok(quarantined, "Attacker source must be auto-quarantined");
    assert.equal(quarantined.scope, QuarantineScope.COMPOSITE_DEVICE);
  } finally {
    await cleanup();
  }
});

test("Layer 3: Adaptive Tarpitting Rate-Limiter calculates step-wise delays without hard-blocking hospital IP", async () => {
  const { service, cleanup } = await setupService();
  try {
    const hospitalIp = "203.250.10.15"; // Hospital A egress IP
    const standardJa3 = "ja3_standard_waf_client";

    // Initial state: 0 failures -> no delay
    let tarpit = service.calculateTarpitDelay({ ipAddress: hospitalIp, ja3Fingerprint: standardJa3 });
    assert.equal(tarpit.throttled, false);
    assert.equal(tarpit.delayMs, 0);

    // 1 & 2 failures -> below threshold (threshold = 3) -> no delay
    for (let i = 1; i <= 2; i++) {
      await service.writeAudit({
        actorType: "DOCTOR",
        actorId: "DOC-A-01",
        hospitalId: "HOSP-A",
        action: AuditAction.ACCESS_DENIED,
        result: "FAIL",
        reason: "CONSENT_NOT_FOUND",
        ipAddress: hospitalIp,
        userAgent: "TestBrowser/1.0",
        ja3Fingerprint: standardJa3,
      });
    }
    tarpit = service.calculateTarpitDelay({ ipAddress: hospitalIp, ja3Fingerprint: standardJa3 });
    assert.equal(tarpit.throttled, false);
    assert.equal(tarpit.delayMs, 0);

    // 3rd failure -> hits threshold -> 1000ms delay
    await service.writeAudit({
      actorType: "DOCTOR",
      actorId: "DOC-A-01",
      hospitalId: "HOSP-A",
      action: AuditAction.ACCESS_DENIED,
      result: "FAIL",
      reason: "CONSENT_NOT_FOUND",
      ipAddress: hospitalIp,
      userAgent: "TestBrowser/1.0",
      ja3Fingerprint: standardJa3,
    });
    tarpit = service.calculateTarpitDelay({ ipAddress: hospitalIp, ja3Fingerprint: standardJa3 });
    assert.equal(tarpit.throttled, true);
    assert.equal(tarpit.delayMs, 1000, "3rd failure must inject 1000ms tarpit delay");

    // 5th failure -> 3000ms delay
    for (let i = 4; i <= 5; i++) {
      await service.writeAudit({
        actorType: "DOCTOR",
        actorId: "DOC-A-01",
        hospitalId: "HOSP-A",
        action: AuditAction.ACCESS_DENIED,
        result: "FAIL",
        reason: "CONSENT_NOT_FOUND",
        ipAddress: hospitalIp,
        userAgent: "TestBrowser/1.0",
        ja3Fingerprint: standardJa3,
      });
    }
    tarpit = service.calculateTarpitDelay({ ipAddress: hospitalIp, ja3Fingerprint: standardJa3 });
    assert.equal(tarpit.throttled, true);
    assert.equal(tarpit.delayMs, 3000, "5th failure must scale to 3000ms tarpit delay");

    // 10 failures -> capped at maxDelayMs (5000ms)
    for (let i = 6; i <= 10; i++) {
      await service.writeAudit({
        actorType: "DOCTOR",
        actorId: "DOC-A-01",
        hospitalId: "HOSP-A",
        action: AuditAction.ACCESS_DENIED,
        result: "FAIL",
        reason: "CONSENT_NOT_FOUND",
        ipAddress: hospitalIp,
        userAgent: "TestBrowser/1.0",
        ja3Fingerprint: standardJa3,
      });
    }
    tarpit = service.calculateTarpitDelay({ ipAddress: hospitalIp, ja3Fingerprint: standardJa3 });
    assert.equal(tarpit.throttled, true);
    assert.equal(tarpit.delayMs, 5000, "Delays must be capped at 5000ms max to prevent socket timeouts");
  } finally {
    await cleanup();
  }
});

test("Fail-Closed Security: assertActorNotQuarantined rejects evasive quarantined callers", async () => {
  const { service, cleanup } = await setupService();
  try {
    const ip = "198.51.100.77";
    const ja3 = "ja3_evasion_test_77";

    await service.quarantineActor({
      actorId: `IP:${ip}`,
      ipAddress: ip,
      ja3Fingerprint: ja3,
      scope: QuarantineScope.COMPOSITE_DEVICE,
      reason: "EVASION_ATTEMPT",
    });

    // Calling with randomized UA but matching JA3 must throw 403 ACTOR_QUARANTINED
    assert.throws(
      () => {
        service.assertActorNotQuarantined("DOC-TEST", ip, "Random-UA-XYZ", ja3);
      },
      (err) => {
        return (
          err.name === "ServiceValidationError" &&
          err.code === AccessDenyReason.ACTOR_QUARANTINED &&
          err.statusCode === 403
        );
      }
    );
  } finally {
    await cleanup();
  }
});
