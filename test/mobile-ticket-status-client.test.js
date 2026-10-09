import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const client = readFileSync('public/mobile/app.js', 'utf8');
const code = client.slice(client.indexOf('function stopTicketStatusPolling('), client.indexOf('async function requestMobileRevocation('));
function fixture(receipt, { ok = true, change = false, expirePending = false } = {}) {
  const ticket = { ticketId: 'owned-ticket', qr: { payload: 'sensitive-capability', expiresAt: '2026-12-01T00:00:00Z' } };
  const state = { activeTicket: ticket, activeConsent: { consentId: 'owned-consent', status: 'ACTIVE' }, isAuthenticated: true, countdownTimer: 1 };
  const nodes = new Map(); let stopped = 0, timers = 0;
  const context = vm.createContext({ state, AbortSignal, encodeURIComponent, Date,
    document: { querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); } },
    clearTimeout() {}, clearInterval() { stopped++; }, setTimeout() { timers++; }, patientHeaders: () => ({ authorization: 'unit-only' }),
    fetch: async (url, options) => {
      assert.equal(url, '/api/consents/owned-consent/handoff-tickets/owned-ticket');
      assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
      if (change) state.activeTicket = { ticketId: 'different-ticket' };
      if (expirePending) { ticket.terminal = true; ticket.qr.payload = null; }
      return { ok, json: async () => receipt };
    },
  });
  vm.runInContext(code, context);
  return { state, ticket, nodes, run: () => vm.runInContext('refreshActiveTicketStatus()', context), stopped: () => stopped, timers: () => timers, context };
}
const receipt = status => ({ ticketId: 'owned-ticket', consentId: 'owned-consent', expiresAt: '2026-12-01T00:00:00Z', status });
test('an in-flight ISSUED receipt cannot relabel a locally expired QR as usable', async () => {
  const f = fixture(receipt('ISSUED'), {expirePending:true});
  await f.run();
  assert.equal(f.ticket.terminal,true); assert.equal(f.ticket.qr.payload,null);
  assert.equal(f.nodes.size,0);
});
test('matching server terminal status removes QR capability and stops deadline', async () => {
  for (const status of ['USED', 'REVOKED', 'EXPIRED']) {
    const f = fixture(receipt(status)); await f.run();
    assert.equal(f.ticket.terminal, true); assert.equal(f.ticket.qr.payload, null);
    assert.equal(f.stopped(), 1); assert.match(f.nodes.get('#qr-status-pill').textContent, new RegExp(status));
  }
});
test('HTTP failure, mismatched receipt, unknown status and stale response cannot claim consumption', async () => {
  for (const [body, options] of [[receipt('USED'), { ok: false }], [{ ...receipt('USED'), ticketId: 'other' }, {}], [receipt('INVALID'), {}], [receipt('USED'), { change: true }]]) {
    const f = fixture(body, options); await f.run();
    assert.equal(f.ticket.terminal, undefined); assert.equal(f.stopped(), 0);
    assert.doesNotMatch(f.nodes.get('#qr-status-pill')?.textContent ?? '', /사용 완료/);
  }
  const revoked = fixture(receipt('USED')); revoked.state.activeConsent.status = 'REVOKED'; await revoked.run(); assert.equal(revoked.ticket.terminal, undefined);
});
test('status polling never starts for expired or malformed deadlines or locked app', async () => {
  for (const expiry of ['invalid', '2000-01-01T00:00:00Z']) {
    const f = fixture(receipt('ISSUED')); f.ticket.qr.expiresAt = expiry;
    vm.runInContext('startTicketStatusPolling()', f.context); assert.equal(f.timers(), 0);
  }
  const locked = fixture(receipt('USED')); locked.state.isAuthenticated = false; await locked.run(); assert.equal(locked.stopped(), 0);
});
