import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

test('presentation overlay packages the current patient, clinician, viewer and mobile assets together', () => {
  const docker = readFileSync('Dockerfile.hcc-main-scenario', 'utf8');
  const sources = docker.split(/\r?\n/).filter(line => line.startsWith('COPY '))
    .flatMap(line => line.split(/\s+/).slice(1, -1));
  const required = [
    'public/index.html', 'public/app.js', 'public/capstone-auth.js',
    'public/ui/patient.js', 'public/ui/patient-home-premium.css',
    'public/ui/clinician.js', 'public/ui/clinician-desk.css',
    'public/ui/viewer-studio.js', 'public/ui/viewer-studio.css',
    'public/mobile/index.html', 'public/mobile/app.js', 'public/mobile/sw.js',
    'public/ui/mobile.css', 'public/ui/capstone-login.css',
    'public/ui/faq-assistant.js', 'public/ui/faq-assistant.css', 'public/ui/faq-catalog.js',
    'src/capstone-mock-idp.js', 'src/capstone-hcc-catalog.js', 'src/server.js',
    'src/capstone-b-portal.js', 'src/http-utils.js', 'src/services.js',
  ];
  for (const file of required) {
    assert.ok(existsSync(file), file);
    assert.ok(sources.includes(file), 'missing from image overlay: ' + file);
  }
  for (const source of sources) assert.ok(existsSync(path.resolve(source)), source);
  assert.ok(sources.includes('public/fonts/pretendard/'), 'self-hosted font and license');
});
