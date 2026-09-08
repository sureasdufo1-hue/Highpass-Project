import assert from "node:assert/strict";
import test from "node:test";

import { PrincipalRole } from "../src/auth.js";
import { PhrProviderErrorCode, SyntheticFhirProvider } from "../src/health-data-provider.js";
import { PhrAuditAction, PhrService } from "../src/phr-service.js";

const secret = "phr-service-test-secret-material-at-least-32-bytes";
const principalA = Object.freeze({
  subject: "synthetic-account-a",
  patientId: "P-1001",
  role: PrincipalRole.PATIENT,
  roles: [PrincipalRole.PATIENT],
});
const requestContext = Object.freeze({
  correlationId: "corr-phr-service-a",
  requestedAt: "2026-09-08T06:00:00Z",
  ipAddress: "127.0.0.1",
  userAgent: "phr-contract-test",
});

function harness(options = {}) {
  const auditLogs = [];
  const store = {
    saves: 0,
    async save() { this.saves += 1; },
  };
  const auditService = options.auditService ?? {
    async writeAudit(entry) { auditLogs.push(structuredClone(entry)); },
  };
  const provider = new SyntheticFhirProvider({
    cursorSecret: secret,
    clock: () => new Date("2026-09-08T06:00:00Z"),
  });
  return {
    auditLogs,
    store,
    service: new PhrService({ provider, auditService, store, referenceSecret: secret }),
  };
}

test("PHR-W04 summary returns an opaque patient reference and canonical request/allow audit", async () => {
  const { service, auditLogs, store } = harness();
  const result = await service.getSummary(principalA, requestContext);
  assert.equal(result.data.patient.displayName, "합성환자 A");
  assert.match(result.data.patient.patientRef, /^phr_[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(result).includes("P-1001"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-patient-a"), false);
  assert.deepEqual(auditLogs.map((entry) => entry.action), [
    PhrAuditAction.ACCESS_REQUESTED,
    PhrAuditAction.ACCESS_ALLOWED,
  ]);
  assert.ok(auditLogs.every((entry) => entry.auditSessionId === requestContext.correlationId));
  assert.ok(auditLogs.every((entry) => entry.actorId === principalA.subject));
  assert.equal(store.saves, 1);
});

test("PHR-W04 imaging API model exposes only opaque reference and approved mapping states", async () => {
  const { service, auditLogs } = harness();
  const result = await service.list("imaging-studies", principalA, {}, requestContext);
  assert.equal(result.data.length, 1);
  const imaging = result.data[0];
  assert.match(imaging.imagingStudyRef, /^phr_[A-Za-z0-9_-]{43}$/);
  assert.equal(imaging.mappingStatus, "MAPPED");
  assert.equal(imaging.accessStatus, "CONSENT_REQUIRED");
  assert.equal(imaging.sourceOrganizationRef, "HOSP-A");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("1.2.826"), false);
  assert.equal(serialized.includes("urn:dicom:uid"), false);
  assert.equal(serialized.includes("synthetic-imaging-a-ct"), false);
  assert.deepEqual(auditLogs.map((entry) => entry.action), [
    PhrAuditAction.ACCESS_REQUESTED,
    PhrAuditAction.IMAGING_MAPPING_CHECKED,
    PhrAuditAction.ACCESS_ALLOWED,
  ]);

  const detail = await service.getImagingStudy(imaging.imagingStudyRef, principalA, { ...requestContext, correlationId: "corr-detail-a" });
  assert.equal(detail.data.imagingStudyRef, imaging.imagingStudyRef);
  assert.equal(JSON.stringify(detail).includes("1.2.826"), false);
});

test("PHR-W04 patient binding denial is audited with no allowed event", async () => {
  const { service, auditLogs, store } = harness();
  await assert.rejects(
    service.getSummary({ ...principalA, patientId: "P-1002" }, requestContext),
    (error) => error.code === PhrProviderErrorCode.PATIENT_BINDING_MISMATCH,
  );
  assert.deepEqual(auditLogs.map((entry) => entry.action), [
    PhrAuditAction.ACCESS_REQUESTED,
    PhrAuditAction.ACCESS_DENIED,
  ]);
  assert.equal(auditLogs.at(-1).reasonCode, PhrProviderErrorCode.PATIENT_BINDING_MISMATCH);
  assert.equal(store.saves, 1);
});

test("PHR-W04 authenticated non-patient access is denied and audited with the actual actor type", async () => {
  const { service, auditLogs } = harness();
  await assert.rejects(
    service.getSummary({ subject: "DOC-A-01", role: PrincipalRole.DOCTOR, roles: [PrincipalRole.DOCTOR], patientId: null }, requestContext),
    (error) => error.code === PhrProviderErrorCode.PATIENT_BINDING_MISMATCH,
  );
  assert.deepEqual(auditLogs.map((entry) => entry.action), [
    PhrAuditAction.ACCESS_REQUESTED,
    PhrAuditAction.ACCESS_DENIED,
  ]);
  assert.ok(auditLogs.every((entry) => entry.actorType === PrincipalRole.DOCTOR));
  assert.ok(auditLogs.every((entry) => entry.actorId === "DOC-A-01"));
  assert.ok(auditLogs.every((entry) => entry.patientId === null));
});

test("PHR-W04 fails closed when the mandatory audit writer fails", async () => {
  const auditFailure = Object.assign(new Error("synthetic audit outage"), { code: "AUDIT_WRITE_FAILED" });
  const { service, store } = harness({ auditService: { async writeAudit() { throw auditFailure; } } });
  await assert.rejects(service.getSummary(principalA, requestContext), auditFailure);
  assert.equal(store.saves, 0);
});
