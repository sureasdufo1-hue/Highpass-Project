# Actual HTTP pre-auth PostgreSQL outage / recovery gate

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002 and V3-NFR-REL-001.

Executed [HTTP outage prompt](../implementation/highpass-v3-p0-06-preauth-http-outage-prompt.md).
Changed owned HTTP and secure-edge fixtures only. Explicit publisher capacity1 is
test configuration; production defaults/deadlines, authentication and TLS remain
unchanged. No new migration/dependency, existing runtime DB/stack or commit/push.

Owned PostgreSQL ACCESS EXCLUSIVE lock and exact publisher INSERT/Lock witness
prove real dispatched storage stalls. Original HTTPS rejection responds403 before
completion, three burst requests remain403 with OVERFLOW, dispatched timeout and
separate witnessed backend termination produce OUTCOME_UNKNOWN. Only the witnessed
publisher backend in the owned validation DB is terminated before lock rollback.
No extra committed event is asserted only after that explicit intervention; timeout
alone cannot prove absence of later commit. Fresh rejection after recovery is
RECORDED_DURABLE; disposed emitter keeps403/NOT_RECORDED and adds no row.

Domain preparation, result ledger and authenticated domain/network audit counts
remain unchanged throughout this matrix. Completion history caps at16 stage/outcome
entries. Synthetic frontend-only health responds200 during event lock; it proves
that separate fixture listener responsiveness, NOT clinical write availability,
application readiness, full API HA or sustained DoS resistance.

Setup reader-query failure closes both owned pools; edge/server setup is within
finally cleanup even when certificate/configuration setup fails. Normal fixture
cleanup PASS is actual evidence. Every possible OS cleanup fault is not exhaustively
injected. The existing driver/base query/connect and sink deadlines are retained.

`node scripts/v3-identity-transaction-check.js`: exit0,427/427 PASS,92,776 ms,
cleanup PASS,sourceUnchanged true. Manifest digest and all current captured source
hashes independently match:
`evidence/generated/hp-v3-identity-tx-2026-10-08T02-02-20-349Z-fe3a2384/manifest.json`.
Intermediate427 PASS,92,702 ms is preserved; final run includes setup cleanup.
`node --test --test-concurrency=1`: exit0,417/417 PASS,82,199.4246 ms. This command
does not execute the separate live HTTPS/staging scripts. New fixture syntax exit0.
Document cross-reference check is links/coverage labels only, not policy approval.

Residual: full sustained load/HA, current deployed live v3 routes, production log
reader purpose/retention, expiry-safe long-outage reconciliation, actual IdP/human
proof, and prior intermittent Session latency root cause remain NOT VERIFIED or
unresolved. Original failed HTTP cardinality evidence remains retained. 김범희's
2026-10-08 approval is synthetic preparation, not independent new-evidence approval.
No whole MVP/v3, legal PIPA, ISMS-P or hospital operation conclusion.

Next [decision readiness prompt](../implementation/highpass-v3-p0-06-decision-readiness-prompt.md)
is written/read and executed through requirement/security/traceability and current
lock analysis. [D1..D6 decision draft](highpass-v3-lifecycle-decision-packet-2026-10-08.md)
provides policy choices without permission-bearing code. Full canonical detail
review/alignment and exact human choices remain pending; generic prior approval
cannot activate Consent/recipient/Grant. Overall MVP/v3 IN PROGRESS.
