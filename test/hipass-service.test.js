import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import {
  AuthError,
  AuthMode,
  PrincipalRole,
  applyAuditScope,
  assertDoctorPrincipal,
  assertPatientPrincipal,
  authenticateRequest,
  createAuthenticationProvider,
  requireInternalService,
  validateAuthConfiguration,
} from "../src/auth.js";
import { TestKeyProvider } from "../src/key-provider.js";
import { validateProductionSecrets } from "../src/secrets.js";
import { HipassService, ServiceValidationError } from "../src/services.js";

async function createService(clock = () => "2026-06-25T10:00:00.000Z", options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-test-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  const service = new HipassService(store, clock, { tokenSecret: "test-secret-for-signed-token", ...options });
  return { dir, store, service };
}

function mockOrthanc() {
  return {
    qidoStudies: async () => ({
      status: 200,
      body: [{ "0020000D": { Value: ["1.2.410.100.1.20260620.001"] } }],
    }),
    qidoSeries: async () => ({
      status: 200,
      body: [
        { "0020000E": { Value: ["1.2.410.100.1.20260620.001.1"] } },
        { "0020000E": { Value: ["1.2.410.100.1.20260620.001.2"] } },
      ],
    }),
    qidoInstances: async () => ({
      status: 200,
      body: [{ "00080018": { Value: ["1.2.410.100.1.20260620.001.1.1"] } }],
    }),
    wadoInstance: async () => ({
      status: 200,
      contentType: "application/dicom",
      body: Buffer.from("DICM"),
    }),
  };
}

function failingOrthanc() {
  return {
    qidoStudies: async () => {
      throw new Error("ECONNREFUSED hospital-a-orthanc:8042");
    },
    qidoSeries: async () => {
      throw new Error("ECONNREFUSED hospital-a-orthanc:8042");
    },
    qidoInstances: async () => {
      throw new Error("ECONNREFUSED hospital-a-orthanc:8042");
    },
    wadoInstance: async () => {
      throw new Error("ECONNREFUSED hospital-a-orthanc:8042");
    },
  };
}

function consentInput(overrides = {}) {
  return {
    patientId: "P-1001",
    sourceHospitalId: "HOSP-A",
    targetHospitalId: "HOSP-B",
    purpose: "TREATMENT",
    permission: "VIEW_ONLY",
    validUntil: "2026-08-01T00:00:00.000Z",
    scopes: [
      {
        studyInstanceUid: "1.2.410.100.1.20260518.002",
      },
    ],
    ...overrides,
  };
}

function accessRequest(overrides = {}) {
  return {
    consentId: "CONSENT-DEMO-ACTIVE",
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: "1.2.410.100.1.20260620.001",
    purpose: "TREATMENT",
    requestedAction: "VIEW",
    ...overrides,
  };
}

async function assertAccessDenied(service, input, reasonCode) {
  const result = await service.evaluateDicomAccessRequest(input);
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, reasonCode);
  assert.match(result.auditSessionId, /^audit-session_/);
}

async function assertConsentValidation(service, input, code) {
  await assert.rejects(
    () => service.createConsent(input),
    (error) => error instanceof ServiceValidationError && error.code === code,
  );
}

test("creates active study-scoped consent with view-only permission", async () => {
  const { dir, store, service } = await createService();
  try {
    const consent = await service.createConsent(consentInput());

    assert.equal(consent.status, "ACTIVE");
    assert.equal(consent.effectiveStatus, "ACTIVE");
    assert.equal(consent.permission, "VIEW_ONLY");
    assert.equal(consent.purpose, "TREATMENT");
    assert.equal(consent.revokedAt, null);
    assert.equal(consent.scopes.length, 1);
    assert.equal(consent.scopes[0].studyInstanceUid, "1.2.410.100.1.20260518.002");
    assert.equal(consent.scopes[0].seriesInstanceUid, null);
    assert.equal(store.get("auditLogs").at(-1).action, "CONSENT_CREATED");
    assert.equal(store.get("auditLogs").at(-1).patientId, "P-1001");
    assert.equal(store.get("auditLogs").at(-1).consentId, consent.consentId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates series-scoped consent with download permission", async () => {
  const { dir, service } = await createService();
  try {
    const consent = await service.createConsent(consentInput({
      purpose: "CONSULTATION",
      permission: "DOWNLOAD_ALLOWED",
      scopes: [
        {
          studyInstanceUid: "1.2.410.100.1.20260620.001",
          seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
        },
      ],
    }));

    assert.equal(consent.permission, "DOWNLOAD_ALLOWED");
    assert.equal(consent.scopes[0].seriesInstanceUid, "1.2.410.100.1.20260620.001.1");
    assert.equal(service.checkAccess({
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "CONSULTATION",
      permission: "DOWNLOAD_ALLOWED",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }).allowed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gets and lists patient consents with scopes", async () => {
  const { dir, store, service } = await createService();
  try {
    const created = await service.createConsent(consentInput());
    const viewed = await service.viewConsent(created.consentId, "P-1001", { ipAddress: "127.0.0.1" });
    const patientConsents = service.listConsentsByPatient("P-1001");

    assert.equal(viewed.consentId, created.consentId);
    assert.equal(viewed.scopes.length, 1);
    assert.ok(patientConsents.some((consent) => consent.consentId === created.consentId));
    assert.equal(store.get("auditLogs").at(-1).action, "CONSENT_VIEWED");
    assert.equal(store.get("auditLogs").at(-1).consentId, created.consentId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("revokes active consent and records revoked timestamp", async () => {
  const { dir, store, service } = await createService();
  try {
    const created = await service.createConsent(consentInput());
    const revoked = await service.revokeConsent(created.consentId, "P-1001");

    assert.equal(revoked.status, "REVOKED");
    assert.equal(revoked.revokedAt, "2026-06-25T10:00:00.000Z");
    assert.equal(revoked.updatedAt, "2026-06-25T10:00:00.000Z");
    assert.equal(store.get("auditLogs").at(-1).action, "CONSENT_REVOKED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects invalid consent creation requests and writes failed audit", async () => {
  const { dir, store, service } = await createService();
  try {
    await assertConsentValidation(service, consentInput({ patientId: "P-9999" }), "PATIENT_NOT_FOUND");
    await assertConsentValidation(service, consentInput({ targetHospitalId: "HOSP-Z" }), "TARGET_HOSPITAL_NOT_FOUND");
    await assertConsentValidation(service, consentInput({ scopes: [{ studyInstanceUid: "NO-STUDY" }] }), "STUDY_NOT_FOUND");
    await assertConsentValidation(service, consentInput({
      patientId: "P-1002",
      sourceHospitalId: "HOSP-A",
      scopes: [{ studyInstanceUid: "1.2.410.100.1.20260518.002" }],
    }), "STUDY_PATIENT_MISMATCH");
    await assertConsentValidation(service, consentInput({
      scopes: [
        {
          studyInstanceUid: "1.2.410.100.1.20260620.001",
          seriesInstanceUid: "1.2.410.100.1.20260620.001.404",
        },
      ],
    }), "SERIES_NOT_FOUND");
    await assertConsentValidation(service, consentInput({ validUntil: "2026-06-01T00:00:00.000Z" }), "VALID_PERIOD_INVALID");
    await assertConsentValidation(service, consentInput({
      validFrom: "2026-05-01T00:00:00.000Z",
      validUntil: "2026-06-01T00:00:00.000Z",
    }), "VALID_UNTIL_EXPIRED");
    await assertConsentValidation(service, consentInput({ scopes: [] }), "CONSENT_SCOPE_REQUIRED");
    await assertConsentValidation(service, consentInput({ permission: "EDIT_ALLOWED" }), "PERMISSION_INVALID");
    await assertConsentValidation(service, consentInput({ purpose: "BILLING" }), "PURPOSE_INVALID");

    const failedAudits = store.get("auditLogs").filter((log) => log.action === "CONSENT_CREATE_FAILED");
    assert.equal(failedAudits.length, 10);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects duplicate revoke and expired revoke", async () => {
  const { dir, store, service } = await createService();
  try {
    const created = await service.createConsent(consentInput());
    await service.revokeConsent(created.consentId, "P-1001");
    await assert.rejects(
      () => service.revokeConsent(created.consentId, "P-1001"),
      (error) => error instanceof ServiceValidationError && error.code === "CONSENT_ALREADY_REVOKED",
    );

    store.get("consents").push({
      consentId: "CONSENT-EXPIRED-TEST",
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: "VIEW_ONLY",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2026-01-31T00:00:00.000Z",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
    });
    await assert.rejects(
      () => service.revokeConsent("CONSENT-EXPIRED-TEST", "P-1001"),
      (error) => error instanceof ServiceValidationError && error.code === "CONSENT_ALREADY_EXPIRED",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine allows access only when all RBAC and ABAC conditions match", async () => {
  const { dir, store, service } = await createService();
  try {
    const result = await service.evaluateDicomAccessRequest(accessRequest());

    assert.equal(result.decision, "ALLOWED");
    assert.match(result.auditSessionId, /^audit-session_/);
    const audit = store.get("auditLogs").at(-1);
    assert.equal(audit.action, "ACCESS_ALLOWED");
    assert.equal(audit.result, "SUCCESS");
    assert.equal(audit.consentId, "CONSENT-DEMO-ACTIVE");
    assert.equal(audit.patientId, "P-1001");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies missing consent and writes reason code", async () => {
  const { dir, store, service } = await createService();
  try {
    await assertAccessDenied(service, accessRequest({ consentId: "CONSENT-NOT-FOUND" }), "ACCESS_DENIED_NO_CONSENT");
    const audit = store.get("auditLogs").at(-1);
    assert.equal(audit.action, "ACCESS_DENIED");
    assert.equal(audit.reason, "ACCESS_DENIED_NO_CONSENT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies malformed access requests fail closed", async () => {
  const { dir, store, service } = await createService();
  try {
    await assertAccessDenied(service, { doctorId: "DOC-B-01" }, "INVALID_REQUEST");
    const audit = store.get("auditLogs").at(-1);
    assert.equal(audit.action, "ACCESS_DENIED");
    assert.equal(audit.reason, "INVALID_REQUEST");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies revoked, expired, and not-yet-valid consents", async () => {
  const { dir, store, service } = await createService();
  try {
    store.get("consents").push(
      {
        ...store.get("consents")[0],
        consentId: "CONSENT-REVOKED-POLICY",
        status: "REVOKED",
        revokedAt: "2026-06-10T00:00:00.000Z",
      },
      {
        ...store.get("consents")[0],
        consentId: "CONSENT-EXPIRED-POLICY",
        validUntil: "2026-06-01T00:00:00.000Z",
      },
      {
        ...store.get("consents")[0],
        consentId: "CONSENT-FUTURE-POLICY",
        validFrom: "2026-07-01T00:00:00.000Z",
        validUntil: "2026-08-01T00:00:00.000Z",
      },
    );
    for (const consentId of ["CONSENT-REVOKED-POLICY", "CONSENT-EXPIRED-POLICY", "CONSENT-FUTURE-POLICY"]) {
      store.get("consentScopes").push({
        ...store.get("consentScopes")[0],
        scopeId: `SCOPE-${consentId}`,
        consentId,
      });
    }

    await assertAccessDenied(service, accessRequest({ consentId: "CONSENT-REVOKED-POLICY" }), "CONSENT_REVOKED");
    await assertAccessDenied(service, accessRequest({ consentId: "CONSENT-EXPIRED-POLICY" }), "CONSENT_EXPIRED");
    await assertAccessDenied(service, accessRequest({ consentId: "CONSENT-FUTURE-POLICY" }), "CONSENT_NOT_YET_VALID");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies hospital and doctor hospital mismatches", async () => {
  const { dir, service } = await createService();
  try {
    await assertAccessDenied(service, accessRequest({ requestingHospitalId: "HOSP-C" }), "HOSPITAL_MISMATCH");
    await assertAccessDenied(service, accessRequest({ doctorId: "DOC-C-01" }), "DOCTOR_HOSPITAL_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies study and series scope mismatches", async () => {
  const { dir, service } = await createService();
  try {
    await assertAccessDenied(service, accessRequest({
      studyInstanceUid: "1.2.410.100.2.20260622.003",
    }), "STUDY_SCOPE_MISMATCH");
    await assertAccessDenied(service, accessRequest({
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.404",
    }), "SERIES_SCOPE_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies purpose mismatch and view-only download", async () => {
  const { dir, service } = await createService();
  try {
    await assertAccessDenied(service, accessRequest({ purpose: "CONSULTATION" }), "PURPOSE_MISMATCH");
    await assertAccessDenied(service, accessRequest({ requestedAction: "DOWNLOAD" }), "DOWNLOAD_NOT_ALLOWED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine denies non-doctor actors", async () => {
  const { dir, store, service } = await createService();
  try {
    store.get("doctors").push({
      doctorId: "USER-PATIENT-LIKE",
      name: "Non doctor test user",
      hospitalId: "HOSP-B",
      roles: ["Patient"],
      approvedPurposes: ["TREATMENT"],
    });

    await assertAccessDenied(service, accessRequest({ doctorId: "USER-PATIENT-LIKE" }), "INVALID_REQUEST");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("policy engine allows download when consent permission allows it", async () => {
  const { dir, service } = await createService();
  try {
    const consent = await service.createConsent(consentInput({
      purpose: "CONSULTATION",
      permission: "DOWNLOAD_ALLOWED",
      scopes: [
        {
          studyInstanceUid: "1.2.410.100.1.20260620.001",
          seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
        },
      ],
    }));
    const result = await service.evaluateDicomAccessRequest(accessRequest({
      consentId: consent.consentId,
      purpose: "CONSULTATION",
      requestedAction: "DOWNLOAD",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));

    assert.equal(result.decision, "ALLOWED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("issues short-lived signed DICOMweb token after policy allow", async () => {
  const { dir, store, service } = await createService();
  try {
    const result = await service.requestDicomAccessToken(accessRequest());
    const claims = decodeTokenPayload(result.accessToken);

    assert.equal(result.decision, "ALLOWED");
    assert.equal(result.expiresAt, "2026-06-25T10:05:00.000Z");
    assert.equal(result.allowedStudyUid, "1.2.410.100.1.20260620.001");
    assert.deepEqual(result.allowedSeriesUids, []);
    assert.equal(result.permission, "VIEW_ONLY");
    assert.equal(claims.consentId, "CONSENT-DEMO-ACTIVE");
    assert.equal(claims.doctorId, "DOC-B-01");
    assert.equal(claims.targetHospitalId, "HOSP-B");
    assert.equal(claims.studyInstanceUid, "1.2.410.100.1.20260620.001");
    assert.equal(claims.auditSessionId, result.auditSessionId);
    assert.equal(claims.patientId, undefined);
    assert.equal(store.get("dicomAccessTokenLogs").at(-1).status, "ACTIVE");
    assert.equal(store.get("auditLogs").at(-1).action, "TOKEN_ISSUED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not issue token for denied access request", async () => {
  const { dir, store, service } = await createService();
  try {
    const result = await service.requestDicomAccessToken(accessRequest({ requestedAction: "DOWNLOAD" }));

    assert.equal(result.decision, "DENIED");
    assert.equal(result.reasonCode, "DOWNLOAD_NOT_ALLOWED");
    assert.equal(result.accessToken, undefined);
    assert.equal(store.get("dicomAccessTokenLogs").length, 0);
    assert.equal(store.get("auditLogs").at(-1).action, "TOKEN_DENIED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("denies expired token and records TOKEN_EXPIRED", async () => {
  let now = "2026-06-25T10:00:00.000Z";
  const { dir, store, service } = await createService(() => now);
  try {
    const issued = await service.requestDicomAccessToken(accessRequest());
    now = "2026-06-25T10:06:00.000Z";
    const verified = await service.verifyDicomAccessToken(issued.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    });

    assert.equal(verified.active, false);
    assert.equal(verified.reason, "TOKEN_EXPIRED");
    assert.equal(store.get("dicomAccessTokenLogs").at(-1).status, "EXPIRED");
    assert.equal(store.get("auditLogs").at(-1).action, "TOKEN_EXPIRED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("denies token use outside study, series, hospital, and permission scope", async () => {
  const { dir, service } = await createService();
  try {
    const studyToken = await service.requestDicomAccessToken(accessRequest());
    assert.equal((await service.verifyDicomAccessToken(studyToken.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.2.20260622.003",
      requestedAction: "VIEW",
    })).reason, "TOKEN_STUDY_MISMATCH");
    assert.equal((await service.verifyDicomAccessToken(studyToken.accessToken, {
      targetHospitalId: "HOSP-C",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    })).reason, "TOKEN_HOSPITAL_MISMATCH");
    assert.equal((await service.verifyDicomAccessToken(studyToken.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "DOWNLOAD",
    })).reason, "TOKEN_PERMISSION_MISMATCH");

    const consent = await service.createConsent(consentInput({
      purpose: "CONSULTATION",
      permission: "DOWNLOAD_ALLOWED",
      scopes: [
        {
          studyInstanceUid: "1.2.410.100.1.20260620.001",
          seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
        },
      ],
    }));
    const seriesToken = await service.requestDicomAccessToken(accessRequest({
      consentId: consent.consentId,
      purpose: "CONSULTATION",
      requestedAction: "DOWNLOAD",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));
    assert.equal((await service.verifyDicomAccessToken(seriesToken.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.2",
      requestedAction: "VIEW",
    })).reason, "TOKEN_SERIES_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("blocks new token and existing token verification after consent revoke", async () => {
  const { dir, service } = await createService();
  try {
    const issued = await service.requestDicomAccessToken(accessRequest());
    await service.revokeConsent("CONSENT-DEMO-ACTIVE", "P-1001");
    const newToken = await service.requestDicomAccessToken(accessRequest());
    const existingToken = await service.verifyDicomAccessToken(issued.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    });

    assert.equal(newToken.decision, "DENIED");
    assert.equal(newToken.reasonCode, "CONSENT_REVOKED");
    assert.equal(newToken.accessToken, undefined);
    assert.equal(existingToken.active, false);
    assert.equal(existingToken.reason, "TOKEN_CONSENT_INACTIVE");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("denies invalid signature and tampered token", async () => {
  const { dir, service } = await createService();
  try {
    const issued = await service.requestDicomAccessToken(accessRequest());
    const badSignature = `${issued.accessToken.slice(0, -1)}x`;
    const tampered = tamperTokenPayload(issued.accessToken, { studyInstanceUid: "1.2.410.tampered" });

    assert.equal((await service.verifyDicomAccessToken(badSignature, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    })).reason, "TOKEN_INVALID");
    assert.equal((await service.verifyDicomAccessToken(tampered, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    })).reason, "TOKEN_INVALID");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway queries Orthanc only with valid scoped token", async () => {
  const { dir, store, service } = await createService(undefined, { orthancClient: mockOrthanc() });
  try {
    const token = await service.requestDicomAccessToken(accessRequest({
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));
    const studies = await service.gatewayListStudies(token.accessToken);
    const series = await service.gatewayListSeries(token.accessToken, "1.2.410.100.1.20260620.001");
    const instances = await service.gatewayListInstances(
      token.accessToken,
      "1.2.410.100.1.20260620.001",
      "1.2.410.100.1.20260620.001.1",
    );
    const instance = await service.gatewayRetrieveInstance(
      token.accessToken,
      "1.2.410.100.1.20260620.001",
      "1.2.410.100.1.20260620.001.1",
      "1.2.410.100.1.20260620.001.1.1",
    );

    assert.equal(studies.status, 200);
    assert.equal(series.body.length, 1);
    assert.equal(instances.status, 200);
    assert.equal(instance.status, 200);
    assert.equal(instance.body.toString(), "DICM");
    assert.ok(store.get("transferUsageLogs").length >= 4);
    assert.equal(store.get("transferUsageLogs").at(-1).sopInstanceUid, "1.2.410.100.1.20260620.001.1.1");
    assert.equal(store.get("auditLogs").at(-1).sopInstanceUid, "1.2.410.100.1.20260620.001.1.1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway returns sanitized upstream outage and records audit", async () => {
  const { dir, store, service } = await createService(undefined, { orthancClient: failingOrthanc() });
  try {
    const token = await service.requestDicomAccessToken(accessRequest({
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));
    const result = await service.gatewayListStudies(token.accessToken, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    });

    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: "ORTHANC_UNAVAILABLE" });
    assert.doesNotMatch(JSON.stringify(result.body), /ECONNREFUSED|hospital-a-orthanc|8042|stack/i);
    assert.equal(store.get("auditLogs").at(-1).result, "FAIL");
    assert.equal(store.get("auditLogs").at(-1).reason, "ORTHANC_UNAVAILABLE");
    assert.equal(store.get("transferUsageLogs").at(-1).bytesTransferred, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway denies missing, invalid, expired, hospital, study, series, and permission failures", async () => {
  let now = "2026-06-25T10:00:00.000Z";
  const { dir, service } = await createService(() => now, { orthancClient: mockOrthanc() });
  try {
    const token = await service.requestDicomAccessToken(accessRequest({
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));
    assert.equal((await service.gatewayListStudies(null)).body.error, "TOKEN_INVALID");
    assert.equal((await service.gatewayListStudies(`${token.accessToken}x`)).body.error, "TOKEN_INVALID");
    now = "2026-06-25T10:06:00.000Z";
    assert.equal((await service.gatewayListStudies(token.accessToken)).body.error, "TOKEN_EXPIRED");

    now = "2026-06-25T10:00:00.000Z";
    const fresh = await service.requestDicomAccessToken(accessRequest({
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    }));
    assert.equal((await service.gatewayListSeries(fresh.accessToken, "1.2.410.100.2.20260622.003")).body.error, "TOKEN_STUDY_MISMATCH");
    assert.equal((await service.gatewayListInstances(
      fresh.accessToken,
      "1.2.410.100.1.20260620.001",
      "1.2.410.100.1.20260620.001.2",
    )).body.error, "TOKEN_SERIES_MISMATCH");
    assert.equal((await service.verifyDicomAccessToken(fresh.accessToken, {
      targetHospitalId: "HOSP-C",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "VIEW",
    })).reason, "TOKEN_HOSPITAL_MISMATCH");
    assert.equal((await service.verifyDicomAccessToken(fresh.accessToken, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      requestedAction: "DOWNLOAD",
    })).reason, "TOKEN_PERMISSION_MISMATCH");
    assert.equal((await service.gatewayDownloadInstance(
      fresh.accessToken,
      "1.2.410.100.1.20260620.001",
      "1.2.410.100.1.20260620.001.1",
      "1.2.410.100.1.20260620.001.1.1",
    )).body.error, "TOKEN_PERMISSION_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("audit logs include standard fields and hash-chain integrity", async () => {
  const { dir, store, service } = await createService();
  try {
    await service.writeAudit({
      auditSessionId: "audit-session-login",
      actorType: "DOCTOR",
      actorId: "DOC-B-01",
      hospitalId: "HOSP-B",
      action: "LOGIN_SUCCESS",
      result: "SUCCESS",
      ipAddress: "127.0.0.1",
    });
    await service.writeAudit({
      auditSessionId: "audit-session-login",
      actorType: "DOCTOR",
      actorId: "DOC-B-01",
      hospitalId: "HOSP-B",
      action: "LOGIN_FAILED",
      result: "FAIL",
      reason: "INVALID_CREDENTIALS",
      ipAddress: "127.0.0.1",
    });

    const latest = store.get("auditLogs").at(-1);
    assert.equal(latest.hospitalId, "HOSP-B");
    assert.equal(latest.reasonCode, "INVALID_CREDENTIALS");
    assert.match(latest.recordHash, /^sha256:/);
    assert.match(latest.previousHash, /^sha256:/);
    assert.deepEqual(service.verifyAuditIntegrity(), { ok: true, checked: 2 });

    latest.action = "TAMPERED";
    assert.equal(service.verifyAuditIntegrity().ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detects bulk image access with configurable threshold", async () => {
  const { dir, service } = await createService(undefined, {
    anomalyRules: {
      bulkAccessThreshold: 3,
      bulkAccessWindowMinutes: 5,
      repeatedFailureThreshold: 99,
    },
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      await service.writeAudit({
        auditSessionId: "bulk-session",
        actorType: "GATEWAY",
        actorId: "gateway",
        hospitalId: "HOSP-B",
        action: "IMAGE_VIEWED",
        result: "SUCCESS",
        studyInstanceUid: `1.2.410.bulk.${index}`,
      });
    }

    assert.equal(service.listAnomalyAlerts()[0].action, "BULK_ACCESS_DETECTED");
    assert.equal(service.listAnomalyAlerts()[0].reasonCode, "BULK_ACCESS_ALERT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detects repeated failures and expired token abuse", async () => {
  const { dir, service } = await createService(undefined, {
    anomalyRules: {
      repeatedFailureThreshold: 2,
      repeatedFailureWindowMinutes: 10,
      expiredTokenThreshold: 2,
      expiredTokenWindowMinutes: 10,
    },
  });
  try {
    await service.writeAudit({
      auditSessionId: "failure-session",
      actorType: "GATEWAY",
      actorId: "gateway",
      action: "TOKEN_INVALID",
      result: "FAIL",
      reason: "TOKEN_INVALID",
    });
    await service.writeAudit({
      auditSessionId: "failure-session",
      actorType: "GATEWAY",
      actorId: "gateway",
      action: "ACCESS_DENIED",
      result: "FAIL",
      reason: "STUDY_SCOPE_MISMATCH",
    });
    await service.writeAudit({
      auditSessionId: "expired-session",
      actorType: "GATEWAY",
      actorId: "expired-token-user",
      action: "TOKEN_EXPIRED",
      result: "FAIL",
      reason: "TOKEN_EXPIRED",
    });
    await service.writeAudit({
      auditSessionId: "expired-session",
      actorType: "GATEWAY",
      actorId: "expired-token-user",
      action: "TOKEN_EXPIRED",
      result: "FAIL",
      reason: "TOKEN_EXPIRED",
    });

    const actions = service.listAnomalyAlerts().map((log) => log.action);
    assert.ok(actions.includes("REPEATED_ACCESS_FAILURE"));
    assert.ok(actions.includes("EXPIRED_TOKEN_ABUSE"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detects unusual download pattern and blocks audit mutation", async () => {
  const { dir, service } = await createService(() => "2026-06-25T02:00:00.000Z", {
    anomalyRules: {
      unusualDownloadThreshold: 2,
      unusualDownloadWindowMinutes: 60,
      unusualDownloadStartHour: 0,
      unusualDownloadEndHour: 6,
      repeatedFailureThreshold: 99,
    },
  });
  try {
    await service.writeAudit({
      auditSessionId: "download-session",
      actorType: "GATEWAY",
      actorId: "gateway",
      hospitalId: "HOSP-B",
      action: "IMAGE_DOWNLOADED",
      result: "SUCCESS",
      studyInstanceUid: "1.2.410.download.1",
    });
    await service.writeAudit({
      auditSessionId: "download-session",
      actorType: "GATEWAY",
      actorId: "gateway",
      hospitalId: "HOSP-B",
      action: "IMAGE_DOWNLOADED",
      result: "SUCCESS",
      studyInstanceUid: "1.2.410.download.2",
    });
    await service.recordAuditMutationDenied({ actorId: "SECURITY_ADMIN", ipAddress: "127.0.0.1" });

    const actions = service.listAnomalyAlerts().map((log) => log.action);
    assert.ok(actions.includes("UNUSUAL_DOWNLOAD_PATTERN"));
    assert.equal(service.listAuditLogs({ action: "AUDIT_LOG_MUTATION_DENIED" })[0].reasonCode, "AUDIT_LOG_APPEND_ONLY");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prepares research dataset with pseudonymized DICOM header and masked report", async () => {
  const { dir, store, service } = await createService();
  try {
    const originalPatient = { ...store.get("patients").find((patient) => patient.patientId === "P-1001") };
    const dataset = service.prepareResearchDataset({
      studyInstanceUid: "1.2.410.100.1.20260518.002",
      reportText: "Name: Virtual Patient, PatientID: P-1001, Address: Demo-gu 1, Phone: 010-1234-5678. Chest CT clear.",
    });

    assert.equal(dataset.purpose, "RESEARCH");
    assert.equal(dataset.originalDataPolicy, "ORIGINAL_DICOM_REMAINS_IN_ORTHANC_OR_SOURCE_PACS");
    assert.equal(dataset.dicomHeader.PatientName, "REMOVED");
    assert.match(dataset.dicomHeader.PatientID, /^R-PSEUDO-/);
    assert.notEqual(dataset.dicomHeader.PatientID, "P-1001");
    assert.match(dataset.dicomHeader.StudyInstanceUID, /^2\.25\.\d+$/);
    assert.notEqual(dataset.dicomHeader.StudyInstanceUID, "1.2.410.100.1.20260518.002");
    assert.match(dataset.dicomHeader.SeriesInstanceUIDs[0], /^2\.25\.\d+$/);
    assert.notEqual(dataset.dicomHeader.SeriesInstanceUIDs[0], "1.2.410.100.1.20260518.002.1");
    assert.equal(dataset.dicomHeader.StudyDate, "2026");
    assert.equal(dataset.dicomHeader.BodyPartExamined, "CHEST");
    assert.equal(dataset.dicomHeader.PatientBirthDate, "REMOVED");
    assert.equal(dataset.dicomHeader.PatientAddress, "REMOVED");
    assert.equal(dataset.dicomHeader.PatientTelephoneNumbers, "REMOVED");
    assert.equal(dataset.dicomHeader.OtherPatientIDs, "REMOVED");
    assert.equal(dataset.dicomHeader.InstitutionName, "VIRTUAL_HOSPITAL");
    assert.match(dataset.report, /\[NAME\]/);
    assert.match(dataset.report, /\[PATIENT_ID\]/);
    assert.match(dataset.report, /\[ADDRESS\]/);
    assert.match(dataset.report, /\[PHONE\]/);
    assert.deepEqual(store.get("patients").find((patient) => patient.patientId === "P-1001"), originalPatient);
    assert.equal(store.get("pseudonymMappings").length, 1);
    assert.equal(store.get("pseudonymMappings")[0].patientId, "P-1001");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("research release gate requires minimum dataset and k-anonymity thresholds", async () => {
  const { dir, service } = await createService();
  try {
    const request = await service.requestResearchExport({
      requesterId: "RESEARCHER-003",
      studyInstanceUid: "1.2.410.100.1.20260518.002",
      purpose: "Small sample research",
    });
    await service.decideResearchExport(request.requestId, {
      approverId: "SECURITY-ADMIN-001",
      decision: "APPROVED",
    });
    const exported = await service.exportResearchDataset(request.requestId);

    assert.equal(request.releaseDecision, "HUMAN_REVIEW_REQUIRED");
    assert.ok(["MIN_DATASET_SIZE_NOT_MET", "K_ANONYMITY_NOT_MET"].includes(request.releaseReason));
    assert.equal(exported.decision, "DENIED");
    assert.ok(["MIN_DATASET_SIZE_NOT_MET", "K_ANONYMITY_NOT_MET"].includes(exported.reasonCode));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("blocks research export before approval and allows it after approval", async () => {
  const { dir, store, service } = await createService(undefined, {
    deIdentificationPolicy: {
      kAnonymityThreshold: 1,
      minimumDatasetSize: 1,
    },
  });
  try {
    const requested = await service.requestResearchExport({
      requesterId: "RESEARCHER-001",
      studyInstanceUid: "1.2.410.100.1.20260518.002",
      purpose: "AI model validation",
    });
    const blocked = await service.exportResearchDataset(requested.requestId);
    const approved = await service.decideResearchExport(requested.requestId, {
      approverId: "SECURITY-ADMIN-001",
      decision: "APPROVED",
      reason: "MVP approved sample dataset",
    });
    assert.equal(approved.status, "APPROVED");
    const exported = await service.exportResearchDataset(requested.requestId);

    assert.equal(requested.status, "REQUESTED");
    assert.equal(blocked.decision, "DENIED");
    assert.equal(blocked.reasonCode, "RESEARCH_EXPORT_NOT_APPROVED");
    assert.equal(exported.decision, "ALLOWED");
    assert.equal(exported.dataset.dicomHeader.PatientName, "REMOVED");
    assert.equal(exported.request.status, "EXPORTED");
    const actions = store.get("auditLogs").map((log) => log.action);
    assert.ok(actions.includes("RESEARCH_EXPORT_REQUESTED"));
    assert.ok(actions.includes("RESEARCH_EXPORT_BLOCKED"));
    assert.ok(actions.includes("RESEARCH_EXPORT_APPROVED"));
    assert.ok(actions.includes("RESEARCH_EXPORT_COMPLETED"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("marks high-risk facial imaging and blocks research export without verified defacing", async () => {
  const { dir, store, service } = await createService();
  try {
    store.get("imagingStudies").push({
      studyId: "STUDY-FACE-001",
      patientId: "P-1001",
      sourceHospitalId: "HOSP-A",
      studyInstanceUid: "1.2.410.100.1.20260626.009",
      modality: "CT",
      bodyPart: "FACE",
      studyDate: "2026-06-26",
      description: "Facial CT 3D reconstruction",
      metadataOnly: true,
      series: [
        {
          seriesInstanceUid: "1.2.410.100.1.20260626.009.1",
          modality: "CT",
          description: "Face 3D",
          instanceCount: 120,
          bytes: 120_000_000,
          previewImageUrl: null,
        },
      ],
    });
    const requested = await service.requestResearchExport({
      requesterId: "RESEARCHER-002",
      studyInstanceUid: "1.2.410.100.1.20260626.009",
      purpose: "Facial CT cohort",
    });
    await service.decideResearchExport(requested.requestId, {
      approverId: "SECURITY-ADMIN-001",
      decision: "APPROVED",
    });
    const exported = await service.exportResearchDataset(requested.requestId);

    assert.equal(requested.highRiskImage, true);
    assert.equal(requested.datasetPreview.riskLevel, "HIGH_RISK_IMAGE");
    assert.equal(requested.datasetPreview.defacingStatus, "NOT_IMPLEMENTED");
    assert.equal(exported.decision, "DENIED");
    assert.equal(exported.reasonCode, "HIGH_RISK_IMAGE_EXPORT_BLOCKED");
    assert.equal(store.get("auditLogs").at(-1).reasonCode, "HIGH_RISK_IMAGE_EXPORT_BLOCKED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("development mock authentication binds patient and doctor principal values", () => {
  const patient = authenticateRequest({
    headers: {
      "x-hipass-role": "PATIENT",
      "x-hipass-user-id": "P-1001",
      "x-hipass-patient-id": "P-1001",
    },
  }, { AUTH_MODE: "DEVELOPMENT_MOCK" });
  assertPatientPrincipal(patient, "P-1001");
  assert.throws(() => assertPatientPrincipal(patient, "P-1002"), (error) => (
    error instanceof AuthError && error.code === "PATIENT_IDENTITY_MISMATCH"
  ));

  const doctor = authenticateRequest({
    headers: {
      "x-hipass-role": "DOCTOR",
      "x-hipass-user-id": "DOC-B-01",
      "x-hipass-doctor-id": "DOC-B-01",
      "x-hipass-hospital-id": "HOSP-B",
    },
  }, { AUTH_MODE: "DEVELOPMENT_MOCK" });
  assertDoctorPrincipal(doctor, { doctorId: "DOC-B-01", hospitalId: "HOSP-B" });
  assert.throws(() => assertDoctorPrincipal(doctor, { doctorId: "DOC-A-01", hospitalId: "HOSP-B" }), (error) => (
    error instanceof AuthError && error.code === "DOCTOR_IDENTITY_MISMATCH"
  ));
  assert.throws(() => assertDoctorPrincipal(doctor, { doctorId: "DOC-B-01", hospitalId: "HOSP-C" }), (error) => (
    error instanceof AuthError && error.code === "HOSPITAL_IDENTITY_MISMATCH"
  ));
});

test("mock authentication is disabled unless explicitly configured and internal service needs token", () => {
  assert.throws(() => authenticateRequest({ headers: { "x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001" } }, {}), (error) => (
    error instanceof AuthError && error.code === "AUTH_MODE_REQUIRED"
  ));
  assert.throws(() => authenticateRequest({ headers: { "x-hipass-role": "INTERNAL_SERVICE" } }, { AUTH_MODE: "DEVELOPMENT_MOCK" }), (error) => (
    error instanceof AuthError && error.code === "INTERNAL_SERVICE_HEADER_FORBIDDEN"
  ));

  const internal = authenticateRequest({
    headers: { "x-hipass-service-token": "test-service-token" },
  }, { HIPASS_INTERNAL_SERVICE_TOKEN: "test-service-token" });
  requireInternalService(internal);
});

test("production startup rejects development mock authentication", () => {
  assert.throws(() => validateAuthConfiguration({
    NODE_ENV: "production",
    AUTH_MODE: AuthMode.DEVELOPMENT_MOCK,
  }), (error) => error instanceof AuthError && error.code === "PRODUCTION_MOCK_AUTH_FORBIDDEN");
});

test("test authentication provider verifies JWT issuer, audience, exp, and principal claims", () => {
  const env = {
    NODE_ENV: "test",
    AUTH_MODE: AuthMode.TEST,
    JWT_ISSUER: "hipass-test",
    JWT_AUDIENCE: "hipass-api",
    TEST_JWT_SECRET: "test-jwt-secret",
  };
  const provider = createAuthenticationProvider(env);
  const token = signTestJwt({
    iss: "hipass-test",
    aud: "hipass-api",
    sub: "doctor-subject",
    userId: "DOC-B-01",
    doctorId: "DOC-B-01",
    hospitalId: "HOSP-B",
    roles: ["DOCTOR"],
    scope: "dicom:request",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  }, env.TEST_JWT_SECRET);

  const principal = authenticateRequest({ headers: { authorization: `Bearer ${token}` } }, env, provider);
  assert.equal(principal.authMode, "TEST");
  assert.equal(principal.doctorId, "DOC-B-01");
  assertDoctorPrincipal(principal, { doctorId: "DOC-B-01", hospitalId: "HOSP-B" });

  const wrongIssuer = signTestJwt({
    iss: "wrong",
    aud: "hipass-api",
    sub: "doctor-subject",
    doctorId: "DOC-B-01",
    hospitalId: "HOSP-B",
    roles: ["DOCTOR"],
    exp: Math.floor(Date.now() / 1000) + 300,
  }, env.TEST_JWT_SECRET);
  assert.throws(() => authenticateRequest({ headers: { authorization: `Bearer ${wrongIssuer}` } }, env, provider), (error) => (
    error instanceof AuthError && error.code === "JWT_ISSUER_INVALID"
  ));

  const expired = signTestJwt({
    iss: "hipass-test",
    aud: "hipass-api",
    sub: "doctor-subject",
    doctorId: "DOC-B-01",
    hospitalId: "HOSP-B",
    roles: ["DOCTOR"],
    exp: Math.floor(Date.now() / 1000) - 1,
  }, env.TEST_JWT_SECRET);
  assert.throws(() => authenticateRequest({ headers: { authorization: `Bearer ${expired}` } }, env, provider), (error) => (
    error instanceof AuthError && error.code === "JWT_EXPIRED"
  ));
});

test("audit log read scope allows security admin and narrows hospital admin", () => {
  const securityAdmin = { role: PrincipalRole.SECURITY_ADMIN };
  assert.deepEqual(applyAuditScope(securityAdmin, { result: "FAIL" }), { result: "FAIL" });

  const hospitalAdmin = { role: PrincipalRole.HOSPITAL_ADMIN, hospitalId: "HOSP-B" };
  assert.deepEqual(applyAuditScope(hospitalAdmin, { result: "FAIL", hospitalId: "HOSP-A" }), {
    result: "FAIL",
    hospitalId: "HOSP-B",
  });

  assert.throws(() => applyAuditScope({ role: PrincipalRole.DOCTOR }, {}), (error) => (
    error instanceof AuthError && error.code === "ROLE_NOT_ALLOWED"
  ));
});

test("retention purge planning is dry-run and does not delete token logs", async () => {
  const { dir, store, service } = await createService(() => "2026-06-25T10:00:00.000Z");
  try {
    const token = await service.requestDicomAccessToken(accessRequest());
    const plan = service.planRetentionPurge();

    assert.equal(plan.mode, "DRY_RUN");
    assert.equal(plan.destructiveActionTaken, false);
    assert.ok(plan.policies.some((item) => item.dataType === "PSEUDONYM_MAPPING"));
    assert.ok(store.get("dicomAccessTokenLogs").some((item) => item.tokenId === decodeTokenPayload(token.accessToken).jti));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("retention enforce requires deletion approval and respects legal hold", async () => {
  const { dir, store, service } = await createService(() => "2026-06-25T10:00:00.000Z");
  try {
    const token = await service.requestDicomAccessToken(accessRequest());
    const tokenId = decodeTokenPayload(token.accessToken).jti;
    const tokenLog = store.get("dicomAccessTokenLogs").find((item) => item.tokenId === tokenId);
    tokenLog.expiresAt = "2026-01-01T00:00:00.000Z";
    store.set("retentionDeletionApprovals", [{
      dataType: "ACCESS_TOKEN_LOG",
      recordId: tokenId,
      status: "APPROVED",
      approvedBy: "SEC-ADMIN-01",
    }]);
    store.set("retentionLegalHolds", [{
      dataType: "ACCESS_TOKEN_LOG",
      recordId: tokenId,
      active: true,
      reason: "dispute-review",
    }]);

    const held = service.planRetentionPurge({ HIPASS_TOKEN_LOG_RETENTION_DAYS: "1" });
    assert.equal(held.candidates[0].action, "KEEP_LEGAL_HOLD");

    const result = await service.executeRetentionPurge({
      RETENTION_PURGE_MODE: "ENFORCE",
      RETENTION_ALLOW_SYNTHETIC_DELETE: "true",
      HIPASS_TOKEN_LOG_RETENTION_DAYS: "1",
    });
    assert.equal(result.destructiveActionTaken, false);
    assert.ok(store.get("dicomAccessTokenLogs").some((item) => item.tokenId === tokenId));

    store.set("retentionLegalHolds", []);
    const deleted = await service.executeRetentionPurge({
      RETENTION_PURGE_MODE: "ENFORCE",
      RETENTION_ALLOW_SYNTHETIC_DELETE: "true",
      HIPASS_TOKEN_LOG_RETENTION_DAYS: "1",
    });
    assert.equal(deleted.destructiveActionTaken, true);
    assert.ok(!store.get("dicomAccessTokenLogs").some((item) => item.tokenId === tokenId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pseudonym mapping includes protected reference and local key provider marker", async () => {
  const { dir, store, service } = await createService();
  try {
    service.prepareResearchDataset({
      studyInstanceUid: "1.2.410.100.1.20260518.002",
    });
    const mapping = store.get("pseudonymMappings")[0];

    assert.equal(mapping.patientId, "P-1001");
    assert.match(mapping.protectedPatientRef, /^protected:[a-f0-9]{64}$/);
    assert.equal(mapping.keyProvider, "LOCAL_DEVELOPMENT_HMAC");
    assert.equal(mapping.keyId, "dicom-local-key-v1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("signed DICOM access token includes kid and rejects unknown key id", async () => {
  const { dir, service } = await createService(() => "2026-06-25T10:00:00.000Z", {
    dicomTokenKeyProvider: new TestKeyProvider("token-key-material", "token-key-v1"),
  });
  try {
    const issued = await service.requestDicomAccessToken(accessRequest());
    assert.equal(decodeTokenHeader(issued.accessToken).kid, "token-key-v1");
    assert.equal(decodeTokenPayload(issued.accessToken).kid, "token-key-v1");

    const invalidKid = replaceTokenHeader(issued.accessToken, { kid: "missing-key" }, "token-key-material");
    const rejected = await service.verifyDicomAccessToken(invalidKid, {
      targetHospitalId: "HOSP-B",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });
    assert.equal(rejected.active, false);
    assert.equal(rejected.reason, "TOKEN_INVALID");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production secret validation rejects placeholders", () => {
  const result = validateProductionSecrets({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://hipass:replace-with-real-password@db/hipass",
    DICOM_TOKEN_SECRET: "replace-with-dicom-token-secret",
    HIPASS_INTERNAL_SERVICE_TOKEN: "replace-with-service-token",
    JWT_ISSUER: "https://idp.example.test",
    JWT_AUDIENCE: "hipass-api",
    JWT_PUBLIC_KEY: "replace-with-public-key",
    AUDIT_HASH_SECRET: "replace-with-audit-secret",
    PSEUDONYM_HMAC_SECRET: "replace-with-pseudonym-secret",
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.name === "DICOM_TOKEN_SECRET"));
});

test("denies access when no matching consent exists", async () => {
  const { dir, service } = await createService();
  try {
    const result = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-C",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "ACCESS_DENIED_NO_CONSENT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("issues short lived token for consented study", async () => {
  const { dir, service } = await createService();
  try {
    const result = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, "TOKEN_ISSUED");
    assert.match(result.token.token, /^dicom_/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("revoked consent invalidates active tokens", async () => {
  const { dir, store, service } = await createService();
  try {
    const tokenResult = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });

    await service.revokeConsent("CONSENT-DEMO-ACTIVE", "P-1001");
    const token = store.get("dicomAccessTokenLogs").find((item) => item.token === tokenResult.token.token);

    assert.equal(token.status, "REVOKED");
    assert.equal(service.introspectToken(tokenResult.token.token).active, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("series request writes audit and transfer usage logs", async () => {
  const { dir, store, service } = await createService();
  try {
    const tokenResult = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });

    const series = await service.listSeries(
      tokenResult.token.token,
      "1.2.410.100.1.20260620.001",
      "AUDIT-TEST-001",
    );

    assert.equal(series.status, 200);
    assert.equal(series.body.length, 2);
    assert.equal(series.body[0].previewImageUrl, "/assets/demo-mri.png");
    assert.equal(store.get("transferUsageLogs").length, 1);
    assert.equal(store.get("transferUsageLogs")[0].transferMode, "DIRECT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("study WADO simulation writes study audit and transfer usage logs", async () => {
  const { dir, store, service } = await createService();
  try {
    const tokenResult = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
    });

    const result = await service.retrieveStudy(
      tokenResult.token.token,
      "1.2.410.100.1.20260620.001",
      "AUDIT-TEST-STUDY",
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.retrievalMode, "WADO_RS_STUDY_SIMULATION");
    assert.equal(store.get("auditLogs").at(-1).action, "IMAGE_VIEWED");
    assert.equal(store.get("transferUsageLogs").at(-1).bytesTransferred, 169_200_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("series WADO simulation enforces token series scope", async () => {
  const { dir, service } = await createService();
  try {
    const tokenResult = await service.requestDicomAccess({
      patientId: "P-1001",
      doctorId: "DOC-B-01",
      sourceHospitalId: "HOSP-A",
      targetHospitalId: "HOSP-B",
      purpose: "treatment",
      studyInstanceUid: "1.2.410.100.1.20260620.001",
      seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    });

    const result = await service.retrieveSeries(
      tokenResult.token.token,
      "1.2.410.100.1.20260620.001",
      "1.2.410.100.1.20260620.001.2",
      "AUDIT-TEST-SERIES",
    );

    assert.equal(result.status, 403);
    assert.equal(result.body.error, "TOKEN_SERIES_MISMATCH");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function decodeTokenPayload(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

function decodeTokenHeader(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

function tamperTokenPayload(token, overrides) {
  const [header, payload, signature] = token.split(".");
  const claims = {
    ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    ...overrides,
  };
  return `${header}.${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${signature}`;
}

function replaceTokenHeader(token, overrides, secret) {
  const [header, payload] = token.split(".");
  const nextHeader = {
    ...JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    ...overrides,
  };
  const encodedHeader = Buffer.from(JSON.stringify(nextHeader), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`${encodedHeader}.${payload}`).digest("base64url");
  return `${encodedHeader}.${payload}.${signature}`;
}

function signTestJwt(claims, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
