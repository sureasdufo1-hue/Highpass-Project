# PENDING preparation authority and persistence contract

2026-10-08 / DRAFT TECHNICAL CONTRACT / UNASSIGNED. Not patient approval or runtime activation.
Sources: pending input/lifecycle contracts, migrations006..017, V3TenantTransaction,
V3ExchangeReadService and Session creation/replay. Related V3-FR-CON-001/002,
EX-005/006/007, V3-SR-IAM-004/TEN-001..003/AUTH-001..004; FR-001..005/014..025/037..041.

## 1. Current gaps and exact boundary

Pure pending intent branding proves parser provenance only. A forged matching JSON
selection can pass it. Existing Session read policy relies on exchange:read, source
creation root/directory relies on exchange:create, and typed Session audit has no
preparation action. Do not supply these extra user scopes or broad pool privileges
to make consent:write work. A new isolated source preparation service needs its own
RLS/read/lock/audit contract. Nothing here makes recipient INVITED into ACTIVE.

Preparation is an immutable staging request, not ConsentArtifact, approval event,
AuthorizationDecision or TransferGrant. It may be requested by patient or provider;
provider preparation is never the patient's approval. D1..D6 still govern later
ceremony, identity link, institution acceptance, actual consent lifecycle and edges.

## 2. Proposed source authority

All actors need live server-branded binding and fresh active persisted actor/tenant/
source hospital under consent:write. Role must be PATIENT/DOCTOR/HOSPITAL_ADMIN.
Require exact source owner tenant/hospital from the locked Session, live undeleted
owned PatientRef and ACTIVE SOURCE participant. Reject maintenance/security/platform
identities. PATIENT must match its persisted bound PatientRef even on a provider-
initiated Session. Initial DOCTOR scope is own requester only, not all doctors in
the institution. HOSPITAL_ADMIN may prepare in its source institution, not approve
for a patient. These are bounded staging-role proposals, not approved clinical delegation.

Current initial Session eligibility is REQUESTED/v1 only. All other states, effective
expiry, inactive target tenant/hospital or target mismatch deny. This does not remove
the complete target lifecycle; later eligibility needs its own evidence/edge gate.
Use source/target identity from DB, never the client authority projection.

Prepare signature proposal (internal only):
prepare(binding, idempotencyKey, sessionId, ifMatch, request, correlation).
There is NO selection/tenant/actor/clock argument from a client. UUID sessionId;
strong quoted positive If-Match integer; key16..128 ASCII allowlist as existing
Session commands. Proposed errors: invalid422; inaccessible/missing404; stale412;
scope/window violation422; idempotency conflict409; eligible-but-terminal/expired
prepare or replay returns uniform404 with precise safe DENY audit; storage503.
Authentication/binding failures retain existing401/403 and occur before repository.

## 3. Same-transaction procedure and timing

1. Validate exact shape/binding/key/If-Match/correlation without DB effects. Canonicalize
   structural request without rejecting an elapsed validFrom just for replay lookup.
2. Dedicated nonowner/NOBYPASSRLS preparation pool, transaction deadline<=10s. Reject
   membership in clinical/expiry policy groups or dangerous owner/admin roles.
3. V3TenantTransaction.run(binding,'consent:write',...) locks fresh principal/source
   tenant/hospital. Within callback acquire scoped keyed advisory lock. Scope keys by
   tenant/hospital/actor/operation; use domain-separated keyed HMAC request/key hashes.
4. Lookup only own immutable preparation ledger. Validate digest and compare normalized
   command (including Session/version/window/scope/policy/submitted-evidence commitment).
   Different payload ->409 and committed DENY audit; original evidence input is untrusted.
5. Select source authorized Session FOR SHARE with exact predicates and minimal columns.
   Check version, state and DB clock. Lock owned undeleted PatientRef and SOURCE participant;
   lookup/lock target hospital/tenant using server-selected tuple. Do not use read-service
   returned JSON in another transaction or add exchange:read/create to the actor.
6. Reread ordinal immutable resource scopes, verify count and canonical SHA256 against
   Session snapshot, canonical actions and purpose. Derive projection internally and
   check request scope/window subset. Client fields must match authoritative identities.
7. New request: DB now<=validFrom<validUntil<=Session.validUntil and finite configured
   maximum lifetime. Retry: validFrom may have elapsed; require original fixed window,
   DB now<validUntil, live Session/current authority, same version and no expansion.
   Never change validFrom to now, alter request digest or issue new approval on retry.
8. New row+canonical resources/actions+typed audit+immutable idempotency result commit
   atomically. Existing matching row returns original minimal receipt only after current
   authority/time/row integrity checks and safe audit. Recheck DB clock after work and
   immediately before commit; deadline exhaustion/expired JWT rolls back/fails closed.

Registry-first ordering is fixed. Existing source create locks its PatientRef before
target registry; other paths differ. For the isolated first gate use Session share ->
PatientRef/source participant share -> target registry share; these are read locks,
but prove actual suspension/cancellation/expiry competition, not just assume safety.
Do not claim D6 global multi-institution deadlock freedom. No production retry loop;
lock/query/whole-transaction timeouts are finite and classified as technical failures.

## 4. Proposed additive staging data (not applied DDL)

| Object | Minimum fields | Constraints and ownership |
|---|---|---|
| consent_preparation_requests | preparation_id, session_id, session_version, patient_ref, owner_tenant/source/target tuple, actor_id, purpose, PENDING state, UNVERIFIED evidence status, requested window, policy_version, submitted_evidence_commitment, canonical resource digest/count, created_at, audit/trace refs | immutable; no ACTIVE/approved/decision/grant fields; composite Session/ref/source/target references |
| consent_preparation_scopes | preparation_id, ordinal, Study UID, whole_study, explicit Series array | bounded canonical immutable subset of current Session scope; omitted Series never broadens scoped parent |
| consent_preparation_actions | preparation_id, canonical action | unique1..4 and subset of Session requested actions; no new clinical action |
| consent_preparation_audit_outbox | event_id, owner tenant/hospital, actor, optional authorized Session/preparation/version, action/result/reason, DB time, audit_session_id/trace_id | append-only; fixed PREPARATION_CREATED/REPLAYED/DENIED; no raw evidence/key/token/local patient ref |
| consent_preparation_results | tenant/hospital/actor/operation, key_digest, request_digest, preparation_id, original created_at/state/evidenceStatus | scoped composite uniqueness; immutable; no raw key or credential |

submitted_evidence_commitment: domain-separated keyed32-byte commitment to untrusted
submitted string, not proof of approval or verified digest algorithm. Discard submitted
raw string from stored staging/audit/receipt. Keep issuer/policy approval evidence for
the future reviewed ceremony, not a guessed signature or administrator digest.

Deferred proof must bind preparation to exact child count, digest, actor/Session/version,
created audit and immutable result; direct partial assembly must fail at commit.
State PENDING never becomes ACTIVE in this schema. Future terminal Session leaves
historical staging immutable but ineligible; it must not imply a still-valid approval.
Persistence representation is independent of D4 approved ConsentArtifact versions.
Bounded staging retention/deletion with audit is a separate policy before deployment;
do not claim production retention or delete existing rows in this gate.

Receipt proposal: preparationId/sessionId/expectedSessionVersion/state PENDING/
evidenceStatus UNVERIFIED/createdAt. No patient identifiers, resources, submitted
string, commitment, key/token or approval flag. Same eligible retry preserves receipt.
Terminal/expiry/inactive binding/reference/recipient denial takes precedence over it.
Lost COMMIT ACK -> outcome unknown; new coordinator retry reads durable own result.

## 5. Minimum privileges / RLS proposal

Use a distinct NOLOGIN hp_v3_pending_policy capability for a dedicated pool role; no
membership in hp_v3_clinical_policy or hp_v3_expiry_policy. Capability is not a login
credential or global service authority. Fixture provisioning only before deployment.

Session select/lock policies derive from nonrecursive immutable creation-context tuple
plus own persisted principal and source authority. Root policy must not reference its
Session or children. Scoped child reads may reference the already restricted Session.
Permit patient preparation on provider-created Session only through bound PatientRef,
not arbitrary matching UUIDs. Existing permissive PUBLIC policies referencing Mapping
can force unwanted privileges during planning; role-scope them if required, preserving
existing clinical-role behavior and regression tests. Do not grant Mapping SELECT as
a workaround. Add narrow consent directory lookup without granting exchange:create.

Grant only required registry/ref/root/Session/resource/participant columns, staging
own-row SELECT/INSERT and append-only audit INSERT. FOR SHARE needs lock-only UPDATE
privilege/policy with WITH CHECK(false); actual clinical parent UPDATE is forbidden.
No patient/local Mapping identifier read, clinical audit administration, Session state
events/cascade writes, object storage or key privileges. New tables FORCE RLS and REVOKE
PUBLIC; restricted preparation policies check human context and exact consent scope.
Same-actor preparation/result visibility; no destination or platform enumeration.

## 6. Atomic audits and negative plan — NOT VERIFIED

Use new preparation audit domain; do not mislabel PREPARATION_CREATED as SESSION_CREATED
or change Session to CONSENT_PENDING. An allowlisted DENY records actor/source/trace,
safe reason and DB time; unauthorized/missing IDs are omitted. Unknown/foreign rows
uniform404. Do not expose internal table names, SQL, stack or raw certificate paths.
Audit failure returns503 without any preparation result. For inactive registry, the
wrapper currently rejects before callback: report no domain audit rather than falsely
claiming it was persisted. Optional earlier security audit is separate implementation.
Outbox append is not WORM/hash-chain integration or delivered SIEM event.

| Cases | Required assertions |
|---|---|
| PA-01 control | patient/provider source requests -> one PENDING/UNVERIFIED receipt; no approval/Grant/Session mutation |
| PA-02 authority | foreign/missing source/ref/Session, forged projection, wrong bound patient, other requester doctor, recipient INVITED, revoked/suspended principal ->deny/no row |
| PA-03 parent liveness | suspended target/source, deleted ref, cancelled/expired Session, stale version ->deny; current reasons safely audited where context allows |
| PA-04 scope/window | Study/Series/action/purpose expansion, past-start new request, malformed policy/evidence ->deny before insert |
| PA-05 replay | same normalized command concurrent calls ->one row/audit/result and original receipt; elapsed-start but live-window retry succeeds; expired-window retry denies; changed payload409 |
| PA-06 integrity | direct SQL incomplete assembly, fake audit/foreign FK/scope digest, parent/ledger edits and maintenance read ->deny |
| PA-07 storage | audit/result/child insert faults ->full rollback; actual COMMIT then injected lost ACK ->safe unknown; retry no duplicate |
| PA-08 races | actual two-session expiry/cancel/suspension vs preparation locks; before/after cutoff classifications; no successful post-terminal admission |
| PA-09 transport later | exact body/size/timeout/auth/If-Match/secret-safe responses; HTTP/HTTPS remain separate gate |

## 7. Execution sequence and exit boundary

Next isolated work: structural-vs-fresh/replay timing alignment first, then additive
schema/policy dry-run, nonowner authority reads, staging transaction/fault/race tests,
and injection-only HTTP before any deployment. Baseline tests stay; no existing DB or
stack changes. Public consent-artifacts API still targets approved evidence and must
not be relabelled as this staging API. New endpoint shape requires separate review.

This contract resolves a technical PENDING staging direction only. No D1..D6 approval
is fabricated. Actual schema/service/PA cases are NOT IMPLEMENTED/NOT VERIFIED at this
document gate. Full P0-04..06/MVP/v3 remain IN PROGRESS.

## 8. Physical foundation follow-up — 2026-10-08

018 implements the five staging objects with NO admission policies or runtime grants.
Additional assembly columns: action_count plus ordinal actions, creation_event_id and
creation_action. Creation audit composite FK also binds exact created_at; result
preparation_id is unique. DENY audit IDs are always null for a minimal safe first gate.
Deferred scope/action/result inserts recheck sealed counts/subset/digest; canonical
SQL digest matches JS JSON.stringify for strictly validated digit/dot UIDs.
This is owner-fixture assembly/nonowner default-deny evidence only, not the service,
minimum-privilege preparation RLS, PA-01..09 or clinical approval.

## 9. Source-only read/lock follow-up — 2026-10-08

019 separates legacy permissive ref/root/participant/resource and directory policies
into the existing clinical capability. Pending root derives from source actor only,
never parent/child RLS; Session/ref/scopes use this restricted root. Patient is bound
to ref; doctor is requester-only. Ref deletion and source suspension deny visibility.
Directory selection grants nonpatient chosen registry metadata, not recipient authority;
source activity is checked/locked by the transaction wrapper and root authority.
The directory helper avoids reading its own protected registry tables recursively.
Read-lock policies use WITH CHECK(false); no runtime grants or staging INSERT policy.

src/v3-pending-projection.js is a trusted same-transaction repository helper, NOT a
public read endpoint. It requires consent:write and a dedicated pending-only pool,
locks/checks source/ref/target, revalidates state/version/DB clock/resource hash, and
returns immutable internal selection or minimal internal DENY classification.
Only a future audited write service may consume it. No standalone audited read/API,
staging save, patient approval or external integration is completed by this helper.

Pool acquisition now must use guardPendingPool before V3TenantTransaction registry
queries: mixed clinical membership otherwise reactivates legacy RLS evaluation
before the internal callback guard. Both acquisition and same-tx checks remain;
registry/admin/owner guard and normal finite transaction deadlines are unchanged.

## 10. Internal write follow-up — 2026-10-08

020 and V3PendingPreparationService implement isolated own-actor writes and exact
receipt replay. createPendingTransactions brands the dedicated guarded runner;
plain/cloned generic runners are refused. Normalization is structural only, never
client selection authority. Actual PG222 evidence covers HOSPITAL_ADMIN creation,
conflict/restart/concurrent/replay/expiry and audit/result rollback/lost ACK.
This supersedes earlier NOT IMPLEMENTED statements only for these implemented
internal components. Full PA-01..08, other role/tenant negatives, direct admitted
assembly attacks, child faults and cancel/expiry/suspension competition remain open.
No runtime route, approved artifact, patient ceremony or institution activation.
See [write report](../governance/highpass-v3-p0-06-pending-write-2026-10-08.md) and
[next adversarial/race gate](../implementation/highpass-v3-p0-06-pending-adversarial-races-prompt.md).
