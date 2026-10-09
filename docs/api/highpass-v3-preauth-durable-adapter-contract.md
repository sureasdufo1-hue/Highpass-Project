# Pre-auth durable adapter contract — isolated design

2026-10-08 / DRAFT / UNASSIGNED / INJECTION-ONLY IMPLEMENTATION / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

Confirmed: migration022 publisher has INSERT columns only. Duplicate UUID raises
23505; that alone does not prove same event or prior successful delivery. Ordinary
SELECT cannot be added to publisher merely to simplify retry. Test-only adapter
success is not durable success. Immutable row trigger is not WORM/DBA compromise
protection and there is no chain or delivery sink yet.

Proposed isolated design: observer-owned private admission read, not public JSON;
copy fixed eight fields with exact UTC timestamp and host address semantics.
Freshness must be checked before pool acquisition and again before dispatch;
stale observations are never rewritten with a newer observation time. Repeated
same-event confirmation does not modify immutable observed_at/recorded_at.

Publisher adapter sends one parameterized INSERT under bounded auto-commit query
and accepts RECORDED_DURABLE only after INSERT command completion. If acquisition
failed before dispatch, NOT_RECORDED is justified. Once INSERT is dispatched,
query timeout, disconnect, cancellation or missing acknowledgement is
OUTCOME_UNKNOWN unless the DB returned a definitive rejection. Aborting the
caller does not prove the server cancelled the operation. Capacity remains held
for unsettled work; no new unbounded background operation on each timeout.
OVERFLOW before dispatch is not durable success and cannot alter TLS DENY.

Retry design candidate without new SQL grants: a separate internal reconciliation
dependency uses the existing isolated reader credential to query only the admitted
UUID, comparing all eight exact fields with normalized inet/timestamptz semantics.
Only a matching committed row resolves prior delivery; a mismatch is EVENT_CONFLICT,
no row is NOT_CONFIRMED (not proof of permanent absence while an earlier command
may still commit). Reconciliation dependency is not exposed to publisher callers
or clinical APIs; publisher retains no SELECT. This adds an internal use of a
global test reader and needs explicit production ownership/purpose review before
any runtime use. No SECURITY DEFINER or new role/grant is necessary for isolated
tests. No unknown-error path silently re-enqueues with a different event UUID.

Open decision: purpose-limited production reconciliation versus dedicated reader
credential, approved global log access and retention; do not infer organization
approval from this local design. Another acceptable design must explicitly prove
same-event equality and uncertainty without publisher read/overwrite escalation.
Observer-owned `createDurableSink` is now implemented with separate publisher and
reconciliation pools. Duplicate INSERT reports NOT_CONFIRMED; explicit confirm
compares all eight original fields and returns RECORDED_DURABLE, EVENT_CONFLICT
or NOT_CONFIRMED. No automatic new UUID, overwrite or publisher SELECT is used.
Only fixed safe outcomes escape DB errors; no raw diagnostics. Role guard rejects
superuser/bypass/owner/dangerous membership and mixed clinical/pending/opposite
pre-auth role membership. Acquisition/guard/input failures occur before dispatch;
post-dispatch unknown errors/timeouts are OUTCOME_UNKNOWN.

Durable acknowledgement also requires driver `getTransactionStatus()==='I'`
before guard, before dispatch and after query completion. A borrowed open
transaction must not imply COMMIT. Local pg8.22.0 query completion is handled on
ReadyForQuery and exposes that public method; older/missing-status drivers fail
closed before INSERT, not guessed durable success. No dependency/lockfile change
was made. This is a verified local-driver contract, not universal driver support.
Timed-out work retains capacity until actual settlement and late acquired client
is destroyed without issuing a query. Inputs expire within ten seconds by wall
and monotonic clocks; stale inputs cannot be refreshed or reconciled via this API.
Long-outage reconciliation beyond that window remains unresolved, not silently
allowed by this implementation. Unit tests alone do not establish durable PG.

Acceptance: forged/foreign/cloned/stale admission before pool access; publisher
and reconciler role guards; finite acquisition/query/cleanup; actual COMMIT ACK
and injected lost ACK; exact retry, different content same UUID, unresolved race;
sink failure/overflow without authentication ALLOW; actual owned TLS-to-PG event
provenance and direct clinical access denial. No arbitrary observer callback or
mocked socket is sufficient evidence of real transport admission.
