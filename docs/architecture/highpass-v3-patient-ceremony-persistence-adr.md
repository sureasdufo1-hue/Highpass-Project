# Patient ceremony persistence — incremental ADR

2026-10-08 / DRAFT TECHNICAL DESIGN / UNASSIGNED.
Policy reviewer and approver: 김범희, 2026-10-08; policy adoption is not
independent approval of new implementation evidence.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.

## Decision and bounded implementation

Use additive immutable objects; never UPDATE an018 preparation to ACTIVE.
Migration023 introduces only a patient-bound ceremony and its mandatory creation
audit, with a separate NOLOGIN `hp_v3_consent_approval_policy`. No admission RLS,
login membership, runtime migration or deployed approval route is introduced.
Existing clinical, pending and maintenance capabilities remain unchanged.

The challenge binds an immutable preparation, parent version, registered source
PatientRef and patient principal; source and target institutions, purpose, window,
ordered resources/actions and policy are included in its server-derived digest.
An independent linking clause includes version, UTF-8 text digest, fixed
PATIENT_IDENTITY_LINK purpose and finite window within the clinical window.
Neither clinical approval nor a submitted evidence commitment implies link approval.

Canonical representation v1 is PostgreSQL16 `jsonb_build_array(... )::text` UTF-8,
domain-separated by HP-V3-PATIENT-CONTENT-PG16-V1, with numeric epoch timestamps,
ordered scope/action arrays and SHA-256. It is NOT JS JSON.stringify/JCS. The server
must return the locked snapshot and its SQL digest; clients echo the digest, not
calculate approval evidence. A canonicalization change needs a new domain/version.

Store only SHA-256 of a future CSPRNG nonce, never the nonce. A database hash/UUID
does not prove randomness, signed authentication or a human ceremony. Reauth kind
is explicitly SIGNED_SYNTHETIC_REAUTH_ONLY; schema timestamp bounds complement,
but cannot replace, private verified TestProvider claims in the future service.
Challenge lifetime is at most five minutes, bounded by preparation and reauth
freshness. SQL owner fixture values are constraint tests, NOT authentication proof.

Next additive objects will separate `contentVersion` from state-event sequence.
Content snapshots must be immutable and permit future versioned replacement;
append-only decision events uniquely consume a ceremony. Initial APPROVE/REJECT
only, explicit independent link choice, typed original response/idempotency record
and audit must commit together. A recorded approval is not Decision ALLOW, Grant,
recipient activation, Mapping VERIFIED, or an executed clinical action. Withdrawal,
expiry and other later transitions need their own reviewed contracts.

## Lock DAG and deployment gate

Registry-first transactions currently lock principal/source tenant/hospital with
a JOIN FOR SHARE. Its internal row order is not proven deterministic. Preserve
that invariant; do not assert global deadlock safety from a diagram.

Proposed single-session ceremony service order:

registry SHARE → actor/operation/idempotency advisory → Session SHARE → owned
PatientRef SHARE → target hospital SHARE → target tenant SHARE → immutable
preparation/children read → ceremony/decision serialization → child/audit/result
INSERT → final live/reauth check → COMMIT and deferred validation.

An immutable challenge itself needs no UPDATE of staging, Mapping or participant.
The preparation and principal composite FKs may acquire implicit parent locks;
the cyclic ceremony/audit FKs and assembly trigger run at COMMIT. Before opening
nonowner INSERT policies, measure actual blockers/pg_locks and deferred checks.
Do not acquire a Session UPDATE after PatientRef/target locks in the new path.
Institution stop/ref mutation/withdraw paths are not implemented by this ADR;
they must not introduce the opposite dependency while retaining earlier locks.

Known existing paths: create uses ref/target before new Session insert, pending
uses Session→ref→target SHARE, cancel uses Session UPDATE, expiry uses ordered
Session UPDATE SKIP LOCKED, Mapping paths differ in ref/Mapping order. SHARE-only
differences do not prove a current deadlock. New cross-session mutations require
a separate full graph, not this single-session proposal.

Required actual D6 races: approval versus cancel/expiry, principal/ref/source/target
inactivation, duplicate challenge consumption and lost ACK; later approval versus
withdraw, institution acceptance versus stop, and linking versus cancellation.
Use owned backend PID witnesses and bounded lock/query/transaction timeouts. No
raw SQL parameters, nonce, token or private key in evidence. A schema owner test
does not pass D6, prove concurrent live approval, or authorize runtime activation.

## Remaining gates

023 schema/default-deny/rollback → patient-only minimum-column projection and
guarded pool → private verified challenge issuance → immutable decision/content/
audit/result atomic persistence and exactly-once consumption → actual races →
HTTPS/API/UI and independent review. Each gate keeps new evidence DRAFT/UNASSIGNED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 025 issuance follow-up, before code

[Hash-only recovery contract](../api/highpass-v3-patient-challenge-issuance-contract.md)
defines atomic challenge/audit/idempotency metadata, first-commit-only raw nonce,
explicit nonce-unavailable retry and lost-ACK recovery with a fresh request key.
No stored or reconstructible raw nonce, in-process resend cache or real KMS claim.
Additional issuance result is immutable; required deferred receipt proof complements
existing exact creation-audit proof. Historical pre025 fixtures are not backfilled
as service-issued evidence.023 assembly's preparation SELECT-star is replaced by
named needed columns to preserve minimal patient grants; validation is not relaxed.
Same-key advisory lock is actor/source scoped and precedes existing Session locks.
Signed reauth/CSPRNG evidence must come from the private service, never SQL settings.

## 026 decision persistence, before implementation

Use immutable content/scopes/actions, two initial state events (PENDING then
ACTIVE/REJECTED), exact event audits, one ceremony/preparation consumption and one
typed decision receipt. contentVersion is separate from eventSequence. Initial
version1 only is admitted until a replacement-version contract is implemented;
future versions are not silently covered by old evidence.023 challenge stays immutable.

Decision locks: registry SHARE→actor/operation/key advisory→source/preparation
decision advisory→Session SHARE→ref SHARE→target hospital SHARE→target tenant SHARE→
ceremony read→content/event/audit/consumption/receipt INSERT→final checks→COMMIT.
Preparation decision lock uses a fixed domain-separated SHA256-derived bigint,
not an actor/key-secret-dependent digest, so different actors/keys cannot bypass
serialization. UNIQUE preparation/ceremony consumption remains the DB backstop.
No ceremony UPDATE lock or new parent UPDATE occurs after ref/target locks.
Deferred FK proof and assembly validate exact timestamps, canonical snapshot,
independent link choice, signed-synthetic assurance bounds and live current context.
Actual raw nonce/private reauth provenance remains service-enforced, not SQL proof.

The safe idempotent receipt proves a recorded decision, not current authorization.
Exact same-key retry still needs current private patient/reauth and locked parent,
but may return a prior receipt after that challenge deadline; it cannot re-consume
or issue authority. Fresh attempts require live nonce/deadline. Changes to command,
nonce, key or preparation cannot create a second initial decision. New public
audit/HTTPS/UI, withdrawal/expiry, supersession and full D6 remain mandatory gates.
