import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HealthDataProviderStatus,
  MyHealthWayProvider,
  PhrProviderError,
  PhrProviderErrorCode,
  SyntheticFhirProvider,
} from "../src/health-data-provider.js";

const cursorSecret = "synthetic-provider-test-cursor-secret-32-bytes";
const fixedDate = new Date("2026-09-08T05:00:00Z");
const contextA = Object.freeze({
  principalSubject: "synthetic-account-a",
  patientRef: "P-1001",
  correlationId: "corr-synthetic-a",
});
const contextB = Object.freeze({
  principalSubject: "synthetic-account-b",
  patientRef: "P-1002",
  correlationId: "corr-synthetic-b",
});

function provider(options = {}) {
  return new SyntheticFhirProvider({ cursorSecret, clock: () => fixedDate, ...options });
}

function assertProviderError(operation, statusCode, code) {
  assert.throws(operation, (error) => (
    error instanceof PhrProviderError
    && error.statusCode === statusCode
    && error.code === code
  ));
}

test("PHR-W03 Synthetic Provider advertises only offline R4 capabilities", () => {
  assert.deepEqual(provider().getCapabilities(), {
    providerId: "synthetic-r4",
    status: HealthDataProviderStatus.AVAILABLE,
    fhirVersion: "4.0.1",
    synthetic: true,
    resources: ["Patient", "Encounter", "Condition", "MedicationRequest", "Observation", "DiagnosticReport", "ImagingStudy"],
    maxPageSize: 50,
    externalNetworkRequired: false,
  });
});

test("PHR-W03 returns the bound patient record with common metadata and no cross-patient resources", () => {
  const result = provider().getPatientRecord(contextA);
  assert.equal(result.meta.sourceProvider, "synthetic-r4");
  assert.equal(result.meta.fhirVersion, "4.0.1");
  assert.equal(result.meta.synthetic, true);
  assert.equal(result.meta.retrievedAt, fixedDate.toISOString());
  assert.equal(result.meta.correlationId, contextA.correlationId);
  assert.equal(result.data.patients[0].id, "synthetic-patient-a");
  assert.equal(result.data.imagingStudies[0].id, "synthetic-imaging-a-ct");
  assert.equal(JSON.stringify(result).includes("synthetic-patient-b"), false);

  const resultB = provider().getPatientRecord(contextB);
  assert.equal(resultB.data.patients[0].id, "synthetic-patient-b");
  assert.equal(JSON.stringify(resultB).includes("synthetic-patient-a"), false);
});

test("PHR-W03 rejects missing context, account/patient mismatch, and short cursor secrets fail closed", () => {
  const synthetic = provider();
  assertProviderError(() => synthetic.getPatientRecord({}), 401, PhrProviderErrorCode.AUTHENTICATION_REQUIRED);
  assertProviderError(
    () => synthetic.getPatientRecord({ ...contextA, patientRef: "P-1002" }),
    403,
    PhrProviderErrorCode.PATIENT_BINDING_MISMATCH,
  );
  assertProviderError(
    () => new SyntheticFhirProvider({ cursorSecret: "short" }),
    500,
    PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED,
  );
});

test("PHR-W03 uses patient/filter-bound opaque pagination and rejects tampering or replay", () => {
  const synthetic = provider();
  const first = synthetic.listImagingStudies(contextA, { limit: 1 });
  assert.equal(first.data.length, 1);
  assert.equal(first.meta.page.nextCursor, null);

  assertProviderError(
    () => synthetic.listImagingStudies(contextA, { limit: 0 }),
    413,
    PhrProviderErrorCode.PAYLOAD_LIMIT_EXCEEDED,
  );
  assertProviderError(
    () => synthetic.listImagingStudies(contextA, { patientId: "P-1002" }),
    422,
    PhrProviderErrorCode.RESOURCE_UNSUPPORTED,
  );
  assertProviderError(
    () => synthetic.listImagingStudies(contextA, { from: "2020-01-01", to: "2026-01-01" }),
    413,
    PhrProviderErrorCode.PAYLOAD_LIMIT_EXCEEDED,
  );
  assertProviderError(
    () => synthetic.listImagingStudies(contextA, { cursor: "1.invalid", limit: 1 }),
    400,
    PhrProviderErrorCode.CURSOR_INVALID,
  );

  const original = readFileSync("test/fixtures/phr/r4/v1/patient-a-bundle.json", "utf8");
  const expanded = JSON.parse(original);
  const extra = structuredClone(expanded.entry.find((entry) => entry.resource.resourceType === "Observation"));
  extra.fullUrl = "urn:uuid:10000000-0000-4000-8000-000000000099";
  extra.resource.id = "synthetic-observation-a-2";
  extra.resource.effectiveDateTime = "2026-05-19T01:30:00Z";
  expanded.entry.push(extra);

  const tempRoot = mkdtempSync(path.join(tmpdir(), "highpass-phr-provider-"));
  cpSync("test/fixtures/phr/r4/v1", tempRoot, { recursive: true });
  writeFileSync(path.join(tempRoot, "patient-a-bundle.json"), JSON.stringify(expanded));
  const manifestPath = path.join(tempRoot, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files["patient-a-bundle.json"] = createHash("sha256").update(readFileSync(path.join(tempRoot, "patient-a-bundle.json"))).digest("hex");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const paged = provider({ fixtureRoot: tempRoot });
  const page1 = paged.listObservations(contextA, { limit: 1 });
  assert.ok(page1.meta.page.nextCursor);
  assert.doesNotMatch(page1.meta.page.nextCursor, /P-1001|synthetic-account-a/);
  const page2 = paged.listObservations(contextA, { limit: 1, cursor: page1.meta.page.nextCursor });
  assert.equal(page2.data.length, 1);
  assert.notEqual(page1.data[0].id, page2.data[0].id);
  assertProviderError(
    () => paged.listObservations(contextB, { limit: 1, cursor: page1.meta.page.nextCursor }),
    400,
    PhrProviderErrorCode.CURSOR_INVALID,
  );
  assertProviderError(
    () => paged.listObservations(contextA, { limit: 2, cursor: page1.meta.page.nextCursor }),
    400,
    PhrProviderErrorCode.CURSOR_INVALID,
  );
});

test("PHR-W03 validates immutable fixture hashes before serving any record", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "highpass-phr-tamper-"));
  cpSync("test/fixtures/phr/r4/v1", tempRoot, { recursive: true });
  writeFileSync(path.join(tempRoot, "patient-a-bundle.json"), "{}");
  assertProviderError(
    () => provider({ fixtureRoot: tempRoot }),
    500,
    PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED,
  );
});

test("PHR-W03 MyHealthWay remains NOT_CONFIGURED and performs no external call", () => {
  let outboundCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    outboundCalls += 1;
    throw new Error("network must not be called");
  };
  try {
    const myHealthWay = new MyHealthWayProvider();
    assert.equal(myHealthWay.getCapabilities().status, HealthDataProviderStatus.NOT_CONFIGURED);
    assertProviderError(
      () => myHealthWay.getPatientRecord(contextA),
      503,
      PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED,
    );
    assertProviderError(
      () => myHealthWay.listImagingStudies(contextA),
      503,
      PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED,
    );
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
