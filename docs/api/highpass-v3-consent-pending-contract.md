# PENDING consent preparation input contract

2026-10-08 / DRAFT / UNASSIGNED. Related V3-FR-CON-001/002, V3-FR-EX-005,
V3-SR-IAM-004/TEN-001/AUTH-001/002 and legacy FR-001..005/014..020.

## Scope and exact interface

preparePendingConsentIntent(binding, request, selection, policy) is an internal PURE
validator. No DB client, router, artifact write, audit write, membership transition,
approval or Grant/key/payload is created. Fixed PENDING is preparation, not consent.
assertPendingConsentIntent confirms parser provenance for the same live branded
binding only; it never confirms current Session authority or patient approval.

binding: server-branded V3PrincipalRegistry binding, live JWT, PATIENT/DOCTOR/
HOSPITAL_ADMIN with consent:write. Source hospital/owner tenant must match selection;
PATIENT additionally matches its server-bound PatientRef. This is structural identity
checking, not a fresh DB principal/ownership/membership check.

request exact keys: patientRefId, sourceHospitalId, targetHospitalId, purpose,
allowedActions, state, validFrom, validUntil, resources, policyVersion, evidenceDigest.
state must be PENDING. ACTIVE, approval/link flags, keys/tokens or extra fields deny.
evidenceDigest follows existing target length/alphabet43..128; it is only a submitted
opaque string, not verified SHA256, approval evidence, authenticity or consent.
Returned field is unverifiedEvidenceDigest and evidenceStatus UNVERIFIED.

selection exact keys: sessionId, patientRefId, ownerTenantId, sourceHospitalId,
targetHospitalId, purpose, requestedActions, resources, validFrom, validUntil, version.
This projection is UNTRUSTED to the parser. A caller can fabricate matching selection;
passing validation does not make it authoritative. A future service must reread/lock
Session/ref/registry and immutable scope in DB, and regenerate/revalidate the intent.
No caller authoritative=true flag or arbitrary extra field is accepted.

policy exact keys: nowMs, maxLifetimeMs. Finite safe integer server values required;
maxLifetimeMs1..86400000. These are injected test/structural policy values here, not DB
time proof. Request window must start >=now, end after start, end<=now+maxLifetime and
be within parent window. Later service must use DB time at admission/commit.

## Scope semantics and errors

Shared pure Session normalizers retain1..100 unique Study selections,1..500 unique
Series when supplied, and1..4 canonical independent actions. Same purpose and action/
resource subsets only. Omitted Series means explicit whole Study: a Series-scoped
parent cannot expand to whole Study. Whole-Study parent may narrow to listed Series.
Selections are normalized/copied/deep-frozen; no mutable caller-array authority.

Malformed fields/prototypes/accessors/sparse arrays ->422 V3_CONSENT_PENDING_INVALID;
purpose/action/resource expansion ->422 V3_CONSENT_PENDING_SCOPE_MISMATCH;
window expansion/elapsed window ->422 V3_CONSENT_PENDING_WINDOW_INVALID;
source/patient mismatch ->403 fixed safe codes; missing role/scope/binding denies.
Nonfinite numeric server policy ->500 V3_CONSENT_PENDING_POLICY_REQUIRED.
Messages never include patient input/evidence text/token. No DENY audit is claimed:
that requires the future transactional service, not this pure function.

## Remaining gate

### Retry timing follow-up — 2026-10-08

parsePendingConsentIntent now checks exact authenticated structure/parent subset
without fresh-time admission. preparePendingConsentIntent preserves FRESH behavior.
validatePendingConsentIntentWindow accepts internal FRESH/REPLAY selection; REPLAY
requires branded parser output, fixed nonexpired window and finite server policy.
Elapsed validFrom is allowed only in that internal retry check. The future service
must choose REPLAY from a matching durable ledger, never client body/flags. Neither
mode proves a ledger, DB time, ownership or patient approval by itself.
Missing/malformed server policy now fails closed500. A new request remains unable
to use past validFrom; an expired retry remains denied. No persistence exists yet.

The [authority/write contract](highpass-v3-consent-pending-authority-contract.md)
specifies proposed same-transaction DB selection, separate staging tables and current
retry eligibility. It also identifies elapsed-validFrom replay handling needed before
connecting this pure validator to persistence. No schema/service is activated by it.

Implement server-selected locked authoritative projection and current eligibility
before persistence. Safe PENDING preparation must remain separate from approved
ConsentArtifact version/lifecycle (D4). D1 patient ceremony, D2 link clause, D3 recipient
acceptance and D4 content/events remain undecided; D5/D6 state/lock review also apply.
No actual consent, invitation activation, cross-institution linking or clinical
authority is implemented. Approval must not be inferred from a branded intent.
