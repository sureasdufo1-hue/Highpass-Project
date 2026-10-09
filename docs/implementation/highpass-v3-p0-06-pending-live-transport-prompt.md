# Next execution: actual PG through preparation handler, then isolated HTTPS

2026-10-08 / DRAFT / UNASSIGNED. Keep all clinical D1..D6 gates unresolved.

1. Revalidate current pending transport report, residual PA results, exact source
   hashes and complete PA-01..09 matrix. Preserve failed Series fixture evidence.
   Transport7/related24 are mocked service tests, not actual PG through HTTP.
2. Inspect the injection-only HTTP contract and handler, strict body reader and
   source-role pool. No server.js or user-stack deployment/credential enrollment.
   Contract path is a separate preparation interface, never consent-artifacts.
3. Extend disposable PG fixture with an ephemeral loopback HTTP server invoking the
   real handler/registry/V3PendingPreparationService. Hash handler and fixture too.
   Test initial/replay original201 receipt, stale412, conflict409, expired404,
   inactive403, wrong actor/scope and storage fault503 with actual DB counts/audits.
   Auth/parser rejection and rollback are not falsely recorded as domain DENY.
4. Verify timeout/abort leave no successful partial assembly, readiness remains
   responsive and all client/server/poll/query/whole transaction budgets are finite.
   Same Session response matching and no evidence/token/key/SQL leakage remain.
5. Add isolated HTTPS using established dev CA/script and explicitly trusted client
   certificates/hostname. No -k/insecure/verification relaxation; no production name
   or private key evidence. Normal trust ALLOW and invalid trust/hostname DENY must
   be distinguished from timeout/refused/DNS/daemon failures.
6. mTLS/trusted ingress/DPoP binding is a distinct deployment gate, not proved by
   HTTPS alone. Inspect exact enforcement contract and do not borrow clinical image
   evidence for a new preparation endpoint. No runtime activation until all relevant
   review/transport gates are satisfied; actual patient approval remains separate.
7. Run related/full Node, actual PG regression, syntax/docs links/whitespace, evidence
   manifest digest and owned label/exact-name cleanup. Document commands/exit counts,
   actual SHA/dirty hash boundary and remaining NOT VERIFIED. New evidence DRAFT.
8. Update API/ERD/master plan/report; write next exact gap prompt and execute safe
   work immediately. No commit/push/merge/PR, external KMS, actual patient data or
   changes to existing runtime DB/volumes.

## Immediate inspection started

Current PG checker invokes preparation service directly and hashes service/SQL/
fixtures, not the new HTTP handler. Existing injection-only tests use a trusted
mock prepare method, so actual HTTP-to-PG and HTTPS remain unverified. The checker
already owns a cached ephemeral PostgreSQL fixture, suitable for additive real
handler integration without touching the deployment. Explicit server timeout and
owned-resource shutdown must be provided by that fixture, not assumed from handler.
