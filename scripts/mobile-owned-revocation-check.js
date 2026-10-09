import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyOwnedDemoRevocation } from '../src/mobile-demo-revocation-check.js';
import { createCapstoneProofClient } from '../src/capstone-dpop-client.js';

if (process.argv[2] !== '--apply') throw new Error('EXPLICIT_APPLY_REQUIRED');
const proof = JSON.parse(readFileSync(new URL('../artifacts/mobile-browser-20261009/scenario-checkpoint.json', import.meta.url), 'utf8'));
const ca = readFileSync(new URL('../tmp/certs/mtls/ca.crt', import.meta.url));
const retryWithProof = process.argv[3] === '--retry-pre-token-with-dpop';
if (retryWithProof) {
  const prior = JSON.parse(readFileSync(new URL('../artifacts/mobile-browser-20261009/owned-api-revocation-result.json', import.meta.url), 'utf8'));
  if (prior.reason !== 'PRE_REVOCATION_TOKEN_NOT_CONFIRMED' || prior.consentId !== proof.consentId || prior.ticketId !== proof.ticketId) throw new Error('PRIOR_PRE_MUTATION_OUTCOME_REQUIRED');
}
const resultPath = new URL(`../artifacts/mobile-browser-20261009/owned-api-revocation${retryWithProof ? '-dpop' : ''}-result.json`, import.meta.url);
// Never overwrite an existing mutation receipt: reconcile before retrying.
let profiles;
let proofHeaders;
async function request(path, role, body) {
  const token = profiles?.[role] ?? (role && !['PATIENT', 'DOCTOR', 'SECURITY_ADMIN'].includes(role) ? role : null);
  const payload = body ? JSON.stringify(body) : null;
  const method = payload ? 'POST' : 'GET';
  const authorization = proofHeaders ? proofHeaders({ path, method, token, issuance: method === 'POST' && path === '/api/dicom-access/request' }) : token ? { authorization: `Bearer ${token}` } : {};
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, 'https://192.168.111.149:9443'), { ca, timeout: 10000, signal: AbortSignal.timeout(10000), method, headers: { ...authorization, ...(payload ? { 'content-type': 'application/json', origin: 'https://192.168.111.149:9443' } : {}) } }, res => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 2_000_000) res.destroy(new Error('RESPONSE_LIMIT')); });
      res.on('error', reject);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { reject(new Error('INVALID_RECEIPT')); } });
    });
    req.on('timeout', () => req.destroy(new Error('REQUEST_TIMEOUT')));
    req.on('error', reject); req.end(payload);
  });
}
let result;
// Exclusive receipt reservation happens before any remote operation.
writeFileSync(resultPath, JSON.stringify({ status: 'NOT VERIFIED', operation: 'STARTED_RECONCILE_BEFORE_RETRY', consentId: proof.consentId, ticketId: proof.ticketId, review: 'DRAFT / UNASSIGNED' }), { flag: 'wx' });
try {
  let key = ''; for await (const chunk of process.stdin) { key += chunk; if (key.length > 129) throw new Error('CREDENTIAL_LIMIT'); }
  const login = await request('/api/capstone-demo/login', null, { key: key.trim() }); key = '';
  if (login.status !== 200 || login.body.environment !== 'CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY') throw new Error('DEMO_LOGIN_NOT_CONFIRMED');
  profiles = login.body.profiles;
  if (!profiles?.PATIENT || !profiles?.DOCTOR || !profiles?.SECURITY_ADMIN) throw new Error('DEMO_PROFILES_REQUIRED');
  const policy = await request('/api/security/proof-policy', null);
  if (policy.status !== 200 || policy.body.supported !== true || policy.body.required !== true || policy.body.replayScope !== 'SHARED_POSTGRES') throw new Error('STRICT_PROOF_POLICY_NOT_CONFIRMED');
  proofHeaders = createCapstoneProofClient('https://192.168.111.149:9443');
  result = await verifyOwnedDemoRevocation(request, proof);
} catch (error) {
  result = { status: 'NOT VERIFIED', review: 'DRAFT / UNASSIGNED', consentId: proof.consentId, ticketId: proof.ticketId, reason: /^[A-Z_]+$/.test(error.message) ? error.message : 'API_CHECK_FAILED_RECONCILE_BEFORE_RETRY', browserConfirmation: 'NOT VERIFIED' };
  process.exitCode = 1;
} finally { profiles = null; proofHeaders = null; }
writeFileSync(resultPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
