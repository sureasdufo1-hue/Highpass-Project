import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { createCapstoneProofClient } from '../src/capstone-dpop-client.js';
import { verifySyntheticTicketReplay } from '../src/mobile-demo-ticket-replay-check.js';

if (process.argv[2] !== '--apply') throw new Error('EXPLICIT_APPLY_REQUIRED');
const origin = 'https://192.168.111.149:9443';
const ca = readFileSync(new URL('../tmp/certs/mtls/ca.crt', import.meta.url));
const resultPath = new URL('../artifacts/mobile-browser-20261009/ticket-replay-api-result.json', import.meta.url);
let profiles;
let proofHeaders;
function request(path, role, body) {
  const token = profiles?.[role];
  const method = body ? 'POST' : 'GET';
  const payload = body ? JSON.stringify(body) : null;
  const headers = proofHeaders ? proofHeaders({ path, method, token, issuance: path === '/api/transfers/tickets/redeem-viewer' }) : {};
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, origin), {
      ca, method, timeout: 10000, signal: AbortSignal.timeout(10000),
      headers: { ...headers, ...(payload ? { origin, 'content-type': 'application/json' } : {}) },
    }, res => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; if (text.length > 2_000_000) res.destroy(new Error('RESPONSE_LIMIT')); });
      res.on('error', reject);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(text) }); } catch { reject(new Error('INVALID_RECEIPT')); } });
    });
    req.on('timeout', () => req.destroy(new Error('REQUEST_TIMEOUT')));
    req.on('error', reject); req.end(payload);
  });
}
let progress = { status: 'NOT VERIFIED', review: 'DRAFT / UNASSIGNED', phase: 'STARTED_RECONCILE_BEFORE_RETRY' };
// Reserve before any remote action; a lost creation response is never retried.
writeFileSync(resultPath, JSON.stringify(progress), { flag: 'wx' });
let result;
try {
  let key = '';
  for await (const chunk of process.stdin) { key += chunk; if (key.length > 129) throw new Error('CREDENTIAL_LIMIT'); }
  const login = await request('/api/capstone-demo/login', null, { key: key.trim() }); key = '';
  if (login.status !== 200 || login.body.environment !== 'CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY') throw new Error('DEMO_LOGIN_NOT_CONFIRMED');
  profiles = login.body.profiles;
  if (!profiles?.PATIENT || !profiles?.DOCTOR || !profiles?.SECURITY_ADMIN) throw new Error('DEMO_PROFILES_REQUIRED');
  const policy = await request('/api/security/proof-policy');
  if (policy.status !== 200 || policy.body.required !== true || policy.body.supported !== true || policy.body.replayScope !== 'SHARED_POSTGRES') throw new Error('STRICT_PROOF_POLICY_NOT_CONFIRMED');
  proofHeaders = createCapstoneProofClient(origin);
  result = await verifySyntheticTicketReplay(request, update => {
    progress = { ...progress, ...update }; writeFileSync(resultPath, JSON.stringify(progress));
  });
} catch (error) {
  result = { ...progress, reason: /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED_RECONCILE_BEFORE_RETRY' };
} finally { profiles = null; proofHeaders = null; }
writeFileSync(resultPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
