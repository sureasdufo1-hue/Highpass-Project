import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('QR status requires cloud API source promotion, not a B-only UI overlay', () => {
  const portal = readFileSync('src/capstone-b-portal.js', 'utf8');
  const cloud = readFileSync('Dockerfile.ticket-status-control', 'utf8');
  const mobile = readFileSync('Dockerfile.mobile-capstone', 'utf8');
  const operator = readFileSync('scripts/capstone-cloud-app-rollout.py', 'utf8');
  assert.match(portal, /"https:\/\/10\.90\.88\.1"/);
  assert.match(cloud, /FROM \$\{CAPSTONE_BASE_IMAGE\}/);
  assert.match(cloud, /COPY src\/server\.js src\/services\.js src\/domain\.js \/app\/src\//);
  for (const source of ['src/server.js', 'src/services.js', 'src/domain.js']) {
    assert.ok(operator.includes(`"${source}"`), `cloud attestation must cover ${source}`);
  }
  assert.match(mobile, /public\/mobile\/app\.js/);
  assert.doesNotMatch(mobile, /COPY src\/server\.js/);
  assert.doesNotMatch(cloud, /(?:COPY|ADD).*?(?:secret|\.env|cert)/i);
});
