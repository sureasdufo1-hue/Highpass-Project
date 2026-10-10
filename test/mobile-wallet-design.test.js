import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/mobile/app.js','utf8');
test('mobile opens the shared signed login instead of a development-auth fallback',()=>{
 const html=readFileSync('public/mobile/index.html','utf8');
 const auth=readFileSync('public/capstone-auth.js','utf8');
 assert.match(html,/<html lang="ko" data-capstone="1">/);
 assert.match(auth,/mediq-mobile-login/);
 assert.match(auth,/mediq-login-advanced/);
 assert.match(auth,/\/api\/capstone-demo\/login/);
 assert.match(auth,/type="password" autocomplete="current-password"/);
 assert.doesNotMatch(html,/Ycdc2024/);
 assert.match(auth,/연동 준비 중/);
});
test('wallet hero uses authenticated context and actual study metadata, with safe empty state',()=>{
  const code=source.slice(source.indexOf('function renderHomeScreen()'),source.indexOf('function renderHomeRecentList()'));
  for(const hasStudy of [false,true]){
    const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
    const context=vm.createContext({capstoneAuth:{context:{patientName:'합성 시험 환자',defaultStudyUid:'1.2.3'}},state:{patientName:'합성 시험 환자',studies:hasStudy?[{studyInstanceUid:'1.2.3',description:'서버 제공 CT',studyDate:'2026-10-01',sourceHospitalId:'HOSP-A',modality:'CT'}]:[],consents:[]},document:{getElementById:node,querySelector:selector=>node(selector.slice(1))},renderHomeRecentList(){}});
    vm.runInContext(code+';renderHomeScreen();',context);
    assert.equal(node('wallet-patient-name').textContent,'합성 시험 환자님,');
    assert.equal(node('btn-home-quick-share').disabled,!hasStudy);
    assert.equal(node('wallet-study').textContent,hasStudy?'서버 제공 CT':'공유할 영상을 확인해 주세요');
    assert.doesNotMatch(node('wallet-study').textContent,/홍길동|간암/);
  }
});
test('four-tab navigation preserves secondary records/vault and existing consent/QR control IDs',()=>{
 const html=readFileSync('public/mobile/index.html','utf8');
 const nav=html.slice(html.indexOf('<nav class="mobile-nav"'));
 assert.deepEqual([...nav.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['home','studies','share','profile']);
 for(const id of ['btn-wizard-confirm-submit','qr-box-wrap','qr-countdown-text','btn-revoke-qr','tab-records','tab-vault','tab-profile'])assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1,id);
 assert.ok(html.includes('data-tab="records"'));assert.ok(html.includes('data-tab="vault"'));
});
