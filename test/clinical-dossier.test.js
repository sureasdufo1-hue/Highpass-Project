import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clinicalNextAction, clinicalDossierModel } from '../public/ui/clinician.js';
const now = Date.parse('2026-10-10T03:00:00Z');
const study = {modality:'CT',studyDate:'20261010',sourceHospitalId:'HOSP-A'};
const consent = {status:'ACTIVE',validFrom:'2026-10-10T00:00:00Z',validUntil:'2026-10-10T04:00:00Z',targetHospitalId:'HOSP-B',purpose:'TREATMENT'};
test('clinical next action keeps absent, pending, expired and revoked consent out of viewer routing', () => {
  assert.equal(clinicalNextAction(study,null,null,false,now).action,'qr');
  for (const status of ['REVOKED','EXPIRED']) assert.equal(clinicalNextAction(study,{...consent,status},null,false,now).action,'details');
  assert.equal(clinicalNextAction(study,{...consent,status:'PENDING'},null,false,now).action,'refresh');
  assert.equal(clinicalNextAction(study,{...consent,validUntil:new Date(now).toISOString()},null,true,now).action,'details');
  assert.equal(clinicalNextAction(study,{...consent,validFrom:'2026-10-11T00:00:00Z'},null,false,now).action,'refresh');
});
test('return-to-viewer label needs loaded pixels and a live token for the selected study', () => {
  const selected={...study,studyInstanceUid:'1.2.3'};
  const token={studyInstanceUid:'1.2.3',expiresAt:'2026-10-10T03:05:00Z'};
  assert.equal(clinicalNextAction(selected,consent,token,true,now).label,'Viewer로 돌아가기');
  for (const invalid of [null,{...token,studyInstanceUid:'9.8.7'},{...token,expiresAt:new Date(now).toISOString()}])
    assert.equal(clinicalNextAction(selected,consent,invalid,true,now).label,'접근 확인 후 CT 열기');
  assert.equal(clinicalNextAction(selected,consent,token,false,now).label,'접근 확인 후 CT 열기');
});
test('dossier presents loaded metadata without fabricating access or transfer completion', () => {
  const model = clinicalDossierModel(study, consent, {patientName:'홍길동',scenario:{id:'HCC_PRESENTATION',age:56}}, now);
  assert.equal(model.patient, '홍길동');
  assert.match(model.patientNote,/56세.*합성/);
  assert.equal(model.consent,'동의 유효 · 서버 검증 필요');
  assert.equal(model.target,'HOSP-B');
  assert.equal(JSON.stringify(model).includes('720'),false);
});
test('dossier handles missing, revoked and expired consent honestly', () => {
  assert.equal(clinicalDossierModel(study,null,{},now).target,'수신 기관 확인 대기');
  assert.equal(clinicalDossierModel(study,{...consent,status:'REVOKED'},{},now).consent,'철회됨');
  assert.equal(clinicalDossierModel(study,{...consent,validUntil:new Date(now).toISOString()},{},now).consent,'만료됨');
  assert.equal(clinicalDossierModel(null,null,{},now).consent,'검사 선택 대기');
  assert.equal(clinicalDossierModel(study,null,{},now).patientNote.includes('56'),false);
});
test('desk preserves unique action and pixel hooks, with no design raster substituted for DICOM', () => {
  const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const id of ['clinical-dossier','clinical-open-viewer','clinical-preview-host','viewer-image','clinician-search','download-instance'])
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  assert.ok(html.includes('/ui/clinician-desk.css'));
  assert.equal(html.includes('clinician-concepts-20261010'),false);
  const js = readFileSync(new URL('../public/ui/clinician.js',import.meta.url),'utf8');
  assert.equal(js.includes('innerHTML'),false);
  const manifest = readFileSync(new URL('../scripts/verify-hcc-scenario-candidates.js',import.meta.url),'utf8');
  assert.ok(manifest.includes("'public/ui/clinician.js','public/ui/clinician-desk.css'"));
});
