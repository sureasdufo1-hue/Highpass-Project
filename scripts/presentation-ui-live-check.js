import https from 'node:https';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://192.168.111.149:9443';
const ca = readFileSync(path.join(root, 'tmp/certs/mtls/ca.crt'));
const files = ['app.js', 'capstone-auth.js', 'ui/workspace.css', 'ui/tokens.css', 'ui/clinician.js', 'ui/patient.js', 'mobile/app.js', 'mobile/sw.js', 'mobile/style.css', 'mobile/manifest.json', 'brand/mediq-source.png'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function check(file) {
  return new Promise(resolve => {
    let finished = false;
    const expected = hash(readFileSync(path.join(root, 'public', file)));
    const request = https.get(`${origin}/${file}`, { ca, rejectUnauthorized: true }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2097152) request.destroy(new Error('RESPONSE_SIZE_LIMIT'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const actual = hash(Buffer.concat(chunks));
        finish({ status: response.statusCode === 200 && actual === expected ? 'PASS' : 'FAIL', httpStatus: response.statusCode, expectedSha256: expected, servedSha256: actual });
      });
      response.on('error', error => finish({ status: 'NOT VERIFIED', reason: error.code ?? 'RESPONSE_ERROR' }));
    });
    // Wall-clock bound includes DNS, TCP, TLS and body; no redirects or retries.
    const timer = setTimeout(() => request.destroy(Object.assign(new Error('DEADLINE'), { code: 'REQUEST_DEADLINE' })), 8000);
    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ file, ...result });
    }
    request.on('error', error => finish({ status: 'NOT VERIFIED', reason: error.code ?? 'TRANSPORT_ERROR' }));
  });
}
const checks = await Promise.all(files.map(check));
const result = { scope: 'B_PRESENTATION_PUBLIC_ASSET_HASHES_ONLY', review: 'DRAFT / UNASSIGNED', origin, observedAt: new Date().toISOString(), checks, status: checks.every(row => row.status === 'PASS') ? 'PASS' : checks.some(row => row.status === 'NOT VERIFIED') ? 'NOT VERIFIED' : 'FAIL' };
const directory = path.join(root, 'artifacts', 'workstation', `presentation-ui-inventory-${Date.now()}`);
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: path.join(directory, 'result.json') }, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
