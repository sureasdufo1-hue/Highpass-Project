import test from 'node:test';
import assert from 'node:assert/strict';
import {requirePatientPolicyDenial} from '../scripts/lib/patient-browser-integration.js';
test('browser revocation evidence requires actual dedicated 403 response',()=>{
  assert.deepEqual(requirePatientPolicyDenial({status:403,error:'PATIENT_ACCESS_DENIED'}),{status:403,error:'PATIENT_ACCESS_DENIED'});
});
test('service outage, transport absence and unrelated 403 cannot become policy DENY',()=>{
  for(const response of [undefined,{status:503,error:'PATIENT_ACCESS_DENIED'},{status:500,error:'PATIENT_ACCESS_DENIED'},
    {status:401,error:'PATIENT_PROOF_REQUIRED'},{status:403,error:'PATIENT_SCOPE_INVALID'},{status:403}])
    assert.throws(()=>requirePatientPolicyDenial(response));
});
