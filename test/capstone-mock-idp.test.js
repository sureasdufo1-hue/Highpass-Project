import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { verifyJwt } from "../src/auth.js";
import { createCapstoneMockIdp } from "../src/capstone-mock-idp.js";
import { HCC_STUDY_UID } from '../src/capstone-hcc-catalog.js';
import { readFileSync } from "node:fs";
import vm from "node:vm";
const environment = () => ({ HIPASS_CAPSTONE_MOCK_IDP: "1", NODE_ENV: "production", AUTH_MODE: "TEST", HIPASS_CONTROL_PLANE_ONLY: "1", HIPASS_CAPSTONE_LOGIN_KEY: randomBytes(32).toString("hex"), TEST_JWT_SECRET: randomBytes(32).toString("hex"), JWT_ISSUER: "highpass-capstone-test-idp", JWT_AUDIENCE: "highpass-capstone-api" });

test('password login is fixed to synthetic patient, uses salted hash and never issues hospital or admin profiles', () => {
  const password = randomBytes(24).toString('base64url'), salt = randomBytes(16);
  const env = { ...environment(), HIPASS_CAPSTONE_PATIENT_USERNAME: 'unit-patient', HIPASS_CAPSTONE_PATIENT_PASSWORD_HASH: `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}` };
  const login = createCapstoneMockIdp(env);
  const request = { username: 'unit-patient', password, hccRegistered: true, ip: 'unit-patient' };
  const result = login(request);
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body.profiles), ['PATIENT']);
  const claims = verifyJwt(result.body.profiles.PATIENT, { hmacSecret: env.TEST_JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  assert.equal(claims.patientId, 'MEDIQ-SYN-HCC-001');
  assert.equal(claims.exp - claims.iat, 300);
  for (const secret of [password, env.HIPASS_CAPSTONE_PATIENT_PASSWORD_HASH]) assert.ok(!JSON.stringify(result).includes(secret));
  for (const entryRole of ['DOCTOR', 'SECURITY_ADMIN', 'PLATFORM_ADMIN']) assert.equal(login({ ...request, ip: entryRole, entryRole }).status, 403);
  assert.equal(login({ ...request, ip: 'other-profile', patientProfile: 'DEFAULT' }).status, 403);
  assert.equal(login({ ...request, ip: 'missing-catalog', hccRegistered: false }).status, 409);
  for (const override of [{ password: 'incorrect' }, { username: 'other' }, { password: '' }, { password: {} }, { key: env.HIPASS_CAPSTONE_LOGIN_KEY }]) {
    assert.equal(login({ ...request, ip: randomBytes(8).toString('hex'), ...override }).status, 401);
  }
  for (let i = 0; i < 5; i++) assert.equal(login({ ...request, ip: 'limited', password: 'incorrect' }).status, 401);
  assert.equal(login({ ...request, ip: 'limited' }).status, 429);
  assert.throws(() => createCapstoneMockIdp({ ...env, HIPASS_CAPSTONE_PATIENT_PASSWORD_HASH: 'invalid' }));
  assert.equal(createCapstoneMockIdp(environment())(request).status, 401);
});

test('actual browser header function tags exact session expiry without returning credentials', () => {
  const source = readFileSync('public/capstone-auth.js', 'utf8');
  const start = source.indexOf('headers(role) {') + 'headers(role) {'.length;
  const end = source.lastIndexOf('} };');
  assert.ok(start > 0 && end > start);
  const expiresAt = '2026-10-10T01:00:00Z', deadline = Date.parse(expiresAt);
  let now = deadline - 1;
  const context = vm.createContext({ profiles: { expiresAt, profiles: { PATIENT: 'synthetic-unit-profile' } }, Date: { now: () => now, parse: Date.parse } });
  const headers = vm.runInContext(`(function(role) {${source.slice(start, end)}})`, context);
  assert.equal(headers('PATIENT').authorization, 'Bearer synthetic-unit-profile');
  assert.throws(() => headers('FOREIGN'), error => error.code !== 'CAPSTONE_SESSION_EXPIRED');
  for (now of [deadline, deadline + 1]) {
    assert.throws(() => headers('PATIENT'), error => error.code === 'CAPSTONE_SESSION_EXPIRED' && !error.message.includes('synthetic-unit-profile'));
  }
});
test("synthetic IdP is explicitly disabled by default and refuses non-capstone/weak or reused credentials", () => {
  assert.equal(createCapstoneMockIdp({}), null);
  for (const override of [{ NODE_ENV: "development" }, { AUTH_MODE: "DEVELOPMENT_MOCK" }, { HIPASS_CONTROL_PLANE_ONLY: "0" }, { HIPASS_CAPSTONE_LOGIN_KEY: "short" }, { JWT_ISSUER: "real-hospital" }]) assert.throws(() => createCapstoneMockIdp({ ...environment(), ...override }));
  const env = environment();
  assert.throws(() => createCapstoneMockIdp({ ...env, HIPASS_CAPSTONE_LOGIN_KEY: env.TEST_JWT_SECRET }));
});
test("strong presenter key issues only fixed synthetic roles, five-minute signed issuer/audience JWTs", () => {
  const env = environment();
  const result = createCapstoneMockIdp(env)({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: "192.0.2.1", role: "PLATFORM_ADMIN", doctorId: "attacker" });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body.profiles), ["PATIENT", "DOCTOR", "SECURITY_ADMIN"]);
  for (const [role, token] of Object.entries(result.body.profiles)) {
    const claims = verifyJwt(token, { hmacSecret: env.TEST_JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    assert.equal(claims.role, role);
    assert.equal(claims.exp - claims.iat, 300);
    if (role === "DOCTOR") assert.equal(claims.doctorId, "DOC-B-01");
  }
  assert.ok(!JSON.stringify(result).includes(env.HIPASS_CAPSTONE_LOGIN_KEY));
});
test("invalid presenter login is denied and bounded by per-IP attempts and finite map capacity", () => {
  let now = Date.now();
  const env = environment();
  const login = createCapstoneMockIdp(env, () => now);
  for (let i = 0; i < 5; i++) assert.equal(login({ key: "bad", ip: "192.0.2.1" }).status, 401);
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: "192.0.2.1" }).status, 429);
  now += 300001;
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: "192.0.2.1" }).status, 200);
  for (let i = 0; i < 256; i++) login({ key: "bad", ip: `test-${i}` });
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: "new-client" }).status, 429);
});

test('phantom login requires a committed server catalog and never accepts arbitrary patient identity', () => {
  const env = environment(), login = createCapstoneMockIdp(env);
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'test', patientProfile: 'PHANTOM' }).status, 409);
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'test', patientProfile: 'FOREIGN', phantomRegistered: true }).status, 400);
  const result = login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'test', patientProfile: 'PHANTOM', phantomRegistered: true, patientId: 'P-1001' });
  const claims = verifyJwt(result.body.profiles.PATIENT, { hmacSecret: env.TEST_JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  assert.equal(claims.patientId, 'HP-TEST-PHANTOM-001'); assert.equal(claims.sub, 'synthetic-phantom-account');
  assert.equal(result.body.demoContext.patientId, claims.patientId);
});

test('HCC-style CT profile is fixed, synthetic, catalog-gated, and never accepts caller identity', () => {
  const env = environment(), login = createCapstoneMockIdp(env);
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'hcc-unregistered', patientProfile: 'HCC_SYNTHETIC' }).status, 409);
  const result = login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'hcc-registered', patientProfile: 'HCC_SYNTHETIC', hccRegistered: true, patientId: 'P-1001' });
  const claims = verifyJwt(result.body.profiles.PATIENT, { hmacSecret: env.TEST_JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  assert.equal(claims.patientId, 'MEDIQ-SYN-HCC-001');
  assert.equal(claims.sub, 'synthetic-hcc-account');
  assert.equal(result.body.demoContext.defaultStudyUid, HCC_STUDY_UID);
  assert.equal(result.body.demoContext.patientName, '홍길동');
  assert.equal(result.body.demoContext.scenario.age, 56);
  assert.ok(!JSON.stringify(result).includes(env.HIPASS_CAPSTONE_LOGIN_KEY));
});

test('main scenario archives legacy login choices and issues only the fixed 56-year-old profile', () => {
  const env = { ...environment(), HIPASS_CAPSTONE_MAIN_SCENARIO: 'HCC' }, login = createCapstoneMockIdp(env);
  for (const patientProfile of ['DEFAULT', 'PHANTOM']) {
    assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: patientProfile, patientProfile, phantomRegistered: true }).body.error, 'DEMO_PROFILE_ARCHIVED');
  }
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'not-ready' }).status, 409);
  assert.equal(login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'foreign-role', hccRegistered: true, entryRole: 'PLATFORM_ADMIN' }).status, 400);
  const result = login({ key: env.HIPASS_CAPSTONE_LOGIN_KEY, ip: 'main', hccRegistered: true, entryRole: 'DOCTOR', patientId: 'OTHER' });
  assert.equal(result.status, 200); assert.equal(result.body.demoContext.entryRole, 'DOCTOR');
  assert.equal(result.body.demoContext.defaultStudyUid, HCC_STUDY_UID);
  const patient = verifyJwt(result.body.profiles.PATIENT, { hmacSecret: env.TEST_JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  assert.equal(patient.patientId, 'MEDIQ-SYN-HCC-001');
});
test("login requires authenticated ingress and audit persistence before JWT release; browser stores no credentials", () => {
  const server = readFileSync("src/server.js", "utf8");
  const block = server.slice(server.indexOf('if (url.pathname === "/api/capstone-demo/login")'), server.indexOf('if (method === "GET" && url.pathname === "/api/health")'));
  assert.match(block, /!meta.ingressTrusted/u);
  assert.match(block, /maxBytes: 2048/u);
  assert.ok(block.indexOf("await store.save()") < block.indexOf("return sendJson(response, result.status"));
  assert.match(block, /"LOGIN_FAILURE"/u);
  const browser = readFileSync("public/capstone-auth.js", "utf8");
  assert.doesNotMatch(browser, /\b(?:localStorage|sessionStorage|console)[ \t]*\.[ \t]*\w/u);
  assert.match(browser, /finally \{ input.value = ""/u);
});
