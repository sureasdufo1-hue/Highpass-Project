import { createHmac, randomUUID, timingSafeEqual, scryptSync, createHash } from "node:crypto";
import { HCC_PATIENT_ID, HCC_PATIENT_SUBJECT, HCC_STUDY_UID, HCC_PRESENTATION } from './capstone-hcc-catalog.js';

// Explicit synthetic capstone presenter identity, not production authentication.
export function createCapstoneMockIdp(env, clock = Date.now) {
  if (env.HIPASS_CAPSTONE_MOCK_IDP !== "1") return null;
  if (env.NODE_ENV !== "production" || env.AUTH_MODE !== "TEST" || env.HIPASS_CONTROL_PLANE_ONLY !== "1"
      || typeof env.HIPASS_CAPSTONE_LOGIN_KEY !== "string" || env.HIPASS_CAPSTONE_LOGIN_KEY.length < 32
      || env.HIPASS_CAPSTONE_LOGIN_KEY.length > 128 || /[\r\n\0]/.test(env.HIPASS_CAPSTONE_LOGIN_KEY)
      || typeof env.TEST_JWT_SECRET !== "string" || env.TEST_JWT_SECRET.length < 32
      || env.JWT_ISSUER !== "highpass-capstone-test-idp" || env.JWT_AUDIENCE !== "highpass-capstone-api"
      || env.HIPASS_CAPSTONE_LOGIN_KEY === env.TEST_JWT_SECRET) throw new Error("CAPSTONE_MOCK_IDP_CONFIGURATION_INVALID");
  const attempts = new Map();
  const accountId = env.HIPASS_CAPSTONE_PATIENT_USERNAME;
  const passwordHash = env.HIPASS_CAPSTONE_PATIENT_PASSWORD_HASH;
  if ((accountId || passwordHash) && (!/^[A-Za-z0-9_-]{4,32}$/.test(accountId ?? '')
      || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash ?? ''))) {
    throw new Error('CAPSTONE_PATIENT_CREDENTIAL_CONFIGURATION_INVALID');
  }
  return input => {
    const now = clock();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    if (attempts.size >= 256 && !attempts.has(input.ip)) return { status: 429, body: { error: "DEMO_LOGIN_RATE_LIMIT" } };
    const entry = attempts.get(input.ip) ?? { count: 0, until: now + 300000 };
    if (entry.count >= 5) return { status: 429, body: { error: "DEMO_LOGIN_RATE_LIMIT" } };
    entry.count += 1;
    attempts.set(input.ip, entry);
    const accountLogin = input.username !== undefined || input.password !== undefined;
    if (accountLogin) {
      if (!passwordHash || typeof input.username !== 'string' || input.username.length > 32
          || typeof input.password !== 'string' || input.password.length > 128 || !input.password.length
          || input.key !== undefined) return { status: 401, body: { error: 'DEMO_LOGIN_INVALID' } };
      const [, salt, digest] = passwordHash.split('$');
      const actual = scryptSync(input.password, Buffer.from(salt, 'hex'), 64);
      const nameMatches = timingSafeEqual(createHash('sha256').update(input.username).digest(), createHash('sha256').update(accountId).digest());
      if (!timingSafeEqual(actual, Buffer.from(digest, 'hex')) || !nameMatches) return { status: 401, body: { error: 'DEMO_LOGIN_INVALID' } };
      if (input.entryRole && input.entryRole !== 'PATIENT') return { status: 403, body: { error: 'DEMO_PATIENT_ROLE_REQUIRED' } };
      if (input.patientProfile && input.patientProfile !== 'HCC_SYNTHETIC') return { status: 403, body: { error: 'DEMO_PATIENT_PROFILE_REQUIRED' } };
    } else {
      const provided = typeof input.key === "string" && input.key.length <= 128 ? Buffer.from(input.key) : Buffer.alloc(0);
      const expected = Buffer.from(env.HIPASS_CAPSTONE_LOGIN_KEY);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { status: 401, body: { error: "DEMO_LOGIN_INVALID" } };
    }
    const mainScenario = env.HIPASS_CAPSTONE_MAIN_SCENARIO === 'HCC';
    const profile = accountLogin ? 'HCC_SYNTHETIC' : input.patientProfile ?? (mainScenario ? 'HCC_SYNTHETIC' : 'DEFAULT');
    if (mainScenario && profile !== 'HCC_SYNTHETIC') return { status: 409, body: { error: 'DEMO_PROFILE_ARCHIVED' } };
    const entryRole = input.entryRole ?? 'PATIENT';
    if (!['PATIENT', 'DOCTOR'].includes(entryRole)) return { status: 400, body: { error: 'DEMO_ENTRY_INVALID' } };
    if (!['DEFAULT', 'PHANTOM', 'HCC_SYNTHETIC'].includes(profile)) return { status: 400, body: { error: 'SYNTHETIC_PROFILE_INVALID' } };
    if (profile === 'PHANTOM' && input.phantomRegistered !== true) return { status: 409, body: { error: 'PHANTOM_CATALOG_NOT_REGISTERED' } };
    if (profile === 'HCC_SYNTHETIC' && input.hccRegistered !== true) return { status: 409, body: { error: 'HCC_CATALOG_NOT_REGISTERED' } };
    const patientId = profile === 'PHANTOM' ? 'HP-TEST-PHANTOM-001' : profile === 'HCC_SYNTHETIC' ? HCC_PATIENT_ID : 'P-1001';
    const patientName = profile === 'PHANTOM' ? '합성 팬텀 환자' : profile === 'HCC_SYNTHETIC' ? '홍길동' : '가상환자 1001';
    const defaultStudyUid = profile === 'PHANTOM' ? '1.2.826.0.1.3680043.10.5432.20261009.1'
      : profile === 'HCC_SYNTHETIC' ? HCC_STUDY_UID : '1.2.410.100.1.20260620.001';
    const subject = profile === 'PHANTOM' ? 'synthetic-phantom-account' : profile === 'HCC_SYNTHETIC' ? HCC_PATIENT_SUBJECT : 'synthetic-account-a';
    attempts.delete(input.ip);
    const numeric = Math.floor(now / 1000);
    const issue = claims => {
      const encoded = [{ alg: "HS256", typ: "JWT" }, { iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE, iat: numeric, exp: numeric + 300, jti: randomUUID(), ...claims }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
      return `${encoded}.${createHmac("sha256", env.TEST_JWT_SECRET).update(encoded).digest("base64url")}`;
    };
    return { status: 200, body: { environment: "CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY", expiresAt: new Date(now + 300000).toISOString(), demoContext: { patientId, patientName, defaultStudyUid, entryRole,
      ...(profile === 'HCC_SYNTHETIC' ? { scenario: HCC_PRESENTATION } : {}) }, profiles: {
      PATIENT: issue({ sub: subject, role: "PATIENT", patientId }),
      ...(!accountLogin ? {
      DOCTOR: issue({ sub: "DOC-B-01", role: "DOCTOR", doctorId: "DOC-B-01", hospitalId: "HOSP-B" }),
      SECURITY_ADMIN: issue({ sub: "SECURITY-ADMIN-001", role: "SECURITY_ADMIN", hospitalId: "HOSP-A" }),
      } : {}),
    } } };
  };
}
