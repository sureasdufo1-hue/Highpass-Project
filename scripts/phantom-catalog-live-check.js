// Actual B HTTPS -> cloud API. Presenter key is accepted only on anonymous stdin.
import https from 'node:https';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const checks = [];
let key = '';
for await (const chunk of process.stdin) {
  key += chunk.toString('utf8');
  if (key.length > 128) throw new Error('PRESENTER_INPUT_TOO_LARGE');
}
key = key.trim();
if (key.length < 32) throw new Error('PRESENTER_INPUT_REQUIRED');
const origin = 'https://192.168.111.149:9443';
const ca = readFileSync('tmp/certs/mtls/ca.crt');
const deadline = setTimeout(() => { console.log(JSON.stringify({status:'NOT VERIFIED',reason:'LIVE_PROBE_DEADLINE',checks})); process.exit(1); }, 90000);
const call = (route, jwt, input) => new Promise((resolve, reject) => {
  const payload = input === undefined ? undefined : Buffer.from(JSON.stringify(input));
  const request = https.request(new URL(route, origin), { method: payload ? 'POST' : 'GET', ca,
    rejectUnauthorized: true, minVersion: 'TLSv1.2', headers: {
      ...(jwt ? {authorization: `Bearer ${jwt}`} : {}),
      ...(payload ? {origin,'content-type':'application/json','content-length':payload.length} : {}),
    } }, response => {
    let bytes = 0, chunks = [];
    response.on('data', chunk => { bytes += chunk.length; if(bytes > 128000) request.destroy(new Error('RESPONSE_LIMIT')); else chunks.push(chunk); });
    response.on('end', () => { try { resolve({status:response.statusCode, cache:response.headers['cache-control'], body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}); } catch {reject(new Error('INVALID_JSON'));} });
    response.on('error', reject);
  });
  const timer = setTimeout(() => request.destroy(new Error('HTTPS_WALL_CLOCK_TIMEOUT')), 8000);
  request.on('close', () => clearTimeout(timer));
  request.on('error', reject);
  if(payload) request.write(payload);
  request.end();
});
let status = 'NOT VERIFIED';
try {
  const login = await call('/api/capstone-demo/login', null, {key});
  assert.equal(login.status, 200);
  const roles = login.body.profiles;
  checks.push({test:'ACTUAL_STRICT_HTTPS_SYNTHETIC_LOGIN',status:'PASS'});
  const route = '/api/capstone-demo/phantom-catalog', input = {datasetId:'SYNTHETIC_PHANTOM_24_SLICE_V1'};
  for (const [role, jwt, expected] of [['UNAUTHENTICATED',null,401],['PATIENT',roles.PATIENT,403],['DOCTOR',roles.DOCTOR,403]]) {
    const denied = await call(route, jwt, input);
    assert.equal(denied.status, expected);
    checks.push({test:role+'_CATALOG_DENIED',status:'PASS',httpStatus:denied.status});
  }
  const registered = await call(route, roles.SECURITY_ADMIN, input);
  assert.equal(registered.status, 200); assert.equal(registered.cache,'no-store');
  assert.equal(registered.body.registrationCommitAcknowledged,true);
  assert.equal(registered.body.studyCount,2); assert.equal(registered.body.instanceCount,24);
  assert.equal(registered.body.consentIssued,false);
  checks.push({test:'FIXED_SYNTHETIC_METADATA_REGISTRATION',status:'PASS',addedStudies:registered.body.addedStudies,
    catalogSha256:registered.body.catalogSha256,auditSessionId:registered.body.auditSessionId});
  const repeat = await call(route, roles.SECURITY_ADMIN, input);
  assert.equal(repeat.status,200); assert.equal(repeat.body.addedStudies,0);
  checks.push({test:'REGISTRATION_IDEMPOTENCE',status:'PASS'});
  const phantom = await call('/api/capstone-demo/login', null, {key,patientProfile:'PHANTOM'});
  assert.equal(phantom.status,200); assert.equal(phantom.body.demoContext.patientId,'HP-TEST-PHANTOM-001');
  const list = await call('/api/imaging-studies?patientId=HP-TEST-PHANTOM-001',phantom.body.profiles.PATIENT);
  assert.equal(list.status,200);
  const studies = Array.isArray(list.body) ? list.body : list.body.studies;
  assert.equal(studies?.length,2);
  checks.push({test:'COMMITTED_PHANTOM_PROFILE_AND_OWN_STUDY_LIST',status:'PASS',studyCount:studies.length});
  const invalid = await call(route, roles.SECURITY_ADMIN, {datasetId:'NOT_THE_FIXED_DATASET'});
  checks.push({test:'ARBITRARY_DATASET_DENIED_WITH_CLIENT_ERROR',status:invalid.status===400?'PASS':'FAIL',httpStatus:invalid.status,expectedStatus:400});
  assert.equal(invalid.status,400);
  assert.deepEqual(invalid.body,{error:'SYNTHETIC_DATASET_REQUIRED'});
  assert.equal(invalid.cache,'no-store');
  status = 'PASS';
} catch(error) {
  checks.push({test:'LIVE_HTTP_REGISTRATION',status:error.code==='ERR_ASSERTION'?'FAIL':'NOT VERIFIED',reason:error.code==='ERR_ASSERTION'?'UNEXPECTED_HTTP_OR_CONTRACT_RESULT':error.code ?? 'HTTP_CHECK_UNAVAILABLE'});
  status = checks.some(row=>row.status==='FAIL')?'FAIL':'NOT VERIFIED';
} finally {
  key = null;
  clearTimeout(deadline);
}
const directory = path.resolve('artifacts/workstation',`phantom-catalog-live-${Date.now()}`);
mkdirSync(directory,{recursive:true});
const result = {scope:'B_HTTPS_CLOUD_METADATA_REGISTRATION_NOT_VIEWER_OR_V3_MAPPING',review:'DRAFT / UNASSIGNED',status,checks};
writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,evidence:path.join(directory,'result.json')}));
process.exitCode = status==='PASS'?0:1;
