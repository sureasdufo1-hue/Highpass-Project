import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { selectConsentForStudy, isRevocationAcknowledged } from "../public/consent-selection.js";

const row = (consentId, status) => ({ consentId, status, targetHospitalId: "HOSP-B", scopes: [{ studyInstanceUid: "1.2.3" }] });
const selection = preferredConsentId => ({ studyUid: "1.2.3", targetHospitalId: "HOSP-B", preferredConsentId });

test("UI bootstrap follows all module-level state declarations so early clicks cannot hit a temporal dead zone", () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const bootstrap = source.indexOf("\ninitNavigation();");
  assert.ok(bootstrap > 0);
  for (const declaration of source.matchAll(/^(?:let|const)\s+[A-Za-z_$][\w$]*/gm)) {
    assert.ok(declaration.index < bootstrap, "module state must be initialized before handlers can run");
  }
  assert.ok(source.indexOf("\nawait loadDashboard().catch(() => {});") > bootstrap);
});

test("dashboard preserves explicit revoked/expired flow instead of silently using another ACTIVE consent", () => {
  for (const status of ["REVOKED", "EXPIRED"]) {
    const selected = row("chosen", status);
    assert.equal(selectConsentForStudy([row("other", "ACTIVE"), selected], selection("chosen")), selected);
  }
});

test("patient dashboard never requests privileged audit, detection or quarantine feeds", async () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchDashboardSnapshot(options = {})");
  const prefix = source.slice(start, source.indexOf("  lastStudies =", start));
  let requested;
  const context = vm.createContext({ URLSearchParams, currentPersona: "PATIENT", auditResultFilter:null, auditActionFilter:null,
    demo:{patientId:"synthetic"}, latestConsentId:null, consentViewRevision:0, dashboardRequestSequence:0, dashboardAppliedSequence:0,
    fetchDashboardReads:async paths=>{requested=paths;return [{status:"UP"},[],[]];} });
  await vm.runInContext(prefix + "\nreturn; }\nfetchDashboardSnapshot()", context);
  assert.deepEqual(Array.from(requested), ["/api/health","/api/imaging-studies?patientId=synthetic&includeSeries=true","/api/patients/synthetic/consents"]);
});

test("a failed patient list response is never rendered as a successful zero count", async () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchDashboardSnapshot(options = {})");
  const prefix = source.slice(start, source.indexOf("  lastStudies =", start));
  const context = vm.createContext({ URLSearchParams, currentPersona: "PATIENT", auditResultFilter:null, auditActionFilter:null,
    demo:{patientId:"synthetic"}, latestConsentId:null, consentViewRevision:0, dashboardRequestSequence:0, dashboardAppliedSequence:0,
    fetchDashboardReads:async()=>[{status:"UP"},{error:"FORBIDDEN"},[]] });
  await assert.rejects(vm.runInContext(prefix + "\nreturn; }\nfetchDashboardSnapshot()", context), /PATIENT_SNAPSHOT_UNAVAILABLE/);
});

test("revocation controller clears cached access but never announces success on a failed response", async () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const controller = source.slice(source.indexOf("async function revokePatientConsent()"), source.indexOf("function updateConsentOperationControls", source.indexOf("async function revokePatientConsent()")));
  for (const acknowledged of [false, true]) {
    const events = [], messages = [];
    const context = vm.createContext({
      latestConsentId: "chosen", demo: { patientId: "synthetic" },
      consentViewRevision: 0,
      consentMutationPending: false, updateConsentOperationControls() {},
      latestToken: "test-only", latestTokenInfo: {}, latestTicketNonce: "test-only",
      patientConsentReady: true, viewerStatus: { textContent: "" },
      postJson: async () => acknowledged ? { consentId: "chosen", status: "REVOKED" } : { error: "SERVICE_UNAVAILABLE" },
      clearCountdownTimer() {}, updateVisitModePacket() {}, isRevocationAcknowledged,
      setPatientStatus: value => messages.push(value), resetViewerData() {}, updatePipelineSteps() {},
      showViewerMessage() {}, renderOutput() {}, broadcastSync: value => events.push(value),
      loadDashboard: async () => {},
    });
    const result = await vm.runInContext(controller + "\nrevokePatientConsent()", context);
    assert.equal(result, acknowledged);
    assert.equal(context.latestToken, null);
    assert.equal(context.latestTicketNonce, null);
    assert.equal(events.includes("CONSENT_REVOKED"), acknowledged);
    assert.equal(messages.some(value => value.includes("REVOKED")), acknowledged);
  }
});
test("new explicit active consent replaces previous flow while initial selection remains supported", () => {
  const first = row("first", "ACTIVE"), second = row("second", "ACTIVE");
  assert.equal(selectConsentForStudy([first, second], selection("second")), second);
  assert.equal(selectConsentForStudy([first, second], selection(null)), first);
});
test("display selection never admits another hospital, Study or disallowed scope", () => {
  const wrongHospital = { ...row("wrong", "ACTIVE"), targetHospitalId: "HOSP-C" };
  const denied = { ...row("denied", "ACTIVE"), scopes: [{ studyInstanceUid: "1.2.3", allowed: false }] };
  assert.equal(selectConsentForStudy([wrongHospital, denied], selection("wrong")), null);
  assert.equal(selectConsentForStudy([row("first", "ACTIVE")], { ...selection("first"), studyUid: "1.2.4" }), null);
});
test("revocation UI acknowledges only the exact server-confirmed consent, never errors or expiry", () => {
  assert.equal(isRevocationAcknowledged({ consentId: "chosen", status: "REVOKED" }, "chosen"), true);
  for (const result of [{ error: "SERVICE_UNAVAILABLE" }, { consentId: "other", status: "REVOKED" }, { consentId: "chosen", status: "EXPIRED" }, { consentId: "chosen", status: "REVOKED", error: "DENIED" }, null]) {
    assert.equal(isRevocationAcknowledged(result, "chosen"), false);
  }
});

test("dashboard discards a delayed snapshot captured before the selected consent changed", async () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchDashboardSnapshot(options = {})");
  const prefix = source.slice(start, source.indexOf("  lastStudies =", start));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({ URLSearchParams, currentPersona: "PATIENT", auditResultFilter: null, auditActionFilter: null,
    demo: { patientId: "synthetic" }, latestConsentId: "old", consentViewRevision: 0, dashboardRequestSequence: 0, dashboardAppliedSequence: 0,
    fetchDashboardReads: async paths => { await pending; return paths.map(() => []); } });
  const result = vm.runInContext(prefix + "\nreturn 'SNAPSHOT_APPLIED'; }\nfetchDashboardSnapshot()", context);
  context.latestConsentId = "new";
  release();
  assert.equal(await result, undefined, "stale response must not replace the newer selection");
});

test("dashboard ignores older responses and pre-revocation snapshots even when consent ID is unchanged", async () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchDashboardSnapshot(options = {})");
  const prefix = source.slice(start, source.indexOf("  lastStudies =", start));
  for (const staleCause of ["revision", "sequence"]) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const context = vm.createContext({ URLSearchParams, currentPersona: "PATIENT", auditResultFilter: null, auditActionFilter: null,
      demo: { patientId: "synthetic" }, latestConsentId: "same", consentViewRevision: 0,
      dashboardRequestSequence: 0, dashboardAppliedSequence: 0, fetchDashboardReads: async paths => { await pending; return paths.map(() => []); } });
    const result = vm.runInContext(prefix + "\nreturn 'SNAPSHOT_APPLIED'; }\nfetchDashboardSnapshot()", context);
    if (staleCause === "revision") context.consentViewRevision++;
    else context.dashboardAppliedSequence = 2;
    release();
    assert.equal(await result, undefined);
  }
});
