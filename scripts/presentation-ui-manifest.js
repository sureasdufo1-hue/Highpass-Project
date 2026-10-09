import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--image' || !/^sha256:[a-f0-9]{64}$/.test(args[1]))) {
  console.error('Usage: node scripts/presentation-ui-manifest.js [--image sha256:<64 hex>]');
  process.exit(2);
}
const files = [];
function walk(relative) {
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (name === 'public/assets/clinical') continue;
    if (entry.isSymbolicLink()) throw new Error('UI_SYMLINK_REQUIRES_REVIEW');
    if (entry.isDirectory()) walk(name);
    else if (entry.isFile()) files.push(name);
  }
}
for (const entry of readdirSync(path.join(root, 'public'), { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:js|css)$/.test(entry.name) || entry.isFile() && entry.name === 'index.html') files.push(`public/${entry.name}`);
}
for (const dir of ['ui', 'mobile', 'brand', 'images', 'assets']) walk(`public/${dir}`);
const assets = files.sort().map(file => ({ file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') }));
let verification = { status: 'NOT VERIFIED', reason: 'IMAGE_NOT_REQUESTED' };
if (args.length) {
  // No ports, network, mounts, or writable root filesystem. Only read image files.
  const program = `const fs=require('node:fs'),crypto=require('node:crypto');const rows=JSON.parse(process.argv[1]);let bad=[];for(const row of rows){try{const hash=crypto.createHash('sha256').update(fs.readFileSync('/app/'+row.file)).digest('hex');if(hash!==row.sha256)bad.push(row.file);}catch{bad.push(row.file);}}console.log(JSON.stringify({status:bad.length?'FAIL':'PASS',checked:rows.length,mismatches:bad}));process.exitCode=bad.length?1:0;`;
  const run = spawnSync('docker', ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--entrypoint=/nodejs/bin/node', args[1], '-e', program, JSON.stringify(assets)], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (run.status === 0 || run.status === 1) {
    try { verification = JSON.parse(run.stdout); }
    catch { verification = { status: 'NOT VERIFIED', reason: 'IMAGE_VERIFIER_OUTPUT_INVALID' }; }
  } else verification = { status: 'NOT VERIFIED', reason: run.error?.code ?? 'DOCKER_EXECUTION_FAILED' };
  if (verification.status !== 'PASS') process.exitCode = 1;
}
console.log(JSON.stringify({ scope: 'PRESENTATION_STATIC_ASSETS_ONLY', review: 'DRAFT / UNASSIGNED', image: args[1] ?? null, assets, verification }, null, 2));
