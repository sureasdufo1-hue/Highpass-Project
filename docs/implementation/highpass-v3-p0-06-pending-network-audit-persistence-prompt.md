# Next execution — atomic preparation network audit persistence

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041 and V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

1. Read the updated authoritative audit contract, opaque network authority, handler,
   service and migrations018..020. Inspect current exact-source PG evidence first.
2. Align and implement an additive network audit table with event/authority/
   correlation composite FK, inet IP and public fingerprint, immutability, FORCE RLS
   and explicit pending-only least privileges. No historical backfill or fake trust.
3. Define internal service/helper admission for opaque context and fail closed when
   strict-edge audit requires missing/cloned/stale facts. Do not loosen the existing
   two-field correlation contract or accept caller-supplied JSON network authority.
4. Persist network record in the same transaction as its real domain event. Test
   normal, replay, domain-denial, insertion rollback, wrong actor/tuple, cross-tenant,
   maintenance invisibility, forbidden mutation and lost COMMIT ACK/retry. Preserve
   original receipt and existing creation-audit FK. No pre-auth invented principal.
5. Verify complete owned proxy/backend/nonowner PG, focused/full regression and
   exact source hashes; preserve failures and cleanup. No runtime/deployed migration.
6. Define separate bounded pre-auth security-sink contract and proof-binding gate.
   Do not claim hash-chain/SIEM/durable TLS-denial audit from this domain network row.
7. Write and immediately begin the residual gate; D1..D6/IdP/production remain open.

Initial execution: current source audit returns eventId and enforces typed fixed
domain reasons, while migration018's existing creation tuple is immutable. An
additive referenced authority/correlation tuple is necessary; network persistence
must not modify the original receipt or use pre-authenticated guessed actors.
