import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveLiveStatus,
  findSyntaxConflicts,
  maskUid,
  validateUidSyntax,
  verifyPhrImagingMappings,
} from "../scripts/verify-phr-imaging-mapping.js";

const identity = { patientRef: "P-1001", dicomPatientId: "P-1001", sourceOrganizationRef: "HOSP-A" };
const seriesUid = "1.2.826.0.1.3680043.10.5432.20260908.1001.1.1";
const mapping = {
  mappingRef: "imgmap-test-1",
  providerId: "synthetic-r4",
  sourceOrganizationRef: "HOSP-A",
  patientRef: "P-1001",
  fhirImagingStudyId: "study-1",
  studyInstanceUid: "1.2.826.0.1.3680043.10.5432.20260908.1001.1",
  allowedSeriesUids: [seriesUid],
  mappingStatus: "MAPPED",
};

function fakePacs({ study, seriesUids = [], fail = null } = {}) {
  return {
    async findStudy() {
      if (fail) throw Object.assign(new Error("boom"), { status: fail });
      return study;
    },
    async listSeriesUids() {
      if (fail) throw Object.assign(new Error("boom"), { status: fail });
      return seriesUids;
    },
  };
}

test("valid synthetic UID passes syntax validation", () => {
  assert.equal(validateUidSyntax(mapping.studyInstanceUid), null);
  assert.equal(validateUidSyntax(seriesUid), null);
});

test("malformed UID is rejected (CONFLICT path)", () => {
  assert.equal(validateUidSyntax("1.2.410.100.1.20260620.001."), "UID_SYNTAX_INVALID");
  assert.equal(validateUidSyntax("01.2.3"), "UID_LEADING_ZERO");
  assert.equal(validateUidSyntax("abc.123"), "UID_SYNTAX_INVALID");
  assert.equal(validateUidSyntax(`${"9".repeat(65)}.1`), "UID_TOO_LONG");
});

test("study present with matching binding and series is MAPPED", async () => {
  const derived = await deriveLiveStatus(mapping, identity, fakePacs({
    study: { patientId: "P-1001" },
    seriesUids: [seriesUid, "1.2.3.4"],
  }));
  assert.equal(derived.status, "MAPPED");
});

test("absent study is NOT_MAPPED (PHR-T05 negative case)", async () => {
  const derived = await deriveLiveStatus(mapping, identity, fakePacs({ study: null }));
  assert.equal(derived.status, "NOT_MAPPED");
});

test("allowed series missing in PACS is CONFLICT", async () => {
  const derived = await deriveLiveStatus(mapping, identity, fakePacs({
    study: { patientId: "P-1001" },
    seriesUids: [],
  }));
  assert.equal(derived.status, "CONFLICT");
  assert.ok(derived.reasons.some((reason) => reason.startsWith("ALLOWED_SERIES_MISSING:")));
});

test("patient binding mismatch against PACS is CONFLICT", async () => {
  const derived = await deriveLiveStatus(mapping, identity, fakePacs({
    study: { patientId: "P-9999" },
    seriesUids: [seriesUid],
  }));
  assert.equal(derived.status, "CONFLICT");
  assert.ok(derived.reasons.includes("PATIENT_BINDING_MISMATCH"));
});

test("same study UID bound to two patients is CONFLICT without PACS access", async () => {
  const conflicting = [
    mapping,
    { ...mapping, mappingRef: "imgmap-test-2", patientRef: "P-1002", mappingStatus: "NOT_MAPPED" },
  ];
  const conflicts = findSyntaxConflicts(conflicting);
  assert.ok(conflicts.get("imgmap-test-1").includes("STUDY_UID_SHARED_ACROSS_PATIENT_OR_SOURCE"));
  assert.ok(conflicts.get("imgmap-test-2").includes("STUDY_UID_SHARED_ACROSS_PATIENT_OR_SOURCE"));
});

test("unreachable PACS yields SOURCE_UNAVAILABLE and stops fail-closed", async () => {
  const { results, sourceUnavailable } = await verifyPhrImagingMappings({
    mappings: [mapping, { ...mapping, mappingRef: "imgmap-test-2", fhirImagingStudyId: "study-2", studyInstanceUid: "1.2.826.0.1.3680043.10.5432.20260908.1001.2", allowedSeriesUids: ["1.2.826.0.1.3680043.10.5432.20260908.1001.2.1"] }],
    identities: [identity],
    pacs: fakePacs({ fail: 503 }),
  });
  assert.equal(sourceUnavailable, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].liveStatus, "SOURCE_UNAVAILABLE");
  assert.equal(results[0].agreement, "MISMATCH");
});

test("fixture and live disagreement is reported as MISMATCH", async () => {
  const { results } = await verifyPhrImagingMappings({
    mappings: [{ ...mapping, mappingStatus: "NOT_MAPPED" }],
    identities: [identity],
    pacs: fakePacs({ study: { patientId: "P-1001" }, seriesUids: [seriesUid] }),
  });
  assert.equal(results[0].liveStatus, "MAPPED");
  assert.equal(results[0].agreement, "MISMATCH");
});

test("report masks raw UIDs and endpoints", () => {
  const masked = maskUid(mapping.studyInstanceUid);
  assert.match(masked, /^sha256:[0-9a-f]{12}$/);
});
