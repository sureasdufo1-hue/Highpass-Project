import { createHmac, createVerify, timingSafeEqual } from "node:crypto";

export const PrincipalRole = Object.freeze({
  PATIENT: "PATIENT",
  DOCTOR: "DOCTOR",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  SECURITY_ADMIN: "SECURITY_ADMIN",
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  INTERNAL_SERVICE: "INTERNAL_SERVICE",
});

export const AuthMode = Object.freeze({
  DEVELOPMENT_MOCK: "DEVELOPMENT_MOCK",
  TEST: "TEST",
  OIDC: "OIDC",
  PRODUCTION: "PRODUCTION",
});

export class AuthError extends Error {
  constructor(statusCode, code, message = code) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AuthenticationProvider {
  constructor(env = process.env) {
    this.env = env;
  }

  authenticate() {
    throw new AuthError(501, "AUTH_PROVIDER_NOT_IMPLEMENTED", "Authentication provider is not implemented");
  }
}

export class InternalServiceProvider extends AuthenticationProvider {
  authenticate(request) {
    validatePrivacyServiceConfiguration(this.env);
    const serviceToken = request.headers["x-hipass-service-token"];
    if (serviceToken === undefined) return null;
    const privacy = this.env.HIPASS_PRIVACY_SERVICE_TOKEN;
    const dataPlane = this.env.HIPASS_DATA_PLANE_SERVICE_TOKEN;
    const keyRelease = this.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN;
    const patientView = this.env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN;
    const patientRelease=this.env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN;
    const isPatientRelease=typeof serviceToken==='string' && patientRelease && safeEqual(serviceToken,patientRelease);
    if(isPatientRelease && (Buffer.byteLength(patientRelease)<32 || /[\r\n]/.test(patientRelease)
      || [patientView,keyRelease,dataPlane,privacy,this.env.HIPASS_INTERNAL_SERVICE_TOKEN].includes(patientRelease)))
      throw new AuthError(503,'PATIENT_RELEASE_SERVICE_CONFIGURATION_INVALID');
    const isPatientView = typeof serviceToken === 'string' && patientView && safeEqual(serviceToken,patientView);
    if(isPatientView && (Buffer.byteLength(patientView)<32 || [keyRelease,dataPlane,privacy,this.env.HIPASS_INTERNAL_SERVICE_TOKEN].includes(patientView)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(this.env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID??'')))throw new AuthError(503,'PATIENT_VIEW_SERVICE_CONFIGURATION_INVALID');
    const isKeyRelease = typeof serviceToken === "string" && keyRelease && safeEqual(serviceToken, keyRelease);
    if ((isKeyRelease || (keyRelease && [dataPlane, privacy, this.env.HIPASS_INTERNAL_SERVICE_TOKEN].includes(keyRelease)))
      && (Buffer.byteLength(keyRelease) < 32 || [dataPlane, privacy, this.env.HIPASS_INTERNAL_SERVICE_TOKEN].includes(keyRelease)
        || !/^[A-Za-z0-9_-]{1,128}$/u.test(this.env.HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID ?? "")
        || this.env.HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID === this.env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID)) throw new AuthError(503, "KEY_RELEASE_SERVICE_CONFIGURATION_INVALID");
    const isDataPlane = typeof serviceToken === "string" && dataPlane && safeEqual(serviceToken, dataPlane);
    if (isDataPlane && (Buffer.byteLength(dataPlane) < 32 || dataPlane === privacy || dataPlane === this.env.HIPASS_INTERNAL_SERVICE_TOKEN)) throw new AuthError(503, "DATA_PLANE_SERVICE_CONFIGURATION_INVALID");
    const isPrivacy = typeof serviceToken === "string" && privacy && safeEqual(serviceToken, privacy);
    const isInternal = typeof serviceToken === "string" && this.env.HIPASS_INTERNAL_SERVICE_TOKEN
      && safeEqual(serviceToken, this.env.HIPASS_INTERNAL_SERVICE_TOKEN);
    if (!isPrivacy && !isInternal && !isDataPlane && !isKeyRelease && !isPatientView && !isPatientRelease) throw new AuthError(401, "INTERNAL_SERVICE_TOKEN_INVALID");
    const identity = isPatientRelease ? 'patient-key-release-gateway' : isPatientView ? 'patient-self-view-gateway' : isKeyRelease ? "key-release-gateway" : isDataPlane ? "data-plane-gateway" : isPrivacy ? "privacy-service" : "internal-service";
    return normalizePrincipal({
      subject: identity,
      userId: identity,
      actorType: PrincipalRole.INTERNAL_SERVICE,
      role: PrincipalRole.INTERNAL_SERVICE,
      roles: [PrincipalRole.INTERNAL_SERVICE],
      scopes: isPatientRelease ? ['gateway:patient-package-key-release'] : isPatientView ? ['gateway:patient-self-view-authorize'] : isKeyRelease ? ["gateway:package-key-release"] : isDataPlane ? ["gateway:data-plane-authorize"] : isPrivacy ? ["privacy:inspect"]
        : ["audit:write", "gateway:introspect", ...(!privacy ? ["privacy:inspect"] : [])],
      hospitalId: isPatientView ? this.env.HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID : isKeyRelease ? this.env.HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID : null,
      ...(isPatientRelease?{viewingGatewayId:'hospital-b-portal'}:{}),
      patientId: null,
      doctorId: null,
      sessionId: identity,
      authenticatedAt: new Date().toISOString(),
      authMethod: "INTERNAL_SERVICE_TOKEN",
      authMode: "INTERNAL_SERVICE_TOKEN",
    });
  }
}

export class DevelopmentMockProvider extends AuthenticationProvider {
  authenticate(request) {
    const role = normalizePrincipalRole(request.headers["x-hipass-role"]);
    if (!role) throw new AuthError(401, "AUTHENTICATION_REQUIRED", "Missing development principal");
    if (role === PrincipalRole.INTERNAL_SERVICE) {
      throw new AuthError(403, "INTERNAL_SERVICE_HEADER_FORBIDDEN", "Internal service role requires service token");
    }
    return normalizePrincipal({
      subject: request.headers["x-hipass-user-id"] ?? request.headers["x-hipass-doctor-id"] ?? request.headers["x-hipass-patient-id"] ?? "dev-user",
      userId: request.headers["x-hipass-user-id"] ?? request.headers["x-hipass-doctor-id"] ?? request.headers["x-hipass-patient-id"] ?? "dev-user",
      actorType: role,
      role,
      roles: [role],
      scopes: splitScopes(request.headers["x-hipass-scopes"] ?? defaultScopesForRole(role).join(" ")),
      hospitalId: request.headers["x-hipass-hospital-id"] ?? null,
      patientId: request.headers["x-hipass-patient-id"] ?? null,
      doctorId: request.headers["x-hipass-doctor-id"] ?? null,
      sessionId: request.headers["x-hipass-session-id"] ?? "dev-session",
      authenticatedAt: new Date().toISOString(),
      authMethod: "DEVELOPMENT_MOCK",
      authMode: AuthMode.DEVELOPMENT_MOCK,
    });
  }
}

export class TestProvider extends AuthenticationProvider {
  authenticate(request) {
    const token = getBearerTokenFromRequest(request);
    if (!token) throw new AuthError(401, "AUTHENTICATION_REQUIRED", "Missing test token");
    const claims = verifyJwt(token, {
      issuer: this.env.JWT_ISSUER ?? "hipass-test",
      audience: this.env.JWT_AUDIENCE ?? "hipass-api",
      hmacSecret: this.env.TEST_JWT_SECRET ?? this.env.DICOM_TOKEN_SECRET,
      publicKey: this.env.JWT_PUBLIC_KEY,
    });
    return principalFromClaims(claims, "TEST_JWT", AuthMode.TEST);
  }
}

export class OidcProvider extends AuthenticationProvider {
  authenticate(request) {
    const token = getBearerTokenFromRequest(request);
    if (!token) throw new AuthError(401, "AUTHENTICATION_REQUIRED", "Missing bearer token");
    const claims = verifyJwt(token, {
      issuer: requiredEnv(this.env, "JWT_ISSUER"),
      audience: requiredEnv(this.env, "JWT_AUDIENCE"),
      publicKey: requiredEnv(this.env, "JWT_PUBLIC_KEY"),
    });
    return principalFromClaims(claims, "OIDC_JWT", AuthMode.OIDC);
  }
}

export function validateAuthConfiguration(env = process.env) {
  validatePrivacyServiceConfiguration(env);
  const nodeEnv = String(env.NODE_ENV ?? "development").toLowerCase();
  const authMode = env.AUTH_MODE ?? (nodeEnv === "test" ? AuthMode.TEST : null);
  if (!authMode) throw new AuthError(500, "AUTH_MODE_REQUIRED", "AUTH_MODE is required");
  if (nodeEnv === "production" && authMode === AuthMode.DEVELOPMENT_MOCK) {
    throw new AuthError(500, "PRODUCTION_MOCK_AUTH_FORBIDDEN", "Production must not run with development mock authentication");
  }
  if ([AuthMode.OIDC, AuthMode.PRODUCTION].includes(authMode)) {
    for (const key of ["JWT_ISSUER", "JWT_AUDIENCE", "JWT_PUBLIC_KEY"]) requiredEnv(env, key);
  }
  return { nodeEnv, authMode };
}

export function createAuthenticationProvider(env = process.env) {
  validateAuthConfiguration(env);
  const mode = env.AUTH_MODE ?? (String(env.NODE_ENV).toLowerCase() === "test" ? AuthMode.TEST : null);
  if (mode === AuthMode.DEVELOPMENT_MOCK) return new DevelopmentMockProvider(env);
  if (mode === AuthMode.TEST) return new TestProvider(env);
  if (mode === AuthMode.OIDC || mode === AuthMode.PRODUCTION) return new OidcProvider(env);
  throw new AuthError(500, "AUTH_MODE_UNSUPPORTED", `Unsupported AUTH_MODE: ${mode}`);
}

export function authenticateRequest(request, env = process.env, provider = null) {
  const internal = new InternalServiceProvider(env).authenticate(request);
  if (internal) return internal;
  return (provider ?? createAuthenticationProvider(env)).authenticate(request);
}

export function requireRoles(principal, roles) {
  if (!principal) throw new AuthError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  if (!roles.some((role) => principal.roles?.includes(role) || principal.role === role)) {
    throw new AuthError(403, "ROLE_NOT_ALLOWED", "Role is not allowed for this operation");
  }
}

export function assertPatientPrincipal(principal, patientId) {
  requireRoles(principal, [PrincipalRole.PATIENT]);
  if (!patientId || principal.patientId !== patientId) {
    throw new AuthError(403, "PATIENT_IDENTITY_MISMATCH", "Patient identity mismatch");
  }
}

export function assertDoctorPrincipal(principal, { doctorId, hospitalId }) {
  requireRoles(principal, [PrincipalRole.DOCTOR]);
  if (!doctorId || principal.doctorId !== doctorId) {
    throw new AuthError(403, "DOCTOR_IDENTITY_MISMATCH", "Doctor identity mismatch");
  }
  if (!hospitalId || principal.hospitalId !== hospitalId) {
    throw new AuthError(403, "HOSPITAL_IDENTITY_MISMATCH", "Hospital identity mismatch");
  }
}

export function canReadAuditLogs(principal) {
  requireRoles(principal, [
    PrincipalRole.SECURITY_ADMIN,
    PrincipalRole.PLATFORM_ADMIN,
    PrincipalRole.HOSPITAL_ADMIN,
  ]);
}

export function applyAuditScope(principal, filters = {}) {
  canReadAuditLogs(principal);
  if (principal.role === PrincipalRole.HOSPITAL_ADMIN) return { ...filters, hospitalId: principal.hospitalId };
  return filters;
}

export function requireInternalService(principal) {
  requireRoles(principal, [PrincipalRole.INTERNAL_SERVICE]);
}

// Preserve the existing identity assertion; persist only authenticated identity
// and a bounded attempted consent reference, never the caller's credentials/body.
export async function assertDoctorPrincipalAudited(principal, input, recordDenial) {
  try {
    assertDoctorPrincipal(principal, input);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    try {
      await recordDenial({
        actorType: principal?.role ?? "SYSTEM",
        actorId: principal?.doctorId ?? principal?.patientId ?? principal?.userId ?? "UNKNOWN",
        hospitalId: principal?.hospitalId ?? null,
        consentId: typeof input.consentId === "string" && /^consent_[a-f0-9]{16}$/.test(input.consentId) ? input.consentId : null,
        action: "TOKEN_DENIED", result: "FAIL", reasonCode: error.code,
      });
    } catch {
      throw new AuthError(503, "AUTHORIZATION_AUDIT_UNAVAILABLE");
    }
    throw error;
  }
}

export function requireInternalServiceScope(principal, scope) {
  requireInternalService(principal);
  if (!Array.isArray(principal.scopes) || !principal.scopes.includes(scope)) {
    throw new AuthError(403, "SERVICE_SCOPE_REQUIRED");
  }
}

function validatePrivacyServiceConfiguration(env) {
  const privacy = env.HIPASS_PRIVACY_SERVICE_TOKEN;
  if (privacy === undefined) return;
  if (typeof privacy !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(privacy)
    || new Set(privacy).size < 8 || /replace|change.?me|example/i.test(privacy)) {
    throw new AuthError(500, "PRIVACY_SERVICE_TOKEN_INVALID_CONFIGURATION");
  }
  if (env.HIPASS_INTERNAL_SERVICE_TOKEN && safeEqual(privacy, env.HIPASS_INTERNAL_SERVICE_TOKEN)) {
    throw new AuthError(500, "SERVICE_TOKEN_COLLISION");
  }
}

export function isPrivilegedAdmin(principal) {
  return [PrincipalRole.SECURITY_ADMIN, PrincipalRole.PLATFORM_ADMIN].includes(principal?.role);
}

export function verifyJwt(token, options) {
  const [encodedHeader, encodedPayload, signature] = String(token).split(".");
  if (!encodedHeader || !encodedPayload || !signature) throw new AuthError(401, "JWT_INVALID", "JWT is malformed");
  const header = parseBase64UrlJson(encodedHeader);
  const claims = parseBase64UrlJson(encodedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  if (header.alg === "HS256") {
    if (!options.hmacSecret) throw new AuthError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT HMAC secret is not configured");
    const expected = createHmac("sha256", options.hmacSecret).update(signingInput).digest("base64url");
    if (!safeEqual(signature, expected)) throw new AuthError(401, "JWT_INVALID_SIGNATURE", "JWT signature is invalid");
  } else if (header.alg === "RS256") {
    if (!options.publicKey) throw new AuthError(500, "JWT_PUBLIC_KEY_NOT_CONFIGURED", "JWT public key is not configured");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    if (!verifier.verify(options.publicKey, signature, "base64url")) throw new AuthError(401, "JWT_INVALID_SIGNATURE", "JWT signature is invalid");
  } else {
    throw new AuthError(401, "JWT_ALG_UNSUPPORTED", "JWT algorithm is unsupported");
  }
  validateRegisteredClaims(claims, options);
  return claims;
}

function principalFromClaims(claims, authMethod, authMode) {
  const roles = normalizeRoles(claims.roles ?? claims.role);
  const role = roles[0] ?? null;
  return normalizePrincipal({
    subject: claims.sub,
    userId: claims.userId ?? claims.sub,
    actorType: role,
    role,
    roles,
    scopes: splitScopes(claims.scope ?? claims.scopes ?? ""),
    hospitalId: claims.hospitalId ?? null,
    patientId: claims.patientId ?? null,
    doctorId: claims.doctorId ?? null,
    sessionId: claims.sid ?? claims.jti ?? claims.sub,
    authenticatedAt: new Date().toISOString(),
    issuer: claims.iss,
    audience: claims.aud,
    expiresAtMs: claims.exp * 1000,
    authMethod,
    authMode,
  });
}

function normalizePrincipal(principal) {
  validatePrincipalShape(principal);
  return principal;
}

function validatePrincipalShape(principal) {
  if (!principal.subject || !principal.userId || !principal.role) {
    throw new AuthError(401, "PRINCIPAL_INCOMPLETE", "Principal requires subject, userId, and role");
  }
  if (principal.role === PrincipalRole.PATIENT && !principal.patientId) {
    throw new AuthError(401, "PATIENT_PRINCIPAL_INCOMPLETE", "Patient principal requires patientId");
  }
  if (principal.role === PrincipalRole.DOCTOR && (!principal.doctorId || !principal.hospitalId)) {
    throw new AuthError(401, "DOCTOR_PRINCIPAL_INCOMPLETE", "Doctor principal requires doctorId and hospitalId");
  }
  if (principal.role === PrincipalRole.HOSPITAL_ADMIN && !principal.hospitalId) {
    throw new AuthError(401, "HOSPITAL_ADMIN_PRINCIPAL_INCOMPLETE", "Hospital admin principal requires hospitalId");
  }
}

function validateRegisteredClaims(claims, options) {
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.sub !== "string" || !claims.sub) throw new AuthError(401, "JWT_SUB_REQUIRED", "JWT sub is required");
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)
    || ["iat", "nbf"].some((key) => claims[key] !== undefined
      && (typeof claims[key] !== "number" || !Number.isFinite(claims[key])))) {
    throw new AuthError(401, "JWT_REGISTERED_CLAIMS_INVALID", "JWT timestamps must be finite NumericDate values");
  }
  if (options.issuer && claims.iss !== options.issuer) throw new AuthError(401, "JWT_ISSUER_INVALID", "JWT issuer is invalid");
  const expectedAudience = options.audience;
  const actualAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (expectedAudience && !actualAudiences.includes(expectedAudience)) throw new AuthError(401, "JWT_AUDIENCE_INVALID", "JWT audience is invalid");
  if (claims.exp === undefined || Number(claims.exp) <= now) throw new AuthError(401, "JWT_EXPIRED", "JWT is expired");
  if (claims.nbf !== undefined && Number(claims.nbf) > now) throw new AuthError(401, "JWT_NOT_YET_VALID", "JWT is not yet valid");
  if (claims.iat !== undefined && Number(claims.iat) > now + 60) throw new AuthError(401, "JWT_IAT_INVALID", "JWT issued-at is invalid");
}

function parseBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new AuthError(401, "JWT_INVALID", "JWT JSON is invalid");
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function getBearerTokenFromRequest(request) {
  const header = request.headers.authorization ?? request.headers.Authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function normalizePrincipalRole(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replaceAll("-", "_");
  return Object.values(PrincipalRole).includes(normalized) ? normalized : null;
}

function normalizeRoles(value) {
  const roles = Array.isArray(value) ? value : String(value ?? "").split(/[,\s]+/);
  return roles.map(normalizePrincipalRole).filter(Boolean);
}

function splitScopes(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(/[,\s]+/).filter(Boolean);
}

function defaultScopesForRole(role) {
  if (role === PrincipalRole.DOCTOR) return ["dicom:request"];
  if (role === PrincipalRole.PATIENT) return ["consent:write", "consent:read"];
  if (role === PrincipalRole.SECURITY_ADMIN) return ["audit:read", "research:approve"];
  if (role === PrincipalRole.PLATFORM_ADMIN) return ["platform:admin", "audit:read"];
  if (role === PrincipalRole.HOSPITAL_ADMIN) return ["hospital:admin", "audit:read"];
  return [];
}

function requiredEnv(env, key) {
  if (!env[key]) throw new AuthError(500, `${key}_REQUIRED`, `${key} is required`);
  return env[key];
}
