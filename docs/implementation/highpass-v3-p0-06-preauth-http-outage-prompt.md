# Next execution — actual HTTP pre-auth PG outage and recovery matrix

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041, V3-SR-IAM-002. Overall MVP/v3 IN PROGRESS.

1. Read the HTTP observation and durable adapter contracts, latest HTTP binding
   evidence including failed runs, and owned TLS outage fixture. Do not deploy
   this injection-only edge or enroll credentials in existing databases.
2. In the owned validation PostgreSQL only, lock the pre-auth event table and
   witness the exact owned HTTP publisher INSERT waiting on Lock. Confirm the
   original HTTPS rejection responds403 before storage settles. Do not replace
   the real database outage with a promise mock.
3. Exercise a finite HTTP burst against the bounded publisher while blocked;
   requests remain403, capacity rejection is explicitly OVERFLOW and completion
   history remains bounded. Prove no preparation, result ledger or fabricated
   domain/network audit is created. Verify a separate valid synthetic request
   remains responsive; no full HA or sustained DoS conclusion.
4. Prove dispatched timeout and witnessed publisher backend termination produce
   OUTCOME_UNKNOWN rather than NOT_RECORDED or false durable success. Terminate
   only witnessed owned backends before unlocking when asserting no committed
   row. Timeout by itself cannot prove absence of a later commit.
5. Roll back owned lock and restore resources in finally; prove fresh rejection
   after recovery is RECORDED_DURABLE. Test disposed emitter on real HTTPS: deny
   remains403 and no new event. Separate deliberate sequential delivery checks
   from burst/outage checks; do not increase capacity or deadlines to make green.
6. Protect setup-error cleanup of owned publisher/reader pools and owned listener
   resources. Never terminate unrelated processes, stacks or databases. All
   waits, database queries, network operations and cleanup have finite bounds.
7. Run focused and full Node regression and exact-source PostgreSQL verification;
   check manifest digest, source hashes and cleanup. Preserve any FAIL or NOT
   VERIFIED, report commands/counts/timing and start the next justified gate.

Long-outage operator reconciliation after admission expiry, reader/retention
approval, actual IdP/human PoP, D1..D6 and prior intermittent Session latency
root cause remain unresolved. Never refresh event time to defeat expiry. Human
approval by 김범희 on2026-10-08 covers synthetic preparation, not independent
approval of new results, legal compliance, hospital operation or production.
