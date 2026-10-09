import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { verifyJwt } from '../src/auth.js';

function fixture() {
  const options = { issuer: 'synthetic-issuer', audience: 'synthetic-api', hmacSecret: randomBytes(32).toString('hex') };
  const now = Math.floor(Date.now()/1000);
  function token(change) {
    const claims = { iss: options.issuer, aud: options.audience, sub: 'synthetic-subject', exp: now+60, ...change };
    const input = [JSON.stringify({alg:'HS256'}), JSON.stringify(claims)].map(value => Buffer.from(value).toString('base64url')).join('.');
    return `${input}.${createHmac('sha256',options.hmacSecret).update(input).digest('base64url')}`;
  }
  return { options, token, now };
}
test('signed JWT requires finite NumericDate timestamps, not coercible strings or objects', () => {
  const f = fixture();
  for (const key of ['exp','iat','nbf']) for (const value of ['not-a-time', String(f.now+60), null, {}, [], true, Infinity, NaN]) {
    assert.throws(() => verifyJwt(f.token({[key]:value}),f.options), error => error.statusCode===401 && error.code==='JWT_REGISTERED_CLAIMS_INVALID');
  }
  assert.throws(() => verifyJwt(f.token({exp:undefined}),f.options), error => error.code==='JWT_REGISTERED_CLAIMS_INVALID');
});
test('signed JWT requires a nonempty string subject', () => {
  const f = fixture();
  for (const sub of [undefined,null,'',{},42,true]) {
    assert.throws(() => verifyJwt(f.token({sub}),f.options), error => error.code==='JWT_SUB_REQUIRED');
  }
});
test('valid integer and fractional NumericDates retain expiry and future-time checks', () => {
  const f = fixture();
  assert.doesNotThrow(() => verifyJwt(f.token({exp:f.now+60.5,iat:f.now-0.5,nbf:f.now-0.5}),f.options));
  assert.throws(() => verifyJwt(f.token({exp:f.now-1}),f.options), error=>error.code==='JWT_EXPIRED');
  assert.throws(() => verifyJwt(f.token({nbf:f.now+3600}),f.options), error=>error.code==='JWT_NOT_YET_VALID');
  assert.throws(() => verifyJwt(f.token({iat:f.now+3600}),f.options), error=>error.code==='JWT_IAT_INVALID');
  assert.throws(() => verifyJwt(f.token({}),{...f.options,hmacSecret:randomBytes(32).toString('hex')}), error=>error.code==='JWT_INVALID_SIGNATURE');
});
