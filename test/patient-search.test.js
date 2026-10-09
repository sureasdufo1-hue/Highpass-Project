import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPatientStudies } from '../public/ui/patient.js';
const studies = [
  {description:'Brain MRI',modality:'MR',studyDate:'2026-06-20',sourceHospitalId:'HOSP-A'},
  {description:'Chest CT',modality:'CT',studyDate:'2026-05-18',sourceHospitalId:'HOSP-A'},
  {description:'Other CT',modality:'CT',studyDate:'2026-09-08',sourceHospitalId:'HOSP-B'},
];
test('patient search covers the entire fetched list, including cards outside the initial two',()=>{
  assert.deepEqual(filterPatientStudies(studies,'CT'),studies.slice(1));
  assert.deepEqual(filterPatientStudies(studies,'2026-09 HOSP-B'),[studies[2]]);
});
test('search supports MRI modality aliases, blank reset and empty results without mutating source',()=>{
  assert.deepEqual(filterPatientStudies(studies,'mri'),[studies[0]]);
  assert.equal(filterPatientStudies(studies,'  ').length,3);
  assert.equal(filterPatientStudies(studies,'unavailable').length,0);
  assert.equal(filterPatientStudies(studies,'<script>').length,0);
  assert.equal(studies.length,3);
});
