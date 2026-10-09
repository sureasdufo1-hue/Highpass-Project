# Next execution: durable pre-auth adversarial and sink-failure integration

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041, V3-SR-IAM-002. No full MVP/v3 completion claim.

1. Inspect exact current actual-PG/TLS adapter evidence and Node regression.
   Distinguish socket-double ack/idempotency tests from actual TLS event writes.
2. Prove actual same-UUID different-content conflict and missing-row uncertainty,
   client borrowed inside open PG transaction, swapped/mixed policy roles and
   acquisition/storage outage with finite deadlines. Do not grant publisher read.
3. Prove actual TLS DENY during actual PG privilege revocation, reader outage,
   timed-out insertion and bounded flooding. Readiness must stay responsive and
   no original admission may be refreshed or another UUID silently substituted.
4. Test replay after ten-second admission expiry and define a separate bounded
   operator/reconciliation contract for long outage if required. Do not relax
   live admission TTL or give clinical users global security events. Keep
   production ownership and retention as open decisions.
5. Align genuine pre-auth HTTP ingress/JWT/mock-assurance rejection observation
   before wiring it into injection-only isolated edge tests. No invented
   actor/tenant/patient/session, untrusted forwarded IP or raw token/error capture.
6. Preserve failed runs, verify exact-source hashes and owned cleanup, execute
   focused/full regressions, then write and start the next remaining gate. No
   existing runtime migration, deployment, commit/push/merge/PR, actual patients,
   hospital/legal approval, WORM/SIEM or full-MVP claim from isolated storage.
