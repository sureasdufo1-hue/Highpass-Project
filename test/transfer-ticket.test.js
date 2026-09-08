import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import { HipassService, ServiceValidationError } from "../src/services.js";

const STUDY_001 = "1.2.410.100.1.20260620.001";
const SERIES_001_1 = "1.2.410.100.1.20260620.001.1";
const STUDY_002 = "1.2.410.100.1.20260518.002";

function clockAt(startMs) {
  const state = { now: startMs };
  const clock = () => new Date(state.now).toISOString();
  clock.advance = (minutes) => {
    state.now += minutes * 60_000;
  };
  return clock;
}

async function createService(options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-ticket-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  const clock = options.clock ?? clockAt(Date.parse("2026-06-25T10:00:00.000Z"));
  const service = new HipassService(store, clock, { tokenSecret: "test-secret-for-signed-token", ...options });
  return { dir, store, service, clock };
}

function transferRequestInput(overrides = {}) {
  return {
    requesterDoctorId: "DOC-A-01",
    patientId: "P-1001",
    sourceHospitalId: "HOSP-A",
    targetHospitalId: "HOSP-B",
    purpose: "TREATMENT",
    permission: "VIEW_ONLY",
    scopes: [{ studyInstanceUid: STUDY_001 }],
    ...overrides,
  };
}

function approvalInput(overrides = {}) {
  return {
    patientId: "P-1001",
    permission: "VIEW_ONLY",
    validUntil: "2026-06-26T10:00:00.000Z",
    ...overrides,
  };
}

function redeemInput(overrides = {}) {
  return {
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: STUDY_001,
    purpose: "TREATMENT",
    requestedAction: "VIEW",
    ...overrides,
  };
}

async function issueTicket(service, requestOverrides = {}, approvalOverrides = {}) {
  const request = await service.createTransferRequest(transferRequestInput(requestOverrides));
  const approval = await service.approveTransferRequest(request.requestId, approvalInput(approvalOverrides));
  return { request, approval, nonce: approval.nonce };
}

test("issues a one-time opaque ticket bound to consent scope", async () => {
  const { dir, store, service } = await createService();
  try {
    const { request, approval, nonce } = await issueTicket(service);

    assert.equal(request.status, "PENDING_CONSENT");
    assert.equal(store.get("transferRequests").find((item) => item.requestId === request.requestId).status, "TICKET_ISSUED");
    assert.equal(approval.ticket.status, "ISSUED");
    assert.equal(approval.ticket.consentId, approval.consentId);
    assert.deepEqual(approval.ticket.allowedStudyUids, [STUDY_001]);
    assert.equal(approval.ticket.sourceHospitalId, "HOSP-A");
    assert.equal(approval.ticket.targetHospitalId, "HOSP-B");

    assert.ok(nonce.length >= 43, "nonce should carry >= 128 bits of entropy");
    const stored = store.get("transferTickets").find((ticket) => ticket.ticketId === approval.ticketId);
    assert.ok(!JSON.stringify(stored).includes(nonce), "plaintext nonce must never be persisted");
    assert.match(stored.nonceHash, /^sha256:/);

    const actions = store.get("auditLogs").map((log) => log.action);
    assert.ok(actions.includes("TRANSFER_REQUEST_CREATED"));
    assert.ok(actions.includes("CONSENT_CREATED"));
    assert.ok(actions.includes("TICKET_ISSUED"));
    assert.equal(store.get("auditLogs").at(-1).action, "TICKET_ISSUED");
    assert.equal(store.get("auditLogs").at(-1).result, "SUCCESS");
    assert.ok(store.get("auditLogs").at(-1).auditSessionId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("redeeming a valid ticket consumes it once and issues a scoped token", async () => {
  const { dir, store, service } = await createService();
  try {
    const { approval, nonce } = await issueTicket(service);
    const result = await service.redeemTransferTicket(nonce, redeemInput());

    assert.equal(result.decision, "ALLOWED");
    assert.ok(result.accessToken);
    assert.equal(result.ticketId, approval.ticketId);
    const ticket = store.get("transferTickets").find((item) => item.ticketId === approval.ticketId);
    assert.equal(ticket.status, "USED");
    assert.equal(ticket.redeemedDoctorId, "DOC-B-01");
    assert.equal(ticket.redeemedHospitalId, "HOSP-B");
    assert.equal(store.get("transferRequests").find((item) => item.requestId === approval.requestId).status, "REDEEMED");

    const actions = store.get("auditLogs").map((log) => log.action);
    assert.ok(actions.includes("TICKET_REDEEMED"));
    assert.ok(actions.includes("ACCESS_ALLOWED"));
    assert.ok(actions.includes("TOKEN_ISSUED"));
    const verify = await service.verifyDicomAccessToken(result.accessToken, { targetHospitalId: "HOSP-B", studyInstanceUid: STUDY_001 });
    assert.equal(verify.active, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a consumed ticket cannot be replayed (SEC-QR-02)", async () => {
  const { dir, service } = await createService();
  try {
    const { nonce } = await issueTicket(service);
    assert.equal((await service.redeemTransferTicket(nonce, redeemInput())).decision, "ALLOWED");
    const replay = await service.redeemTransferTicket(nonce, redeemInput());
    assert.equal(replay.decision, "DENIED");
    assert.equal(replay.reasonCode, "TICKET_ALREADY_USED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an expired ticket is denied and marked expired (SEC-QR-01)", async () => {
  const clock = clockAt(Date.parse("2026-06-25T10:00:00.000Z"));
  const { dir, store, service } = await createService({ clock });
  try {
    const { approval, nonce } = await issueTicket(service);
    clock.advance(11);
    const result = await service.redeemTransferTicket(nonce, redeemInput());
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "TICKET_EXPIRED");
    assert.equal(store.get("transferTickets").find((item) => item.ticketId === approval.ticketId).status, "EXPIRED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a ticket from another hospital is denied (SEC-INST-01)", async () => {
  const { dir, service } = await createService();
  try {
    const { nonce } = await issueTicket(service);
    const result = await service.redeemTransferTicket(nonce, redeemInput({ requestingHospitalId: "HOSP-C", doctorId: "DOC-C-01" }));
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "HOSPITAL_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a doctor outside the target hospital cannot redeem", async () => {
  const { dir, service } = await createService();
  try {
    const { nonce } = await issueTicket(service);
    const result = await service.redeemTransferTicket(nonce, redeemInput({ doctorId: "DOC-A-01" }));
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "DOCTOR_HOSPITAL_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("purpose and study scope bindings are enforced (SEC-SCOPE-01)", async () => {
  const { dir, service } = await createService();
  try {
    const { nonce } = await issueTicket(service);
    const wrongPurpose = await service.redeemTransferTicket(nonce, redeemInput({ purpose: "CONSULTATION" }));
    assert.equal(wrongPurpose.reasonCode, "PURPOSE_MISMATCH");

    const wrongStudy = await service.redeemTransferTicket(nonce, redeemInput({ studyInstanceUid: STUDY_002 }));
    assert.equal(wrongStudy.reasonCode, "STUDY_SCOPE_MISMATCH");

    const wrongSeries = await service.redeemTransferTicket(nonce, redeemInput({ seriesInstanceUid: "1.2.410.100.1.20260620.001.9" }));
    assert.equal(wrongSeries.reasonCode, "SERIES_SCOPE_MISMATCH");

    const unknownTicket = await service.redeemTransferTicket("does-not-exist-unknown-nonce-value", redeemInput());
    assert.equal(unknownTicket.reasonCode, "ACCESS_DENIED_NO_TICKET");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("VIEW_ONLY ticket blocks download redemption (SEC-DL-01)", async () => {
  const { dir, service } = await createService();
  try {
    const { nonce } = await issueTicket(service);
    const result = await service.redeemTransferTicket(nonce, redeemInput({ requestedAction: "DOWNLOAD" }));
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "DOWNLOAD_NOT_ALLOWED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("consent revocation invalidates an unredeemed ticket (SEC-CONS-01)", async () => {
  const { dir, store, service } = await createService();
  try {
    const { approval, nonce } = await issueTicket(service);
    await service.revokeConsent(approval.consentId, "P-1001");
    const result = await service.redeemTransferTicket(nonce, redeemInput());
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "TICKET_REVOKED");
    assert.equal(store.get("transferTickets").find((item) => item.ticketId === approval.ticketId).status, "REVOKED");
    assert.equal(store.get("transferRequests").find((item) => item.requestId === approval.requestId).status, "REVOKED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("QR payload carries only an opaque routing reference (FR-QR-001)", async () => {
  const { dir, service } = await createService({ publicBaseUrl: "https://hipass.example" });
  try {
    const { approval } = await issueTicket(service);
    assert.match(approval.qr.payload, /^https:\/\/hipass\.example\/t\/[A-Za-z0-9_-]{43}$/);
    assert.ok(!approval.qr.payload.includes("P-1001"));
    assert.ok(!approval.qr.payload.includes(STUDY_001));
    assert.ok(!approval.qr.payload.includes(approval.consentId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("patient cannot widen a VIEW_ONLY request to DOWNLOAD_ALLOWED", async () => {
  const { dir, service } = await createService();
  try {
    const request = await service.createTransferRequest(transferRequestInput());
    await assert.rejects(
      () => service.approveTransferRequest(request.requestId, approvalInput({ permission: "DOWNLOAD_ALLOWED" })),
      (error) => error instanceof ServiceValidationError && error.code === "PERMISSION_EXCEEDS_REQUEST",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("transfer requests must originate from a source-hospital doctor", async () => {
  const { dir, service } = await createService();
  try {
    await assert.rejects(
      () => service.createTransferRequest(transferRequestInput({ requesterDoctorId: "DOC-B-01" })),
      (error) => error instanceof ServiceValidationError && error.code === "REQUESTER_NOT_SOURCE_HOSPITAL_DOCTOR",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a request already awaiting a ticket cannot be approved twice", async () => {
  const { dir, service } = await createService();
  try {
    const { request } = await issueTicket(service);
    await assert.rejects(
      () => service.approveTransferRequest(request.requestId, approvalInput()),
      (error) => error instanceof ServiceValidationError && error.code === "TRANSFER_REQUEST_STATE_INVALID",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("getTransferRequest and patient listing never expose the nonce hash", async () => {
  const { dir, service } = await createService();
  try {
    const { request, approval } = await issueTicket(service);
    const view = JSON.stringify(service.getTransferRequest(request.requestId));
    assert.ok(!view.includes("nonceHash"));
    assert.ok(!view.includes(approval.nonce));
    const list = service.listTransferRequestsByPatient("P-1001");
    assert.equal(list.length, 1);
    assert.equal(list[0].ticket.status, "ISSUED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("redeeming after consent expiry is denied even if ticket still within TTL", async () => {
  const clock = clockAt(Date.parse("2026-06-25T10:00:00.000Z"));
  const { dir, service } = await createService({ clock });
  try {
    const { nonce } = await issueTicket(service, {}, { validUntil: "2026-06-25T10:05:00.000Z" });
    clock.advance(6);
    const result = await service.redeemTransferTicket(nonce, redeemInput());
    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "CONSENT_EXPIRED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
