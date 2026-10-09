import { TestProvider, OidcProvider, AuthError } from './auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const supportedRoles = new Set(['PATIENT','DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN','INTERNAL_SERVICE']);
const maintenanceScopes=new Map([['SESSION_EXPIRY','exchange:expire'],['CONSENT_EXPIRY','consent:expire']]);
const privateState = new WeakMap();
const issuedBindings = new WeakMap();
const verifiedSyntheticAssurance=new WeakMap();
/** Signed test-provider claims only; not real IdP MFA or human proof. */
export function assertV3SyntheticPatientReauthentication(binding,{nowMs,maxAgeMs}={}){
  v3BindingExpiry(binding);
  if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300000)
    throw new AuthError(500,'V3_REAUTH_POLICY_REQUIRED');
  const fact=verifiedSyntheticAssurance.get(binding);
  if(binding.role!=='PATIENT'||!fact||fact.authTimeMs>nowMs||nowMs-fact.authTimeMs>maxAgeMs
    ||fact.authTimeMs>Date.now()||Date.now()-fact.authTimeMs>maxAgeMs)
    throw new AuthError(403,'V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
  return fact;
}
// Context is an internal capability: an arbitrary frozen request body is not valid.
export function v3BindingExpiry(binding) {
  const expiresAt = binding && typeof binding === 'object' ? issuedBindings.get(binding) : undefined;
  if (expiresAt === undefined) throw new AuthError(403, 'V3_AUTHENTICATED_BINDING_REQUIRED');
  if (Date.now() >= expiresAt) throw new AuthError(401, 'JWT_EXPIRED');
  return expiresAt;
}
function denied(code) { throw new AuthError(403, code); }
function recordKey(issuer, subject) { return JSON.stringify([issuer, subject]); }
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AuthError(500, 'V3_REGISTRY_CONFIGURATION_INVALID');
  return value.toLowerCase();
}

/** Server-owned registry snapshot. No body/header fields configure it. */
export class V3PrincipalRegistry {
  constructor({ provider, records } = {}) {
    if (!(provider instanceof TestProvider || provider instanceof OidcProvider) || !Array.isArray(records)) {
      throw new AuthError(500, 'V3_REGISTRY_CONFIGURATION_INVALID');
    }
    const issuer = provider.env.JWT_ISSUER ?? (provider instanceof TestProvider ? 'hipass-test' : null);
    if (typeof issuer !== 'string' || !issuer || issuer.length > 256) throw new AuthError(500, 'V3_REGISTRY_CONFIGURATION_INVALID');
    const bindings = new Map();
    for (const record of records) {
      if (!record || record.issuer !== issuer || typeof record.subject !== 'string' || !record.subject
        || record.subject.length > 256 || !supportedRoles.has(record.role)
        || !Array.isArray(record.scopes) || record.scopes.some(scope => typeof scope !== 'string' || !/^[a-z][a-z0-9:-]{1,63}$/.test(scope))
        || typeof record.authHospitalId !== 'string' || !record.authHospitalId || record.authHospitalId.length > 128
        || !['ACTIVE','SUSPENDED','REVOKED'].includes(record.status)) throw new AuthError(500, 'V3_REGISTRY_CONFIGURATION_INVALID');
      const key = recordKey(issuer, record.subject);
      if(record.role==='INTERNAL_SERVICE'
        ?!maintenanceScopes.has(record.servicePurpose)||record.patientRefId!=null||record.scopes.length!==1||record.scopes[0]!==maintenanceScopes.get(record.servicePurpose)
        :record.servicePurpose!=null||record.scopes.some(scope=>scope==='exchange:expire'||scope==='consent:expire'))throw new AuthError(500,'V3_REGISTRY_CONFIGURATION_INVALID');
      if (bindings.has(key)) throw new AuthError(500, 'V3_REGISTRY_CONFIGURATION_INVALID');
      bindings.set(key, Object.freeze({ issuer, subject: record.subject, tenantId: uuid(record.tenantId),
        hospitalId: uuid(record.hospitalId), actorId: uuid(record.actorId), role: record.role,
        authHospitalId: record.authHospitalId, status: record.status,
        scopes: Object.freeze([...new Set(record.scopes)]),
        patientRefId: record.patientRefId == null ? null : uuid(record.patientRefId),
        ...(record.role==='INTERNAL_SERVICE'?{servicePurpose:record.servicePurpose}:{}) }));
    }
    // Capture a private provider config snapshot so changing caller env cannot switch issuer/key.
    const snapshot = provider instanceof TestProvider ? new TestProvider({ ...provider.env }) : new OidcProvider({ ...provider.env });
    privateState.set(this, { provider: snapshot, issuer, bindings });
  }
  resolve(request, { requiredScope, allowedRoles } = {}) {
    if (typeof requiredScope !== 'string' || !Array.isArray(allowedRoles) || !allowedRoles.length) throw new AuthError(500, 'V3_OPERATION_POLICY_REQUIRED');
    const state = privateState.get(this);
    const principal = state.provider.authenticate(request);
    // Provider has already verified this exact bearer. Apply strict timestamp
    // types as well: legacy Number('not-a-time') comparisons otherwise yield NaN.
    const bearer = request.headers.authorization ?? request.headers.Authorization;
    let claims;
    try { claims = JSON.parse(Buffer.from(bearer.slice(7).trim().split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new AuthError(401, 'V3_REGISTERED_CLAIMS_INVALID'); }
    if (!Number.isSafeInteger(claims.exp) || claims.exp <= 0
      || ['iat','nbf'].some(key => claims[key] !== undefined && (!Number.isSafeInteger(claims[key]) || claims[key] < 0))) {
      throw new AuthError(401, 'V3_REGISTERED_CLAIMS_INVALID');
    }
    const binding = state.bindings.get(recordKey(state.issuer, principal.subject));
    if (!binding || binding.status !== 'ACTIVE') denied('V3_PRINCIPAL_NOT_REGISTERED');
    const maintenanceScope=maintenanceScopes.get(binding.servicePurpose);
    if(binding.role==='INTERNAL_SERVICE'&&(requiredScope!==maintenanceScope||principal.scopes.length!==1||principal.scopes[0]!==maintenanceScope
      ||principal.roles.length!==1||principal.roles[0]!=='INTERNAL_SERVICE'))
      denied('V3_SERVICE_SCOPE_NOT_ALLOWED');
    if (principal.role !== binding.role || !allowedRoles.includes(binding.role)) denied('V3_ROLE_NOT_ALLOWED');
    if (principal.hospitalId !== binding.authHospitalId) denied('V3_HOSPITAL_BINDING_MISMATCH');
    if (!principal.scopes.includes(requiredScope) || !binding.scopes.includes(requiredScope)) denied('V3_SCOPE_NOT_ALLOWED');
    if (binding.role === 'PATIENT' && !binding.patientRefId) denied('V3_PATIENT_BINDING_REQUIRED');
    const resolved = Object.freeze({ actorId: binding.actorId, tenantId: binding.tenantId, hospitalId: binding.hospitalId,
      patientRefId: binding.patientRefId, role: binding.role,
      scopes: Object.freeze(binding.scopes.filter(scope => principal.scopes.includes(scope))),
      ...(binding.role==='INTERNAL_SERVICE'?{servicePurpose:binding.servicePurpose}:{}) });
    issuedBindings.set(resolved, claims.exp * 1000);
    if(state.provider instanceof TestProvider&&binding.role==='PATIENT'
      &&claims.acr==='urn:highpass:capstone:mock-mfa'&&claims.highpass_test_assurance===true
      &&Array.isArray(claims.amr)&&claims.amr.length===3&&new Set(claims.amr).size===3
      &&['pwd','otp','mfa'].every(value=>claims.amr.includes(value))
      &&Number.isSafeInteger(claims.auth_time)&&claims.auth_time>=0&&Number.isSafeInteger(claims.auth_time*1000))
      verifiedSyntheticAssurance.set(resolved,Object.freeze({kind:'SIGNED_SYNTHETIC_REAUTH_ONLY',authTimeMs:claims.auth_time*1000}));
    return resolved;
  }
}
