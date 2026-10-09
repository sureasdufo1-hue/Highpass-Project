import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { verifyJwt } from "../src/auth.js";
import { createCapstoneMockIdp } from "../src/capstone-mock-idp.js";
import { readFileSync } from "node:fs";
const environment = () => ({ HIPASS_CAPSTONE_MOCK_IDP: "1", NODE_ENV: "production", AUTH_MODE: "TEST", HIPASS_CONTROL_PLANE_ONLY: "1", HIPASS_CAPSTONE_LOGIN_KEY: randomBytes(32).toString("hex"), TEST_JWT_SECRET: randomBytes(32).toString("hex"), JWT_ISSUER: "highpass-capstone-test-idp", JWT_AUDIENCE: "highpass-capstone-api" });
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
