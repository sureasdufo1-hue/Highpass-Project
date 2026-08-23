#!/usr/bin/env node
const chromePort = Number(process.env.HIPASS_CHROME_DEBUG_PORT ?? 9222);
const targetUrl = process.env.HIPASS_BROWSER_URL ?? "https://localhost:3443/hipass/";

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
};

const cdp = await connectCdp(tab.webSocketDebuggerUrl);
await cdp.send("Network.enable");
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

cdp.on("Network.requestWillBeSent", (params) => {
  if (!params.request?.url?.includes("/dicomweb")) return;
  const headers = normalizeHeaders(params.request.headers);
  const authorization = headers.authorization ?? "";
  const url = new URL(params.request.url);
  const queryNames = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  const hasTokenInUrl = queryNames.some((key) => ["token", "access_token", "jwt"].includes(key));
  trace.dicomwebRequests.push({
    method: params.request.method,
    url: redactUrl(params.request.url),
    authorizationHeaderPresent: Boolean(authorization),
    bearerSchemePresent: authorization.startsWith("Bearer "),
    tokenInUrl: hasTokenInUrl,
  });
  trace.authorizationHeaderPresent ||= Boolean(authorization);
  trace.bearerSchemePresent ||= authorization.startsWith("Bearer ");
  trace.tokenInUrl ||= hasTokenInUrl;
});

await cdp.send("Page.navigate", { url: targetUrl });
await delay(3000);
const tlsState = await cdp.send("Runtime.evaluate", {
  expression: "location.protocol === 'https:' && !document.body.innerText.includes('ERR_CERT') && !document.body.innerText.includes('연결이 비공개로 설정되어 있지 않습니다')",
  returnByValue: true,
});
trace.trustedHttps = tlsState.result.value ? "PASS" : "FAIL";

let flowMode = "UI";
try {
  await runUiFlow(cdp);
} catch (error) {
  flowMode = "BROWSER_FETCH_FALLBACK";
  trace.uiFlowError = error.message;
  await runBrowserFetchFlow(cdp);
}
await delay(3000);

const pageState = await cdp.send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    viewerStatus: document.querySelector('#viewer-status')?.textContent ?? null,
    instanceDetail: document.querySelector('#instance-detail')?.textContent ?? null,
    imageVisible: !!document.querySelector('#viewer-image') && !document.querySelector('#viewer-image').hidden
  })`,
  returnByValue: true,
});
trace.pageState = JSON.parse(pageState.result.value);
trace.flowMode = flowMode;
trace.ohifLoad = trace.pageState.viewerStatus === "Instance loaded" || trace.pageState.imageVisible ? "PASS" : "FAIL";
trace.qido = trace.dicomwebRequests.some((request) => request.url.includes("/dicomweb/studies") && !request.url.includes("/instances")) ? "PASS" : "FAIL";
trace.wado = trace.dicomwebRequests.some((request) => request.url.includes("/instances/")) ? "PASS" : "FAIL";
trace.result = trace.trustedHttps === "PASS" &&
  trace.ohifLoad === "PASS" &&
  trace.authorizationHeaderPresent &&
  trace.bearerSchemePresent &&
  !trace.tokenInUrl &&
  trace.qido === "PASS" &&
  trace.wado === "PASS" ? "PASS" : "FAIL";

console.log(JSON.stringify(trace, null, 2));
process.exit(trace.result === "PASS" ? 0 : 1);

async function runUiFlow(client) {
  const expression = `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const click = async (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error('Missing selector: ' + selector);
        element.click();
        await wait(1800);
      };
      await click('#patient-consent');
      await click('#doctor-request-token');
      await click('#doctor-open-series');
      const firstSeries = document.querySelector('[data-series-uid]');
      if (firstSeries) {
        firstSeries.click();
        await wait(1200);
      }
      await click('#load-instances');
      const firstInstance = document.querySelector('[data-sop-uid]');
      if (!firstInstance) throw new Error('Missing instance row');
      firstInstance.click();
      await wait(1800);
      return {
        viewerStatus: document.querySelector('#viewer-status')?.textContent ?? null,
        instanceRows: document.querySelectorAll('[data-sop-uid]').length,
      };
    })()
  `;
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser UI flow failed");
  }
  return result.result.value;
}

async function runBrowserFetchFlow(client) {
  const expression = `
    (async () => {
      const suffix = Date.now();
      const studyUid = '1.2.410.100.1.20260620.001';
      const seriesUid = '1.2.410.100.1.20260620.001.1';
      const sopUid = seriesUid + '.1';
      const patientHeaders = {
        'content-type': 'application/json',
        'x-hipass-role': 'PATIENT',
        'x-hipass-user-id': 'P-1001',
        'x-hipass-patient-id': 'P-1001',
        'x-hipass-session-id': 'browser-patient-' + suffix
      };
      const doctorHeaders = {
        'content-type': 'application/json',
        'x-hipass-role': 'DOCTOR',
        'x-hipass-user-id': 'DOC-B-01',
        'x-hipass-doctor-id': 'DOC-B-01',
        'x-hipass-hospital-id': 'HOSP-B',
        'x-hipass-session-id': 'browser-doctor-' + suffix
      };
      const consent = await fetch('/api/consents', {
        method: 'POST',
        headers: patientHeaders,
        body: JSON.stringify({
          patientId: 'P-1001',
          sourceHospitalId: 'HOSP-A',
          targetHospitalId: 'HOSP-B',
          purpose: 'TRANSFER',
          permission: 'VIEW_ONLY',
          validFrom: '2026-07-01T00:00:00.000Z',
          validUntil: '2026-12-31T23:59:59.000Z',
          scopes: [{ studyInstanceUid: studyUid, seriesInstanceUid: seriesUid }]
        })
      }).then((response) => response.json());
      const access = await fetch('/api/dicom-access/request', {
        method: 'POST',
        headers: doctorHeaders,
        body: JSON.stringify({
          consentId: consent.consentId,
          doctorId: 'DOC-B-01',
          requestingHospitalId: 'HOSP-B',
          studyInstanceUid: studyUid,
          seriesInstanceUid: seriesUid,
          purpose: 'TRANSFER',
          requestedAction: 'VIEW'
        })
      }).then((response) => response.json());
      if (!access.accessToken) throw new Error('Token not issued: ' + JSON.stringify(access));
      const authHeaders = { authorization: 'Bearer ' + access.accessToken };
      const studies = await fetch('/dicomweb/studies', { headers: authHeaders });
      const series = await fetch('/dicomweb/studies/' + studyUid + '/series', { headers: authHeaders });
      const instances = await fetch('/dicomweb/studies/' + studyUid + '/series/' + seriesUid + '/instances', { headers: authHeaders });
      const wado = await fetch('/dicomweb/studies/' + studyUid + '/series/' + seriesUid + '/instances/' + sopUid, { headers: authHeaders });
      const bytes = await wado.arrayBuffer();
      return {
        studies: studies.status,
        series: series.status,
        instances: instances.status,
        wado: wado.status,
        bytes: bytes.byteLength
      };
    })()
  `;
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser fetch flow failed");
  }
  trace.browserFetchFlow = result.result.value;
}

async function openTab(url) {
  const response = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
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
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => pending.set(id, { resolve: resolveSend, reject: rejectSend }));
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
  for (const key of ["token", "access_token", "jwt"]) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "[REDACTED]");
  }
  return url.toString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
