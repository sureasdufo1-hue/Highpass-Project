import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupOwnedConsent } from '../scripts/browser-owned-consent-cleanup.js';

const receipt = { consentId: 'consent_ab1234', patientId: 'P-1001', sourceHospitalId: 'HOSP-A', targetHospitalId: 'HOSP-B', status: 'ACTIVE' };
const response = status => ({ status: 200, body: { ...receipt, status } });

test('phantom cleanup requires explicit fixed profile and matching fresh receipt', async () => {
  const phantom = { ...receipt, patientId: 'HP-TEST-PHANTOM-001' };
  for (const expectedPatientId of [undefined, 'OTHER', 'P-1001']) {
    let calls = 0;
    const result = await cleanupOwnedConsent({ receipts: [phantom], expectedPatientId, request: async () => { calls++; } });
    assert.equal(result.status, 'NOT VERIFIED');
    assert.equal(calls, 0);
  }
  const replies = ['ACTIVE', 'REVOKED', 'REVOKED'];
  const result = await cleanupOwnedConsent({ receipts: [phantom], expectedPatientId: phantom.patientId, request: async () => ({ status: 200, body: { ...phantom, status: replies.shift() } }) });
  assert.equal(result.status, 'PASS');
  assert.equal(result.recordsDeleted, 0);
  assert.ok(!JSON.stringify(result).includes(phantom.consentId));
});

test('owned cleanup revokes and confirms only the exact fresh receipt, exports no ID', async () => {
  const calls = [], replies = [response('ACTIVE'), response('REVOKED'), response('REVOKED')];
  const result = await cleanupOwnedConsent({ receipts: [receipt], request: async (...args) => { calls.push(args); return replies.shift(); } });
  assert.deepEqual(calls, [['GET', '/api/consents/consent_ab1234'], ['POST', '/api/consents/consent_ab1234/revoke'], ['GET', '/api/consents/consent_ab1234']]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.recordsDeleted, 0);
  assert.deepEqual(result.httpStatuses, [200, 200, 200]);
  assert.ok(!JSON.stringify(result).includes(receipt.consentId));
});

for (const status of ['REVOKED', 'EXPIRED']) test(`owned cleanup does not mutate already ${status} consent`, async () => {
  const calls = [];
  const result = await cleanupOwnedConsent({ receipts: [receipt], request: async (...args) => { calls.push(args); return response(status); } });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'GET');
});

test('missing, duplicate, malformed or unrelated receipt never sends a request', async () => {
  for (const receipts of [[], [receipt, receipt], [{ ...receipt, consentId: '../other' }], [{ ...receipt, patientId: 'OTHER' }], [{ ...receipt, sourceHospitalId: 'OTHER' }], [{ ...receipt, targetHospitalId: 'OTHER' }]]) {
    let calls = 0;
    const result = await cleanupOwnedConsent({ receipts, request: async () => { calls++; } });
    assert.equal(result.status, 'NOT VERIFIED');
    assert.equal(calls, 0);
  }
});

test('mismatched current record prevents revocation', async () => {
  let calls = 0;
  const result = await cleanupOwnedConsent({ receipts: [receipt], request: async () => { calls++; return { status: 200, body: { ...receipt, targetHospitalId: 'OTHER' } }; } });
  assert.equal(result.status, 'NOT VERIFIED');
  assert.equal(calls, 1);
});

test('invalid revoke acknowledgment or failed confirmation never reports PASS', async () => {
  for (const replies of [[response('ACTIVE'), response('ACTIVE')], [response('ACTIVE'), response('REVOKED'), { status: 503, body: {} }]]) {
    const result = await cleanupOwnedConsent({ receipts: [receipt], request: async () => replies.shift() });
    assert.equal(result.status, 'NOT VERIFIED');
  }
});

test('transport errors remain unverified without leaking error details', async () => {
  const result = await cleanupOwnedConsent({ receipts: [receipt], request: async () => { throw new Error('SECRET_VALUE'); } });
  assert.equal(result.status, 'NOT VERIFIED');
  assert.ok(!JSON.stringify(result).includes('SECRET_VALUE'));
});
