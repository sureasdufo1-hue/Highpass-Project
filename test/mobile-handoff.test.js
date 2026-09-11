import test from "node:test";
import assert from "node:assert/strict";
import { HandoffState, MobileHandoffBroker, MobileHandoffError } from "../src/mobile-handoff.js";

function createBroker() {
  return new MobileHandoffBroker({ clock: () => new Date("2026-09-12T00:00:00.000Z") });
}

function createInput() {
  return {
    handoffId: "hof_abcdefghijklmnop",
    transferId: "trf_abcdefghijklmnop",
    packageId: "pkg_abcdefghijklmnop",
    targetInstitutionRef: "inst_hospital_b",
    clinicianRef: "user_doctor_b",
    gatewayRef: "gateway_b",
    purpose: "TREATMENT",
    scope: { studyRefs: ["study-synthetic-1"], seriesRefs: ["series-synthetic-1"], actions: ["VIEW"] },
    expiresAt: "2026-09-12T00:10:00.000Z",
  };
}

test("handoff follows create -> issue -> scan -> approve -> authorize -> consume", () => {
  const broker = createBroker();
  broker.createHandoff(createInput());
  const issued = broker.issueTicket(createInput().handoffId);
  assert.match(issued.qr.payload, /^https:\/\/hipass\.example\/t\/[A-Za-z0-9_-]{43}$/u);
  assert.equal(issued.qr.payload.includes(createInput().packageId), false);
  assert.equal(JSON.stringify(issued).includes("study-synthetic-1"), false);
  assert.equal(broker.scanTicket(issued.qr.payload, "inst_hospital_b").decision, "ALLOW");
  broker.approve(createInput().handoffId);
  broker.authorize(createInput().handoffId, "user_doctor_b");
  const result = broker.consume(issued.qr.payload, "inst_hospital_b");
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.packageId, createInput().packageId);
  assert.deepEqual(result.scope.studyRefs, ["study-synthetic-1"]);
});

test("ticket replay is denied after atomic consume", () => {
  const broker = createBroker();
  broker.createHandoff(createInput());
  const issued = broker.issueTicket(createInput().handoffId);
  broker.scanTicket(issued.qr.payload, "inst_hospital_b");
  broker.approve(createInput().handoffId);
  broker.authorize(createInput().handoffId, "user_doctor_b");
  assert.equal(broker.consume(issued.qr.payload, "inst_hospital_b").decision, "ALLOW");
  const replay = broker.consume(issued.qr.payload, "inst_hospital_b");
  assert.deepEqual(replay, { decision: "DENIED", reasonCode: "TICKET_REPLAY_BLOCKED" });
});

test("wrong institution and unauthorized clinician fail closed without widening scope", () => {
  const broker = createBroker();
  broker.createHandoff(createInput());
  const issued = broker.issueTicket(createInput().handoffId);
  assert.deepEqual(broker.scanTicket(issued.qr.payload, "inst_hospital_c"), { decision: "DENIED", reasonCode: "HANDOFF_INSTITUTION_MISMATCH" });
  assert.deepEqual(broker.authorize(createInput().handoffId, "user_doctor_c"), { decision: "DENIED", reasonCode: "HANDOFF_CLINICIAN_MISMATCH" });
  assert.equal(broker.storedTickets()[0].nonceHash.length, 13);
});

test("expired, revoked, malformed, and replayed ticket paths are rejected", () => {
  let current = new Date("2026-09-12T00:00:00.000Z");
  const broker = new MobileHandoffBroker({ clock: () => current });
  broker.createHandoff(createInput());
  const issued = broker.issueTicket(createInput().handoffId);
  current = new Date("2026-09-12T00:11:00.000Z");
  assert.throws(() => broker.scanTicket(issued.qr.payload, "inst_hospital_b"), (error) => error.code === "HANDOFF_EXPIRED");
  assert.throws(() => broker.scanTicket("https://hipass.example/t/not-a-ticket", "inst_hospital_b"), (error) => error instanceof MobileHandoffError && error.code === "TICKET_INVALID");

  current = new Date("2026-09-12T00:00:00.000Z");
  const second = new MobileHandoffBroker({ clock: () => current });
  second.createHandoff({ ...createInput(), handoffId: "hof_abcdefghijklmnop2" });
  const secondIssued = second.issueTicket("hof_abcdefghijklmnop2");
  second.revoke("hof_abcdefghijklmnop2");
  assert.throws(() => second.scanTicket(secondIssued.qr.payload, "inst_hospital_b"), (error) => error.code === "HANDOFF_REVOKED");
  assert.equal(second.getSession("hof_abcdefghijklmnop2").status, HandoffState.REVOKED);
});
