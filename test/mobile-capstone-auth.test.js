import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const client = readFileSync('public/mobile/app.js', 'utf8');
const worker = readFileSync('public/mobile/sw.js', 'utf8');
const mobileHtml = readFileSync('public/mobile/index.html', 'utf8');

test('untrusted browser sync only requests an authenticated status refresh', () => {
  const code = client.slice(client.indexOf('function onQrConsumedByHospital('), client.indexOf('function stopTicketStatusPolling('));
  for (const status of ['ACTIVE', 'REVOKED', 'EXPIRED']) {
    const messages = [];
    const state = { isAuthenticated: true, activeTicket: { ticketId: 'test' }, activeConsent: { status }, countdownTimer: 42 };
    const context = vm.createContext({ state, refreshActiveTicketStatus: () => messages.push('refresh'),
      document: { querySelector() { assert.fail('Broadcast cannot change DOM state'); } },
      clearInterval() { assert.fail('Broadcast cannot stop expiry'); }, renderHomeScreen() { assert.fail('Broadcast cannot claim consumption'); },
    });
    vm.runInContext(code, context); vm.runInContext('onQrConsumedByHospital()', context);
    assert.equal(messages.length, status === 'ACTIVE' ? 1 : 0);
    assert.equal(state.activeConsent.status, status); assert.equal(state.countdownTimer, 42);
    assert.doesNotMatch(messages.join(''), /접수가 완료|CONSUMED/);
  }
});

test('mobile confirmation has explicit accept/cancel and fails closed on timeout, Escape or unsupported dialogs', async () => {
  const code = client.slice(client.indexOf('function confirmMobileAction('), client.indexOf('function applyMobileRevocation('));
  for (const action of ['accept', 'cancel', 'escape', 'timeout', 'unsupported', 'open-failure']) {
    let dialog; let deadline;
    const nodes = [];
    const create = tag => {
      const node = { tag, handlers: {}, style: {}, open: false, removed: false, setAttribute() {}, append() {}, focus() {},
        addEventListener(name, fn) { this.handlers[name] = fn; },
        remove() { this.removed = true; }, close() { this.open = false; this.handlers.close?.(); },
      };
      if (tag === 'dialog') {
        dialog = node;
        if (action !== 'unsupported') node.showModal = () => { if (action === 'open-failure') throw new Error('UNAVAILABLE'); node.open = true; };
      }
      nodes.push(node); return node;
    };
    const context = vm.createContext({ document: { querySelector: () => null, createElement: create, body: { append() {} } },
      showToast() {}, setTimeout: (fn, milliseconds) => { assert.equal(milliseconds, 120000); deadline = fn; return 1; }, clearTimeout() {},
    });
    vm.runInContext(code, context);
    const pending = vm.runInContext('confirmMobileAction("<img src=x onerror=unsafe>")', context);
    if (action === 'accept') nodes.find(node => node.textContent === '확인 후 실행').handlers.click();
    if (action === 'cancel') nodes.find(node => node.textContent === '취소').handlers.click();
    if (action === 'escape') dialog.handlers.cancel({ preventDefault() {} });
    if (action === 'timeout') deadline();
    assert.equal(await pending, action === 'accept');
    if (action !== 'unsupported') assert.equal(dialog.removed, true);
    assert.equal(nodes.find(node => node.tag === 'p')?.textContent ?? '<img src=x onerror=unsafe>', '<img src=x onerror=unsafe>');
  }
  assert.doesNotMatch(client, /\bconfirm\(/);
});

test('confirming current QR never revokes a different consent selected during confirmation', async () => {
  const code = client.slice(client.indexOf('async function handleRevokeCurrentQr('), client.indexOf('async function handleRevokeAllConsents('));
  const state = { activeConsent: { consentId: 'owned-first' } };
  const context = vm.createContext({ state, showToast() {}, confirmMobileAction: async () => { state.activeConsent = { consentId: 'owned-second' }; return true; },
    requestMobileRevocation() { assert.fail('Changed consent must not be revoked'); },
  });
  vm.runInContext(code, context);
  await vm.runInContext('handleRevokeCurrentQr()', context);
});

test('mobile simulator disclaims unverified identity, hardware, public integration and storage', () => {
  assert.doesNotMatch(mobileHtml, /Risk: LOW|0건 \(완전 차단\)|0 Byte \(Zeroization\)|보건복지부 마이데이터 안심 연계|원본 의료영상을 즉시/);
  for (const disclaimer of ['TEE·단말 무결성·위험도: NOT VERIFIED', '공공기관 연계 미구현', '모바일 저장소 미연동', '실제 DICOM 슬라이스 열람은 미구현', '실제 환자의 법적 동의서나 병원 운영 승인이 아닙니다.']) assert.ok(mobileHtml.includes(disclaimer), disclaimer);
  assert.match(mobileHtml, /id="check-mask-sensitive" disabled/);
});

test('mobile quick auth unlocks only after a patient-bound server simulation receipt', async () => {
  const code = client.slice(client.indexOf('async function handleQuickAuth('), client.indexOf('async function handleLockApp('));
  for (const receipt of [
    { authenticated: true, patientId: 'synthetic-patient', simulation: true },
    { authenticated: false, patientId: 'synthetic-patient', simulation: true },
    { authenticated: true, patientId: 'other-patient', simulation: true },
    { authenticated: true, patientId: 'synthetic-patient', simulation: false },
    {},
  ]) {
    const state = { isVerifying: false, isAuthenticated: false, patientId: 'synthetic-patient' };
    const icon = { textContent: '🔒' }, status = { textContent: '' };
    let loaded = 0;
    const context = vm.createContext({ state, AbortSignal, navigator: {}, setTimeout: callback => callback(),
      document: { querySelector: selector => selector === '#auth-main-icon' ? icon : selector === '#auth-verifying-text' ? status : null },
      patientHeaders: () => ({}), showToast() {}, loadInitialData: async () => { loaded++; },
      fetch: async () => {
        assert.equal(state.isAuthenticated, false);
        assert.equal(icon.textContent, '🔒');
        assert.doesNotMatch(status.textContent, /완료/);
        return { ok: true, json: async () => receipt };
      },
    });
    vm.runInContext(code, context);
    await vm.runInContext('handleQuickAuth("BIO")', context);
    const approved = receipt.authenticated === true && receipt.patientId === state.patientId && receipt.simulation === true;
    assert.equal(state.isAuthenticated, approved);
    assert.equal(loaded, approved ? 1 : 0);
    assert.equal(icon.textContent, approved ? '🔓' : '🔒');
    assert.equal(state.isVerifying, false);
  }
});

function headersContext(auth, marker = '1') {
  const start = client.indexOf('function patientHeaders()');
  const end = client.indexOf('function showToast(', start);
  const context = vm.createContext({ capstoneAuth: auth, document: { documentElement: { dataset: { capstone: marker } } }, state: { patientId: 'P-1001', authMethod: 'BIO' } });
  vm.runInContext(client.slice(start, end), context);
  return () => vm.runInContext('patientHeaders()', context);
}
test('mobile capstone client uses only signed patient profile, never spoofed role headers', () => {
  let role;
  const result = headersContext({ headers(value) { role = value; return { authorization: 'Bearer synthetic-unit-fixture' }; } })();
  assert.equal(role, 'PATIENT');
  assert.equal(result.authorization, 'Bearer synthetic-unit-fixture');
  assert.equal(result['content-type'], 'application/json');
  assert.equal(Object.keys(result).length, 2);
});
test('missing or expired capstone session cannot fall back to development identity', () => {
  assert.throws(headersContext(null), /CAPSTONE_AUTH_REQUIRED/);
  assert.throws(headersContext({ headers() { throw new Error('SESSION_EXPIRED'); } }), /SESSION_EXPIRED/);
  assert.equal(headersContext(null, '')()['x-hipass-role'], 'PATIENT'); // explicit legacy development page only
});
test('mobile initialization waits for presenter login and supports DOM already loaded', () => {
  const init = client.slice(client.indexOf('async function initializeMobileApp()'), client.indexOf('function setupNavigation()'));
  assert.ok(init.indexOf('await initializeCapstoneAuth()') < init.indexOf('setupNavigation()'));
  assert.match(init, /document.readyState === "loading"/);
  assert.match(init, /else startMobileApp\(\)/);
  assert.doesNotMatch(client, /(?:localStorage|sessionStorage)\s*\./);
});
test('mobile revocation requires exact server-confirmed consent and never treats HTTP failure or expiry as success', async () => {
  const start = client.indexOf('async function requestMobileRevocation(');
  const end = client.indexOf('function applyMobileRevocation(', start);
  for (const sample of [
    { ok: false, consentId: 'consent-unit', status: 'REVOKED' },
    { ok: true, consentId: 'other-unit', status: 'REVOKED' },
    { ok: true, consentId: 'consent-unit', status: 'EXPIRED' },
    { ok: true, consentId: 'consent-unit', status: 'ACTIVE' },
    { ok: true, consentId: 'consent-unit', status: 'REVOKED' },
  ]) {
    const context = vm.createContext({ AbortSignal, encodeURIComponent, patientHeaders: () => ({}), fetch: async () => ({ ok: sample.ok, json: async () => sample }) });
    vm.runInContext(client.slice(start, end), context);
    const pending = vm.runInContext('requestMobileRevocation("consent-unit")', context);
    if (sample.ok && sample.status === 'REVOKED' && sample.consentId === 'consent-unit') assert.equal((await pending).status, 'REVOKED');
    else await assert.rejects(pending, /REVOCATION_NOT_CONFIRMED/);
  }
});

function workerFixture() {
  const callbacks = new Map();
  const puts = [], deletes = [], fetches = [];
  const context = vm.createContext({
    URL, AbortSignal, Response,
    self: { location: { origin: 'https://synthetic.invalid' }, addEventListener: (name, fn) => callbacks.set(name, fn), clients: { claim() {} } },
    caches: { open: async () => ({ put: async (...args) => puts.push(args), match: async () => undefined }), keys: async () => ['other-app-cache', 'hipass-mediq-shell-v1', 'hipass-mediq-shell-v2'], delete: async name => { deletes.push(name); } },
    fetch: async request => { fetches.push(request.url); return new Response('static-shell', { status: 200 }); },
  });
  vm.runInContext(worker, context);
  return { callbacks, puts, deletes, fetches };
}

test('mobile share submission preserves every selected consent duration and rejects unknown durations before HTTP', async () => {
  const now = Date.parse('2026-10-09T00:00:00Z');
  class FixedDate extends Date { static now() { return now; } }
  const code = client.slice(client.indexOf('function mobileConsentValidUntil('), client.indexOf('function renderActiveQrView('));
  for (const [duration, hours] of [['1h', 1], ['24h', 24], ['7d', 168], ['forever', null], ['__proto__', null], ['', null]]) {
    const calls = [];
    const context = vm.createContext({
      Date: FixedDate, AbortSignal, encodeURIComponent,
      state: { shareTargetDuration: duration, shareSelectedItems: new Set(['1.2.3']), studies: [{ studyInstanceUid: '1.2.3' }], patientId: 'synthetic-patient', sourceHospitalId: 'HOSP-A', shareTargetHospital: 'HOSP-B' },
      showToast() {}, patientHeaders: () => ({}),
      fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: false }; },
    });
    vm.runInContext(code, context);
    await vm.runInContext('handleExecuteShareTicket()', context);
    if (hours === null) assert.equal(calls.length, 0, duration);
    else {
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, '/api/consents');
      assert.equal(Date.parse(calls[0].body.validUntil) - now, hours * 3600000);
      assert.equal(calls[0].body.permission, 'VIEW_ONLY');
    }
  }
});
test('PWA never caches clinical routes, authorization, query URLs or unknown mobile files', () => {
  const fixture = workerFixture();
  for (const path of ['/api/imaging-studies', '/dicomweb/studies/1.2', '/mobile/private.json', '/mobile/app.js?key=synthetic', '/assets/clinical/x.js']) {
    fixture.callbacks.get('fetch')({ request: new Request('https://synthetic.invalid' + path), respondWith() { assert.fail('Sensitive request intercepted'); } });
  }
  fixture.callbacks.get('fetch')({ request: new Request('https://synthetic.invalid/mobile/app.js', { headers: { authorization: 'Bearer unit-only' } }), respondWith() { assert.fail('Credential-bearing request cached'); } });
  assert.equal(fixture.puts.length, 0);
});
test('PWA caches exact public shell and only removes its own older versions', async () => {
  const fixture = workerFixture();
  let pending;
  fixture.callbacks.get('fetch')({ request: new Request('https://synthetic.invalid/mobile/app.js'), respondWith(promise) { pending = promise; } });
  assert.equal((await pending).status, 200);
  assert.equal(fixture.puts.length, 1);
  fixture.callbacks.get('activate')({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(fixture.deletes, ['hipass-mediq-shell-v1', 'hipass-mediq-shell-v2']);
});

test('mobile shares local design assets without caching private UI paths or disabling zoom', async () => {
  assert.doesNotMatch(mobileHtml, /user-scalable=no|maximum-scale=1/);
  for (const asset of ['/ui/tokens.css', '/ui/components.css', '/ui/mobile.css']) {
    assert.ok(mobileHtml.includes(`href="${asset}"`));
    const fixture = workerFixture(); let pending;
    fixture.callbacks.get('fetch')({ request: new Request('https://synthetic.invalid' + asset), respondWith(promise) { pending = promise; } });
    assert.equal((await pending).status, 200);
    assert.equal(fixture.puts.length, 1);
  }
  const fixture = workerFixture();
  fixture.callbacks.get('fetch')({ request: new Request('https://synthetic.invalid/ui/private.json'), respondWith() { assert.fail('Unknown UI resource cached'); } });
});
