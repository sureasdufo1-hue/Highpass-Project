# Session state/cancel contract alignment

2026-10-07 / DRAFT / UNASSIGNED. Follow-up 015 implements isolated REQUESTED cancellation
with DB event/audit/result/cascade and injection-only HTTP. Runtime not activated.
Related V3-FR-EX-003/006/007, V3-AT-EX-003, FR-014~025/037~041.

## Confirmed requirements and unresolved details

Confirmed: canonical OpenAPI states; architecture identifies six terminal states
COMPLETED/REJECTED/EXPIRED/REVOKED/FAILED/CANCELLED, and a new exchange must use a new
Session. Version/If-Match govern mutations, stale412 and terminal409. Cancel uses
exchange:cancel, idempotency key and audit correlation. Grants must be revoked and
running actions signalled before new access can succeed.

The existing approved documents do not specify every directed transition edge and
evidence freshness rule. Do not interpret the enum order as an automatically approved
linear state machine. The following is the complete target-state coverage/dependency
map, not an authorization to transition missing prerequisites to PASS.

| Target states | Required workflow/evidence | Current disposition |
|---|---|---|
| REQUESTED | validated source/patient/provider request and immutable scope/actions | Isolated create/read HTTP verified |
| IDENTITY_PENDING | outstanding identity/mapping reconciliation | Transition pending; recipient membership not active |
| CONSENT_PENDING | identity reconciled and patient consent workflow initiated | ConsentArtifact workflow pending |
| CONSENTED | active versioned consent for selected purpose/action/resource/window | Pending; no inferred consent |
| AUTHORIZED | current server AuthorizationDecision ALLOW and references | Pending; request intentions are not ALLOW |
| PREFLIGHT | valid grant candidate and execution-plan checks initiated | Pending |
| READY | required current preflight PASS plus valid mappings/consent/authorization | Pending |
| ACTIVE | runtime revalidation and admission of a supported scoped action | Pending |
| VIEWING / DOWNLOADING / TRANSFERRING / MOBILE_EXPORTING | corresponding scoped action capability and runtime safeguards | Pending; one active transition command at a time |
| COMPLETED | actual execution/result/integrity/provenance evidence | Pending; never simulator success inferred |
| REJECTED | recorded rejection decision | Terminal transition pending |
| EXPIRED | finite DB-clock lifetime crossed and recorded state event | REQUESTED/v1 -> EXPIRED/v2 isolated PG tested; scheduler/cascade delivery pending |
| REVOKED | verified revocation workflow and fail-closed cascade | Pending |
| FAILED | recorded technical execution failure, not policy DENY | Pending |
| CANCELLED | authorized versioned cancellation and durable cascade request | REQUESTED cancellation DB/HTTP tested; actual cascade delivery pending |

## Internal cancel command decisions

- PATIENT: PATIENT_WITHDRAWN only, bound PatientRef and source tenant/hospital.
- DOCTOR: REQUESTER_CANCELLED only, must be the Session requester and source member.
- HOSPITAL_ADMIN: requester cancellation of own request, or ADMINISTRATIVE_CANCEL for
  the own source hospital. A target INVITED actor has no cancellation authority.
- POLICY_REVOKED stays in the target reason enum but is not a human shortcut. A future
  authenticated policy revocation workflow must provide actual evidence/cascade.
- Exact UUID, strong single quoted positive If-Match, PostgreSQL int increment bound,
  exact JSON fields and bounded comment. Control characters are rejected; free text
  must never enter audit events/Problem responses. No persistence of comment yet.
- Validated commands are frozen and branded to the originating authenticated binding;
  raw/cloned commands cannot be applied to server snapshots.
- For a locked authorized row: stale version ->412 before terminal check; current
  terminal ->409; effective expiry ->409. Invalid snapshot/clock ->503, not policy PASS.
  Source/patient/requester mismatch ->uniform404. All canonical nonterminal states are
  classified for cancellation intent, but no clinical cascade is implemented by this
  pure function. Future service must persist event/cascade under its transaction.

## Durable retry decision for next implementation

Create replay after terminal cancellation/expiry/revocation must deny, not resurrect a
Session. Same-key retry while nonterminal must preserve the recorded original creation
receipt rather than silently return changed state/version. The existing typed create
ledger has original state/version/createdAt; immutable identity/resources/actions can
reconstruct the receipt, but original updatedAt and current-state eligibility must be
checked explicitly. Current create retry denies terminal cancellation with committed
DENY audit and returns the unchanged REQUESTED/version1 receipt otherwise. Broader
nonterminal receipt replay remains pending; other nonterminal transitions are disabled.

Cancellation replay returns its original typed cancellation receipt without another
state event/cascade or secret. Recheck current actor/source authority first. A changed
key payload conflicts409. Missing/foreign inaccessible ledger must not leak existence.
No free-text or raw idempotency key in audit/ledger; only keyed command digest.

## SQL migration implications

011 fixes state/version/initial timestamps, audit version1, and rejects all UPDATE.
Replace only the Session mutation guard with an exact immutable-column comparison,
legal version+1 transition and deferred event/outbox proof. Preserve all other immutable
tables/triggers and FORCE RLS. Add minimum column UPDATE grants and scoped cancel RLS.
Do not mutate the creation-context FK or source/INVITED participants for cancellation.
Audit helper currently hardcodes version1: extend typed version/action support before
claiming a version2 cancel event. Outbox delivery/hash chain are separate integrations.
015 replaces only the Session guard with exact immutable-column comparison and
REQUESTED/version1 -> CANCELLED/version2, with deferred event/audit/cascade/result proof.
All other immutable tables/triggers and FORCE RLS remain. Audit supports version2;
a restrictive INSERT policy prevents permissive policies fabricating cancel audit.
Application fixture grants are scoped; no existing runtime DB migration is applied.

017 adds the analogous REQUESTED/v1 -> EXPIRED/v2 under a separate maintenance pool.
It requires an expiry event/audit/EXPIRY_REQUESTED proof, not a fabricated cancellation
result ledger. Existing cancellation result proof remains mandatory for CANCELLED.
189 independent PG/loopback checks include expiry/expiry concurrency, audit and cascade
INSERT faults, lost COMMIT ACK and expiry/cancel contention after the expiry deadline.
No cancellation-before-deadline winner or clinical nonterminal transitions are claimed.
Full original creation receipt replay and scheduler drain remain subsequent gates.

## Receipt and retry update — 2026-10-08

The preceding results are historical. The service now explicitly reads immutable
response_state/version/created_at from its scoped creation ledger. Original updatedAt
equals original createdAt for the initial v1 receipt; current lifecycle fields never
replace these values. Immutable identity/purpose/initiation/resources/actions/window
are checked before reconstruction. A pure builder test with later lifecycle values
proves receipt reconstruction only, not an authorized clinical transition.

Structural command parsing accepts elapsed validUntil solely to resolve retries.
Fresh requests with no scoped ledger still undergo finite lifetime validation using
DB time before INSERT; DB RLS enforces the window again. Exact elapsed retries commit
SESSION_EXPIRED DENY audit and return uniform404. Audit storage faults fail closed503;
different same-key commands remain409, and inaccessible sources remain404.
Current live replay eligibility still requires REQUESTED/v1; no broader lifecycle or
clinical access is enabled. Terminal retries cannot resurrect or mint another event.

197 independent PG/loopback checks cover elapsed HTTP retry, audit faults, unchanged
creation ledgers after CANCELLED/EXPIRED and cancellation before deadline remaining
terminal after a later expiry scan. Service admission/drain is unit-tested; deployed
scheduler shutdown, complete lifecycle dependencies and actual cascade delivery remain
pending. [Report](../governance/highpass-v3-p0-05-original-receipt-2026-10-08.md).
