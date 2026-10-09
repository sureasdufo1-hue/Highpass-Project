import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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
  return input => {
    const now = clock();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    if (attempts.size >= 256 && !attempts.has(input.ip)) return { status: 429, body: { error: "DEMO_LOGIN_RATE_LIMIT" } };
    const entry = attempts.get(input.ip) ?? { count: 0, until: now + 300000 };
    if (entry.count >= 5) return { status: 429, body: { error: "DEMO_LOGIN_RATE_LIMIT" } };
    entry.count += 1;
    attempts.set(input.ip, entry);
    const provided = typeof input.key === "string" && input.key.length <= 128 ? Buffer.from(input.key) : Buffer.alloc(0);
    const expected = Buffer.from(env.HIPASS_CAPSTONE_LOGIN_KEY);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { status: 401, body: { error: "DEMO_LOGIN_INVALID" } };
    const profile = input.patientProfile ?? 'DEFAULT';
    if (!['DEFAULT', 'PHANTOM'].includes(profile)) return { status: 400, body: { error: 'SYNTHETIC_PROFILE_INVALID' } };
    if (profile === 'PHANTOM' && input.phantomRegistered !== true) return { status: 409, body: { error: 'PHANTOM_CATALOG_NOT_REGISTERED' } };
    const patientId = profile === 'PHANTOM' ? 'HP-TEST-PHANTOM-001' : 'P-1001';
    attempts.delete(input.ip);
    const numeric = Math.floor(now / 1000);
    const issue = claims => {
      const encoded = [{ alg: "HS256", typ: "JWT" }, { iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE, iat: numeric, exp: numeric + 300, jti: randomUUID(), ...claims }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
      return `${encoded}.${createHmac("sha256", env.TEST_JWT_SECRET).update(encoded).digest("base64url")}`;
    };
    return { status: 200, body: { environment: "CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY", expiresAt: new Date(now + 300000).toISOString(), demoContext: { patientId, patientName: profile === 'PHANTOM' ? '합성 팬텀 환자' : '가상환자 1001', defaultStudyUid: profile === 'PHANTOM' ? '1.2.826.0.1.3680043.10.5432.20261009.1' : '1.2.410.100.1.20260620.001' }, profiles: {
      PATIENT: issue({ sub: profile === 'PHANTOM' ? 'synthetic-phantom-account' : "synthetic-account-a", role: "PATIENT", patientId }),
      DOCTOR: issue({ sub: "DOC-B-01", role: "DOCTOR", doctorId: "DOC-B-01", hospitalId: "HOSP-B" }),
      SECURITY_ADMIN: issue({ sub: "SECURITY-ADMIN-001", role: "SECURITY_ADMIN", hospitalId: "HOSP-A" }),
    } } };
  };
}
