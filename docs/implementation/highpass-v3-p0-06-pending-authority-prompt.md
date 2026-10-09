# Next execution: authoritative PENDING preparation read/write contract

2026-10-08 / DRAFT / UNASSIGNED. Start from pure PENDING intent parser and shared scope
normalizers. Preserve the full lifecycle dependency contract and pending D1..D6 choices.

1. Inspect registry-first transaction, source Session/ref RLS/read metadata service,
   immutable scope digest and create receipt. Define a server-selected locked projection
   for preparation; client selection JSON is never authority. Require fresh persisted
   active principal/ref/institutions, source-only role and consent:write; bound patient
   additionally matches persisted PatientRef. Recheck version, current state and DB time.
2. Keep preparation records separate from approved ConsentArtifact and its unresolved
   content/event representation. Design exact columns, keyed idempotency, result receipt,
   audit and reference/version constraints for a PENDING-only staging request. Mark
   additive DDL/API proposals explicitly; do not claim a digest proves patient approval.
3. Determine safe initial state eligibility from current REQUESTED implementation,
   not enum order. Preserve complete future lifecycle; no recipient or clinical access.
   Revalidate raw intent against current locked canonical scope and finite window.
4. Specify nonowner/RLS minimum privileges, transaction lock order, atomic DENY audit,
   rollback and lost ACK behavior before coding persistence. Do not trust parser branding
   as authorization, reuse broad admin SELECT or activate INVITED destination.
5. Test plan: missing/foreign source/ref, spoofed selection, revoked binding, suspended
   institution, expired/cancelled Session, stale version, scope/window change, audit/
   idempotency failure, duplicate and conflicting retries, expiry/preparation races.
6. Produce scoped authority/write contract plus next isolated implementation prompt.
   Implement only after permission/schema contract is resolved. No approval, Grant,
   key/payload release, existing DB migration, runtime route, commit/push/merge/PR.

## Initial inspection executed after pure input work

V3ExchangeReadService already locks Session/ref, verifies resource digest and audits
read before commit, but uses exchange:read and exposes its own metadata shape. Pending
preparation must not blindly call it with consent:write or trust its returned JSON as
a transaction lock. V3TenantTransaction establishes registry locks before callback.
Future preparation must select/recheck scope inside the SAME transaction with explicit
purpose-built RLS and audit. Current parser has no persistence/audit side effects.

## Executed contract gate — 2026-10-08

Created authority/persistence contract, proposed dedicated preparation policy group,
staging/audit/HMAC result schema and PA-01..09 actual-test plan. No DDL applied or
approval/membership/clinical role activated. Next isolated persistence prompt written
and immediately executed its first timing task: structural parse vs FRESH/REPLAY
validation split with started-window, expired-window and malformed policy tests.
Actual nonowner storage/authority/race tests remain NOT VERIFIED until implemented.

Scoped [execution report](../governance/highpass-v3-p0-06-pending-authority-2026-10-08.md)
preserves actual regression failures and retry results; never inherit earlier human PASS.
