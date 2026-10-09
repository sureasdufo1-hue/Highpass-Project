# Cross-institution identity: dependency and authority contract

2026-10-07. DRAFT TECHNICAL ALIGNMENT / UNASSIGNED. Not runtime activation or
patient consent/legal approval. Basis: architecture alignment §§3–5, logical ERD
§§2–3.2, V3-FR-ID-001~006 / EX-001~007 / CON-001~006 / TEN-002~003.

## Confirmed boundary

PatientRef is opaque; a hospital owns its local mapping, not the patient's global
identity. A patient_ref_registrations row records the original explicit owner
tuple, not another institution's membership or the patient's sharing approval.
Mapping VERIFIED records local identity review, not consent. Session participation
records institutional involvement, not permission to retrieve images or DEKs.

## Dependency ordering (no gate declared complete)

The prior linear P0-04 → P0-05 → P0-06 order cannot finish cross-institution
mapping before the Session/Consent dependencies exist. Split milestones without
removing acceptance cases:

1. P0-04 own-ref Identity foundation (local PG/HTTP tested; not deployed).
2. P0-05 Session/participants/snapshot foundation; source-owned creation, explicit
   recipient participation and no image movement or implicit consent.
3. P0-06 server-authenticated patient binding, versioned ConsentArtifact and
   authorization; exact patient approval evidence must be verified, not a digest
   merely supplied by an administrator. Existing binding.patientRefId provides an
   authenticated registry value; its persistent registration/revocation must also
   be checked transactionally. Legacy consent/handoff is not silently upgraded.
4. Return to P0-04 cross-institution linking with the live Session/Consent authority;
   then exercise A/B/C isolation, review and revoked/expired approval races.
5. Finish all P0-04~06 acceptance including runtime activation before downstream
   clinical access/import. Partial foundations do not close those packages.

## Linking authority, not a new bearer capability

No global membership API or new clinical AccessAction is introduced by this
document. A future linking service must derive its authority from the same Session,
active recipient participation and verified patient approval. It must also verify
that the approved policy/evidence explicitly covers the institution-local identity
link; study:pacs-transfer, an opaque UUID, or a generic ACTIVE consent alone does
not prove that permission. The exact machine-readable approval clause and policy
contract are pending P0-06 alignment, and absence must deny linking.

The internal authorization tuple must include sessionId/version, patientRefId,
source and recipient tenant/hospital, authenticated patient approval identity,
consentArtifactId/version, policy version/evidence digest and bounded valid window.
It is not accepted from the recipient's JSON as trusted state or issued as a token.
Local mapping starts UNVERIFIED and requires a distinct authorized reviewer.
Identity conflicts never reassign owner/PatientRef/protected ref/digest.

## Transaction and revocation rules

Lock authoritative current session, participants, approval and institution status
in a documented global order before mapping writes; revalidate versions and
expiry at commit. The later database/service implementation must serialize a
revocation against creation, and repeat the current authorization checks on an
idempotent retry. A stale successful response is not present authorization.
Revocation wins after its commit: new links and clinical use deny. A previously
committed link may remain as a historical local identity record under retention
policy; it must not imply renewed consent or ongoing clinical access.

Audit link creation and policy denials with actor/tenant/hospital/session/approval
version/mapping/version/trace, not raw identifiers/evidence documents/tokens.
Mutation, audit and idempotency response must commit together. Audit failure denies
and rolls back. Keep missing/foreign resources indistinguishable to unauthorized
callers. RLS must use scoped base relationships without circular SELECT policies,
SECURITY DEFINER shortcuts, copied ownership or global patient enumeration.

## First dependency implementation scope

Validate the existing CreateExchangeSessionRequest: exact fields, server-bound
requester and owner/source, PATIENT_INITIATED bound to the authenticated patient,
PROVIDER_INITIATED only clinical/admin roles, finite policy-bounded expiry,
immutable bounded Study/Series snapshot. Neither path creates active consent.
Source mapping ownership, active target registry, persistent patient binding,
participation, database mutation, audit, idempotency and HTTP still require actual
service/database tests. A validated command is not an authorized session.

Technical clarification: reject duplicate Study entries and empty Series arrays
instead of silently expanding/merging them; omitted Series means explicit whole
Study selection in the existing API. Future requests and approvals must preserve
this distinction, and scope narrowing must never change omission into permission.

## Acceptance remaining NOT VERIFIED end-to-end

A/B mapping of one reference with explicit approval; recipient acceptance;
patient/admin spoofing; foreign UUID-only access; absent or insufficient approval
clause; inactive participant; revoked/expired approval; cancelled/expired session;
suspended institution; stale version; self-review; conflict; missing audit; replay
after revocation; actual two-session revoke/link serialization; clinical DENY after
withdrawal. These require implemented DB/services, not just validator tests.
