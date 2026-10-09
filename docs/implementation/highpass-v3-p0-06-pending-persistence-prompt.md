# Next execution: isolated PENDING persistence foundation

2026-10-08 / DRAFT / UNASSIGNED. Execute the authority/persistence contract without
approval, recipient activation, existing DB migration or runtime route exposure.

1. First align parser timing: exact structural command separate from fresh/replay
   window eligibility. New validFrom>=DB now; replay may have elapsed validFrom but
   must preserve original window/digest and require now<validUntil. Do not reuse raw
   caller selection as authority. Unit-test missing policy, narrowing, started window,
   expired window, malformed timestamps and command-brand boundaries.
2. Add next unused migration (verify numbering before choosing) for dedicated
   hp_v3_pending_policy source authority and immutable PENDING staging/audit/result
   tables/assembly proof. Never alter approved ConsentArtifact/Session state. Explicit
   nonowner pool privilege matrix, FORCE RLS, no SECURITY DEFINER or clinical/expiry
   role membership. Preserve old policy semantics through full isolated regressions.
3. Build server DB projection under consent:write in same bounded transaction. Verify
   role/source/bound patient/doctor requester/ref/SOURCE participant, actual target
   activity, REQUESTED/v1/version, DB clock and canonical resource hash. No added
   exchange:create/read user scope or Mapping SELECT workaround.
4. Persist only immutable staging, canonical children, commitment, safe audit and scoped
   HMAC ledger; minimal receipt. Fresh/replay checks and terminal denial as contract.
   PA-01..08 actual PG/nonowner concurrency/lost ACK/faults required before claiming
   persistence. Stage work if needed but retain all requirements and notVerified list.
5. Cached synthetic Postgres disposable owned fixture only; finite startup/query/lock/
   whole-transaction/polling/cleanup limits. Preserve source hashes, intermediate failures
   and DRAFT/UNASSIGNED evidence. Full Node serial + existing197 regressions, manifest
   checks and scoped report. No skip/hardcoded PASS, real PHI, TLS bypass or commits.
6. Write next prompt and immediately execute safe in-scope work after each verified
   work unit. Actual approvals and D1..D6 decisions remain required before clinical activation.

## Initial execution inspection

Current pending parser requires validFrom>=now before producing an intent, and its
selection input is explicitly untrusted. Before DB retry implementation it needs
structural parsing separate from admission timing, matching the earlier Session
create retry design. Existing wrapper already checks persisted consent:write but
Session/root/ref/directory/audit policies are not a purpose-built preparation domain.
Next concrete implementation starts with parser timing; no persistence is proven yet.

## First execution progress — 2026-10-08

Parser timing task implemented: structural intent separate from FRESH admission and
internal REPLAY window validation. Related20 unit tests PASS; full regression result
belongs to the current scoped report. No schema or service writes yet. Next concrete
work is additive policy/schema dry-run and same-transaction authoritative DB projection;
all PA-01..09 requirements remain, not replaced by these pure tests.

See [current execution report](../governance/highpass-v3-p0-06-pending-authority-2026-10-08.md)
for exact full-suite and isolated retry outcomes before the schema gate.

## Schema foundation execution — 2026-10-08

018 adds five immutable PENDING/UNVERIFIED staging tables, composite source/target/
actor/audit/result references, canonical scope digest and deferred assembly checks.
Actual owned PostgreSQL schema tests:28 PASS; nonowner default DENY verified. No
admission policies or runtime grants yet. Existing197 regression checks with018 PASS.
Continue [nonowner RLS/projection prompt](highpass-v3-p0-06-pending-rls-projection-prompt.md);
initial policy/wrapper inspection executed. Nonowner writes and PA-01..09 are NOT
completed by the owner-only assembly proof; full persistence requirements remain.
