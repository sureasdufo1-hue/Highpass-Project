import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createSeedData } from "../src/seed.js";

const fixtureRoot = path.resolve("test/fixtures/phr/r4/v1");
const requiredClinicalTypes = new Set([
  "Patient",
  "Encounter",
  "Condition",
  "MedicationRequest",
  "Observation",
  "DiagnosticReport",
  "ImagingStudy",
]);
const uidPattern = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*$/;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resources(bundle) {
  return bundle.entry.map((entry) => entry.resource);
}

function resourceKey(resource) {
  return `${resource.resourceType}/${resource.id}`;
}

function collectReferences(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === "reference" && typeof child === "string") output.push(child);
    collectReferences(child, output);
  }
  return output;
}

function dicomUids(bundle) {
  const result = new Set();
  for (const resource of resources(bundle).filter((item) => item.resourceType === "ImagingStudy")) {
    for (const identifier of resource.identifier ?? []) {
      if (identifier.system === "urn:dicom:uid") result.add(identifier.value.replace(/^urn:oid:/, ""));
    }
    for (const series of resource.series ?? []) {
      result.add(series.uid);
      for (const instance of series.instance ?? []) result.add(instance.uid);
    }
  }
  return result;
}

test("PHR-W02 manifest pins every synthetic fixture and the Orthanc seed contract", () => {
  const manifest = readJson("manifest.json");
  assert.equal(manifest.fixtureVersion, "phr-r4-v1");
  assert.equal(manifest.fhirVersion, "4.0.1");
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.clinicalUseProhibited, true);
  assert.equal(manifest.review.status, "PENDING_OWNER_REVIEW");

  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    assert.match(expectedHash, /^[a-f0-9]{64}$/);
    assert.equal(sha256(path.join(fixtureRoot, relativePath)), expectedHash, `${relativePath} checksum changed without a fixture version update`);
  }
  assert.equal(sha256(path.resolve(manifest.orthancSeed.source)), manifest.orthancSeed.sha256);
});

test("PHR-W02 patient bundles have the R4 minimum set and closed local references", () => {
  for (const file of ["patient-a-bundle.json", "patient-b-bundle.json"]) {
    const bundle = readJson(file);
    assert.equal(bundle.resourceType, "Bundle");
    assert.equal(bundle.type, "collection");
    assert.equal(bundle.meta.versionId, "phr-r4-v1");

    const bundleResources = resources(bundle);
    const keys = new Set(bundleResources.map(resourceKey));
    assert.equal(keys.size, bundleResources.length, `${file} contains duplicate resource type/id keys`);
    for (const type of requiredClinicalTypes) {
      assert.ok(bundleResources.some((resource) => resource.resourceType === type), `${file} is missing ${type}`);
    }
    assert.equal(bundleResources.filter((resource) => resource.resourceType === "Patient").length, 1);

    for (const reference of collectReferences(bundle)) {
      assert.doesNotMatch(reference, /^(?:https?:)?\/\//i, `${file} contains an external reference`);
      assert.ok(keys.has(reference), `${file} has an unresolved reference: ${reference}`);
    }

    const patientKey = resourceKey(bundleResources.find((resource) => resource.resourceType === "Patient"));
    for (const resource of bundleResources.filter((item) => item.subject)) {
      assert.equal(resource.subject.reference, patientKey, `${resourceKey(resource)} crosses the patient boundary`);
    }
    assert.equal(JSON.stringify(bundle).includes('"endpoint"'), false);
  }
});

test("PHR-W02 A and B identities, business identifiers, resource IDs, and DICOM UIDs never overlap", () => {
  const identityMap = readJson("identity-map.synthetic.json");
  const [aBinding, bBinding] = identityMap.bindings;
  for (const field of ["accountSubject", "patientRef", "sourceOrganizationRef", "fhirPatientId", "dicomPatientId"]) {
    assert.notEqual(aBinding[field], bBinding[field], `${field} must be isolated`);
  }
  assert.notDeepEqual(aBinding.fhirIdentifier, bBinding.fhirIdentifier);

  const aBundle = readJson("patient-a-bundle.json");
  const bBundle = readJson("patient-b-bundle.json");
  const aResourceIds = new Set(resources(aBundle).map(resourceKey));
  const bResourceIds = new Set(resources(bBundle).map(resourceKey));
  assert.deepEqual([...aResourceIds].filter((id) => bResourceIds.has(id)), []);

  const aUids = dicomUids(aBundle);
  const bUids = dicomUids(bBundle);
  assert.deepEqual([...aUids].filter((uid) => bUids.has(uid)), []);
  for (const uid of [...aUids, ...bUids]) {
    assert.ok(uid.length <= 64 && uidPattern.test(uid), `invalid DICOM UID: ${uid}`);
  }
});

test("PHR-W02 imaging mapping matches patient, organization, FHIR UID, and current Highpass seed", () => {
  const identityMap = readJson("identity-map.synthetic.json");
  const imagingMap = readJson("imaging-map.synthetic.json");
  const seed = createSeedData();
  const bundleByPatientRef = new Map([
    ["P-1001", readJson("patient-a-bundle.json")],
    ["P-1002", readJson("patient-b-bundle.json")],
  ]);

  assert.equal(new Set(imagingMap.mappings.map((mapping) => mapping.mappingRef)).size, imagingMap.mappings.length);
  for (const mapping of imagingMap.mappings) {
    const binding = identityMap.bindings.find((item) => item.patientRef === mapping.patientRef);
    assert.ok(binding, `identity binding missing for ${mapping.patientRef}`);
    assert.equal(binding.sourceOrganizationRef, mapping.sourceOrganizationRef);

    const imagingStudy = resources(bundleByPatientRef.get(mapping.patientRef))
      .find((resource) => resource.resourceType === "ImagingStudy" && resource.id === mapping.fhirImagingStudyId);
    assert.ok(imagingStudy, `FHIR ImagingStudy missing for ${mapping.mappingRef}`);
    const identifier = imagingStudy.identifier.find((item) => item.system === "urn:dicom:uid");
    assert.equal(identifier.value, mapping.fhirStudyUidOriginal);
    assert.equal(identifier.value, `urn:oid:${mapping.studyInstanceUid}`);

    if (mapping.mappingStatus === "MAPPED") {
      assert.ok(mapping.gatewayRef);
      assert.ok(seed.gateways.some((gateway) => gateway.gatewayId === mapping.gatewayRef && gateway.hospitalId === mapping.sourceOrganizationRef));
      const orthancSeedSource = readFileSync(mapping.pacsEvidence.seedSource, "utf8");
      assert.match(orthancSeedSource, new RegExp(mapping.studyInstanceUid.replaceAll(".", "\\.")));
      mapping.pacsEvidence.sopInstanceUids.forEach((uid) => assert.ok(orthancSeedSource.includes(uid)));
    } else {
      assert.equal(mapping.mappingStatus, "NOT_MAPPED");
      assert.equal(mapping.gatewayRef, null);
      assert.equal(mapping.pacsEvidence, null);
      assert.equal(seed.imagingStudies.some((study) => study.studyInstanceUid === mapping.studyInstanceUid), false);
    }
  }
});

test("PHR-W02 preserves coded values and provided units without inventing cross-patient content", () => {
  const a = resources(readJson("patient-a-bundle.json"));
  const b = resources(readJson("patient-b-bundle.json"));
  const aObservation = a.find((resource) => resource.resourceType === "Observation");
  const bObservation = b.find((resource) => resource.resourceType === "Observation");
  assert.deepEqual(aObservation.valueQuantity, {
    value: 13.2,
    unit: "g/dL",
    system: "http://unitsofmeasure.org",
    code: "g/dL",
  });
  assert.deepEqual(bObservation.valueQuantity, {
    value: 72,
    unit: "beats/minute",
    system: "http://unitsofmeasure.org",
    code: "/min",
  });
  assert.equal(JSON.stringify(a).includes("synthetic-patient-b"), false);
  assert.equal(JSON.stringify(b).includes("synthetic-patient-a"), false);
});
