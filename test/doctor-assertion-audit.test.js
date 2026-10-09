import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDoctorPrincipalAudited } from '../src/auth.js';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const doctor = { role: 'DOCTOR', doctorId: 'DOC-B-01', hospitalId: 'HOSP-B' };
const input = { doctorId: 'DOC-B-01', hospitalId: 'HOSP-B', consentId: 'consent_0123456789abcdef' };

test('valid doctor assertion does not add a denial or change authorization', async () => {
  await assertDoctorPrincipalAudited(doctor, input, () => { assert.fail('unexpected denial'); });
});

test('role, doctor and hospital mismatch persist exact safe denial before throwing', async () => {
  for (const [principal, body, code] of [
    [{ role: 'PATIENT', patientId: 'P-1001' }, input, 'ROLE_NOT_ALLOWED'],
    [doctor, { ...input, doctorId: 'FORGED' }, 'DOCTOR_IDENTITY_MISMATCH'],
    [doctor, { ...input, hospitalId: 'HOSP-A' }, 'HOSPITAL_IDENTITY_MISMATCH'],
  ]) {
    let recorded;
    await assert.rejects(assertDoctorPrincipalAudited(principal, { ...body, token: 'never-log', purpose: 'never-log' }, async entry => {
      recorded = entry;
    }), error => error.statusCode === 403 && error.code === code);
    assert.deepEqual(recorded, { actorType: principal.role, actorId: principal.doctorId ?? principal.patientId,
      hospitalId: principal.hospitalId ?? null, consentId: input.consentId, action: 'TOKEN_DENIED', result: 'FAIL', reasonCode: code });
    assert.ok(!JSON.stringify(recorded).includes('never-log'));
  }
});

test('audit write/save failure never falls through to token issue and conceals details', async () => {
  for (const persist of [async () => { throw new Error('secret database connection'); }, undefined]) {
    let issued = false;
    await assert.rejects((async () => {
      await assertDoctorPrincipalAudited(doctor, { ...input, doctorId: 'FORGED' }, persist);
      issued = true;
    })(), error => error.statusCode === 503 && error.code === 'AUTHORIZATION_AUDIT_UNAVAILABLE' && !error.message.includes('secret'));
    assert.equal(issued, false);
  }
});

test('untrusted consent text is not copied into denial audit', async () => {
  let recorded;
  await assert.rejects(assertDoctorPrincipalAudited(doctor, { ...input, doctorId: 'FORGED', consentId: 'secret\nforged' }, entry => { recorded = entry; }));
  assert.equal(recorded.consentId, null);
  assert.equal(recorded.actorId, doctor.doctorId);
});

test('real isolated token HTTP route persists all identity denials; storage failure returns safe 503', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hp-doctor-denial-'));
  const dbPath = path.join(directory, 'db.json');
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], { windowsHide: true, stdio: 'ignore', env: {
    ...process.env, NODE_ENV: 'development', AUTH_MODE: 'DEVELOPMENT_MOCK', HIPASS_STORE: 'json',
    HIPASS_DB_PATH: dbPath, PORT: String(port), DICOM_TOKEN_SECRET: randomBytes(32).toString('hex'),
    HIPASS_DPOP_REQUIRED: '0', HIPASS_INGRESS_SECRET: '', HIPASS_CAPSTONE_KEY_RELEASE: '0', HIPASS_CONTROL_PLANE_ONLY: '0',
  } });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const call = async (route, headers = {}, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() };
  };
  const deadline = Date.now() + 8000;
  while (true) {
    try { if ((await call('/api/health')).status === 200) break; } catch {}
    if (Date.now() >= deadline || child.exitCode !== null) throw new Error('ISOLATED_SERVER_UNAVAILABLE');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const doctorHeaders = { 'x-hipass-role': 'DOCTOR', 'x-hipass-doctor-id': 'DOC-B-01', 'x-hipass-hospital-id': 'HOSP-B' };
  const body = { doctorId: input.doctorId, requestingHospitalId: input.hospitalId, consentId: input.consentId };
  const before = JSON.parse(await readFile(dbPath, 'utf8'));
  for (const [headers, requestBody, code] of [
    [doctorHeaders, { ...body, requestingHospitalId: 'HOSP-A' }, 'HOSPITAL_IDENTITY_MISMATCH'],
    [{ 'x-hipass-role': 'PATIENT', 'x-hipass-patient-id': 'P-1001' }, body, 'ROLE_NOT_ALLOWED'],
    [doctorHeaders, { ...body, doctorId: 'FORGED' }, 'DOCTOR_IDENTITY_MISMATCH'],
  ]) {
    const response = await call('/api/dicom-access/request', headers, { ...requestBody, secret: 'never-log' });
    assert.deepEqual(response, { status: 403, body: { error: code } });
    const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
    const record = persisted.auditLogs.find(entry => entry.reasonCode === code && entry.consentId === input.consentId);
    assert.ok(record?.recordHash && record.auditSessionId);
    assert.equal(record.actorId, headers['x-hipass-doctor-id'] ?? headers['x-hipass-patient-id']);
    assert.equal(record.hospitalId, headers['x-hipass-hospital-id'] ?? null);
    assert.equal(record.action, 'TOKEN_DENIED');
    assert.equal(record.result, 'FAIL');
    assert.deepEqual(persisted.dicomAccessTokenLogs, before.dicomAccessTokenLogs);
    assert.deepEqual(persisted.consents, before.consents);
    assert.ok(!JSON.stringify(record).includes('never-log'));
  }
  // Only the generated fixture path is replaced, never a user's database.
  await rename(dbPath, path.join(directory, 'saved-fixture.json'));
  await mkdir(dbPath);
  const failure = await call('/api/dicom-access/request', doctorHeaders, { ...body, doctorId: 'FORGED' });
  assert.deepEqual(failure, { status: 503, body: { error: 'AUTHORIZATION_AUDIT_UNAVAILABLE' } });
});
