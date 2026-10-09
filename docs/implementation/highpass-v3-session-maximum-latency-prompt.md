# Next priority: diagnose maximum Session latency without loosening deadlines

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related v3 ExchangeSession acceptance and FR-014..025/FR-037..041.

1. Inspect exact manifest hp-v3-identity-tx-2026-10-08T01-23-09-849Z-74a1e7bc.
   Overall NOT VERIFIED, not PASS: maximum-resource client deadline expired while
   server later finished201. Received56581/body-ended56602/finished61584 ms from
   run start proves about4982 ms after body completion, not a DNS/connection DENY.
2. Add bounded fixed SQL phase/duration diagnostics for this synthetic maximum
   request only. No query text, parameters, UID, token, secrets or raw errors.
   Separate body parsing, service preparation, pool/locks, scope insert and COMMIT.
3. Reproduce owned maximum100 Studies x500 Series with exact original timeout and
   actual nonowner/RLS/deferred constraints. Pure JSON benchmark alone does not
   diagnose DB latency. Do not shrink valid input bounds, omit the test, increase
   timeout or weaken count/hash/assembly/authorization/immutability constraints.
4. If an optimization is justified, prove unchanged security semantics against
   normal, malformed, appended-scope, duplicate, concurrent and wrong-owner tests
   before claiming a fix. No speculative trigger removal or broad refactor.
5. Run exact-source full transaction regression and Node tests, preserve prior
   failures, verify manifest and cleanup. Until decisive evidence, keep overall
   transaction gate NOT VERIFIED despite scoped pre-auth durable tests PASS.
6. Resume the pre-auth adversarial/sink-failure prompt after this gate is stable.
   New evidence DRAFT/UNASSIGNED; no runtime deployment, actual patients, clinical/
   legal/production approval, commit/push/merge/PR or whole-MVP/v3 completion claim.
