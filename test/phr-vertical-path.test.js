import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PrincipalRole } from "../src/auth.js";
import { SyntheticFhirProvider } from "../src/health-data-provider.js";
import { PhrService } from "../src/phr-service.js";
import { HipassService } from "../src/services.js";
import { JsonStore } from "../src/store.js";

const PHR_STUDY_UID = "1.2.826.0.1.3680043.10.5432.20260908.1001.1";
const PHR_SERIES_UID = "1.2.826.0.1.3680043.10.5432.20260908.1001.1.1";
const PHR_SOP_UID = "1.2.826.0.1.3680043.10.5432.20260908.1001.1.1.1";
const SECRET = "phr-vertical-test-secret-material-at-least-32-byt";

function echoOrthanc() {
  return {
    qidoStudies: async () => ({
      status: 200,
      body: [{ "0020000D": { Value: [PHR_STUDY_UID] } }],
    }),
    qidoSeries: async (_studyUid, seriesUid) => ({
      status: 200,
      body: [{ "0020000E": { Value: [seriesUid ?? PHR_SERIES_UID] } }],
    }),
    qidoInstances: async () => ({
      status: 200,
      body: [{ "00080018": { Value: [PHR_SOP_UID] } }],
    }),
    wadoInstance: async () => ({
      status: 200,
      contentType: "application/dicom",
      body: Buffer.from("DICM"),
    }),
  };
}

async function createStack() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-phr-vertical-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  const service = new HipassService(store, () => "2026-09-08T10:00:00.000Z", {
    tokenSecret: SECRET,
    orthancClient: echoOrthanc(),
  });
  const phrService = new PhrService({
    provider: new SyntheticFhirProvider({ cursorSecret: SECRET }),
    auditService: service,
    consentService: service,
    store,
    referenceSecret: `${SECRET}-reference`,
  });
  return { dir, store, service, phrService };
}

const principal = Object.freeze({
  subject: "synthetic-account-a",
  role: PrincipalRole.PATIENT,
  patientId: "P-1001",
});
const context = { correlationId: "phr-vertical-w07-correlation" };

test("PHR-W07 vertical path: mapped study -> patient consent -> doctor token -> gateway QIDO/WADO", async () => {
  const { dir, store, service, phrService } = await createStack();
  try {
    const listing = await phrService.list("imaging-studies", principal, {}, context);
    const mapped = listing.data.find((item) => item.mappingStatus === "MAPPED");
    assert.ok(mapped, "expected one MAPPED imaging study");
    assert.equal(mapped.accessStatus, "CONSENT_REQUIRED");

    const consentResult = await phrService.createConsentFromImagingStudy(mapped.imagingStudyRef, principal, {
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: "VIEW_ONLY",
      validUntil: "2026-09-15T00:00:00.000Z",
    }, context);
    assert.equal(consentResult.data.status, "ACTIVE");
    assert.equal(consentResult.data.scopeCount, 1);
    assert.equal(JSON.stringify(consentResult).includes(PHR_STUDY_UID), false);
    const consentId = consentResult.data.consentId;

    const consent = store.get("consents").find((item) => item.consentId === consentId);
    assert.equal(consent.sourceHospitalId, "HOSP-A");
    const scope = store.get("consentScopes").find((item) => item.consentId === consentId);
    assert.equal(scope.studyInstanceUid, PHR_STUDY_UID);
    assert.equal(scope.seriesInstanceUid, PHR_SERIES_UID);

    const token = await service.requestDicomAccessToken({
      consentId,
      doctorId: "DOC-B-01",
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: PHR_STUDY_UID,
      purpose: "TREATMENT",
      requestedAction: "VIEW",
    });
    assert.equal(token.decision, "ALLOWED");

    const studies = await service.gatewayListStudies(token.accessToken, { ipAddress: "127.0.0.1", userAgent: "phr-test" });
    assert.equal(studies.status, 200);
    const series = await service.gatewayListSeries(token.accessToken, PHR_STUDY_UID);
    assert.equal(series.status, 200);
    const instances = await service.gatewayListInstances(token.accessToken, PHR_STUDY_UID, PHR_SERIES_UID);
    assert.equal(instances.status, 200);
    const instance = await service.gatewayRetrieveInstance(token.accessToken, PHR_STUDY_UID, PHR_SERIES_UID, PHR_SOP_UID);
    assert.equal(instance.status, 200);

    const denied = await service.requestDicomAccessToken({
      consentId,
      doctorId: "DOC-B-01",
      requestingHospitalId: "HOSP-B",
      studyInstanceUid: PHR_STUDY_UID,
      purpose: "TREATMENT",
      requestedAction: "DOWNLOAD",
    });
    assert.equal(denied.decision, "DENIED");
    assert.equal(denied.reasonCode, "DOWNLOAD_NOT_ALLOWED");

    const audit = store.get("auditLogs");
    assert.ok(audit.some((entry) => entry.action === "PHR_SHARE_INTENT_CREATED" && entry.consentId === consentId && entry.result === "SUCCESS"));
    assert.ok(audit.some((entry) => entry.action === "CONSENT_CREATED" && entry.consentId === consentId));
    assert.ok(audit.some((entry) => entry.action === "ACCESS_TOKEN_ISSUED" || String(entry.action).includes("TOKEN")));
    const shareAudits = audit.filter((entry) => String(entry.action).startsWith("PHR_"));
    assert.equal(JSON.stringify(shareAudits).includes(PHR_STUDY_UID), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PHR-W07 fails closed for unmapped studies, foreign refs, and malformed bodies", async () => {
  const { dir, phrService } = await createStack();
  try {
    const listing = await phrService.list("imaging-studies", principal, {}, context);
    const mapped = listing.data.find((item) => item.mappingStatus === "MAPPED");

    await assert.rejects(
      () => phrService.createConsentFromImagingStudy("phr_not_a_real_reference_at_all", principal, {
        targetHospitalId: "HOSP-B", purpose: "TREATMENT", permission: "VIEW_ONLY", validUntil: "2026-09-15T00:00:00.000Z",
      }, context),
      (error) => error.statusCode === 404,
    );

    const doctorPrincipal = { subject: "DOC-B-01", role: PrincipalRole.DOCTOR, doctorId: "DOC-B-01", hospitalId: "HOSP-B" };
    await assert.rejects(
      () => phrService.createConsentFromImagingStudy(mapped.imagingStudyRef, doctorPrincipal, {}, context),
      (error) => error.statusCode === 403 && error.code === "PHR_PATIENT_BINDING_MISMATCH",
    );

    await assert.rejects(
      () => phrService.createConsentFromImagingStudy(mapped.imagingStudyRef, principal, {
        purpose: "TREATMENT", permission: "VIEW_ONLY", validUntil: "2026-09-15T00:00:00.000Z",
      }, context),
      (error) => error.statusCode === 422 && error.code === "PHR_CONSENT_REQUEST_INVALID",
    );

    const patientB = { subject: "synthetic-account-b", role: PrincipalRole.PATIENT, patientId: "P-1002" };
    const listingB = await phrService.list("imaging-studies", patientB, {}, { correlationId: "phr-vertical-w07-b" });
    const unmapped = listingB.data.find((item) => item.mappingStatus === "NOT_MAPPED");
    assert.ok(unmapped, "expected patient B to have a NOT_MAPPED imaging study");
    await assert.rejects(
      () => phrService.createConsentFromImagingStudy(unmapped.imagingStudyRef, patientB, {
        targetHospitalId: "HOSP-A", purpose: "TREATMENT", permission: "VIEW_ONLY", validUntil: "2026-09-15T00:00:00.000Z",
      }, { correlationId: "phr-vertical-w07-b" }),
      (error) => error.statusCode === 403 && error.code === "PHR_IMAGING_NOT_MAPPED",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
