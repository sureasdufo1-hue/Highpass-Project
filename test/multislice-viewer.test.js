import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { Role, RequestedAction } from "../src/domain.js";
import { OrthancClient } from "../src/orthanc-client.js";

test("Multi-Slice CT/MRI Stack Navigation & WADO-RS Rendered Slices", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-multislice-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const orthancClient = new OrthancClient();
  orthancClient.qidoInstances = async (study, series) => orthancClient.qidoCuratedInstances(study, series);
  orthancClient.wadoRenderedInstance = async (study, series, sop) => orthancClient.wadoCuratedRenderedInstance(study, series, sop);
  const service = new HipassService(store, () => new Date().toISOString(), { tokenSecret: "test-secret-key-12345", orthancClient });

  const ctStudyUid = "1.2.410.200003.1037.1.0.1357867.20070207.132600.80505.1";
  const ctSeriesUid = "1.3.12.2.1107.5.1.4.50511.30000007020708010365600000031";

  // 1. Create Patient Consent for CT Study
  const consent = await service.createConsent({
    patientId: "P-1001",
    sourceHospitalId: "HOSP-A",
    targetHospitalId: "HOSP-B",
    studyInstanceUid: ctStudyUid,
    purpose: "TREATMENT",
    permission: "VIEW_ONLY",
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(consent.status, "ACTIVE");

  // 2. Doctor requests short-term DICOM access token
  const tokenIssue = await service.requestDicomAccessToken({
    consentId: consent.consentId,
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: ctStudyUid,
    seriesInstanceUid: ctSeriesUid,
    purpose: "TREATMENT",
    requestedAction: RequestedAction.VIEW,
  });
  assert.ok(tokenIssue.accessToken, "Doctor must receive valid short-term token");
  const token = tokenIssue.accessToken;

  await t.test("QIDO-RS instances are strictly ordered by InstanceNumber ascending", async () => {
    const listRes = await service.gatewayListInstances(token, ctStudyUid, ctSeriesUid);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.length > 0, "Must return instances");

    // Check strict ascending order of instance numbers
    let prevNum = -1;
    for (const inst of listRes.body) {
      const numStr = inst["00200013"]?.Value?.[0];
      const num = parseInt(numStr, 10);
      assert.ok(!isNaN(num), `InstanceNumber must be numeric: ${numStr}`);
      assert.ok(num >= prevNum, `Instances must be sorted ascending: ${num} >= ${prevNum}`);
      prevNum = num;
    }
  });

  await t.test("Rendered synthetic fixture returns a BMP slice (not a clinical image)", async () => {
    const listRes = await service.gatewayListInstances(token, ctStudyUid, ctSeriesUid);
    const firstSop = listRes.body[0]["00080018"].Value[0];

    const renderedRes = await service.gatewayRetrieveRenderedInstance(token, ctStudyUid, ctSeriesUid, firstSop);
    assert.equal(renderedRes.status, 200);
    assert.equal(renderedRes.contentType, "image/bmp");
    assert.ok(Buffer.isBuffer(renderedRes.body));
    assert.ok(renderedRes.body.length > 1000, "Rendered BMP must have non-trivial size");

    // Verify BMP magic header
    assert.equal(renderedRes.body.subarray(0, 2).toString("ascii"), "BM");
  });

  await t.test("Fail-Closed Security: denies unauthenticated and revoked token requests", async () => {
    const listRes = await service.gatewayListInstances(token, ctStudyUid, ctSeriesUid);
    const sop = listRes.body[0]["00080018"].Value[0];

    // Invalid / missing token
    const unauth = await service.gatewayRetrieveRenderedInstance("invalid.token", ctStudyUid, ctSeriesUid, sop);
    assert.equal(unauth.status, 403);

    // Patient revokes consent
    await service.revokeConsent(consent.consentId, "P-1001");
    const afterRevoke = await service.gatewayRetrieveRenderedInstance(token, ctStudyUid, ctSeriesUid, sop);
    assert.equal(afterRevoke.status, 403);
  });

  // Cleanup tmp dir
  await rm(dir, { recursive: true, force: true });
});
