import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePatientSelfViewPolicy} from '../src/patient-self-view-policy.js';

function fixture() {
  return {input:{principal:{role:'PATIENT',subject:'synthetic-subject',patientId:'HP-TEST-PHANTOM-001'},patientId:'HP-TEST-PHANTOM-001',studyInstanceUid:'1.2.3',seriesInstanceUid:'1.2.3.1',requestedAction:'VIEW'},
    snapshot:{account:{verified:true,evidenceKind:'CAPSTONE_MOCK_IDP',subject:'synthetic-subject',patientId:'HP-TEST-PHANTOM-001',status:'ACTIVE'},
      ownership:{verified:true,revision:'source-ref-v1',status:'ACTIVE',patientId:'HP-TEST-PHANTOM-001',studyInstanceUid:'1.2.3',sourceHospitalId:'HOSP-A'},
      sourceHospital:{hospitalId:'HOSP-A',status:'ACTIVE'},series:[{studyInstanceUid:'1.2.3',seriesInstanceUid:'1.2.3.1'}]}};
}
test('patient policy returns a minimal own-Series VIEW_ONLY scope without doctor or consent authority',()=>{
  const f=fixture(), before=JSON.stringify(f);
  const result=evaluatePatientSelfViewPolicy(f.input,f.snapshot);
  assert.equal(result.decision,'ALLOWED'); assert.equal(result.scope.permission,'VIEW_ONLY');
  assert.deepEqual(result.scope.allowedSeriesUids,['1.2.3.1']);
  assert.equal(result.scope.doctorId,undefined); assert.equal(result.scope.consentId,undefined);
  assert.equal(result.accessToken,undefined); assert.equal(JSON.stringify(f),before);
});
test('doctor/admin impersonation, foreign patient and all non-VIEW actions deny',()=>{
  for(const role of ['DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN','INTERNAL_SERVICE']){
    const f=fixture();f.input.principal.role=role;assert.equal(evaluatePatientSelfViewPolicy(f.input,f.snapshot).decision,'DENIED');
  }
  const f=fixture(); f.input.patientId='other'; assert.equal(evaluatePatientSelfViewPolicy(f.input,f.snapshot).decision,'DENIED');
  for(const action of ['DOWNLOAD','PACS_IMPORT','STOW',undefined]){const f=fixture();f.input.requestedAction=action;assert.equal(evaluatePatientSelfViewPolicy(f.input,f.snapshot).decision,'DENIED');}
});
test('missing account/ref evidence, suspension, changed ownership or hospital deny',()=>{
  const mutations=[f=>delete f.snapshot.account.verified,f=>f.snapshot.account.evidenceKind='BROWSER',f=>f.snapshot.account.status='SUSPENDED',
    f=>f.snapshot.account.subject='other',f=>delete f.snapshot.ownership.verified,f=>f.snapshot.ownership.revision='',f=>f.snapshot.ownership.patientId='other',
    f=>f.snapshot.ownership.status='DELETED',f=>f.snapshot.sourceHospital.status='INACTIVE',f=>f.snapshot.sourceHospital.hospitalId='HOSP-B'];
  for(const mutate of mutations){const f=fixture();mutate(f);const result=evaluatePatientSelfViewPolicy(f.input,f.snapshot);assert.equal(result.decision,'DENIED');assert.equal(result.scope,undefined);}
  const f=fixture(); assert.equal(evaluatePatientSelfViewPolicy(f.input,null).statusCode,503);
});
test('malformed, foreign, ambiguous or missing Series scope denies',()=>{
  for(const input of [null,undefined,[]]) assert.equal(evaluatePatientSelfViewPolicy(input,null).decision,'DENIED');
  for(const value of ['1.02.3','1/2/3','1.2.3?token=secret','1.2.3.2','9'.repeat(65),undefined]){const f=fixture();f.input.seriesInstanceUid=value;assert.equal(evaluatePatientSelfViewPolicy(f.input,f.snapshot).decision,'DENIED');}
  for(const mutate of [f=>f.snapshot.series.push({...f.snapshot.series[0]}),f=>f.snapshot.series.push(null),f=>f.snapshot.series=[],f=>f.snapshot.series[0].studyInstanceUid='1.2.4']){
    const f=fixture();mutate(f);assert.equal(evaluatePatientSelfViewPolicy(f.input,f.snapshot).decision,'DENIED');
  }
});
