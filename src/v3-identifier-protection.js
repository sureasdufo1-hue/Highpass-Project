import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const privateState = new WeakMap();
export class IdentifierProtectionError extends Error {
  constructor(code) { super(code); this.name = 'IdentifierProtectionError'; this.code = code; }
}
function fail(code) { throw new IdentifierProtectionError(code); }
function contextOf(value) {
  if (!value || typeof value !== 'object') fail('IDENTIFIER_CONTEXT_INVALID');
  return ['tenantId', 'hospitalId', 'patientRefId'].map(name => {
    if (typeof value[name] !== 'string' || !UUID.test(value[name])) fail('IDENTIFIER_CONTEXT_INVALID');
    return value[name].toLowerCase();
  });
}
function plainBytes(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) fail('LOCAL_REFERENCE_INVALID');
  const bytes = Buffer.from(value, 'utf8');
  if (!bytes.length || bytes.length > 256 || bytes.toString('utf8') !== value) {
    bytes.fill(0); fail('LOCAL_REFERENCE_INVALID');
  }
  return bytes;
}
function decode(value, min, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) fail('IDENTIFIER_PROTECTION_INVALID');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64url') !== value) fail('IDENTIFIER_PROTECTION_INVALID');
  return bytes;
}
function aad(context, keyId) { return Buffer.from(JSON.stringify(['HPV3-LOCAL-REF', 1, 'A256GCM', keyId, ...context])); }
function lookup(state, context, bytes) {
  return createHmac('sha256', state.lookupKey)
    .update(JSON.stringify(['HPV3-LOCAL-LOOKUP', 1, context[0], context[1], bytes.toString('utf8')])).digest();
}
function canonical(envelope) {
  return JSON.stringify({ v: envelope.v, alg: envelope.alg, keyId: envelope.keyId,
    nonce: envelope.nonce, ciphertext: envelope.ciphertext, tag: envelope.tag });
}
function stateOf(instance) {
  const state = privateState.get(instance);
  if (!state || state.disposed) fail('IDENTIFIER_PROVIDER_UNAVAILABLE');
  return state;
}

/** Internal provider, not an HTTP endpoint or patient-identity authorization. */
export class V3IdentifierProtection {
  constructor({ encryptionKeys, activeKeyId, lookupKey } = {}) {
    if (!(encryptionKeys instanceof Map) || encryptionKeys.size < 1 || encryptionKeys.size > 16
      || typeof activeKeyId !== 'string' || !KEY_ID.test(activeKeyId) || !encryptionKeys.has(activeKeyId)
      || !Buffer.isBuffer(lookupKey) || lookupKey.length !== 32) fail('IDENTIFIER_KEY_CONFIGURATION_INVALID');
    const keys = new Map();
    for (const [id, key] of encryptionKeys) {
      if (typeof id !== 'string' || !KEY_ID.test(id) || !Buffer.isBuffer(key) || key.length !== 32
        || timingSafeEqual(key, lookupKey)) fail('IDENTIFIER_KEY_CONFIGURATION_INVALID');
      keys.set(id, Buffer.from(key));
    }
    privateState.set(this, { keys, activeKeyId, lookupKey: Buffer.from(lookupKey), disposed: false });
  }
  protect(localRef, context) {
    const state = stateOf(this);
    const bound = contextOf(context);
    const bytes = plainBytes(localRef);
    try {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', state.keys.get(state.activeKeyId), nonce, { authTagLength: 16 });
      cipher.setAAD(aad(bound, state.activeKeyId));
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      const envelope = { v: 1, alg: 'A256GCM', keyId: state.activeKeyId, nonce: nonce.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
      return { protectedLocalRef: Buffer.from(canonical(envelope)).toString('base64url'),
        localRefDigest: lookup(state, bound, bytes).toString('base64url') };
    } catch { fail('IDENTIFIER_PROVIDER_UNAVAILABLE'); }
    finally { bytes.fill(0); }
  }
  verify({ protectedLocalRef, localRefDigest } = {}, context) {
    const state = stateOf(this);
    const bound = contextOf(context);
    let clear;
    let pending;
    try {
      if (typeof protectedLocalRef !== 'string' || protectedLocalRef.length > 4096) fail('IDENTIFIER_PROTECTION_INVALID');
      const protectedBytes = decode(protectedLocalRef, 24, 3072);
      const envelope = JSON.parse(protectedBytes.toString('utf8'));
      if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM' || typeof envelope.keyId !== 'string'
        || !KEY_ID.test(envelope.keyId) || canonical(envelope) !== protectedBytes.toString('utf8')) fail('IDENTIFIER_PROTECTION_INVALID');
      const key = state.keys.get(envelope.keyId);
      if (!key) fail('IDENTIFIER_PROTECTION_INVALID');
      const nonce = decode(envelope.nonce, 12, 12);
      const ciphertext = decode(envelope.ciphertext, 1, 256);
      const tag = decode(envelope.tag, 16, 16);
      const expected = decode(localRefDigest, 32, 32);
      const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
      decipher.setAAD(aad(bound, envelope.keyId));
      decipher.setAuthTag(tag);
      // GCM update may produce unauthenticated plaintext. Never expose it.
      pending = decipher.update(ciphertext);
      clear = Buffer.concat([pending, decipher.final()]);
      const checked = plainBytes(clear.toString('utf8'));
      try {
        if (!checked.equals(clear) || !timingSafeEqual(lookup(state, bound, clear), expected)) fail('IDENTIFIER_PROTECTION_INVALID');
      } finally { checked.fill(0); }
      return { protectedLocalRef: protectedBytes, localRefDigest: expected, algorithm: 'A256GCM', keyId: envelope.keyId };
    } catch {
      // No raw input, key, crypto exception details, cause or plaintext in errors.
      fail('IDENTIFIER_PROTECTION_INVALID');
    } finally { pending?.fill(0); clear?.fill(0); }
  }
  dispose() {
    const state = privateState.get(this);
    if (!state || state.disposed) return;
    for (const key of state.keys.values()) key.fill(0);
    state.lookupKey.fill(0); state.keys.clear(); state.disposed = true;
  }
}
