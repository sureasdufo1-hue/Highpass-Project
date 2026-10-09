# Next execution — D6 existing lock graph and consent contract conflict audit

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related V3-FR-EX-003/006/007, CON-001..006, V3-SR-TEN-003/AUTH-004.

1. Read D1..D6 decision packet and current source for transaction, Session create,
   cancel/expiry, PENDING projection/write and identity review. Inventory explicit
   row/advisory locks in actual query order, including deferred FK/trigger paths.
2. Record exact source hashes and locations. Separate explicit statement order
   from PostgreSQL executor row order and implicit FK/trigger locks. Do not infer
   globally deterministic order from JOIN or absence of a failing test.
3. Identify proven cycles versus candidate conflicts requiring real concurrency
   evidence. Describe how new patient approval, recipient acceptance/linking and
   institution suspension could conflict without inventing deployed endpoints.
4. Compare target OpenAPI consent state/content version fields and ERD with actual
   PENDING immutable staging. List required additive contracts; submitted ACTIVE
   or digest cannot be approval. Do not modify canonical authority or add grants.
5. Create a reviewable lock/API/data audit, link decision packet and master plan,
   run reference validation. D6 stays NOT VERIFIED, D1..D5 NOT APPROVED.
6. Request exact policy direction needed for permission-bearing implementation.
   Do not use generic synthetic preparation approval as policy choice approval.
   Safe analysis is allowed; runtime/DDL authority changes require reviewed design.

No commit/push/deploy, real data, unrelated stack/process mutation or whole MVP
completion. Preserve current dirty tree and all historical failures.
