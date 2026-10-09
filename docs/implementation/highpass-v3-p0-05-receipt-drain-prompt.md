# Next execution: original creation receipt and graceful expiry drain

Continue the complete P0-05 target from persisted expiry; do not redefine it as only
REQUESTED cancellation. Preserve the full canonical state and Consent/Grant prerequisites.

1. Separate current lifecycle eligibility from original creation receipt reconstruction.
   Read response_state/version/created_at from immutable scoped creation ledger. Check
   actor/source/current authority, immutable scope digest and command equality. Never
   silently substitute a later state/version/updatedAt into the original receipt.
   Terminal/effectively expired replay denies and commits safe audit. Do not enable new
   clinical transitions without their Consent/Grant/membership proof.
2. Add bounded expiry service shutdown: stop new admission, await admitted finite
   transactions, no timeout-free polling or global process/container cancellation.
   Test close/drain with in-flight success/failure and late admission. Keep real
   worker scheduling/deployment and cascade acknowledgement explicitly unverified.
3. Actual nonowner PG: immutable original ledger remains unchanged across EXPIRED and
   CANCELLED, replay denied without new events; malformed receipt fails closed. Verify
   cancel before deadline winning and later expiry scan does not resurrect it.
4. Full Node and independent PG/loopback verification, current hashes/manifest and
   scoped report. DRAFT/UNASSIGNED; no r3 review inheritance, no existing DB activation,
   commit/push/merge/PR. Write and execute the next dependency-alignment prompt.

## Execution inspection — 2026-10-07

Current Session service selects only request_digest/session_id from the creation
ledger and reconstructs state/version/updatedAt from the current row. It currently
denies every non-REQUESTED/v1 state, which prevents wrong future receipts only by
blocking those transitions. The immutable ledger already records original
response_state/version/created_at; reconstruction should use those fields explicitly.
Expiry close() only toggles admission and does not return a promise for in-flight
completion. Transactions already enforce <=10s deadlines, so a drain can await a
snapshot of admitted batch promises without adding a scheduler or weakening timeouts.
These are the next implementation changes; no clinical state activation is authorized.

## Executed first follow-up

Service drain implemented and tested: 350 Node and 189 independent PG/loopback PASS;
see [report](../governance/highpass-v3-p0-05-expiry-drain-2026-10-07.md). This prompt remains
IN PROGRESS. Original receipt reconstruction is next. Inspection also found
validUntil<=now rejection before ledger lookup; distinguish structural parsing from
fresh-create expiry eligibility so expired same-key retries commit safe DENY audit
without allowing expired new requests or changing original command digests.

## Follow-up execution — 2026-10-08

Implemented explicit ledger reconstruction and structural/fresh-time validation split.
197 isolated PG/loopback checks PASS with cleanup and manifest integrity. Original
ledgers remain unchanged after cancel/expiry, elapsed retries commit denial audit,
audit faults fail closed, and cancel-before-deadline remains terminal after expiry.
Malformed receipt and differing current lifecycle fields are unit-tested only;
no live nonterminal transition has been enabled. Remaining whole P0-05 prerequisites
move to the next dependency-alignment prompt; see the scoped receipt report.
