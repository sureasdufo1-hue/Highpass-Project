import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicianDetailModel, filterClinicalStudies } from '../public/ui/clinician.js';
const study = { description:'Synthetic CT', modality:'CT' };
const now = Date.parse('2026-10-09T00:00:00Z');
const consent = { status:'ACTIVE', validFrom:'2026-10-08T00:00:00Z', validUntil:'2026-10-10T00:00:00Z', permission:'VIEW_ONLY' };
const state = (value) => clinicianDetailModel(study, value, now)[2][1];
test('clinical detail distinguishes consent dates, revoked and absent states', () => {
  assert.equal(state(null), '동의 필요');
  assert.equal(state(consent), '동의 유효 · 서버 검증 필요');
  assert.equal(state({...consent,status:'REVOKED'}), '철회됨');
  assert.equal(state({...consent,validUntil:'2026-10-09T00:00:00Z'}), '만료됨');
  assert.equal(state({...consent,validFrom:'2026-10-09T01:00:00Z'}), '시작 전');
  assert.equal(state({...consent,validUntil:null}), '유효기간 확인 필요');
});
test('clinical detail never infers transfer success or access grant from consent', () => {
  const rows = clinicianDetailModel(study, consent, now);
  assert.equal(rows[5][1], '열람 시 서버 검증');
  assert.equal(rows[6][1], '미검증');
  assert.deepEqual(clinicianDetailModel(null, consent), []);
});
test('clinical search combines text and consent filters without altering source data', () => {
  const studies = [{...study,studyInstanceUid:'ct'}, {description:'Brain MRI',modality:'MR',studyInstanceUid:'mr'}];
  const resolve = uid => uid === 'ct' ? consent : null;
  assert.equal(filterClinicalStudies(studies,'MRI','all',resolve,now)[0].studyInstanceUid,'mr');
  assert.equal(filterClinicalStudies(studies,'','active',resolve,now)[0].studyInstanceUid,'ct');
  assert.equal(filterClinicalStudies(studies,'','attention',resolve,now)[0].studyInstanceUid,'mr');
  assert.equal(filterClinicalStudies(studies,'<script>','all',resolve,now).length,0);
  assert.equal(studies.length,2);
});
