# Next execution — strict network audit atomic race/expiry verification

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

1. Inspect latest exact-source strict proxy/PG evidence and failed fixture runs.
   Existing generic pending lost-ACK/race tests do not prove strict network rows.
2. Check opaque audit admission at service entry, after DB principal lock before
   callback, network insertion and final COMMIT dispatch. Add any missing check,
   preserving deadline and correlation contracts. Stale/disposed context must roll
   back both domain and network rows even if pool/locks/body consumed its lifetime.
3. Add actual strict service/PG races: expire/dispose after network insertion and
   before commit, lost real COMMIT acknowledgement then exact idempotent retry,
   same-key concurrent creation with distinct current network events, rollback on
   network fault, and foreign/maintenance read denial. Verify row and event counts.
4. Preserve source actor/hospital/correlation tuple, original receipt and append-only
   FK/RLS controls. Do not replay a prior request's network authority on a retry.
5. Full Node and actual complete proxy/backend/PG regression, finite owned cleanup,
   manifest digests and source hashes. Keep previous FAIL runs and intermittent
   DPoP timeout history; latest PASS does not identify its root cause.
6. Only after those checks, write and begin separate bounded pre-auth security-sink
   and human PoP applicability contracts. No clinical/D1..D6/actual MFA/IdP, WORM/
   SIEM, production or whole-MVP approval inferred. No commit/push/merge/PR.

Initial execution: strict service/read helper and transaction dispatch guard inspected.
Network audit now uses actual domain eventId and current private context; generic
legacy lost-ACK tests remain insufficient for the new paired network audit path.
