import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isRevocationAcknowledged } from "../public/consent-selection.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function controllerContext(postJson) {
  const events = [], calls = [];
  const context = vm.createContext({ JSON, encodeURIComponent,
    demo: { patientId: "synthetic", doctorId: "doctor", sourceHospitalId: "A", targetHospitalId: "B", purpose: "TREATMENT", permission: "VIEW_ONLY" },
    latestConsentId: "chosen", selectedStudyUid: "1.2.3", selectedSeriesUid: "", consentViewRevision: 0,
    consentMutationPending: false, tokenRequestPending: false, patientConsentReady: true,
    latestToken: null, latestTokenInfo: null, latestTicketNonce: null, viewerStatus: { textContent: "" },
    consentValidFromInput: { value: "2026-10-09" }, consentValidUntilInput: { value: "2026-10-10" },
    toIsoFromLocal: value => value, postJson: (path, body) => { calls.push(path); return postJson(path, body); },
    updateConsentOperationControls() {}, clearCountdownTimer() {}, setPatientStatus() {}, showViewerMessage() {},
    updateVisitModePacket() {}, navigatePatientPage() {}, showToast() {}, updatePipelineSteps() {}, renderOutput() {},
    loadDashboard: async () => {}, resetViewerData() {}, isRevocationAcknowledged, toFriendlyError: value => value,
    setDownloadState() {}, startCountdownTimer() {}, updateWatermark() {},
    broadcastSync: value => events.push(value), loadGatewayStudies: async () => { events.push("GATEWAY"); },
    loadSeriesForActiveToken: async () => {}, lastSeries: [], loadInstancesForSelectedSeries: async () => {},
  });
  vm.runInContext("function syncPatientChoices(){latestToken=null;latestTokenInfo=null;latestTicketNonce=null;}\n"
    + section("async function createPatientConsent", "async function revokePatientConsent")
    + section("async function revokePatientConsent", "function updateConsentOperationControls")
    + section("function currentTokenRequestContext", "function syncPatientChoices")
    + section("async function requestDoctorToken", "async function openViewer"), context);
  return { context, events, calls };
}

test("pending consent creation permits one mutation only and blocks token/revoke before server acknowledgement", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { context, events, calls } = controllerContext(async path => path === "/api/consents" ? pending : {});
  const creation = vm.runInContext("createPatientConsent()", context);
  assert.equal(context.patientConsentReady, false);
  assert.equal((await vm.runInContext("createPatientConsent()", context)).error, "CONSENT_OPERATION_IN_PROGRESS");
  assert.equal(await vm.runInContext("revokePatientConsent()", context), false);
  assert.equal((await vm.runInContext("requestDoctorToken()", context)).reasonCode, "CONSENT_OPERATION_IN_PROGRESS");
  assert.equal(calls.length, 1);
  release({ consentId: "new", status: "ACTIVE" });
  await creation;
  assert.equal(context.latestConsentId, "new");
  assert.equal(context.patientConsentReady, true);
  assert.equal(context.consentMutationPending, false);
  assert.deepEqual(events, ["CONSENT_CREATED"]);
});

test("failed consent transport releases mutation lock without reporting success or retaining access", async () => {
  const { context, events } = controllerContext(async () => { throw new Error("synthetic unavailable"); });
  const result = await vm.runInContext("createPatientConsent()", context);
  assert.equal(result.error, "CONSENT_REQUEST_FAILED");
  assert.equal(context.consentMutationPending, false);
  assert.equal(context.patientConsentReady, false);
  assert.equal(context.latestToken, null);
  assert.equal(events.length, 0);
});

test("confirmed consent creation and failed secondary refresh remain distinct, without granting access", async () => {
  const { context, events } = controllerContext(async path => path === "/api/consents" ? { consentId: "new", status: "ACTIVE" } : {});
  context.loadDashboard = async () => { throw new Error("secondary refresh unavailable"); };
  const result = await vm.runInContext("createPatientConsent()", context);
  assert.equal(result.error, "CONSENT_REFRESH_FAILED");
  assert.equal(result.consentId, "new");
  assert.equal(context.patientConsentReady, false);
  assert.equal(context.latestConsentId, "new");
  assert.equal(context.latestToken, null);
  assert.equal(context.consentMutationPending, false);
  assert.deepEqual(events, ["CONSENT_CREATED"]);
});

test("patient revocation preempts an in-flight token response; response never reaches Gateway", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { context, events } = controllerContext(async path => path === "/api/dicom-access/request" ? pending : { consentId: "chosen", status: "REVOKED" });
  const request = vm.runInContext("requestDoctorToken()", context);
  assert.equal(await vm.runInContext("revokePatientConsent()", context), true);
  release({ decision: "ALLOWED", accessToken: "test-only" });
  assert.equal((await request).reasonCode, "VIEW_CONTEXT_CHANGED");
  assert.equal(context.latestToken, null);
  assert.equal(context.tokenRequestPending, false);
  assert.deepEqual(events, ["CONSENT_REVOKED"]);
});

test("changed Study scope and duplicate token clicks cannot adopt another flow's delayed token", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { context, calls, events } = controllerContext(async () => pending);
  const request = vm.runInContext("requestDoctorToken()", context);
  assert.equal((await vm.runInContext("requestDoctorToken()", context)).reasonCode, "CONSENT_OPERATION_IN_PROGRESS");
  context.selectedStudyUid = "1.2.4";
  release({ decision: "ALLOWED", accessToken: "test-only" });
  assert.equal((await request).reasonCode, "VIEW_CONTEXT_CHANGED");
  assert.equal(context.latestToken, null);
  assert.equal(calls.length, 1);
  assert.equal(events.length, 0);
});

test("unchanged acknowledged consent still accepts a normal token and requests Gateway", async () => {
  const { context, events } = controllerContext(async () => ({ decision: "ALLOWED", accessToken: "test-only", expiresAt: "synthetic" }));
  assert.equal((await vm.runInContext("requestDoctorToken()", context)).decision, "ALLOWED");
  assert.equal(context.latestToken, "test-only");
  assert.deepEqual(events, ["TOKEN_ISSUED", "GATEWAY"]);
});

test("rendered image completion after revocation cannot recreate a blob cache or visible image", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let created = 0, displayed = 0;
  const context = vm.createContext({ latestToken: "test-only", consentMutationPending: false, consentViewRevision: 0,
    latestConsentId: "chosen", demo: {}, selectedStudyUid: "1.2.3", selectedSeriesUid: "1.2.3.1",
    lastInstances: [{}], totalSlices: 1, currentSliceIndex: 0, selectedSopUid: "", instanceDetail: null,
    viewerStatus: {}, sliceBlobCache: new Map(), updateSliceControlsUi() {}, dicomValue: () => "1.2.3.1.1",
    setDownloadState() {}, showSeriesImage: () => { displayed++; }, prefetchAdjacentSlices() {},
    proofFetch: async () => ({ ok: true, blob: async () => pending }),
    URL: { createObjectURL: () => { created++; return "blob:synthetic"; } },
    clearSliceBlobCache() {}, hideSeriesImage() {}, showViewerMessage() {},
  });
  vm.runInContext(section("function currentTokenRequestContext", "function syncPatientChoices")
    + section("async function displaySlice", "function stepSlice"), context);
  const request = vm.runInContext("displaySlice(0)", context);
  await Promise.resolve();
  context.latestToken = null;
  context.consentViewRevision++;
  release({ synthetic: true });
  await request;
  assert.equal(created, 0);
  assert.equal(displayed, 0);
  assert.equal(context.sliceBlobCache.size, 0);
});
