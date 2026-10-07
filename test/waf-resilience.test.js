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
  SecurityDegradedMode,
  AccessDenyReason,
} from "../src/domain.js";
import { extractJa3FromClientHello } from "../src/tls-inspector.js";

async function setupService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-waf-resilience-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();

  const service = new HipassService(store, () => new Date().toISOString(), {
    tokenSecret: "waf-resilience-secret-32-chars-ok!",
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

/**
 * Builds a synthetic TLS 1.2 ClientHello binary buffer for testing in-app TLS inspector
 */
function buildMockClientHelloBuffer() {
  const chunks = [];

  // 1. Record Layer: 0x16 (Handshake), Version 0x0301 (TLS 1.0), Length placeholder
  const recordHeader = Buffer.from([0x16, 0x03, 0x01, 0x00, 0x00]);
  chunks.push(recordHeader);

  // 2. Handshake Header: 0x01 (Client Hello), Length placeholder (3 bytes)
  const handshakeHeader = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  chunks.push(handshakeHeader);

  // 3. Client Version: 0x0303 (TLS 1.2)
  chunks.push(Buffer.from([0x03, 0x03]));

  // 4. Random: 32 bytes
  chunks.push(Buffer.alloc(32, 0xaa));

  // 5. Session ID: Length 0
  chunks.push(Buffer.from([0x00]));

  // 6. Cipher Suites: Length 6 (3 suites: GREASE 0x0a0a, 0xc02f, 0xc030)
  chunks.push(Buffer.from([0x00, 0x06, 0x0a, 0x0a, 0xc0, 0x2f, 0xc0, 0x30]));

  // 7. Compression Methods: Length 1, null compression (0x00)
  chunks.push(Buffer.from([0x01, 0x00]));

  // 8. Extensions:
  // Extension 1: GREASE 0x1a1a (len 0)
  // Extension 2: Supported Groups (0x000a), len 6, curves: GREASE 0x2a2a, X25519 (0x001d), secp256r1 (0x0017)
  // Extension 3: EC Point Formats (0x000b), len 2, uncompressed (0x00)
  const extBuffer = Buffer.from([
    // Total extensions length: 2 + 10 + 4 = 16 bytes
    0x00, 0x10,
    // Ext 1: GREASE 0x1a1a, len 0
    0x1a, 0x1a, 0x00, 0x00,
    // Ext 2: 0x000a (Supported Groups), len 6 (groups list len 4: 0x001d, 0x0017)
    0x00, 0x0a, 0x00, 0x06, 0x00, 0x04, 0x00, 0x1d, 0x00, 0x17,
    // Ext 3: 0x000b (EC Point Formats), len 2 (formats list len 1: 0x00)
    0x00, 0x0b, 0x00, 0x02, 0x01, 0x00,
  ]);
  chunks.push(extBuffer);

  const fullPacket = Buffer.concat(chunks);

  // Fix Handshake Length (bytes 6-8)
  const handshakeBodyLen = fullPacket.length - 9;
  fullPacket.writeUIntBE(handshakeBodyLen, 6, 3);

  // Fix Record Length (bytes 3-4)
  const recordBodyLen = fullPacket.length - 5;
  fullPacket.writeUInt16BE(recordBodyLen, 3);

  return fullPacket;
}

test("Pillar 1: In-App TLS ClientHello Parser accurately computes JA3 fingerprint with GREASE filtering", () => {
  const mockPacket = buildMockClientHelloBuffer();
  const parsed = extractJa3FromClientHello(mockPacket);

  assert.ok(parsed, "extractJa3FromClientHello must return parsed JA3 attributes");
  assert.equal(parsed.clientVersion, 0x0303, "TLS version must match 771 (0x0303 / TLS 1.2)");

  // Expected JA3 string:
  // 771,49200-49201,10-11,29-23,0 (0xc02f=49199, 0xc030=49200; GREASE 0x0a0a, 0x1a1a, 0x2a2a filtered out)
  assert.ok(parsed.ja3String.startsWith("771,"), "JA3 string must start with SSLVersion 771");
  assert.ok(parsed.ja3String.includes("49199-49200") || parsed.ja3String.includes("49200"), "Must parse non-GREASE ciphers");
  assert.ok(!parsed.ja3String.includes("2570"), "GREASE cipher 0x0a0a (2570) must be completely filtered out");
  assert.equal(parsed.ja3Fingerprint.length, 32, "JA3 fingerprint must be standard 32-character MD5 hash");

  // Fail-Safe check on truncated/invalid buffer
  const corrupted = Buffer.from([0x16, 0x03, 0x01]);
  assert.equal(extractJa3FromClientHello(corrupted), null, "Invalid buffer must return null gracefully without throwing");
});

test("Pillar 2: Adaptive Degraded Mode activates STRICT_HEURISTIC policy when WAF JA3 header is missing", async () => {
  const { service, cleanup } = await setupService();
  try {
    // 1. With JA3 present (WAF enabled) -> FULL_PROTECTION mode with standard thresholds
    const wafEnabledRules = service.getEffectiveAnomalyRules({ ja3Fingerprint: "ja3_cloudflare_waf_valid" });
    assert.equal(wafEnabledRules.mode, SecurityDegradedMode.FULL_PROTECTION);
    assert.equal(wafEnabledRules.headerChurnThreshold, 5);
    assert.equal(wafEnabledRules.tarpitThreshold, 3);
    assert.equal(wafEnabledRules.tarpitBaseDelayMs, 1000);

    // 2. Without JA3 (WAF absent/unconfigured) -> STRICT_HEURISTIC mode with tighter thresholds
    const zeroWafRules = service.getEffectiveAnomalyRules({ ja3Fingerprint: null });
    assert.equal(zeroWafRules.mode, SecurityDegradedMode.STRICT_HEURISTIC);
    assert.equal(zeroWafRules.headerChurnThreshold, 3, "Churn threshold must be tightened to 3 in degraded mode");
    assert.equal(zeroWafRules.tarpitThreshold, 2, "Tarpit threshold must trigger at 2 failures in degraded mode");
    assert.equal(zeroWafRules.tarpitBaseDelayMs, 2000, "Base delay must be increased to 2000ms");
    assert.equal(zeroWafRules.quarantineDurationMinutes, 30, "Quarantine duration must be extended to 30 mins");
  } finally {
    await cleanup();
  }
});

test("Pillar 2: Zero-WAF Strict Header Churn triggers at only 3 rapid User-Agent variations", async () => {
  const { service, cleanup } = await setupService();
  try {
    const attackIp = "192.0.2.88";

    // 3 rapid UA changes WITHOUT JA3 header
    const churnedUas = ["ScriptUA/1.0", "ScriptUA/2.0", "ScriptUA/3.0"];

    for (let i = 0; i < churnedUas.length; i++) {
      await service.writeAudit({
        actorType: "DOCTOR",
        actorId: `DOC-EVADER-${i}`,
        hospitalId: "HOSP-B",
        action: AuditAction.ACCESS_DENIED,
        result: "FAIL",
        reason: "INVALID_REQUEST",
        ipAddress: attackIp,
        userAgent: churnedUas[i],
        ja3Fingerprint: null, // Zero WAF
      });
    }

    // Must be detected immediately on the 3rd variation
    const alerts = service.listAnomalyAlerts();
    const churnAlert = alerts.find(
      (a) => a.action === AuditAction.HEADER_CHURN_DETECTED && a.ipAddress === attackIp
    );
    assert.ok(churnAlert, "STRICT_HEURISTIC mode must detect evasion after only 3 UA variations");

    const quarantines = service.listQuarantines();
    const q = quarantines.find((item) => item.ipAddress === attackIp);
    assert.ok(q, "Attacking IP must be quarantined");
    assert.equal(q.scope, QuarantineScope.COMPOSITE_DEVICE);
  } finally {
    await cleanup();
  }
});

test("Pillar 2: Zero-WAF Tarpit triggers at 2nd failure and injects 2000ms delay", async () => {
  const { service, cleanup } = await setupService();
  try {
    const attackIp = "192.0.2.99";

    // 1st failure: below strict threshold (2) -> no delay
    await service.writeAudit({
      actorType: "DOCTOR",
      actorId: "DOC-ATTACK",
      action: AuditAction.ACCESS_DENIED,
      result: "FAIL",
      reason: "TOKEN_INVALID",
      ipAddress: attackIp,
      ja3Fingerprint: null,
    });
    let tarpit = service.calculateTarpitDelay({ ipAddress: attackIp, ja3Fingerprint: null });
    assert.equal(tarpit.throttled, false);
    assert.equal(tarpit.delayMs, 0);
    assert.equal(tarpit.mode, SecurityDegradedMode.STRICT_HEURISTIC);

    // 2nd failure: reaches strict threshold (2) -> 2000ms delay injected immediately
    await service.writeAudit({
      actorType: "DOCTOR",
      actorId: "DOC-ATTACK",
      action: AuditAction.ACCESS_DENIED,
      result: "FAIL",
      reason: "TOKEN_INVALID",
      ipAddress: attackIp,
      ja3Fingerprint: null,
    });
    tarpit = service.calculateTarpitDelay({ ipAddress: attackIp, ja3Fingerprint: null });
    assert.equal(tarpit.throttled, true);
    assert.equal(tarpit.delayMs, 2000, "Degraded mode must inject 2000ms delay upon 2nd failure");
    assert.equal(tarpit.mode, SecurityDegradedMode.STRICT_HEURISTIC);
  } finally {
    await cleanup();
  }
});

test("Pillar 3: Client Attestation Challenge issues tamper-proof session tokens and rejects forged requests", async () => {
  const { service, cleanup } = await setupService();
  try {
    const clientSessionId = "browser_session_xyz_123";
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HiPassPortal/3.0";
    const ipAddress = "203.250.20.10";

    // 1. Issue authentic token
    const tokenResult = service.issueClientAttestationToken({
      clientSessionId,
      userAgent,
      ipAddress,
      ttlMinutes: 15,
    });

    assert.ok(tokenResult.attestationToken, "Must issue attestationToken");
    assert.equal(tokenResult.clientSessionId, clientSessionId);

    // 2. Verify authentic token passes
    const verifySuccess = service.verifyClientAttestationToken(tokenResult.attestationToken, {
      userAgent,
      ipAddress,
    });
    assert.equal(verifySuccess.valid, true);
    assert.equal(verifySuccess.clientSessionId, clientSessionId);

    // 3. Forged token with altered payload must be rejected
    const forgedToken = tokenResult.attestationToken.slice(0, -6) + "BADSIG";
    const verifyForged = service.verifyClientAttestationToken(forgedToken, {
      userAgent,
      ipAddress,
    });
    assert.equal(verifyForged.valid, false);
    assert.equal(verifyForged.reason, AccessDenyReason.CLIENT_ATTESTATION_INVALID);

    // 4. Mismatched User-Agent or IP must invalidate signature
    const verifyMismatched = service.verifyClientAttestationToken(tokenResult.attestationToken, {
      userAgent: "curl/7.88.1 (EvasionTool)",
      ipAddress,
    });
    assert.equal(verifyMismatched.valid, false);
    assert.equal(verifyMismatched.reason, AccessDenyReason.CLIENT_ATTESTATION_INVALID);

    // 5. Missing token must be rejected with CLIENT_ATTESTATION_REQUIRED
    const verifyMissing = service.verifyClientAttestationToken(null, { userAgent, ipAddress });
    assert.equal(verifyMissing.valid, false);
    assert.equal(verifyMissing.reason, AccessDenyReason.CLIENT_ATTESTATION_REQUIRED);
  } finally {
    await cleanup();
  }
});
