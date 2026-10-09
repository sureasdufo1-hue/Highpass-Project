# Next execution: atomic PENDING write, audit and exact receipt replay

2026-10-08 / DRAFT / UNASSIGNED. Continue the complete persistence contract;
019/source projection is not storage completion or clinical approval.

1. Revalidate latest019/minimum-column nonowner and actual JS projection evidence.
   Keep pending pool separated from clinical/expiry/admin/owner roles. Registry-first
   source lock, ref/participant and server-selected target remain same-transaction.
2. Add next unused numbered migration for own-row staging SELECT/INSERT, children,
   typed audit and HMAC ledger policies. No patient Mapping SELECT, SECURITY DEFINER,
   Session mutation, INVITED activation, approved artifact or external KMS access.
   Root -> request -> children must avoid RLS recursion; exact deferred audit tuples
   and scoped same-actor receipts must not be bypassed by permissive OR policies.
3. Implement internal prepare(binding,key,sessionId,IfMatch,exactRequest,correlation),
   using bounded V3TenantTransaction plus the current projection helper in the SAME
   transaction. Query own HMAC-scoped ledger first; no client selection/clock authority.
   Separate fresh admission from eligible original-window replay. Persist only keyed
   submitted-evidence commitment, canonical scope/actions, PENDING/UNVERIFIED metadata.
4. Commit creation + typed audit + immutable original receipt atomically. Denial paths
   commit minimal allowlisted audit with null inaccessible IDs, then return uniform
   resource error. Inactive registry rejected before callback must not be described
   as a domain audit. Audit/result/child failures roll back; no raw SQL or payload leak.
5. PA-01..08 actual nonowner controls/negatives: authority, current liveness/version,
   scope/time narrowing, same/changed/concurrent key, elapsed-start original receipt,
   expiry replay, direct assembly attack, audit/result faults, actual COMMIT lost ACK
   and restart retry, cancel/expiry/suspension races. Preserve all pending requirements.
6. Fixed finite timeout budgets; owned cached synthetic fixture only, label-checked
   cleanup, exact source hashes and DRAFT manifest. Related/full Node,52 source/schema
   checks and existing197 + projection regression; no hardcoded PASS or omitted gate.
7. Public HTTP/HTTPS/mTLS are a separate next gate. Never activate clinical approval
   while D1..D6 remain unresolved; no existing DB migration, commit/push/merge/PR.
8. Write the next prompt and immediately execute safe in-scope work after verification.

## Initial execution inspection

Checked018: creation request has a deferred composite creation-audit FK; child/action/
result inserts re-run assembly checks; no staging admission policies exist. 019 only
reads/locks source data. Therefore write policy design must supply narrowly scoped
visibility for request/child/result proof without opening existing audit administration.
The source projection returns internal DENY reason only, not persisted audit; wrap it
with the new typed audit writer before any public request service. Do not return its
canonical selection to a browser or consume it in a later transaction. Atomic write,
exact replay and PA races remain NOT IMPLEMENTED/NOT VERIFIED at this point.

## Typed audit foundation executed — 2026-10-08

Implemented appendPendingAudit with exact event fields, server actor/source binding,
fixed reason/action allowlist, null DENY IDs, server-derived CREATED time and exact
affected-row checks. New audit4 tests and related18 tests PASS; these mock SQL only.
No write policy or actual prepare service is completed. Continue full requirements
in [write policy/service prompt](highpass-v3-p0-06-pending-write-policy-prompt.md), whose
same-transaction INSERT SELECT privilege/deferred-audit inspection has started.
