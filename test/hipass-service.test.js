import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
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

function tamperTokenPayload(token, overrides) {
  const [header, payload, signature] = token.split(".");
  const claims = {
    ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    ...overrides,
  };
  return `${header}.${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${signature}`;
}
