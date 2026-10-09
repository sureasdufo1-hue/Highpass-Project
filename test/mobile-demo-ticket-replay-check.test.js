import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySyntheticTicketReplay } from '../src/mobile-demo-ticket-replay-check.js';
const consentId = 'consent_0123456789abcdef', ticketId = 'ticket_0123456789abcdef';
function fixture(mode = 'success') {
  let redeems = 0, firstNonce;
  const calls = [];
  const request = async (path, role, body) => {
    calls.push({ path, role });
    if (path.startsWith('/api/imaging-studies')) return { status: 200, body: [{ studyInstanceUid: '1.2.410.100.1.20260620.001', sourceHospitalId: 'HOSP-A' }] };
    if (path === '/api/consents') return { status: 201, body: { ...body, consentId, status: 'ACTIVE' } };
    if (path.endsWith('/handoff-ticket')) return { status: 201, body: { consentId, ticketId, qr: { payload: 'https://demo.example/t/' + 'a'.repeat(43) } } };
    if (path.endsWith('/redeem-viewer')) {
      redeems++;
      if (redeems === 1) { firstNonce = body.nonce; return { status: 200, body: { decision: 'ALLOWED', ticketId, accessToken: 'never-output', viewerContext: { studyInstanceUid: '1.2.410.100.1.20260620.001', targetHospitalId: 'HOSP-B', permission: 'VIEW_ONLY' } } }; }
      assert.equal(body.nonce, firstNonce);
      if (mode === 'network') throw new Error('DNS failure');
      return { status: mode === 'server-error' ? 503 : 403, body: { decision: 'DENIED', reasonCode: mode === 'proof-replay' ? 'DPOP_REPLAY' : 'TICKET_ALREADY_USED' } };
    }
    if (path.endsWith('/revoke')) {
      assert.equal(path, `/api/consents/${consentId}/revoke`);
      return { status: 200, body: { consentId: mode === 'wrong-cleanup' ? 'other' : consentId, status: 'REVOKED' } };
    }
    if (path === '/api/audit-integrity') return { status: 200, body: { ok: true } };
    assert.fail(path);
  };
  return { request, calls };
}
test('same QR nonce replay must be denied by ticket policy and only our consent cleaned up', async () => {
  const { request, calls } = fixture();
  const progress = [];
  const result = await verifySyntheticTicketReplay(request, row => progress.push(row));
  assert.equal(result.status, 'PASS'); assert.equal(result.cleanup, 'PASS');
  assert.equal(progress.length, 2); assert.equal(calls.filter(call => call.path.endsWith('/revoke')).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /never-output|a{43}|qr|nonce"/);
});
test('proof replay, network failure, server errors and mismatched cleanup are not a successful QR deny', async () => {
  for (const mode of ['proof-replay', 'network', 'server-error', 'wrong-cleanup']) {
    const { request, calls } = fixture(mode);
    const result = await verifySyntheticTicketReplay(request);
    assert.equal(result.status, 'NOT VERIFIED', mode);
    assert.equal(calls.filter(call => call.path.endsWith('/revoke')).length, 1);
  }
});
test('unconfirmed synthetic source stops before creating consent', async () => {
  let calls = 0;
  const result = await verifySyntheticTicketReplay(async () => { calls++; return { status: 200, body: [] }; });
  assert.equal(result.status, 'NOT VERIFIED'); assert.equal(calls, 1); assert.equal(result.consentId, undefined);
});
