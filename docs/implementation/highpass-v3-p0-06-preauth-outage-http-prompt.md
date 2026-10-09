# Next execution: pre-auth timeout/flood and HTTP rejection observation

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041, V3-SR-IAM-002. Whole MVP/v3 still IN PROGRESS.

1. Inspect latest exact-source actual PG/TLS adversarial manifest and unresolved
   Session latency profiles. Never replace a failed client deadline with late201.
2. Add actual PG insertion delay/disconnect tests with known dispatch boundary,
   uncertain COMMIT outcomes and capacity bounds. Actual TLS must remain DENY
   while actual PG is slow; authenticated synthetic readiness must remain bounded.
   Do not reuse only promise mocks as actual PG outage evidence.
3. Prove real-clock ten-second admission expiry without mutating Date.now or
   refreshing event time/UUID. Describe long-outage reconciliation as a separate
   purpose-limited design gap, not runtime admission TTL relaxation.
4. Align injection-only edge observation for trusted-ingress validation, JWT/
   registry denial and mock-assurance denial. Observe only real immediate socket
   facts and fixed generic stages/reasons; never parse unverified JWT for identity,
   use forwarded headers as authoritative IP or invent actor/tenant/patient IDs.
5. Implement only bounded internal observer/sink wiring in owned fixtures after
   contract alignment. Prove failures leave safe403/TLS DENY, no preparation rows
   or authenticated-domain audit invented, and no secrets/errors exposed in UI.
6. Verify exact-source focused/full regressions and manifest/cleanup, preserve
   failed evidence and write/start next gate. No runtime/production deployment,
   actual patient data, IdP/MFA/PoP claims, legal/hospital approval, commit or push.
