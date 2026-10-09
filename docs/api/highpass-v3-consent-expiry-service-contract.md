# Authenticated consent expiry service / durable batch contract

2026-10-08 / DRAFT / UNASSIGNED / IMPLEMENTATION AND EXECUTION PENDING.
CON-003/005/006, AUTH-004, TEN-001/003, AUD-001, FR-001~005/014~025/037~041.
L1~L5 김범희 policy adoption remains separate from technical review.

The internal service receives a private expiry factory and a copied 32-byte HMAC key.
`expireBatch(binding, executionKey, options)` prepares the private bounded command;
executionKey is separate opaque 16..128 character metadata, never authority or a URL.
Source/actor/operation-scoped HMAC key and request digests are persisted, not raw keys.
The same execution key and limit recovers the exact original batch, including zero
processed objects. A changed limit conflicts, and a new key may process later candidates.
Keys must remain available for recovery; real KMS/provisioning is deferred, not simulated
as production KMS. Disposing a service zeroes its copy and prevents new calls.

Additive029 proposes an append-only `consent_expiry_batches` ledger. FORCE RLS admits
only the exact registered CONSENT_EXPIRY actor/source, never patients, approval,
withdrawal or clinical roles. No patient_refs privileges are introduced. A deferred
guard checks batch count, ordered immutable receipt snapshot and exact existing own
CONSENT_EXPIRE lifecycle results. Empty batches are durable; no public read is added.
All runtime migration/enrollment/grants remain inactive; owned fixtures may grant only
expiry SELECT/INSERT and required invoker functions.

Lock order: registered service/source SHARE -> actor/source execution-key advisory ->
candidate content lifecycle advisory in immutable validUntil/consentId order -> current
ACTIVE/predecessor/deadline/terminal recheck -> event3/audit/result/REQUESTED cascade ->
durable batch -> COMMIT. Candidates are source-owned and bounded by command.limit.
No payload, key rewrap or clinical Grant is issued. Event effectiveAt copies validUntil;
recordedAt uses DB clock; service actor and patient subject remain distinct.

Batch receipt `{batchId, processed, receipts}` returns only after COMMIT. Each receipt
contains consent/version/event/sequence/state/effectiveAt/recordedAt/evidenceDigest and
cascadeStatus REQUESTED. Original approval receipts are unchanged. Recovery is historical,
not current ALLOW or consumer ACK; current service/source admission is still required.
Rollback/deadline/credential/unknown COMMIT cannot be successful batch results.

Actual signed-service races, batch replay/empty/conflict, atomic rollback and isolation
must be executed before PASS. Scheduler and consumer ACK/downstream Grant/Viewer/full
MVP remain separate. The DB clock, not worker completion, defines expired access denial.
