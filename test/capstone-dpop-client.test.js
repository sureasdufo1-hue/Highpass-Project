import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createCapstoneProofClient } from '../src/capstone-dpop-client.js';

test('ephemeral DPoP signs method and canonical URL with unique jti and no private JWK', () => {
  const signer = createCapstoneProofClient('https://synthetic.invalid');
  const a = signer({ path: '/api/dicom-access/request?synthetic=1', method: 'POST', token: 'unit-token', issuance: true });
  const b = signer({ path: '/api/dicom-access/request', method: 'POST', token: 'unit-token', issuance: true });
  const parts = a.dpop.split('.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(header.alg, 'ES256'); assert.equal(header.typ, 'dpop+jwt');
  assert.equal(header.jwk.d, undefined);
  assert.equal(payload.htm, 'POST'); assert.equal(payload.htu, 'https://synthetic.invalid/api/dicom-access/request');
  assert.notEqual(payload.jti, JSON.parse(Buffer.from(b.dpop.split('.')[1], 'base64url')).jti);
  assert.equal(a.authorization, 'Bearer unit-token');
  assert.ok(verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: createPublicKey({ key: header.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')));
});
test('bound access token adds ath and DPoP scheme; cross-origin and non-HTTPS requests are denied', () => {
  const signer = createCapstoneProofClient('https://synthetic.invalid');
  const token = `unit.${Buffer.from(JSON.stringify({ cnf: { jkt: 'synthetic' } })).toString('base64url')}.signature`;
  const headers = signer({ path: '/dicomweb/studies', token });
  assert.equal(headers.authorization, `DPoP ${token}`);
  assert.equal(JSON.parse(Buffer.from(headers.dpop.split('.')[1], 'base64url')).ath, createHash('sha256').update(token).digest('base64url'));
  assert.throws(() => signer({ path: 'https://other.invalid/api', token, issuance: true }), /CROSS_ORIGIN/);
  assert.throws(() => createCapstoneProofClient('http://synthetic.invalid'), /HTTPS_ORIGIN/);
});
