import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';

// Ephemeral private key stays in this closure; no key material is serialized.
export function createCapstoneProofClient(origin) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('PROOF_HTTPS_ORIGIN_REQUIRED');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return ({ path, method = 'GET', token, issuance = false }) => {
    const url = new URL(path, base);
    if (url.origin !== base.origin || url.username || url.password) throw new Error('PROOF_CROSS_ORIGIN_DENIED');
    let bound = false;
    if (token) { try { bound = Boolean(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).cnf?.jkt); } catch {} }
    const headers = token ? { authorization: `${bound ? 'DPoP' : 'Bearer'} ${token}` } : {};
    if (!bound && !issuance) return headers;
    const payload = { jti: randomUUID(), htm: method, htu: url.origin + url.pathname, iat: Math.floor(Date.now() / 1000) };
    if (bound) payload.ath = createHash('sha256').update(token).digest('base64url');
    const input = `${encode({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encode(payload)}`;
    headers.dpop = `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    return headers;
  };
}
