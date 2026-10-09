# Next execution: staging write RLS and complete atomic preparation service

2026-10-08 / DRAFT / UNASSIGNED. Continue all requirements of the atomic-write
prompt, including PA-01..08 faults/replay/races, not just audit helper tests.

1. Recheck018/019, pending pool acquisition guard, projection and typed audit writer.
   Next unused migration must supply own-row staging/result SELECT/INSERT and child/
   typed audit admission policies. No existing runtime DB or credential provisioning.
2. Own source active principal + consent:write; same actor staging/receipt visibility.
   Root proof must not query children whose RLS queries root. Exact source/target tuple,
   original receipt, deferred count/digest/action/audit references remain mandatory.
   No Mapping SELECT, SECURITY DEFINER, clinical/expiry membership or patient approval.
3. Implement prepare(binding,key,sessionId,IfMatch,request,correlation) using guarded
   pending-only pool and bounded V3TenantTransaction. Keyed own ledger/advisory lock,
   authoritative projection, structural parse and DB-time FRESH/REPLAY validation
   in one transaction. Store only evidence commitment, not submitted raw string.
4. Append typed CREATED/REPLAYED/DENIED with server binding and DB timestamps;
   missing affected row rolls back. DENY exposes no inaccessible IDs. Original receipt
   after matching retry requires current authority/live parent/fixed window/version.
   Created/child/audit/result writes commit atomically; lost ACK is outcome unknown.
5. Actual nonowner PG positive/negative coverage for complete PA-01..08, concurrency,
   changed key/payload, stale/terminal/expiry, direct assembly attack, storage faults,
   restart exact replay and real competing cancel/expiry/suspension locks. Explicit
   401/403 pre-callback denial is not claimed as a persisted domain audit.
6. Preserve52 schema/source RLS and202 baseline/projection checks, related/full Node,
   bounded owned-fixture cleanup, source hashes/DRAFT manifests and failed runs.
   Existing intermittent DPoP timeout must not be hidden or limits weakened.
7. Write scoped report and next transport prompt, immediately execute safe work.
   Public HTTP/HTTPS/mTLS and actual D1..D6 approval stay separate; no commit/push/PR.

## Started inspection

Audit writer now derives CREATED timestamp/source tuple from the preparation row
and creation_event_id/context rather than a caller timestamp. Therefore its SQL
INSERT SELECT needs exact own-row SELECT policy in the SAME transaction; do not
grant audit admin read or use an owner connection to make this pass. DENY VALUES
has no request FK, so its policy must independently verify the bound active source
actor. Replay never changes immutable creation audit fields. Actual write/RLS/
service and fault/race coverage remain NOT VERIFIED; pure SQL mocks are insufficient.
