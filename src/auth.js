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
    const serviceToken = request.headers["x-hipass-service-token"];
    if (!this.env.HIPASS_INTERNAL_SERVICE_TOKEN || serviceToken !== this.env.HIPASS_INTERNAL_SERVICE_TOKEN) return null;
    return normalizePrincipal({
      subject: "internal-service",
      userId: "internal-service",
      actorType: PrincipalRole.INTERNAL_SERVICE,
      role: PrincipalRole.INTERNAL_SERVICE,
      roles: [PrincipalRole.INTERNAL_SERVICE],
      scopes: ["audit:write", "gateway:introspect"],
      hospitalId: null,
      patientId: null,
      doctorId: null,
      sessionId: request.headers["x-hipass-session-id"] ?? "internal-service",
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
  if (!claims.sub) throw new AuthError(401, "JWT_SUB_REQUIRED", "JWT sub is required");
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
