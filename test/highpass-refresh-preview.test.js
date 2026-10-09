import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/mockups/highpass-refresh/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/mockups/highpass-refresh/design.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/mockups/highpass-refresh/preview.js', import.meta.url), 'utf8');
test('design preview isolates synthetic examples from real authorization and network', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /실제 로그인, 동의, 전송, 토큰 발급 및 DICOM 조회는 실행되지 않습니다/);
  assert.match(html, /개념 도식 · 의료영상 아님/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(html, /<form|https?:\/\/|src="\/assets\/clinical/);
});
test('patient, clinician, viewer and mobile review preserve explicit semantics', () => {
  for (const screen of ['patient', 'hospital', 'viewer']) assert.match(html, new RegExp(`id="${screen}"`));
  assert.match(html, /동의 상태만으로 영상 접근이 허용되지는 않습니다/);
  assert.match(html, /PHR 표준연계/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /mobile-preview/);
  assert.match(js, /textContent = button.dataset.preview/);
});
