#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runBrowserLivePolicyGate } from "./browser-live-policy-gate.js";
import { runBrowserOutageGate } from "./browser-outage-gate.js";
import { safeException, apiOperation, safeViewerState } from "./browser-safe-diagnostics.js";
import { cleanupOwnedConsent } from "./browser-owned-consent-cleanup.js";
import { verifyPhantomPixels } from './phantom-browser-evidence.js';
const chromePort = Number(process.env.HIPASS_CHROME_DEBUG_PORT ?? 9222);
const targetUrl = process.env.HIPASS_BROWSER_URL ?? "https://localhost:3443/hipass/";
const phantomModality = process.env.HIPASS_BROWSER_PHANTOM_MODALITY || '';
if (!['', 'CT', 'MR'].includes(phantomModality) || (phantomModality && (process.env.HIPASS_CAPSTONE_BROWSER !== '1' || process.env.HIPASS_BROWSER_LIVE_POLICY === '1'))) throw new Error('PHANTOM_PROFILE_INVALID');
const phantomStudy = phantomModality ? `1.2.826.0.1.3680043.10.5432.20261009.${phantomModality === 'CT' ? '1' : '2'}` : null;
const deadline = setTimeout(() => { console.log(JSON.stringify({ result: "NOT VERIFIED", reason: "BROWSER_DEADLINE" })); process.exit(2); }, process.env.HIPASS_BROWSER_LIVE_POLICY === "1" ? 660000 : process.env.HIPASS_BROWSER_OUTAGE_DIR ? 360000 : 180000);
const responses = new Map();
const observedTokens = new Set();
const observedUrls = [];
const revokeResponses = new Map();
const consentCreateResponses = new Set();
const tokenIssueResponses = new Set();
// Ephemeral captured request credentials never enter trace output or disk.
let protectedImageRequest = null;
const pendingProtectedImageRequests = new Map();
let loginResponseId = null;

const tab = await openTab(targetUrl);
const trace = {
  generatedAt: new Date().toISOString(),
  browserUrl: targetUrl,
  trustedHttps: "NOT_VERIFIED",
  ohifLoad: "NOT_VERIFIED",
  dicomwebRequests: [],
  tokenInUrl: false,
  authorizationHeaderPresent: false,
  bearerSchemePresent: false,
  dpopSchemePresent: false,
  dpopProofPresent: false,
};

const cdp = await connectCdp(tab.webSocketDebuggerUrl);
const safeApiRequests = new Map();
const safeApiRequestTimes = new Map();
trace.safeApiResponses = [];
trace.safeApiFailures = [];
trace.safeExceptions = [];
await cdp.send("Network.enable");
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

cdp.on("Network.requestWillBeSent", (params) => {
  const operation = apiOperation(params.request.url, params.request.method);
  if (operation) {
    safeApiRequests.set(params.requestId, operation);
    safeApiRequestTimes.set(params.requestId, params.timestamp);
    if (safeApiRequests.size > 128) {
      const oldest = safeApiRequests.keys().next().value;
      safeApiRequests.delete(oldest); safeApiRequestTimes.delete(oldest);
    }
  }
  observedUrls.push(params.request?.url ?? "");
  if (!params.request?.url?.includes("/dicomweb")) return;
  const headers = normalizeHeaders(params.request.headers);
  if (params.request.method === "GET" && params.request.url.endsWith("/rendered") && headers.authorization?.startsWith("DPoP ") && headers.dpop) {
    pendingProtectedImageRequests.set(params.requestId, { url: params.request.url, authorization: headers.authorization, proof: headers.dpop });
    if (pendingProtectedImageRequests.size > 64) pendingProtectedImageRequests.delete(pendingProtectedImageRequests.keys().next().value);
  }
  const authorization = headers.authorization ?? "";
  if (/^(Bearer|DPoP) /.test(authorization)) observedTokens.add(authorization.split(" ")[1]);
  const url = new URL(params.request.url);
  const queryNames = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  const hasTokenInUrl = queryNames.some((key) => ["token", "access_token", "jwt"].includes(key));
  trace.dicomwebRequests.push({
    method: params.request.method,
    url: redactUrl(params.request.url),
    authorizationHeaderPresent: Boolean(authorization),
    bearerSchemePresent: authorization.startsWith("Bearer "),
    dpopSchemePresent: authorization.startsWith("DPoP "),
    dpopProofPresent: Boolean(headers.dpop),
    tokenInUrl: hasTokenInUrl,
  });
  trace.authorizationHeaderPresent ||= Boolean(authorization);
  trace.bearerSchemePresent ||= authorization.startsWith("Bearer ");
  trace.dpopSchemePresent ||= authorization.startsWith("DPoP ");
  trace.dpopProofPresent ||= Boolean(headers.dpop);
  trace.tokenInUrl ||= hasTokenInUrl;
});
cdp.on("Network.responseReceived", (params) => {
  if (safeApiRequests.has(params.requestId)) {
    trace.safeApiResponses.push({ operation: safeApiRequests.get(params.requestId), status: params.response.status,
      elapsedMs: Math.max(0, Math.round((params.timestamp - safeApiRequestTimes.get(params.requestId)) * 1000)) });
    if (trace.safeApiResponses.length > 128) trace.safeApiResponses.shift();
  }
  const candidate = pendingProtectedImageRequests.get(params.requestId);
  if (candidate) {
    pendingProtectedImageRequests.delete(params.requestId);
    if (params.response.status === 200 && params.response.mimeType?.startsWith('image/')) protectedImageRequest = candidate;
  }
  if (params.response.url.endsWith('/api/capstone-demo/login') && params.response.status === 200) loginResponseId = params.requestId;
  if (params.response.url.endsWith('/api/consents') && params.response.status === 201) consentCreateResponses.add(params.requestId);
  if (params.response.url.endsWith('/api/dicom-access/request') && params.response.status === 200) tokenIssueResponses.add(params.requestId);
  if (params.response.url.includes("/dicomweb")) responses.set(params.requestId, { url: redactUrl(params.response.url), status: params.response.status, mimeType: params.response.mimeType });
  if (/\/api\/consents\/[^/]+\/revoke$/.test(params.response.url)) revokeResponses.set(params.requestId, params.response.status);
});

cdp.on("Network.loadingFinished", params => {
  safeApiRequests.delete(params.requestId); safeApiRequestTimes.delete(params.requestId);
});
cdp.on("Network.loadingFailed", params => {
  const operation = safeApiRequests.get(params.requestId);
  if (operation) {
    const allowed = ["net::ERR_ABORTED", "net::ERR_CONNECTION_RESET", "net::ERR_FAILED", "net::ERR_TIMED_OUT", "net::ERR_CONNECTION_REFUSED"];
    trace.safeApiFailures.push({ operation, code: allowed.includes(params.errorText) ? params.errorText : "OTHER",
      elapsedMs: Math.max(0, Math.round((params.timestamp - safeApiRequestTimes.get(params.requestId)) * 1000)) });
    if (trace.safeApiFailures.length > 32) trace.safeApiFailures.shift();
  }
  safeApiRequests.delete(params.requestId); safeApiRequestTimes.delete(params.requestId);
});

await cdp.send("Page.navigate", { url: targetUrl });
await delay(3000);
const tlsState = await cdp.send("Runtime.evaluate", {
  expression: "location.protocol === 'https:' && !document.body.innerText.includes('ERR_CERT') && !document.body.innerText.includes('연결이 비공개로 설정되어 있지 않습니다')",
  returnByValue: true,
});
trace.trustedHttps = tlsState.result.value ? "PASS" : "FAIL";

if (process.env.HIPASS_CAPSTONE_BROWSER === "1") {
  let presenter = readFileSync(0, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(presenter)) throw new Error("INVALID_PRESENTER_INPUT");
  const login = await cdp.send("Runtime.evaluate", { expression: `(async()=>{
    const end=Date.now()+10000;
    while(!document.querySelector('#capstone-login-key')&&Date.now()<end) await new Promise(r=>setTimeout(r,100));
    const input=document.querySelector('#capstone-login-key'); if(!input) throw new Error('LOGIN_UI_MISSING');
    if (${Boolean(phantomModality)}) {
      const profile=document.querySelector('#capstone-patient-profile');
      if(!profile || ![...profile.options].some(o=>o.value==='PHANTOM')) throw new Error('PHANTOM_LOGIN_UI_MISSING');
      profile.value='PHANTOM';
    }
    input.value=${JSON.stringify(presenter)}; document.querySelector('#capstone-login').requestSubmit();
    while(document.querySelector('#capstone-login')&&Date.now()<end) await new Promise(r=>setTimeout(r,100));
    return !document.querySelector('#capstone-login');
  })()`, awaitPromise: true, returnByValue: true });
  trace.capstoneLogin = login.result?.value === true ? "PASS" : "FAIL";
  if (process.env.HIPASS_BROWSER_LIVE_POLICY === "1") {
    if (trace.capstoneLogin !== "PASS" || !loginResponseId) throw new Error("POLICY_LOGIN_REQUIRED");
    const response = await cdp.send("Network.getResponseBody", {requestId:loginResponseId});
    const session = JSON.parse(response.base64Encoded ? Buffer.from(response.body,"base64").toString("utf8") : response.body);
    const refreshProfiles = async () => {
      const refreshed = await cdp.send("Runtime.evaluate", {expression:`(async()=>{
        const response=await fetch('/api/capstone-demo/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:${JSON.stringify(presenter)}}),cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('LOGIN_RENEW_DENIED'); return (await response.json()).profiles;
      })()`,awaitPromise:true,returnByValue:true});
      if(refreshed.exceptionDetails || !refreshed.result?.value?.PATIENT) throw new Error("POLICY_LOGIN_RENEW_FAILED");
      return refreshed.result.value;
    };
    const policy = await runBrowserLivePolicyGate(cdp,session.profiles,new URL(targetUrl).origin,refreshProfiles);
    presenter = null;
    observedTokens.clear();
    console.log(JSON.stringify(policy));
    clearTimeout(deadline);
    process.exit(policy.result === "PASS" ? 0 : 1);
  }
  presenter = null;
}

const flowMode = "UI";
let viewerDiagnosticBreakpoints = [];
if (process.env.HIPASS_BROWSER_DIAGNOSTICS === "1") {
  const applicationScripts = [];
  const viewerBreakpoints = [];
  trace.safeViewerStates = [];
  await cdp.send('Runtime.evaluate', {expression:'globalThis.__highpassSafeViewerStates=[]'});
  cdp.on("Debugger.scriptParsed", event => {
    if (event.url === new URL('/app.js', targetUrl).href) applicationScripts.push(event.scriptId);
  });
  cdp.on("Debugger.paused", async event => {
    try {
        trace.safeExceptions.push(safeException(event));
        if (trace.safeExceptions.length > 32) trace.safeExceptions.shift();
    } finally { await cdp.send("Debugger.resume").catch(() => {}); }
  });
  await cdp.send("Debugger.enable");
  for (const scriptId of applicationScripts) {
    const source = await cdp.send('Debugger.getScriptSource', {scriptId});
    const lines = source.scriptSource.split('\n');
    for (let index=0; index<lines.length; index++) {
      if (lines[index].includes('if (consentMutationPending || !latestToken) return;') || lines[index].trim()==='latestToken = null;') {
        // False conditional breakpoint records primitive state without pausing
        // the application or reading any token/identity value into evidence.
        const condition=`(globalThis.__highpassSafeViewerStates.length<32 && globalThis.__highpassSafeViewerStates.push({line:${index+1},tokenPresent:!!latestToken,consentPending:consentMutationPending,tokenPending:tokenRequestPending,consentReady:patientConsentReady,instanceCount:lastInstances.length,seriesSelected:!!selectedSeriesUid}),false)`;
        const breakpoint=await cdp.send('Debugger.setBreakpoint', {location:{scriptId,lineNumber:index},condition});
        viewerBreakpoints.push(breakpoint.breakpointId);
      }
    }
  }
  viewerDiagnosticBreakpoints = viewerBreakpoints;
  await cdp.send("Debugger.setPauseOnExceptions", { state: phantomStudy ? "none" : "all" });
}
try { trace.concurrentUiControls = await runUiFlow(cdp); trace.uiFlow = "PASS"; }
catch { trace.uiFlow = "FAIL"; }
if (process.env.HIPASS_BROWSER_DIAGNOSTICS === "1") {
  const states=await cdp.send('Runtime.evaluate',{expression:'globalThis.__highpassSafeViewerStates',returnByValue:true});
  trace.safeViewerStates=Array.isArray(states.result?.value) ? states.result.value.slice(0,32).map(safeViewerState) : [];
  for (const breakpointId of viewerDiagnosticBreakpoints) await cdp.send('Debugger.removeBreakpoint',{breakpointId});
  await cdp.send("Debugger.setPauseOnExceptions", {state:"none"});
}
await delay(3000);

const pageState = await cdp.send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    uiProbeStage: ['READY','CONSENT','TOKEN','SERIES','INSTANCES','AUTO_IMAGE','IMAGE','COMPLETE'].includes(globalThis.__highpassProbeStage) ? globalThis.__highpassProbeStage : null,
    tokenControlDisabled: Boolean(document.querySelector('#doctor-request-token')?.disabled),
    ownedCleanupTestStop: globalThis.__highpassOwnedCleanupTestStop === true,
    viewerStatus: document.querySelector('#viewer-status')?.textContent ?? null,
    patientStatus: document.querySelector('#patient-status')?.textContent ?? null,
    reasonCode: (() => { try { const o=JSON.parse(document.querySelector('#output')?.textContent || '{}'); return o.reasonCode ?? o.error ?? null; } catch { return null; } })(),
    instanceDetail: document.querySelector('#instance-detail')?.textContent ?? null,
    imageVisible: !!document.querySelector('#viewer-image') && !document.querySelector('#viewer-image').hidden,
    imageDecoded: !!document.querySelector('#viewer-image')?.complete && document.querySelector('#viewer-image').naturalWidth > 0,
    imageFromGateway: document.querySelector('#viewer-image')?.src?.startsWith('blob:') ?? false,
    width: document.querySelector('#viewer-image')?.naturalWidth ?? 0,
    height: document.querySelector('#viewer-image')?.naturalHeight ?? 0
  })`,
  returnByValue: true,
});
trace.pageState = JSON.parse(pageState.result.value);
const exposure = await cdp.send("Runtime.evaluate", { expression: `(() => { const tokens=${JSON.stringify([...observedTokens])}; return JSON.stringify({
  tokenIssued: tokens.length > 0,
  tokenInUi: tokens.some(token => document.body.innerText.includes(token)),
  tokenInStorage: tokens.some(token => JSON.stringify(localStorage).includes(token) || JSON.stringify(sessionStorage).includes(token)),
  tokenInLocation: tokens.some(token => location.href.includes(token))
}); })()`, returnByValue: true });
trace.exposure = JSON.parse(exposure.result.value);
const history = await cdp.send("Page.getNavigationHistory");
trace.exposure.tokenInHistory = (history.entries ?? []).some(entry => [...observedTokens].some(token => entry.url.includes(token)));
trace.tokenInUrl ||= observedUrls.some(url => [...observedTokens].some(token => url.includes(token) || url.includes(encodeURIComponent(token))));
trace.flowMode = flowMode;
trace.viewerType = "BUILT-IN DICOM VIEWER (NOT OHIF RENDERING CLAIM)";
trace.renderedResponses = [...responses.values()];
trace.ohifLoad = "NOT VERIFIED";
trace.viewerRender = trace.pageState.imageVisible && trace.pageState.imageDecoded && trace.pageState.imageFromGateway && trace.renderedResponses.some(r => r.url.endsWith('/rendered') && r.status === 200 && r.mimeType.startsWith('image/')) ? "PASS" : "FAIL";
trace.qido = trace.renderedResponses.some((request) => request.status === 200 && request.url.includes("/dicomweb/studies") && !request.url.includes("/instances")) ? "PASS" : "FAIL";
trace.wado = trace.renderedResponses.some((request) => request.status === 200 && request.url.includes("/instances/")) ? "PASS" : "FAIL";
if (phantomStudy) {
  const instancesResponse = [...responses.entries()].find(([,row])=>row.status===200 && new URL(row.url).pathname === `/dicomweb/studies/${phantomStudy}/series/${phantomStudy}.1/instances`);
  let instanceRows = null;
  if (instancesResponse) {
    const response = await cdp.send('Network.getResponseBody', {requestId:instancesResponse[0]});
    const rows = JSON.parse(response.base64Encoded ? Buffer.from(response.body,'base64').toString('utf8') : response.body);
    instanceRows = rows;
  }
  trace.phantom = {modality:phantomModality,studyUid:phantomStudy,...verifyPhantomPixels({studyUid:phantomStudy,rows:instanceRows,width:trace.pageState.width,height:trace.pageState.height,nextSlice:trace.concurrentUiControls?.phantomNextSlice})};
  const patientContext = await cdp.send('Runtime.evaluate', {expression: `(() => {
    const hud = document.querySelector('#viewer-hud-study')?.textContent ?? '';
    const profile = document.querySelector('#patient-portal-app .profile-copy strong')?.textContent ?? '';
    return { viewerPatientMatches: hud.includes('HP-TEST-PHANTOM-001') && !hud.includes('P-1001'),
      profilePatientMatches: profile.includes('HP-TEST-PHANTOM-001') && !profile.includes('P-1001') };
  })()`, returnByValue: true});
  trace.patientContextDisplay = patientContext.result?.value ?? {};
}
trace.result = trace.trustedHttps === "PASS" &&
  trace.uiFlow === "PASS" &&
  trace.viewerRender === "PASS" &&
  trace.authorizationHeaderPresent &&
  (process.env.HIPASS_BROWSER_REQUIRE_DPOP === "1" ? trace.dpopSchemePresent && trace.dpopProofPresent && !trace.bearerSchemePresent : trace.bearerSchemePresent || trace.dpopSchemePresent) &&
  !trace.tokenInUrl &&
  trace.exposure.tokenIssued && !trace.exposure.tokenInUi && !trace.exposure.tokenInStorage && !trace.exposure.tokenInLocation && !trace.exposure.tokenInHistory &&
  trace.qido === "PASS" &&
  trace.wado === "PASS" ? "PASS" : "FAIL";
if (phantomStudy && trace.phantom.result !== 'PASS') trace.result='FAIL';
if (phantomStudy && (!trace.patientContextDisplay?.viewerPatientMatches || !trace.patientContextDisplay?.profilePatientMatches)) trace.result='FAIL';

if (process.env.HIPASS_BROWSER_OUTAGE_DIR && trace.result === "PASS") {
  trace.connectionOutage = await runBrowserOutageGate(cdp, responses, process.env.HIPASS_BROWSER_OUTAGE_DIR);
  if (trace.connectionOutage.result !== "PASS") trace.result = "FAIL";
}

if (process.env.HIPASS_BROWSER_NEGATIVE_BOUNDARY === "1") {
  // Tests only the already successful exact image route, not arbitrary origins.
  const fixture = protectedImageRequest;
  protectedImageRequest = null;
  if (!fixture || new URL(fixture.url).origin !== new URL(targetUrl).origin) {
    trace.negativeImageBoundary = { result: "NOT VERIFIED", reason: "NO_SUCCESSFUL_IMAGE_FIXTURE" };
    trace.result = "FAIL";
  } else {
    const probe = await cdp.send("Runtime.evaluate", { expression: `(async () => {
      const fixture = ${JSON.stringify(fixture)};
      const cases = [
        ['UNAUTHENTICATED_IMAGE', {}],
        ['MISSING_DPOP_PROOF_IMAGE', {Authorization: fixture.authorization}],
        ['REPLAYED_DPOP_PROOF_IMAGE', {Authorization: fixture.authorization, DPoP: fixture.proof}]
      ];
      const checks = [];
      for (const [test, headers] of cases) {
        try {
          const response = await fetch(fixture.url, {method:'GET', headers, credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(15000)});
          const imageReturned = (response.headers.get('content-type') || '').startsWith('image/');
          await response.body?.cancel();
          checks.push({test, httpStatus:response.status, imageReturned, status:([401,403].includes(response.status) && !imageReturned) ? 'PASS' : 'FAIL'});
        } catch { checks.push({test, status:'NOT VERIFIED', reason:'REQUEST_FAILED_OR_TIMED_OUT'}); }
      }
      return {checks, result:checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL'};
    })()`, awaitPromise: true, returnByValue: true }, 60000);
    trace.negativeImageBoundary = probe.result?.value ?? {result:"NOT VERIFIED", reason:"PROBE_EVALUATION_FAILED"};
    if (trace.negativeImageBoundary.result !== "PASS") trace.result = "FAIL";
  }
}

if (process.env.HIPASS_CAPSTONE_BROWSER === "1" && trace.uiFlow === "PASS") {
  const revoked = await cdp.send("Runtime.evaluate", { expression: `(async()=>{
    document.querySelector('#patient-revoke').click();
    document.querySelector('#patient-revoke').dispatchEvent(new Event('click'));
    const end=Date.now()+10000;
    while(!document.querySelector('#patient-status')?.textContent.includes('REVOKED')&&Date.now()<end) await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,1500));
    return { revoked:document.querySelector('#patient-status')?.textContent.includes('REVOKED')===true,
      imageCleared:document.querySelector('#viewer-image')?.hidden===true,
      staticFallbackVisible:document.querySelector('#viewer-image')?.hidden===false&&!(document.querySelector('#viewer-image')?.src||'').startsWith('blob:') };
  })()`, awaitPromise: true, returnByValue: true });
  trace.revocationUi = revoked.result?.value ?? { revoked:false };
  trace.revocationAcknowledged = false;
  for (const [requestId, status] of revokeResponses) {
    if (status !== 200) continue;
    const response = await cdp.send("Network.getResponseBody", { requestId });
    const body = JSON.parse(response.base64Encoded ? Buffer.from(response.body,"base64").toString("utf8") : response.body);
    trace.revocationAcknowledged ||= body.status === "REVOKED";
  }
  if (!trace.revocationAcknowledged || !trace.revocationUi.revoked || !trace.revocationUi.imageCleared || trace.revocationUi.staticFallbackVisible || trace.capstoneLogin !== "PASS") trace.result = "FAIL";
  const linkage = { consentCreates: consentCreateResponses.size, tokenIssues: tokenIssueResponses.size,
    revokeRequests: revokeResponses.size, createMatchesToken: false, createMatchesRevoke: false,
    onlyIssuedTokenUsed: false, duplicateMutationSuppressed: false, result: "NOT VERIFIED" };
  if (consentCreateResponses.size === 1 && tokenIssueResponses.size === 1 && revokeResponses.size === 1) {
    try {
      const readBody = async requestId => {
        const response = await cdp.send("Network.getResponseBody", { requestId });
        return JSON.parse(response.base64Encoded ? Buffer.from(response.body,"base64").toString("utf8") : response.body);
      };
      const created = await readBody([...consentCreateResponses][0]);
      const issued = await readBody([...tokenIssueResponses][0]);
      const revoked = await readBody([...revokeResponses.keys()][0]);
      const claims = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64url').toString('utf8'));
      if (phantomStudy) trace.phantom.auditReference = {consentId:created.consentId,auditSessionId:issued.auditSessionId ?? claims.auditSessionId,tokenId:claims.jti};
      linkage.createMatchesToken = Boolean(created.consentId) && claims.consentId === created.consentId;
      if (phantomStudy) linkage.createMatchesToken &&= created.patientId === 'HP-TEST-PHANTOM-001' && created.scopes?.length === 1 && created.scopes[0].studyInstanceUid === phantomStudy && created.scopes[0].seriesInstanceUid === phantomStudy + '.1' && claims.studyInstanceUid === phantomStudy;
      linkage.createMatchesRevoke = revoked.status === "REVOKED" && revoked.consentId === created.consentId;
      linkage.onlyIssuedTokenUsed = observedTokens.size === 1 && observedTokens.has(issued.accessToken);
      linkage.duplicateMutationSuppressed = trace.concurrentUiControls?.consentControlsBusy === true && trace.concurrentUiControls?.tokenControlBusy === true;
      linkage.result = linkage.createMatchesToken && linkage.createMatchesRevoke && linkage.onlyIssuedTokenUsed && linkage.duplicateMutationSuppressed ? "PASS" : "FAIL";
    } catch { linkage.result = "NOT VERIFIED"; }
  }
  trace.singleTransferLinkage = linkage;
  if (linkage.result !== "PASS") trace.result = "FAIL";
}

// Failure cleanup never changes the failed demonstration result into PASS.
if (process.env.HIPASS_CAPSTONE_BROWSER === "1" && trace.result !== "PASS") {
  try {
    const receipts = [];
    for (const requestId of consentCreateResponses) {
      const response = await cdp.send("Network.getResponseBody", { requestId }, 10000);
      receipts.push(JSON.parse(response.base64Encoded ? Buffer.from(response.body, "base64").toString("utf8") : response.body));
    }
    if (!loginResponseId) throw new Error("LOGIN_RECEIPT_UNAVAILABLE");
    const login = await cdp.send("Network.getResponseBody", { requestId: loginResponseId }, 10000);
    let session = JSON.parse(login.base64Encoded ? Buffer.from(login.body, "base64").toString("utf8") : login.body);
    if (typeof session.profiles?.PATIENT !== "string") throw new Error("PATIENT_AUTH_UNAVAILABLE");
    trace.ownedConsentCleanup = await cleanupOwnedConsent({ receipts, expectedPatientId: phantomStudy ? 'HP-TEST-PHANTOM-001' : 'P-1001', request: async (method, path) => {
      const response = await cdp.send("Runtime.evaluate", { expression: `(async()=>{
        const response = await fetch(${JSON.stringify(path)}, {method:${JSON.stringify(method)},
          headers:{authorization:${JSON.stringify("Bearer " + session.profiles.PATIENT)},'content-type':'application/json'},
          ${method === "POST" ? "body:'{}'," : ""}credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
        return {status:response.status,body:await response.json()};
      })()`, awaitPromise: true, returnByValue: true }, 15000);
      if (response.exceptionDetails || !response.result?.value) throw new Error("CLEANUP_REQUEST_FAILED");
      return response.result.value;
    } });
    session = null;
  } catch {
    trace.ownedConsentCleanup = {status:"NOT VERIFIED",reason:"CREATION_OR_AUTH_RECEIPT_UNAVAILABLE",recordsDeleted:0};
  }
}
console.log(JSON.stringify(trace, null, 2));
protectedImageRequest = null;
pendingProtectedImageRequests.clear();
observedTokens.clear();
clearTimeout(deadline);
process.exit(trace.result === "PASS" ? 0 : 1);

async function runUiFlow(client) {
  const expression = `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const until = async (predicate, budget = 15000) => {
        const end = Date.now() + budget;
        while (Date.now() < end) { if (predicate()) return; await wait(250); }
        throw new Error('UI_STATE_TIMEOUT');
      };
      const click = async (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error('Missing selector: ' + selector);
        element.click();
        await wait(1800);
      };
      globalThis.__highpassProbeStage = 'READY';
      await until(() => document.querySelector('#patient-study-select')?.options.length > 0);
      if (${Boolean(phantomStudy)}) {
        const study=document.querySelector('#patient-study-select');
        if(![...study.options].some(o=>o.value===${JSON.stringify(phantomStudy)})) throw new Error('PHANTOM_STUDY_MISSING');
        study.value=${JSON.stringify(phantomStudy)}; study.dispatchEvent(new Event('change',{bubbles:true}));
        await until(()=>[...document.querySelector('#patient-series-select').options].some(o=>o.value===${JSON.stringify(phantomStudy + '.1')}));
        const series=document.querySelector('#patient-series-select');
        series.value=${JSON.stringify(phantomStudy + '.1')}; series.dispatchEvent(new Event('change',{bubbles:true}));
      }
      globalThis.__highpassProbeStage = 'CONSENT';
      const consentButton = document.querySelector('#patient-consent');
      consentButton.click();
      const consentControlsBusy = consentButton.disabled && document.querySelector('#doctor-request-token')?.disabled;
      consentButton.dispatchEvent(new Event('click'));
      // Mutation completion includes three bounded dashboard/PACS/PHR reads;
      // allow their aggregate budget without relaxing any application timeout.
      await until(() => !consentButton.disabled && document.querySelector('#patient-status')?.textContent.includes('ACTIVE'), 45000);
      if (${process.env.HIPASS_BROWSER_TEST_STOP_AFTER_CONSENT === "1" && process.env.HIPASS_CAPSTONE_BROWSER === "1"}) {
        globalThis.__highpassOwnedCleanupTestStop = true;
        throw new Error('OWNED_CLEANUP_TEST_STOP');
      }
      await click('[data-persona="DOCTOR"]');
      globalThis.__highpassProbeStage = 'TOKEN';
      const tokenButton = document.querySelector('#doctor-request-token');
      tokenButton.click();
      const tokenControlBusy = tokenButton.disabled;
      tokenButton.dispatchEvent(new Event('click'));
      // Token issuance, Study QIDO, then Series QIDO each have an existing
      // 20s application deadline. A 15s verifier budget incorrectly cuts off
      // their aggregate before the application can complete or deny. This is
      // observation only: no request retry, auth or application timeout change.
      await until(() => document.querySelectorAll('[data-viewer-series-uid]').length > 0, 65000);
      if (${Boolean(phantomStudy)}) {
        // Token issuance already loads the selected Series and Instances.
        // Wait for that operation, including dashboard reads, before moving a
        // slice. Concurrent reloads revoke blob URLs and invalidate evidence.
        globalThis.__highpassProbeStage = 'AUTO_IMAGE';
        await until(() => !tokenButton.disabled && document.querySelector('#viewer-image')?.complete && document.querySelector('#viewer-image').naturalWidth > 0 && document.querySelector('#viewer-image').src.startsWith('blob:'), 65000);
      } else {
      globalThis.__highpassProbeStage = 'SERIES';
      await click('#doctor-open-series');
      const firstSeries = document.querySelector('[data-viewer-series-uid]');
      if (firstSeries) {
        firstSeries.click();
        await wait(1200);
      }
      globalThis.__highpassProbeStage = 'INSTANCES';
      await click('#load-instances');
      }
      globalThis.__highpassProbeStage = 'IMAGE';
      await until(() => document.querySelector('#viewer-image')?.complete && document.querySelector('#viewer-image').naturalWidth > 0 && document.querySelector('#viewer-image').src.startsWith('blob:'));
      let phantomNextSlice = null;
      if (${Boolean(phantomStudy)}) {
        const image=document.querySelector('#viewer-image'), slider=document.querySelector('#viewer-slice-slider');
        if(image.naturalWidth!==256 || image.naturalHeight!==256 || slider?.max!=='12') throw new Error('PHANTOM_PIXEL_OR_INSTANCE_MISMATCH');
        const firstSource=image.src;
        await click('#btn-next-slice');
        await until(()=>image.complete && image.naturalWidth===256 && image.src.startsWith('blob:') && image.src!==firstSource && slider.value==='2', 45000);
        phantomNextSlice = true;
      }
      globalThis.__highpassProbeStage = 'COMPLETE';
      return {
        consentControlsBusy, tokenControlBusy, phantomNextSlice,
        viewerStatus: document.querySelector('#viewer-status')?.textContent ?? null,
        imageDecoded: document.querySelector('#viewer-image').naturalWidth > 0,
      };
    })()
  `;
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, 150000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser UI flow failed");
  }
  return result.result.value;
}


async function openTab(url) {
  const response = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(url)}`, { method: "PUT", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to open Chrome tab: ${response.status}`);
  return response.json();
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const handlers = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result ?? {});
      return;
    }
    const callbacks = handlers.get(message.method) ?? [];
    callbacks.forEach((callback) => callback(message.params ?? {}));
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}, timeoutMs = 30000) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => {
            const timeout = setTimeout(() => { pending.delete(id); rejectSend(new Error('CDP_COMMAND_TIMEOUT')); }, timeoutMs);
            pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolveSend(value); }, reject: (error) => { clearTimeout(timeout); rejectSend(error); } });
          });
        },
        on(method, callback) {
          const callbacks = handlers.get(method) ?? [];
          callbacks.push(callback);
          handlers.set(method, callbacks);
        },
      });
    });
    socket.addEventListener("error", () => reject(new Error("Chrome CDP websocket error")));
  });
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

function redactUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (["token", "access_token", "jwt"].includes(key.toLowerCase())) url.searchParams.set(key, "[REDACTED]");
  }
  let result = url.toString();
  for (const token of observedTokens) result = result.replaceAll(token, "[REDACTED]").replaceAll(encodeURIComponent(token), "[REDACTED]");
  return result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
