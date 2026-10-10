import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FAQS,FAQ_ROUTES,findFaq} from '../public/ui/faq-catalog.js';

test('public FAQ catalog has unique frozen entries, reviewed limitations and allowlisted routes',()=>{
  assert.equal(FAQS.length,16);assert.equal(new Set(FAQS.map(f=>f.id)).size,16);
  for(const faq of FAQS){assert.ok(Object.isFrozen(faq));assert.ok(faq.question&&faq.answer);if(faq.route)assert.ok(Object.hasOwn(FAQ_ROUTES,faq.route));assert.equal(findFaq(faq.question).items?.[0].id,faq.id);}
  assert.match(FAQS.find(f=>f.id==='login').answer,/未|미연동|완료됐다는 의미가 아닙니다/);
  assert.match(FAQS.find(f=>f.id==='offline').answer,/검증됐다는 뜻은 아닙니다/);
});
test('local matching is bounded and does not invent unknown or medical answers',()=>{
  assert.equal(findFaq('').kind,'empty');assert.equal(findFaq(null).kind,'empty');assert.equal(findFaq('a'.repeat(161)).kind,'limit');
  assert.equal(findFaq('특이한 문자열 zzz').kind,'unknown');assert.equal(findFaq('MRI 종양 판독해 주세요').kind,'medical');
  assert.equal(findFaq('동의 철회').items[0].id,'revoke');assert.ok(findFaq('QR 만료').items.length<=3);
});
test('secret-like input is never returned as a result or echoed into content',()=>{
  // Construct a marker without key material; keep the real secret scanner strict.
  const keyMarker=['-----BEGIN','PRIVATE KEY-----'].join(' ');
  for(const input of ['Bearer synthetic-only','eyJfake.payload.signature',keyMarker,'000000-0000000','fixture@example.invalid','1.2.826.0.1.3680043.10.5432']){
    assert.deepEqual(findFaq(input),{kind:'private'});
  }
  assert.equal(findFaq('<img src=x onerror=alert(1)>').kind,'unknown');
});
test('assistant has no network, persistence or HTML rendering capability',async()=>{
  const source=await readFile(new URL('../public/ui/faq-assistant.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|innerHTML|insertAdjacentHTML|eval\s*\(/);
  assert.match(source,/textContent/);assert.match(source,/children.length>8/);assert.match(source,/dialog\[open\]/);
  assert.match(source,/pagehide/);assert.match(source,/input.value=''/);
});
test('web/mobile entry points reuse module and reset on role, lock, account changes',async()=>{
  const web=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),mobile=await readFile(new URL('../public/mobile/app.js',import.meta.url),'utf8');
  for(const source of [web,mobile])assert.match(source,/import \{createFaqAssistant\} from '\/ui\/faq-assistant.js'/);
  assert.match(web,/function switchPersona[\s\S]*?faqAssistant\?\.reset\(\)/);
  assert.match(mobile,/async function handleLockApp[\s\S]*?faqAssistant\?\.reset\(\)/);
  assert.match(mobile,/function handlePatientSelect[\s\S]*?faqAssistant\?\.reset\(\)/);
  const sw=await readFile(new URL('../public/mobile/sw.js',import.meta.url),'utf8');for(const asset of ['faq-assistant.js','faq-catalog.js','faq-assistant.css'])assert.ok(sw.includes(asset));
  const html=await readFile(new URL('../public/mobile/index.html',import.meta.url),'utf8');
  const nav=html.slice(html.indexOf('<nav class="mobile-nav"'));
  assert.deepEqual([...nav.matchAll(/data-tab="([^"]+)"/g)].map(match=>match[1]),['home','studies','share','profile']);
  for(const tab of ['records','vault'])assert.ok(html.includes(`data-tab="${tab}"`), 'secondary screen remains reachable');
});
