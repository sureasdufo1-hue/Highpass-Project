import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const mobile = readFileSync('public/mobile/app.js', 'utf8');
const web = readFileSync('public/app.js', 'utf8');
function extract(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test('mobile selected profile uses its server context literally, without another patient name', () => {
  const code = extract(mobile, 'function handlePatientSelect(', '// Fail-Closed Data Loading');
  for (const patientId of ['HP-TEST-PHANTOM-001', 'P-1001']) {
    const nodes = new Map();
    const state = { isAuthenticated: false };
    const name = '<img src=x onerror=unsafe>';
    let faqResets = 0;
    const context = vm.createContext({ state, faqAssistant: { reset() { faqResets += 1; } }, capstoneAuth: { context: { patientId, patientName: name } },
      document: { querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { textContent: '', value: '' });
        return nodes.get(selector);
      } }, loadInitialData() { assert.fail('Locked app must not load data'); },
    });
    vm.runInContext(code, context);
    vm.runInContext(`handlePatientSelect(${JSON.stringify(patientId)})`, context);
    assert.equal(faqResets, 1, 'Patient changes must clear the FAQ conversation');
    assert.equal(state.patientId, patientId);
    assert.equal(nodes.get('#header-patient-name').textContent, `${name} (${patientId})`);
    assert.equal(nodes.get('#auth-patient-name').textContent, `${name} (${patientId})`);
    assert.equal(nodes.get('#auth-patient-select').value, patientId);
    assert.equal(nodes.get('#header-patient-name').innerHTML, undefined);
  }
});

test('mobile viewer delegates signed patient context and never invents DICOM slice counts', async () => {
  const code = extract(mobile, 'async function openCineViewer(', 'function closeCineViewer(');
  for (const allowed of [false, true]) {
    const nodes = new Map();
    const state = {};
    state.patientId='HP-TEST-PHANTOM-001';
    const calls=[];
    const context = vm.createContext({ state, AbortSignal, patientHeaders: () => ({}), showToast() {},
      capstoneAuth:allowed?{}:null,
      openPatientPixelViewer:async input=>calls.push(input),
      fetch: async () => ({ ok: allowed }),
      document: { querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { textContent: '', style: {}, hidden: true });
        return nodes.get(selector);
      } }, setCineMode() {}, drawCurrentCineFrame() {},
    });
    vm.runInContext(code, context);
    await vm.runInContext('openCineViewer({studyInstanceUid:"1.2.3",modality:"CT",description:"合成 CT",series:[{instances:Array(12).fill({})}]})', context);
    if (!allowed) {
      assert.equal(calls.length,0);
      assert.equal(state.cineStudy, undefined);
      assert.equal(nodes.size, 0);
    } else {
      assert.equal(calls.length,1);
      assert.equal(calls[0].patientId,'HP-TEST-PHANTOM-001');
      assert.equal(calls[0].study.studyInstanceUid,'1.2.3');
      assert.equal(state.cineTotalSlices,undefined);
      assert.equal(nodes.size,0);
    }
  }
});

test('one mock frame cannot start mobile or patient cine timers', () => {
  for (const [source, start, end, data] of [
    [mobile, 'function startCinePlayback(', 'function stopCinePlayback(', { state: { cineTotalSlices: 1 } }],
    [web, 'function togglePatientCinePlayback(', 'function drawPatientViewerFrame(', { patientViewerState: { totalSlices: 1 } }],
  ]) {
    const context = vm.createContext({ ...data, setInterval() { assert.fail('No invented cine sequence'); },
      document: { querySelector() { assert.fail('Single mock frame must not start playback'); } } });
    vm.runInContext(extract(source, start, end), context);
    const functionName = start.slice('function '.length, -1);
    vm.runInContext(`${functionName}()`, context);
  }
});
