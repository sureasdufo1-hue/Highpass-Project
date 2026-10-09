import test from 'node:test';
import assert from 'node:assert/strict';
import { PatientSelfViewAuthorityReader } from '../src/patient-self-view-authority.js';

const input = () => ({ principal: { role: 'PATIENT', subject: 'synthetic-phantom-account', patientId: 'HP-TEST-PHANTOM-001',
  authMethod: 'TEST_JWT', authMode: 'TEST', issuer: 'highpass-capstone-test-idp', audience: 'highpass-capstone-api', expiresAtMs: 2000 },
  patientId: 'HP-TEST-PHANTOM-001', studyInstanceUid: '1.2.3', seriesInstanceUid: '1.2.3.1', requestedAction: 'VIEW' });
const row = () => ({ subject: 'synthetic-phantom-account', patient_id: 'HP-TEST-PHANTOM-001', account_status: 'ACTIVE', evidence_kind: 'CAPSTONE_MOCK_IDP',
  account_revision: '00000000-0000-4000-8000-000000000001', ref_id: '00000000-0000-4000-8000-000000000002', version: 1,
  ref_status: 'ACTIVE', study_instance_uid: '1.2.3', source_hospital_id: 'HOSP-A', hospital_status: 'ACTIVE', series_instance_uid: '1.2.3.1' });

test('authority reader is default-off and never promotes legacy patient existence', async () => {
  const reader = new PatientSelfViewAuthorityReader({ pool: { query() { assert.fail('disabled query'); } } });
  assert.equal((await reader.authorize(input())).reasonCode, 'PATIENT_ACCOUNT_UNVERIFIED');
});

test('fresh bound snapshot returns only own VIEW scope and changes revision on ref/account replacement', async () => {
  let value = row(), calls = 0;
  const reader = new PatientSelfViewAuthorityReader({ enabled: true, clock: () => 1000, pool: { async query(query) {
    calls++; assert.deepEqual(query.values, ['synthetic-phantom-account','HP-TEST-PHANTOM-001','1.2.3','1.2.3.1']);
    assert.equal(query.query_timeout, 5000); return { rows: [value] };
  } } });
  const first = await reader.authorize(input());
  assert.equal(first.decision, 'ALLOWED'); assert.equal(first.accessToken, undefined); assert.equal(first.scope.consentId, undefined);
  for (const field of ['account_revision','ref_id','version']) {
    value = row(); value[field] = field === 'version' ? 2 : '00000000-0000-4000-8000-000000000009';
    assert.notEqual((await reader.authorize(input())).scope.ownershipRevision, first.scope.ownershipRevision);
  }
  value = row(); value.ref_status = 'DELETED';
  assert.equal((await reader.authorize(input())).reasonCode, 'PATIENT_OWNERSHIP_CHANGED');
  assert.equal(calls, 5);
});

test('foreign role, subject, profile, authentication provenance and expired session deny before database', async () => {
  const reader = new PatientSelfViewAuthorityReader({ enabled: true, clock: () => 1000, pool: { query() { assert.fail('untrusted query'); } } });
  for (const change of [x=>x.principal.role='DOCTOR', x=>x.principal.subject='other', x=>x.patientId='other',
    x=>{x.principal.patientId='P-1001';x.patientId='P-1001';},
    x=>x.principal.authMethod='DEVELOPMENT_MOCK', x=>x.principal.issuer='other', x=>x.principal.audience='other',
    x=>x.principal.expiresAtMs=1000, x=>delete x.principal.expiresAtMs]) {
    const value=input(); change(value); assert.equal((await reader.authorize(value)).decision,'DENIED');
  }
});

test('session expiring during snapshot read cannot authorize', async () => {
  let now=1000;
  const reader=new PatientSelfViewAuthorityReader({enabled:true,clock:()=>now,pool:{async query(){now=2000;return {rows:[row()]};}}});
  assert.equal((await reader.authorize(input())).decision,'DENIED');
});

test('missing/ambiguous evidence, DB failure, suspended account/hospital and foreign scope fail closed', async () => {
  for (const rows of [[],[row(),row()], [{...row(),account_revision:null}], [{...row(),version:0}],
    [{...row(),account_status:'SUSPENDED'}], [{...row(),hospital_status:'INACTIVE'}], [{...row(),patient_id:'other'}],
    [{...row(),series_instance_uid:'1.2.3.2'}], [{...row(),evidence_kind:'BROWSER'}]]) {
    const reader = new PatientSelfViewAuthorityReader({ enabled:true,clock:()=>1000,pool:{async query(){return {rows};}} });
    assert.equal((await reader.authorize(input())).decision,'DENIED');
  }
  const reader=new PatientSelfViewAuthorityReader({enabled:true,clock:()=>1000,pool:{async query(){throw new Error('secret');}}});
  const denied=await reader.authorize(input()); assert.equal(denied.statusCode,503); assert.ok(!JSON.stringify(denied).includes('secret'));
});
