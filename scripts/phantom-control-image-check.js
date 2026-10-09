import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const image = process.argv[2];
if (process.argv.length !== 3 || !/^sha256:[a-f0-9]{64}$/.test(image ?? '')) {
  console.error('Usage: node scripts/phantom-control-image-check.js sha256:<64 hex>');
  process.exit(2);
}
// Include unchanged policy/persistence dependencies, not only overlay files.
const files = ['src/server.js', 'src/capstone-mock-idp.js', 'src/postgres-store.js',
  'src/capstone-phantom-catalog.js', 'scripts/test-support/synthetic-phantom.js',
  'src/services.js', 'src/domain.js', 'src/auth.js', 'src/audit-chain-order.js',
  'src/consent-bound-key-release.js', 'scripts/start-capstone-control.js'];
const assets = files.map(file => ({ file, sha256: createHash('sha256')
  .update(readFileSync(path.join(root, file))).digest('hex') }));
const program = `const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');const rows=JSON.parse(process.argv[1]);const checks=rows.map(row=>{try{const file='/app/'+row.file;const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');const syntax=cp.spawnSync(process.execPath,['--check',file],{timeout:5000,stdio:'ignore'});return {file:row.file,source:hash===row.sha256?'PASS':'FAIL',syntax:syntax.status===0?'PASS':'FAIL'};}catch{return {file:row.file,source:'FAIL',syntax:'NOT VERIFIED'};}});const status=checks.every(c=>c.source==='PASS'&&c.syntax==='PASS')?'PASS':'FAIL';console.log(JSON.stringify({status,checks}));process.exitCode=status==='PASS'?0:1;`;
const run = spawnSync('docker', ['run', '--rm', '--pull=never', '--network=none',
  '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
  '--entrypoint=/nodejs/bin/node', image, '-e', program, JSON.stringify(assets)],
{ encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
let verification = { status: 'NOT VERIFIED', reason: run.error?.code ?? 'IMAGE_VERIFIER_UNAVAILABLE' };
if (run.status === 0 || run.status === 1) {
  try { verification = JSON.parse(run.stdout); } catch { verification.reason = 'INVALID_VERIFIER_OUTPUT'; }
}
const directory = path.join(root, 'artifacts/workstation', `phantom-control-image-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const result = { scope: 'IMAGE_SOURCE_AND_SYNTAX_ONLY_NOT_RUNTIME_E2E',
  review: 'DRAFT / UNASSIGNED', image, assets, verification,
  generatedAt: new Date().toISOString() };
writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: path.join(directory, 'result.json') }, null, 2));
process.exitCode = verification.status === 'PASS' ? 0 : 1;
