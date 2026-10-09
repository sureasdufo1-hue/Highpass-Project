import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { TestProvider } from '../src/auth.js';
import { V3PrincipalRegistry } from '../src/v3-principal-registry.js';
import { V3TenantTransaction } from '../src/v3-tenant-transaction.js';
import { V3IdentityIdempotency } from '../src/v3-identity-idempotency.js';
import { V3IdentifierProtection } from '../src/v3-identifier-protection.js';
import { V3MappingReadService } from '../src/v3-mapping-read-service.js';
import { V3MappingWriteService } from '../src/v3-mapping-write-service.js';
import { createV3IdentityRuntimeRouter } from '../src/v3-identity-runtime-router.js';

test('identity host composition requires explicit mode and real service dependencies', () => {
  assert.throws(() => createV3IdentityRuntimeRouter(), /OPT_IN_REQUIRED/);
  assert.throws(() => createV3IdentityRuntimeRouter({ mode: 'production' }), /OPT_IN_REQUIRED/);
  assert.throws(() => createV3IdentityRuntimeRouter({ mode: 'CAPSTONE_SYNTHETIC_ONLY' }), /CONFIGURATION_REQUIRED/);
});

test('identity router fails closed before storage, rejects aliases/duplicates, preserves other domains and drains disposal', async () => {
  let connections = 0;
  const transactions = new V3TenantTransaction({ pool: { connect: async () => { connections++; throw new Error('PRIVATE_DB_ERROR'); } }, deadlineMs: 8000 });
  const protection = new V3IdentifierProtection({ encryptionKeys: new Map([['test', randomBytes(32)]]), activeKeyId: 'test', lookupKey: randomBytes(32) });
  const registry = new V3PrincipalRegistry({ provider: new TestProvider({ JWT_ISSUER: 'router-test', JWT_AUDIENCE: 'router-test', TEST_JWT_SECRET: randomBytes(32).toString('hex') }), records: [] });
  const router = createV3IdentityRuntimeRouter({ mode: 'CAPSTONE_SYNTHETIC_ONLY', registry,
    readService: new V3MappingReadService({ transactions }),
    writeService: new V3MappingWriteService({ idempotency: new V3IdentityIdempotency({ transactions, hmacKey: randomBytes(32) }), protection }) });
  const server = createServer((req, res) => { router.handle(req, res).then(handled => { if (!handled) { res.writeHead(418); res.end('{}'); } }); });
  server.requestTimeout = 2000; server.headersTimeout = 2000; server.timeout = 2000;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const call = (path, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, timeout: 2000 }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('error', reject); response.on('aborted', () => reject(new Error('TEST_RESPONSE_ABORTED')));
      response.on('end', () => { try { resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : {} }); } catch (error) { reject(error); } });
    });
    request.on('timeout', () => request.destroy(new Error('TEST_TIMEOUT'))); request.on('error', reject); request.end();
  });
  try {
    const id = randomUUID(), prefix = '/api/v3/patient-mappings/';
    assert.equal((await call(prefix + id)).status, 401);
    const headers = { 'content-type': 'application/json', 'idempotency-key': 'test_reconcile_001', 'x-audit-session-id': randomUUID() };
    assert.equal((await call(prefix + 'reconcile', 'POST', headers)).status, 401);
    assert.equal((await call(prefix + id + '/reviews', 'POST', headers)).status, 401);
    assert.equal((await call(prefix + 'reconcile')).status, 405);
    for (const suffix of ['%2fsecret', '../secret', id + '//reviews', id + '/reviews/extra', id + '/']) {
      assert.ok([404, 422].includes((await call(prefix + suffix)).status));
    }
    const duplicate = await call(prefix + id, 'GET', ['Host', '127.0.0.1', 'Authorization', 'Bearer FIRST', 'Authorization', 'Bearer SECOND']);
    assert.equal(duplicate.status, 422); assert.equal(duplicate.body.code, 'V3_DUPLICATE_HEADER');
    assert.equal(duplicate.headers['cache-control'], 'no-store');
    assert.equal((await call('/api/consents')).status, 418);
    assert.equal((await call('/api/v3/exchange-sessions')).status, 418);
    assert.equal((await call('/api/v3/patient-mappings-extra')).status, 418);
    router.dispose();
    const closed = await call(prefix + id);
    assert.equal(closed.status, 503); assert.equal(closed.body.code, 'V3_IDENTITY_RUNTIME_UNAVAILABLE');
    assert.equal(connections, 0);
  } finally { router.dispose(); protection.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
