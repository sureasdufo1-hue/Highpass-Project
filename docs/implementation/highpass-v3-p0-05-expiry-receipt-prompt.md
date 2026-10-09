# Next execution: persisted expiry and original creation receipt lifecycle

Continue the full state/cancel target, not a REQUESTED-only final architecture.
Start from latest 015 internal cancellation PG/HTTP evidence and dirty worktree.

1. Design source-scoped authenticated maintenance identity and minimum expiry scope.
   Current registry supports five human role categories, not SERVICE. Align a dedicated
   maintenance principal before adding a worker role; do not reuse a random admin or
   infer platform-wide cross-tenant authority. Synthetic issuer/subject only in tests.
2. Add exact versioned REQUESTED -> EXPIRED event/audit/durable cascade request using
   DB clock. Preserve immutable identity/resources/actions, RLS and terminal guards.
   Effective expiry already denies ordinary access even before a worker has run.
3. Implement bounded batch/shutdown and one event per Session/version. Test actual
   concurrent expiry/cancel, retries and audit/outbox faults in nonowner PG. No worker
   deployment or existing DB activation in this gate.
4. Preserve original typed create receipt from ledger + immutable snapshot with current
   terminal deny. Future state/version must not silently replace original response.
   Version1 timestamps currently match; later nonterminal mutation cannot rely on that.
5. Align expired/cancelled metadata tracking separately from clinical eligibility.
   Never turn expired clinical access into ALLOW. Document complete target-state edges
   and real prerequisites; future clinical transitions remain gated.
6. Cascade enqueue is not actual Grant revoke/work cancellation delivery; mark those
   NOT VERIFIED until models/acknowledgements exist. Full Node, actual PG/HTTP regression,
   source-hashed evidence/manifest, report, next prompt and execute it. DRAFT/UNASSIGNED.

## Initial execution inspection — 2026-10-07

015 allows only REQUESTED -> CANCELLED: state-event CHECK, audit action/result,
cascade kind, guard and deferred proof encode cancellation. Expiry cannot be added as
a timer bypassing these controls. Registry supports PATIENT/DOCTOR/HOSPITAL_ADMIN/
SECURITY_ADMIN/PLATFORM_ADMIN only. Maintenance identity is an explicit design step.
Create ledger has original state/version/created_at; eligibility is currently REQUESTED/v1.
Next implementation must handle original receipt and current state in one transaction.
