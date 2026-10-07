import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { HipassService, calculateJwkThumbprint } from "../src/services.js";
import {
  AuditAction,
  AccessDenyReason,
} from "../src/domain.js";

async function setupService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-dpop-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();

  const service = new HipassService(store, () => new Date().toISOString(), {
    tokenSecret: "dpop-test-token-secret-32-chars-ok!",
  });

  return { service, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

function generateClientKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = publicKey.export({ format: "jwk" });
  return { privateKey, publicKey, jwk };
}

function createDPoPProof({ privateKey, jwk, method, url, nonce = `dpop_nonce_${Math.random()}`, iat = Math.floor(Date.now() / 1000) }) {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk,
  };
  const payload = {
    jti: nonce,
    htm: method,
    htu: url,
    iat,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
  const signature = sign("SHA256", signedData, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

test("DPoP Scenario 1: Authentic WebCrypto KeyPair generates verifiable DPoP Proof and binds to Attestation Token", async () => {
  const { service, cleanup } = await setupService();
  try {
    const { privateKey, jwk } = generateClientKeyPair();
    const expectedThumbprint = calculateJwkThumbprint(jwk);
    assert.ok(expectedThumbprint, "Thumbprint must be computed");

    // 1. Issue Client Attestation Token bound to client's public key JWK
    const tokenResult = service.issueClientAttestationToken({
      clientSessionId: "sess_doctor_b_01",
      clientPublicKeyJwk: jwk,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      ipAddress: "203.250.20.15",
    });

    assert.equal(tokenResult.publicKeyThumbprint, expectedThumbprint);

    // 2. Client calls sensitive API with DPoP Proof
    const method = "POST";
    const url = "/api/dicom-access/request";
    const dpopJwt = createDPoPProof({ privateKey, jwk, method, url });

    const proofVerification = await service.verifyDPoPProof(dpopJwt, {
      method,
      url,
      expectedPublicKeyThumbprint: tokenResult.publicKeyThumbprint,
    });

    assert.equal(proofVerification.valid, true, "Valid DPoP Proof must pass verification");
    assert.equal(proofVerification.publicKeyThumbprint, expectedThumbprint);
  } finally {
    await cleanup();
  }
});

test("DPoP Scenario 2: Same-NAT Replay Attack is strictly rejected (DPOP_NONCE_REPLAYED)", async () => {
  const { service, cleanup } = await setupService();
  try {
    const { privateKey, jwk } = generateClientKeyPair();
    const method = "POST";
    const url = "/api/dicom-access/request";
    const reusableNonce = "fixed_nonce_intercepted_by_eavesdropper_123";

    // 1. Authentic client issues request 1
    const dpopJwt = createDPoPProof({ privateKey, jwk, method, url, nonce: reusableNonce });
    const firstAttempt = await service.verifyDPoPProof(dpopJwt, {
      method,
      url,
      requestMeta: { actorId: "DOC-B-01", ipAddress: "203.250.20.15" },
    });
    assert.equal(firstAttempt.valid, true, "First submission with fresh nonce must succeed");

    // 2. Adversary inside the same NAT replays the identical DPoP proof
    const replayAttempt = await service.verifyDPoPProof(dpopJwt, {
      method,
      url,
      requestMeta: { actorId: "ATTACKER-SAME-NAT", ipAddress: "203.250.20.15" },
    });

    assert.equal(replayAttempt.valid, false);
    assert.equal(replayAttempt.reason, AccessDenyReason.DPOP_NONCE_REPLAYED, "Replayed nonce must be rejected");

    // 3. Confirm Replay Attack alert logged to audit trail
    const auditLogs = service.listAuditLogs({ action: AuditAction.DPOP_REPLAY_ATTACK_DETECTED });
    assert.ok(auditLogs.length > 0, "DPOP_REPLAY_ATTACK_DETECTED must be audited");
    assert.equal(auditLogs[0].reasonCode, "REPLAY_ATTACK_DETECTED_FOR_DPOP_NONCE");
  } finally {
    await cleanup();
  }
});

test("DPoP Scenario 3: Token Eavesdropper cannot substitute with their own KeyPair (DPOP_KEY_MISMATCH)", async () => {
  const { service, cleanup } = await setupService();
  try {
    const victimKey = generateClientKeyPair();
    const attackerKey = generateClientKeyPair();

    // 1. Victim gets attestation token bound to victimKey
    const victimToken = service.issueClientAttestationToken({
      clientSessionId: "victim_session_456",
      clientPublicKeyJwk: victimKey.jwk,
    });

    // 2. Attacker steals token and signs with attackerKey's privateKey
    const method = "POST";
    const url = "/api/dicom-access/request";
    const attackerDPoP = createDPoPProof({
      privateKey: attackerKey.privateKey,
      jwk: attackerKey.jwk,
      method,
      url,
    });

    // 3. Verify against the victim's bound thumbprint
    const check = await service.verifyDPoPProof(attackerDPoP, {
      method,
      url,
      expectedPublicKeyThumbprint: victimToken.publicKeyThumbprint,
    });

    assert.equal(check.valid, false);
    assert.equal(check.reason, AccessDenyReason.DPOP_KEY_MISMATCH, "Key substitution must be blocked");
  } finally {
    await cleanup();
  }
});

test("DPoP Scenario 4: Forged signature or tampering is strictly rejected (DPOP_SIGNATURE_INVALID)", async () => {
  const { service, cleanup } = await setupService();
  try {
    const { privateKey, jwk } = generateClientKeyPair();
    const method = "POST";
    const url = "/api/dicom-access/request";
    const validDPoP = createDPoPProof({ privateKey, jwk, method, url });

    // Tamper with signature
    const parts = validDPoP.split(".");
    const tamperedDPoP = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -5)}BADSIG`;

    const check = await service.verifyDPoPProof(tamperedDPoP, { method, url });
    assert.equal(check.valid, false);
    assert.equal(check.reason, AccessDenyReason.DPOP_SIGNATURE_INVALID);
  } finally {
    await cleanup();
  }
});

test("DPoP Scenario 5: Method and URI tampering are blocked (DPOP_METHOD_MISMATCH & DPOP_URI_MISMATCH)", async () => {
  const { service, cleanup } = await setupService();
  try {
    const { privateKey, jwk } = generateClientKeyPair();

    // Proof generated for POST /api/dicom-access/request
    const dpopJwt = createDPoPProof({
      privateKey,
      jwk,
      method: "POST",
      url: "/api/dicom-access/request",
    });

    // 1. Tested against different HTTP method (e.g. GET)
    const methodCheck = await service.verifyDPoPProof(dpopJwt, {
      method: "GET",
      url: "/api/dicom-access/request",
    });
    assert.equal(methodCheck.valid, false);
    assert.equal(methodCheck.reason, AccessDenyReason.DPOP_METHOD_MISMATCH);

    // 2. Tested against different URL (e.g. /api/consents/steal)
    const uriCheck = await service.verifyDPoPProof(dpopJwt, {
      method: "POST",
      url: "/api/consents/steal",
    });
    assert.equal(uriCheck.valid, false);
    assert.equal(uriCheck.reason, AccessDenyReason.DPOP_URI_MISMATCH);
  } finally {
    await cleanup();
  }
});

test("DPoP Scenario 6: Clock Skew over 60 seconds is rejected (DPOP_PROOF_EXPIRED)", async () => {
  const { service, cleanup } = await setupService();
  try {
    const { privateKey, jwk } = generateClientKeyPair();
    const method = "POST";
    const url = "/api/dicom-access/request";

    // Expired timestamp (2 minutes ago)
    const expiredIat = Math.floor(Date.now() / 1000) - 120;
    const expiredDPoP = createDPoPProof({ privateKey, jwk, method, url, iat: expiredIat });

    const check = await service.verifyDPoPProof(expiredDPoP, { method, url });
    assert.equal(check.valid, false);
    assert.equal(check.reason, AccessDenyReason.DPOP_PROOF_EXPIRED);
  } finally {
    await cleanup();
  }
});
