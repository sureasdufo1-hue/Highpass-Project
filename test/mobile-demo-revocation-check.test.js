import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOwnedDemoRevocation } from '../src/mobile-demo-revocation-check.js';

const proof = { environment: 'CAPSTONE_SYNTHETIC_ONLY', consentId: 'consent_0123456789abcdef', ticketId: 'ticket_0123456789abcdef' };
function fixture(override = {}) {
  const replies = [
    { status: 200, body: [{ ticketId: proof.ticketId, consentId: proof.consentId, actorId: 'P-1001', result: 'SUCCESS' }] },
    { status: 200, body: { consentId: proof.consentId, patientId: 'P-1001', sourceHospitalId: 'HOSP-A', targetHospitalId: 'HOSP-B', permission: 'VIEW_ONLY', purpose: 'TREATMENT', status: 'ACTIVE', scopes: [{ studyInstanceUid: '1.2.410.100.1.20260620.001' }] } },
    { status: 200, body: { decision: 'ALLOWED', accessToken: 'synthetic-unit-token' } },
    { status: 200, body: [{}] },
    { status: 200, body: { consentId: proof.consentId, status: 'REVOKED' } },
    { status: 403, body: { decision: 'DENIED', reasonCode: 'ACCESS_DENIED_CONSENT_REVOKED' } },
    { status: 403, body: { error: 'ACCESS_DENIED' } },
    { status: 200, body: { ok: true } },
  ];
  for (const [index, reply] of Object.entries(override)) replies[Number(index)] = reply;
  const calls = [];
  const request = async (...args) => { calls.push(args); return replies[calls.length - 1]; };
  return { request, calls };
}
test('owned synthetic API revocation proves allow then both new and existing token denial without emitting secrets', async () => {
  const { request, calls } = fixture();
  const result = await verifyOwnedDemoRevocation(request, proof);
  assert.equal(result.status, 'PASS');
  assert.equal(result.browserConfirmation, 'NOT VERIFIED');
  assert.equal(result.ticketReplay, 'NOT VERIFIED');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-unit-token|accessToken/);
  assert.equal(calls[4][0], `/api/consents/${proof.consentId}/revoke`);
});
test('wrong ownership and scope stop before any token issuance or revocation', async () => {
  for (const override of [
    { 0: { status: 200, body: [{ ticketId: proof.ticketId, consentId: 'other', actorId: 'P-1001', result: 'SUCCESS' }] } },
    { 1: { status: 200, body: { consentId: proof.consentId, patientId: 'other' } } },
  ]) {
    const { request, calls } = fixture(override);
    await assert.rejects(verifyOwnedDemoRevocation(request, proof), /OWNED_/);
    assert.ok(calls.length <= 2);
  }
});
test('transport errors, generic server failure and wrong revocation receipt never count as policy denial', async () => {
  for (const override of [
    { 4: { status: 200, body: { consentId: 'other', status: 'REVOKED' } } },
    { 5: { status: 503, body: { decision: 'DENIED', reasonCode: 'ACCESS_DENIED_CONSENT_REVOKED' } } },
    { 6: { status: 403, body: { error: 'DNS_FAILURE' } } },
    { 7: { status: 200, body: { ok: false } } },
  ]) await assert.rejects(verifyOwnedDemoRevocation(fixture(override).request, proof), /NOT_CONFIRMED/);
  await assert.rejects(verifyOwnedDemoRevocation(async () => { throw new Error('ECONNREFUSED'); }, proof), /ECONNREFUSED/);
});
