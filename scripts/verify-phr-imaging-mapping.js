import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OrthancClient } from "../src/orthanc-client.js";

const UID_PATTERN = /^[0-9]+(\.[0-9]+)*$/;
const UID_MAX_LENGTH = 64;
const UID_COMPONENT_MAX_LENGTH = 20;

export function validateUidSyntax(uid) {
  if (typeof uid !== "string" || !UID_PATTERN.test(uid)) return "UID_SYNTAX_INVALID";
  if (uid.length > UID_MAX_LENGTH) return "UID_TOO_LONG";
  for (const component of uid.split(".")) {
    if (component.length > UID_COMPONENT_MAX_LENGTH) return "UID_COMPONENT_TOO_LONG";
    if (component.length > 1 && component.startsWith("0")) return "UID_LEADING_ZERO";
  }
  return null;
}

export function maskUid(uid) {
  return `sha256:${createHash("sha256").update(String(uid)).digest("hex").slice(0, 12)}`;
}

export function findSyntaxConflicts(mappings) {
  const conflicts = new Map();
  const addConflict = (mappingRef, reason) => {
    const list = conflicts.get(mappingRef) ?? [];
    list.push(reason);
    conflicts.set(mappingRef, list);
  };
  const byStudyUid = new Map();
  for (const mapping of mappings) {
    const studyIssue = validateUidSyntax(mapping.studyInstanceUid);
    if (studyIssue) addConflict(mapping.mappingRef, `STUDY_${studyIssue}`);
    for (const seriesUid of mapping.allowedSeriesUids ?? []) {
      const seriesIssue = validateUidSyntax(seriesUid);
      if (seriesIssue) addConflict(mapping.mappingRef, `SERIES_${seriesIssue}`);
    }
    const seen = byStudyUid.get(mapping.studyInstanceUid) ?? [];
    seen.push(mapping);
    byStudyUid.set(mapping.studyInstanceUid, seen);
  }
  for (const group of byStudyUid.values()) {
    if (group.length < 2) continue;
    const crossPatient = group.some((a) => group.some((b) =>
      a !== b && (a.patientRef !== b.patientRef || a.sourceOrganizationRef !== b.sourceOrganizationRef)));
    if (crossPatient) {
      for (const mapping of group) addConflict(mapping.mappingRef, "STUDY_UID_SHARED_ACROSS_PATIENT_OR_SOURCE");
    } else {
      for (const mapping of group) addConflict(mapping.mappingRef, "DUPLICATE_STUDY_UID_MAPPING");
    }
  }
  return conflicts;
}

export async function deriveLiveStatus(mapping, identity, pacs) {
  const expectedPatientId = identity?.dicomPatientId ?? null;
  const study = await pacs.findStudy(mapping.studyInstanceUid);
  if (!study) return { status: "NOT_MAPPED", reasons: ["STUDY_NOT_IN_PACS"] };
  const reasons = [];
  if (!expectedPatientId) reasons.push("IDENTITY_BINDING_MISSING");
  else if (study.patientId !== expectedPatientId) reasons.push("PATIENT_BINDING_MISMATCH");
  const seriesUids = await pacs.listSeriesUids(mapping.studyInstanceUid);
  for (const allowedSeriesUid of mapping.allowedSeriesUids ?? []) {
    if (!seriesUids.includes(allowedSeriesUid)) reasons.push(`ALLOWED_SERIES_MISSING:${maskUid(allowedSeriesUid)}`);
  }
  if (reasons.length > 0) return { status: "CONFLICT", reasons };
  return { status: "MAPPED", reasons: ["PACS_STUDY_AND_SERIES_CONFIRMED"] };
}

export async function verifyPhrImagingMappings({ mappings, identities, pacs, now = () => new Date() }) {
  const identityByPatientRef = new Map(identities.map((identity) => [identity.patientRef, identity]));
  const syntaxConflicts = findSyntaxConflicts(mappings);
  const results = [];
  let sourceUnavailable = false;
  for (const mapping of mappings) {
    const conflicts = syntaxConflicts.get(mapping.mappingRef) ?? [];
    if (conflicts.length > 0) {
      results.push(record(mapping, "CONFLICT", conflicts, "STATIC_VALIDATION", mapping.mappingStatus, now));
      continue;
    }
    let derived;
    try {
      derived = await deriveLiveStatus(mapping, identityByPatientRef.get(mapping.patientRef), pacs);
    } catch (error) {
      sourceUnavailable = true;
      derived = { status: "SOURCE_UNAVAILABLE", reasons: [`PACS_REQUEST_FAILED:${error.status ?? error.code ?? "ERROR"}`] };
    }
    results.push(record(mapping, derived.status, derived.reasons, "LIVE_QIDO_READ", mapping.mappingStatus, now));
    if (sourceUnavailable) break;
  }
  return { results, sourceUnavailable };
}

function record(mapping, liveStatus, reasons, mode, fixtureStatus, now) {
  return {
    mappingRef: mapping.mappingRef,
    patientRef: mapping.patientRef,
    sourceOrganizationRef: mapping.sourceOrganizationRef,
    studyUidRef: maskUid(mapping.studyInstanceUid),
    allowedSeriesUidRefs: (mapping.allowedSeriesUids ?? []).map(maskUid),
    verificationMode: mode,
    fixtureStatus,
    liveStatus,
    agreement: fixtureStatus === liveStatus ? "PASS" : "MISMATCH",
    reasons,
    verifiedAt: now().toISOString(),
  };
}

async function buildPacsAdapter() {
  const client = new OrthancClient();
  return {
    async findStudy(studyInstanceUid) {
      const study = await client.findStudyByUid(studyInstanceUid);
      if (!study) return null;
      return { patientId: study.PatientMainDicomTags?.PatientID ?? null };
    },
    async listSeriesUids(studyInstanceUid) {
      const response = await client.qidoSeries(studyInstanceUid);
      if (response.status !== 200) throw Object.assign(new Error("QIDO_SERIES_FAILED"), { status: response.status });
      return response.body.map((series) => series["0020000E"]?.Value?.[0]).filter(Boolean);
    },
  };
}

export async function main() {
  const fixtureDir = process.env.PHR_FIXTURE_DIR ?? "test/fixtures/phr/r4/v1";
  const mappings = JSON.parse(readFileSync(path.resolve(fixtureDir, "imaging-map.synthetic.json"), "utf8")).mappings;
  const identities = JSON.parse(readFileSync(path.resolve(fixtureDir, "identity-map.synthetic.json"), "utf8")).bindings;
  const { results, sourceUnavailable } = await verifyPhrImagingMappings({ mappings, identities, pacs: await buildPacsAdapter() });
  const report = {
    check: "PHR-W06 imaging mapping live verification",
    tests: {
      "PHR-T04": results.some((r) => r.mappingRef === "imgmap-synthetic-a-ct-v1" && r.liveStatus === "MAPPED" && r.agreement === "PASS") ? "PASS" : "FAIL",
      "PHR-T05": results.some((r) => r.mappingRef === "imgmap-synthetic-b-cr-v1" && r.liveStatus === "NOT_MAPPED" && r.agreement === "PASS") ? "PASS" : "FAIL",
    },
    sourceUnavailable,
    orthancEndpointRef: maskUid(process.env.ORTHANC_REST_URL ?? "http://hospital-a-orthanc:8042"),
    synthetic: true,
    generatedAt: new Date().toISOString(),
    results,
  };
  report.overall = report.tests["PHR-T04"] === "PASS" && report.tests["PHR-T05"] === "PASS" && !sourceUnavailable ? "PASS" : "FAIL";
  const evidenceRoot = process.env.PHR_EVIDENCE_DIR ?? "evidence/generated";
  const evidenceFile = process.env.PHR_EVIDENCE_FILE
    ? path.resolve(process.env.PHR_EVIDENCE_FILE)
    : path.join(evidenceRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}`, "phr-imaging-mapping-live.json");
  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, `${JSON.stringify(report, null, 2)}\n`);
  for (const result of results) {
    console.log(`${result.mappingRef}: fixture=${result.fixtureStatus} live=${result.liveStatus} ${result.agreement} [${result.reasons.join(",")}]`);
  }
  console.log(`PHR-T04 ${report.tests["PHR-T04"]} / PHR-T05 ${report.tests["PHR-T05"]} / overall ${report.overall}`);
  console.log(`evidence: ${evidenceFile}`);
  if (sourceUnavailable) process.exitCode = 2;
  else if (report.overall !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
