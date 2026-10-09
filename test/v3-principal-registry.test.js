import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { TestProvider, DevelopmentMockProvider } from '../src/auth.js';
import { V3PrincipalRegistry } from '../src/v3-principal-registry.js';

function fixture() {
  const env = { JWT_ISSUER: 'synthetic-idp', JWT_AUDIENCE: 'synthetic-v3', TEST_JWT_SECRET: randomBytes(32).toString('hex') };
  const record = { issuer: env.JWT_ISSUER, subject: 'synthetic-admin', actorId: randomUUID(), tenantId: randomUUID(),
    hospitalId: randomUUID(), authHospitalId: 'SYNTHETIC-HOSP-A', role: 'HOSPITAL_ADMIN', scopes: ['mapping:read','mapping:write'], status: 'ACTIVE' };
  const registry = new V3PrincipalRegistry({ provider: new TestProvider(env), records: [record] });
  const policy = { requiredScope: 'mapping:write', allowedRoles: ['HOSPITAL_ADMIN'] };
  function request(change = {}, secret = env.TEST_JWT_SECRET) {
    const claims = { iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE, sub: record.subject, exp: Math.floor(Date.now()/1000)+60,
      role: record.role, hospitalId: record.authHospitalId, scope: 'mapping:read mapping:write', ...change };
    const input = [JSON.stringify({ alg: 'HS256', typ: 'JWT' }), JSON.stringify(claims)].map(value => Buffer.from(value).toString('base64url')).join('.');
    return { headers: { authorization: `Bearer ${input}.${createHmac('sha256', secret).update(input).digest('base64url')}` } };
  }
  return { env, record, registry, policy, request };
}
test('registry uses authenticated subject and server UUIDs; ignores spoofed body/header context', () => {
  const f = fixture(); const request = f.request();
  request.headers['x-hipass-hospital-id'] = 'SYNTHETIC-HOSP-B'; request.body = { tenantId: randomUUID(), hospitalId: randomUUID() };
  const bound = f.registry.resolve(request, f.policy);
  assert.equal(bound.actorId, f.record.actorId); assert.equal(bound.tenantId, f.record.tenantId); assert.equal(bound.hospitalId, f.record.hospitalId);
  assert.ok(Object.isFrozen(bound)); assert.ok(Object.isFrozen(bound.scopes));
});
for (const [name, change, code] of [['issuer', {iss: 'foreign-idp'}, 'JWT_ISSUER_INVALID'], ['audience', {aud: 'foreign-api'}, 'JWT_AUDIENCE_INVALID'],
  ['expiry', {exp: 1}, 'JWT_EXPIRED'], ['subject', {sub: 'unknown-subject'}, 'V3_PRINCIPAL_NOT_REGISTERED'], ['hospital', {hospitalId: 'SYNTHETIC-HOSP-B'}, 'V3_HOSPITAL_BINDING_MISMATCH'],
  ['role', {role: 'PLATFORM_ADMIN'}, 'V3_ROLE_NOT_ALLOWED'], ['scope', {scope: 'mapping:read'}, 'V3_SCOPE_NOT_ALLOWED']]) {
  test(`registry denies invalid ${name} before binding`, () => {
    const f = fixture(); assert.throws(() => f.registry.resolve(f.request(change), f.policy), error => error.code === code && [401,403].includes(error.statusCode));
  });
}
test('registry rejects signature forgery, no token and Development Mock', () => {
  const f = fixture();
  assert.throws(() => f.registry.resolve(f.request({}, randomBytes(32).toString('hex')), f.policy));
  assert.throws(() => f.registry.resolve({headers: {'x-hipass-role':'HOSPITAL_ADMIN'}}, f.policy));
  assert.throws(() => new V3PrincipalRegistry({provider: new DevelopmentMockProvider({}), records: [f.record]}));
});
test('registry record status, granted scopes, operation roles and duplicate bindings fail closed', () => {
  const f = fixture();
  for (const change of [{status: 'SUSPENDED'}, {status: 'REVOKED'}, {scopes: ['mapping:read']}]) {
    const registry = new V3PrincipalRegistry({provider: new TestProvider(f.env), records: [{...f.record, ...change}]});
    assert.throws(() => registry.resolve(f.request(), f.policy));
  }
  assert.throws(() => f.registry.resolve(f.request(), {...f.policy, allowedRoles:['DOCTOR']}));
  assert.throws(() => f.registry.resolve(f.request()));
  assert.throws(() => new V3PrincipalRegistry({provider: new TestProvider(f.env), records:[f.record,f.record]}));
});
test('registry snapshots config and records; mutations cannot expand scope or switch issuer', () => {
  const f = fixture(); const request = f.request(); const bound = f.registry.resolve(request, f.policy);
  f.record.scopes.push('audit:read'); f.record.tenantId = randomUUID(); f.env.JWT_ISSUER = 'foreign-idp'; f.env.TEST_JWT_SECRET = randomBytes(32).toString('hex');
  assert.deepEqual(f.registry.resolve(request, f.policy), bound);
  assert.equal(JSON.stringify(f.registry), '{}');
});
test('registry rejects nonnumeric, fractional and unsafe registered timestamps after signature verification', () => {
  const f = fixture();
  for (const value of ['not-a-time', String(Math.floor(Date.now()/1000)+60), Math.floor(Date.now()/1000)+60.5, Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(() => f.registry.resolve(f.request({exp:value}), f.policy), error => ['JWT_REGISTERED_CLAIMS_INVALID','V3_REGISTERED_CLAIMS_INVALID'].includes(error.code));
  }
  for (const key of ['iat','nbf']) for (const value of ['not-a-time', null, 0.5, -1]) {
    assert.throws(() => f.registry.resolve(f.request({[key]:value}), f.policy), error => ['JWT_REGISTERED_CLAIMS_INVALID','V3_REGISTERED_CLAIMS_INVALID'].includes(error.code));
  }
});
