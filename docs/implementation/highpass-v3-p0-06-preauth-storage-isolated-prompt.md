# Next execution: isolated pre-auth append-only storage foundation

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041, V3-SR-IAM-002. Never declare overall MVP/v3 complete.

1. Read pre-auth security-event contract, actual TLS observation evidence and
   existing migration/role conventions. Confirm source hashes and current tests.
2. Implement an additive isolated schema foundation only after explicit alignment:
   eventId, observedAt, scope, stage, reasonCode, DENY, IMMEDIATE_SOCKET, nullable
   host IP; recordedAt is DB assigned. Exact enums, valid stage/reason pairs,
   finite time and freshness policy, UUID uniqueness, no raw JSON/clinical IDs.
3. Separate NOLOGIN policy roles and owned synthetic test credentials: publisher
   explicit-column INSERT only and security-reader SELECT only. FORCE RLS,
   revoke PUBLIC and append-only trigger. No runtime enrollment, bypass-RLS,
   ownership or clinical membership. Retention and production reader ownership
   remain unresolved; no automatic deletion or guessed tenant identity.
4. Prove actual nonowner PG constraints/visibility with no-context/general role,
   publisher SELECT/UPDATE/DELETE denial, reader write denial, malformed enums/
   subnet/timestamp, duplicate UUID and privileged immutable trigger tests.
5. Define durable adapter contracts for bounded insert/abort, commit uncertainty,
   exact same-event retry without false certainty. A socket test double or valid
   SQL row alone never proves TLS provenance. Keep admission and credentials as
   separate boundaries. Do not label test-only RECORDED as durable success.
6. Generate hashed DRAFT/UNASSIGNED evidence, preserve failures and verify owned
   container cleanup. Run focused/full regression with finite deadlines. Write
   and immediately start the next adapter/TLS-to-isolated-PG integration prompt.
   No existing database changes, real patient data, deployment, commit or push.
