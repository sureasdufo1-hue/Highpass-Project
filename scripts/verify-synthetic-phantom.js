import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const input = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('EXPLICIT_GENERATED_DATASET_DIRECTORY_REQUIRED');
const fixture = JSON.parse(readFileSync(path.join(input, 'manifest.json'), 'utf8'));
if (fixture.generator !== 'highpass-geometric-phantom-v1' || fixture.clinicalUseAllowed !== false) throw new Error('PHANTOM_MANIFEST_REQUIRED');
const id = randomUUID(), name = 'hp-phantom-' + id, label = 'highpass.phantom-owner=' + id;
const probeName = name + '-probe';
const output = path.resolve('artifacts/synthetic-phantom-validation', id);
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'orthanc.json'), JSON.stringify({ Name: 'ISOLATED SYNTHETIC FORMAT VALIDATION', StorageDirectory: '/tmp/storage', IndexDirectory: '/tmp/index', RemoteAccessAllowed: false, AuthenticationEnabled: false, DicomServerEnabled: false, HttpPort: 8042 }), { flag: 'wx' });
const docker = args => execFileSync('docker', args, { timeout: 30000, maxBuffer: 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const pacsImage = 'sha256:9f74f2dbf91aef1f9169fc9ec36bc3b1d414294e7ec561294065b7180882aa9a';
const appImage = 'sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1';
let owned = false, result = { status: 'NOT VERIFIED', review: 'DRAFT / UNASSIGNED' };
try {
  docker(['image', 'inspect', pacsImage]); docker(['image', 'inspect', appImage]);
  // No port publication, no network, no existing volume. Loopback API is fixture
  // parsing only, not a TLS/authentication control claim or live config change.
  owned = true;
  docker(['run', '-d', '--pull', 'never', '--name', name, '--label', label, '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,size=64m', '--mount', `type=bind,source=${output},target=/validation,readonly`, pacsImage, '/validation/orthanc.json']);
  const until = Date.now() + 20000;
  let ready = false;
  while (Date.now() < until) {
    try { execFileSync('docker', ['exec', name, '/usr/local/bin/busybox', 'wget', '-T', '2', '-q', '-O', '/dev/null', 'http://127.0.0.1:8042/system'], { timeout: 4000, stdio: 'ignore' }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw new Error('PHANTOM_PACS_READINESS_TIMEOUT');
  const probe = path.resolve('scripts/test-support/synthetic-phantom-pacs-probe.js');
  result = JSON.parse(docker(['run', '--rm', '--pull', 'never', '--name', probeName, '--label', label, '--network', 'container:' + name, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--mount', `type=bind,source=${input},target=/fixtures,readonly`, '--mount', `type=bind,source=${probe},target=/probe.mjs,readonly`, appImage, '/probe.mjs']));
} catch (error) {
  result = { ...result, status: 'NOT VERIFIED', reason: /^PHANTOM_[A-Z_]+$/.test(error.message) ? error.message : 'PHANTOM_DOCKER_OR_PROBE_ERROR' };
} finally {
  if (owned) {
    try {
      // A timed-out Docker CLI does not imply its container stopped. Resolve
      // and stop the exact owned probe before removing its network namespace.
      if (docker(['ps', '-aq', '--filter', 'name=^/' + probeName + '$']).trim()) {
        const probeDetails = JSON.parse(docker(['inspect', probeName]))[0];
        if (probeDetails.Config.Labels['highpass.phantom-owner'] !== id) throw new Error('OWNED_PROBE_MISMATCH');
        docker(['rm', '-f', '-v', probeName]);
      }
      const details = JSON.parse(docker(['inspect', name]))[0];
      if (details.Config.Labels['highpass.phantom-owner'] !== id || details.HostConfig.NetworkMode !== 'none') throw new Error('OWNED_CONTAINER_MISMATCH');
      docker(['rm', '-f', '-v', name]); result.cleanup = 'PASS — OWNED DISPOSABLE CONTAINER ONLY';
    } catch { result.cleanup = 'NOT VERIFIED'; result.status = 'NOT VERIFIED'; }
  }
}
result.datasetManifest = path.join(input, 'manifest.json');
result.pacsImageId = pacsImage;
writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ ...result, evidence: path.join(output, 'result.json') }));
process.exitCode = result.status === 'PASS' ? 0 : 1;
