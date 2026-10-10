import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderPatientOverview} from '../public/ui/patient.js';

test('patient typography is offline, version-pinned and licensed',()=>{
  const font=readFileSync('public/fonts/pretendard/PretendardVariable.woff2');
  assert.equal(createHash('sha256').update(font).digest('hex'),'9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4');
  assert.match(readFileSync('public/fonts/pretendard/LICENSE.txt','utf8'),/SIL OPEN FONT LICENSE Version 1.1/);
  const css=readFileSync('public/ui/patient-home-premium.css','utf8');
  assert.match(css,/font-display:swap/);
  assert.doesNotMatch(css,/@import|url\(['"]?https?:/);
  assert.match(css,/#patient-portal-app/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/focus-visible/);
});

test('home restyle retains existing consent, revoke, search, role and viewer controller hooks',()=>{
  const html=readFileSync('public/index.html','utf8');
  for(const id of ['btn-head-transfer','btn-quick-approve','btn-quick-revoke','btn-consent-detail','patient-home-search','patient-recent-studies','patient-action-consent-badge','patient-read-state']) {
    assert.equal(html.split(`id="${id}"`).length-1,1,id);
  }
  assert.match(html,/data-ui-theme="patient-premium"/);
  assert.match(html,/class="premium-summary"/);
  assert.match(html,/data-route="phr"/);
  assert.match(html,/내 영상\. 내 선택\./);
});

test('study cards render untrusted labels as text and preserve explicit view/share callbacks',()=>{
  const saved=globalThis.document;
  const node=(tag='div')=>({tag,children:[],dataset:{},events:{},setAttribute(key,value){this[key]=value;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},addEventListener(key,handler){this.events[key]=handler;}});
  const container=node(),count=node(),result=node(),calls=[];
  globalThis.document={createElement:node,createElementNS:(_ns,tag)=>node(tag),querySelector(selector){return {'#patient-recent-studies':container,'#patient-study-count':count,'#patient-search-result':result}[selector]??null;}};
  try {
    const study={studyInstanceUid:'1.2.3.990',description:'<img src=x onerror=unsafe>',modality:'CT',sourceHospitalId:'HOSP-A',studyDate:'2026-10-10'};
    renderPatientOverview([study],{onView:s=>calls.push(['view',s]),onShare:s=>calls.push(['share',s])});
    const card=container.children[0];
    assert.equal(card.children[1].textContent,study.description);
    assert.equal(card.children[1].innerHTML,undefined);
    const buttons=card.children.at(-1).children;
    assert.deepEqual(buttons.map(b=>b.textContent),['영상 보기','공유하기']);
    assert.deepEqual(calls,[]);
    buttons[0].events.click();buttons[1].events.click();
    assert.deepEqual(calls,[['view',study],['share',study]]);
    assert.equal(card.children[0].children.some(n=>n.tag==='img'),false,'No fake pixels or external thumbnails');
  } finally { if(saved===undefined) delete globalThis.document;else globalThis.document=saved; }
});
