# Next execution: source-scoped persisted expiry transaction

Continue the full [expiry/receipt objective](highpass-v3-p0-05-expiry-receipt-prompt.md).
Use explicit [maintenance identity](../api/highpass-v3-expiry-maintenance-principal-contract.md)
and current expiry batch contract. Do not activate existing DB/worker or clinical routes.

1. Provision only a disposable dedicated NOBYPASSRLS/nonowner maintenance role/pool in
   the synthetic fixture. Column-level minimum Session projection, registry lock-only
   privileges and precise expiry event/audit/cascade INSERT; no clinical SELECT/raw UID.
2. Add additive 017 migration for REQUESTED/v1 -> EXPIRED/v2 using authoritative DB
   clock, exact role/purpose/scope/source checks, immutable identity/action/snapshot
   guard and deferred event/audit/durable cascade proof. Do not remove cancellation
   guards, extend service scope to clinical access or use bypass/security-definer owner.
3. Bounded batch with FOR UPDATE SKIP LOCKED, source filter, limits/deadline/shutdown.
   One event per Session/version; concurrent expiry/expiry and expiry/cancel races,
   lost COMMIT ACK and audit/outbox failure must be proven in actual nonowner PG.
4. Return minimal technical receipts, never patient/Study/Series metadata. Persisted
   expiry must not affect original creation receipt; terminal retry always denies
   resurrection. Define original ledger receipt preservation for future nonterminal
   states explicitly. Clinical eligibility already denies effective expiry.
5. Add exact SQL mutation/privilege boundary and cancelled/expired metadata policy tests,
   full Node, current source hashes, manifest evidence/report. Enqueue is not actual
   grant revoke/work cancellation acknowledgement. DRAFT/UNASSIGNED.
6. Preserve complete canonical state/Consent/Grant dependencies, write next prompt and
   execute it after this gate. No whole MVP/v3 completion claim.

## Initial execution inspection

016 only enrolls/bounds maintenance and blocks clinical policies. 015 expiry guard,
event action, cascade kind and cancellation ledger proof cannot represent EXPIRED.
Future proof must distinguish cancellation result from expiry's per-version receipt;
otherwise it would require a fabricated cancel ledger. RLS must authorize the precise
expiry projection under a dedicated DB role, not reuse broad clinical pool privileges.
This concrete migration/service work is next; no persisted expiry service exists yet.
