import test from "node:test";
import assert from "node:assert/strict";
import { apiOperation, safeException, safeViewerState } from "../scripts/browser-safe-diagnostics.js";

test('viewer diagnosis retains only bounded primitive state, never token or identifiers', () => {
  const result = safeViewerState({ tokenPresent:true, consentPending:false, tokenPending:true,
    consentReady:true, seriesSelected:true, instanceCount:12, line:1613, token:'SECRET', patientId:'PRIVATE' });
  assert.equal(result.instanceCount,12);
  assert.equal(result.tokenPresent,true);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  for (const value of ['SECRET', -1, Infinity, 1000001]) {
    const invalid = safeViewerState({tokenPresent:value,line:value,instanceCount:value});
    assert.equal(invalid.tokenPresent,null);
    assert.equal(invalid.line,null);
    assert.equal(invalid.instanceCount,null);
  }
});

test("diagnostics emit fixed operation enums and never identifiers, credentials or exception text", () => {
  assert.equal(apiOperation("https://synthetic.invalid/api/consents/private-id/handoff-ticket?token=private", "POST"), "HANDOFF_TICKET");
  assert.equal(apiOperation("https://synthetic.invalid/api/consents", "POST"), "CONSENT_CREATE");
  assert.equal(apiOperation("https://synthetic.invalid/api/dicom-access/request", "POST"), "TOKEN_REQUEST");
  assert.equal(apiOperation("https://synthetic.invalid/api/security/proof-policy", "GET"), "PROOF_POLICY");
  assert.equal(apiOperation("https://synthetic.invalid/dicomweb/studies?token=private", "GET"), "QIDO_STUDIES");
  assert.equal(apiOperation("https://synthetic.invalid/dicomweb/studies/private-study/series", "GET"), "QIDO_SERIES");
  assert.equal(apiOperation("https://synthetic.invalid/dicomweb/studies/private-study/series/private-series/instances", "GET"), "QIDO_INSTANCES");
  assert.equal(apiOperation("https://synthetic.invalid/dicomweb/studies/private-study/series/private-series/instances/private-instance/rendered", "GET"), "WADO_RENDERED");
  assert.equal(apiOperation("https://synthetic.invalid/dicomweb/private-unknown", "GET"), null);
  const report = safeException({ data: { className: "TypeError", description: "Cannot read properties of null private-secret" }, callFrames: [{ functionName: "createPatientConsent" }] });
  assert.deepEqual(report, { type: "TypeError", stage: "createPatientConsent", code: "NULL_PROPERTY" });
  assert.ok(!JSON.stringify(report).includes("private-secret"));
});
