import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createDecipheriv, createHmac } from 'node:crypto';
import { inspect } from 'node:util';
import { V3IdentifierProtection, IdentifierProtectionError } from '../src/v3-identifier-protection.js';

const localRef = 'SYNTHETIC-LOCAL-A-001';
function fixture() {
  const encryptionKey = randomBytes(32);
  const lookupKey = randomBytes(32);
  const options = { encryptionKeys: new Map([['demo-v1', encryptionKey]]), activeKeyId: 'demo-v1', lookupKey };
  const provider = new V3IdentifierProtection(options);
  const context = { tenantId: randomUUID(), hospitalId: randomUUID(), patientRefId: randomUUID() };
  return { options, encryptionKey, lookupKey, provider, context };
}
function invalid(action, code = 'IDENTIFIER_PROTECTION_INVALID') {
  assert.throws(action, error => error instanceof IdentifierProtectionError && error.code === code
    && error.message === code && !('cause' in error));
}
function altered(input, change) {
  const envelope = JSON.parse(Buffer.from(input.protectedLocalRef, 'base64url').toString());
  change(envelope);
  return { ...input, protectedLocalRef: Buffer.from(JSON.stringify(envelope)).toString('base64url') };
}

test('identifier provider verifies AEAD and keyed digest without returning plaintext', () => {
  const f = fixture();
  try {
    const input = f.provider.protect(localRef, f.context);
    const verified = f.provider.verify(input, f.context);
    assert.deepEqual(Object.keys(verified), ['protectedLocalRef', 'localRefDigest', 'algorithm', 'keyId']);
    assert.equal(verified.localRefDigest.length, 32);
    assert.equal(verified.algorithm, 'A256GCM');
    assert.equal(verified.keyId, 'demo-v1');
    assert.ok(!verified.protectedLocalRef.includes(Buffer.from(localRef)));
    // Independent standard-library calculation verifies exact contract, not just roundtrip.
    const envelope = JSON.parse(verified.protectedLocalRef.toString());
    const cipher = createDecipheriv('aes-256-gcm', f.encryptionKey, Buffer.from(envelope.nonce, 'base64url'), { authTagLength: 16 });
    cipher.setAAD(Buffer.from(JSON.stringify(['HPV3-LOCAL-REF', 1, 'A256GCM', 'demo-v1',
      f.context.tenantId, f.context.hospitalId, f.context.patientRefId])));
    cipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const clear = Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64url')), cipher.final()]);
    assert.equal(clear.toString(), localRef);
    clear.fill(0);
    const digest = createHmac('sha256', f.lookupKey).update(JSON.stringify([
      'HPV3-LOCAL-LOOKUP', 1, f.context.tenantId, f.context.hospitalId, localRef])).digest();
    assert.ok(digest.equals(verified.localRefDigest));
  } finally { f.provider.dispose(); }
});

for (const property of ['tenantId', 'hospitalId', 'patientRefId']) {
  test(`identifier protection denies changed ${property}`, () => {
    const f = fixture();
    try { invalid(() => f.provider.verify(f.provider.protect(localRef, f.context), { ...f.context, [property]: randomUUID() })); }
    finally { f.provider.dispose(); }
  });
}
test('lookup matches same local ID across PatientRef but differs across hospitals/tenants', () => {
  const f = fixture();
  try {
    const input = f.provider.protect(localRef, f.context);
    const otherPatient = f.provider.protect(localRef, { ...f.context, patientRefId: randomUUID() });
    assert.equal(input.localRefDigest, otherPatient.localRefDigest);
    for (const name of ['tenantId', 'hospitalId']) {
      assert.notEqual(input.localRefDigest, f.provider.protect(localRef, { ...f.context, [name]: randomUUID() }).localRefDigest);
    }
  } finally { f.provider.dispose(); }
});
test('randomized protection retains deterministic lookup and canonical UUID casing', () => {
  const f = fixture();
  try {
    const inputs = Array.from({ length: 128 }, () => f.provider.protect(localRef, f.context));
    assert.equal(new Set(inputs.map(item => item.protectedLocalRef)).size, 128);
    assert.equal(new Set(inputs.map(item => JSON.parse(Buffer.from(item.protectedLocalRef, 'base64url')).nonce)).size, 128);
    assert.equal(new Set(inputs.map(item => item.localRefDigest)).size, 1);
    const uppercase = Object.fromEntries(Object.entries(f.context).map(([key, value]) => [key, value.toUpperCase()]));
    assert.doesNotThrow(() => f.provider.verify(inputs[0], uppercase));
  } finally { f.provider.dispose(); }
});
for (const part of ['nonce', 'ciphertext', 'tag']) {
  test(`identifier protection denies tampered ${part}`, () => {
    const f = fixture();
    try {
      const changed = altered(f.provider.protect(localRef, f.context), envelope => {
        const bytes = Buffer.from(envelope[part], 'base64url'); bytes[0] ^= 1; envelope[part] = bytes.toString('base64url');
      });
      invalid(() => f.provider.verify(changed, f.context));
    } finally { f.provider.dispose(); }
  });
}
test('wrong key and digest fail closed with one safe error', () => {
  const f = fixture();
  const other = new V3IdentifierProtection({ ...f.options, encryptionKeys: new Map([['demo-v1', randomBytes(32)]]) });
  try {
    const input = f.provider.protect(localRef, f.context);
    invalid(() => other.verify(input, f.context));
    invalid(() => f.provider.verify({ ...input, localRefDigest: randomBytes(32).toString('base64url') }, f.context));
  } finally { f.provider.dispose(); other.dispose(); }
});
test('unknown version/algorithm/key, extra fields and short nonce/tag rejected', () => {
  const f = fixture();
  try {
    const input = f.provider.protect(localRef, f.context);
    const changes = [e => { e.v = 2; }, e => { e.alg = 'none'; }, e => { e.keyId = 'missing'; },
      e => { e.extra = true; }, e => { e.nonce = randomBytes(11).toString('base64url'); },
      e => { e.tag = randomBytes(15).toString('base64url'); }, e => { e.ciphertext = ''; }];
    for (const change of changes) invalid(() => f.provider.verify(altered(input, change), f.context));
  } finally { f.provider.dispose(); }
});
test('noncanonical, malformed, duplicate or oversized input rejected without reflected data', () => {
  const f = fixture();
  try {
    const input = f.provider.protect(localRef, f.context);
    const json = Buffer.from(input.protectedLocalRef, 'base64url').toString();
    for (const value of ['', input.protectedLocalRef + '=', '!', 'a'.repeat(4097),
      Buffer.from('null').toString('base64url'), Buffer.from('{broken').toString('base64url'),
      Buffer.from(json + ' ').toString('base64url'), Buffer.from(json.replace('{', '{"v":1,')).toString('base64url')]) {
      invalid(() => f.provider.verify({ ...input, protectedLocalRef: value }, f.context));
    }
    for (const digest of ['', input.localRefDigest + '=', randomBytes(31).toString('base64url'), randomBytes(33).toString('base64url')]) {
      invalid(() => f.provider.verify({ ...input, localRefDigest: digest }, f.context));
    }
  } finally { f.provider.dispose(); }
});
test('exact local reference preserved: no automatic case/space/Unicode merge', () => {
  const f = fixture();
  try {
    const refs = [localRef, localRef.toLowerCase(), ` ${localRef}`, `${localRef} `, 'SYNTH-é', 'SYNTH-e\u0301'];
    assert.equal(new Set(refs.map(value => f.provider.protect(value, f.context).localRefDigest)).size, refs.length);
    for (const value of ['x', '한'.repeat(85), 'x'.repeat(256)]) assert.doesNotThrow(() => f.provider.verify(f.provider.protect(value, f.context), f.context));
    for (const value of ['', 'x'.repeat(257), '한'.repeat(86), '\u0000', 'x\ny', '\ud800', null, 5]) {
      invalid(() => f.provider.protect(value, f.context), 'LOCAL_REFERENCE_INVALID');
    }
  } finally { f.provider.dispose(); }
});
test('unconfigured/short/shared keys and malformed context fail closed', () => {
  const f = fixture();
  try {
    for (const options of [undefined, {}, { ...f.options, lookupKey: randomBytes(31) },
      { ...f.options, activeKeyId: 'missing' }, { ...f.options, lookupKey: f.encryptionKey },
      { ...f.options, encryptionKeys: new Map([['demo-v1', randomBytes(31)]]) }]) {
      invalid(() => new V3IdentifierProtection(options), 'IDENTIFIER_KEY_CONFIGURATION_INVALID');
    }
    for (const context of [null, {}, { ...f.context, tenantId: 'HOSP-A' }]) {
      invalid(() => f.provider.protect(localRef, context), 'IDENTIFIER_CONTEXT_INVALID');
    }
  } finally { f.provider.dispose(); }
});
test('encryption key rotation keeps lookup stable; removing old key denies old envelope', () => {
  const f = fixture();
  const nextKey = randomBytes(32);
  const next = new V3IdentifierProtection({ ...f.options, encryptionKeys: new Map([...f.options.encryptionKeys, ['demo-v2', nextKey]]), activeKeyId: 'demo-v2' });
  const removed = new V3IdentifierProtection({ ...f.options, encryptionKeys: new Map([['demo-v2', nextKey]]), activeKeyId: 'demo-v2' });
  try {
    const previous = f.provider.protect(localRef, f.context);
    const current = next.protect(localRef, f.context);
    assert.equal(previous.localRefDigest, current.localRefDigest);
    assert.equal(next.verify(previous, f.context).keyId, 'demo-v1');
    assert.equal(removed.verify(current, f.context).keyId, 'demo-v2');
    invalid(() => removed.verify(previous, f.context));
  } finally { f.provider.dispose(); next.dispose(); removed.dispose(); }
});
test('keys copied and not enumerable; dispose disables provider without mutating caller keys', () => {
  const f = fixture();
  const snapshot = Buffer.from(f.encryptionKey);
  try {
    const input = f.provider.protect(localRef, f.context);
    assert.deepEqual(Object.keys(f.provider), []);
    assert.equal(JSON.stringify(f.provider), '{}');
    assert.ok(!inspect(f.provider, { showHidden: true }).includes(f.encryptionKey.toString('hex')));
    f.encryptionKey.fill(0); f.lookupKey.fill(0);
    assert.doesNotThrow(() => f.provider.verify(input, f.context));
    f.provider.dispose(); f.provider.dispose();
    invalid(() => f.provider.verify(input, f.context), 'IDENTIFIER_PROVIDER_UNAVAILABLE');
    invalid(() => f.provider.protect(localRef, f.context), 'IDENTIFIER_PROVIDER_UNAVAILABLE');
    const separate = new V3IdentifierProtection({ encryptionKeys: new Map([['demo-v1', snapshot]]), activeKeyId: 'demo-v1', lookupKey: randomBytes(32) });
    separate.dispose(); assert.ok(snapshot.some(byte => byte !== 0));
  } finally { f.provider.dispose(); snapshot.fill(0); }
});
