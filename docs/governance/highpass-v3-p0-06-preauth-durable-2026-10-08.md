# Pre-auth injection-only durable adapter execution

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

The [adapter prompt](../implementation/highpass-v3-p0-06-preauth-durable-adapter-prompt.md)
was executed. Observer-owned admission is required before pool access; publisher
and reconciliation credentials are separate, no new SQL grants. Finite deadlines,
pending-capacity bounds, role separation and driver idle status are mandatory.
NOT_RECORDED before dispatch is distinct from OUTCOME_UNKNOWN after dispatch;
duplicate UUID means NOT_CONFIRMED until exact original fields are confirmed by
the dedicated reader. A missing row does not prove a previous operation cannot
later commit. No observation time/UUID is regenerated during retry.

Focused unit command `node --test test/v3-preauth-durable-sink.test.js`: five PASS,
exit 0. Includes forged/foreign admission, duplicate/matching/conflicting/missing
mock results, injected lost ACK, ignored timeout/capacity, late acquisition,
unsafe role, borrowed open transaction and stale admission before pool access.
These mocks are NOT actual PG evidence. Local pg8.22.0 source shows completion at
ReadyForQuery and public getTransactionStatus; missing/non-idle drivers fail closed.

Actual owned PostgreSQL fixture now tests INSERT acknowledgement, duplicate plus
separate exact confirmation, actual committed INSERT then injected lost ACK,
no-row confirmation and real TLS no-cert/untrusted/expired events written via
the same admitted-event adapter. Latest manifest:
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-23-09-849Z-74a1e7bc/manifest.json`.
Its scoped durable INSERT/duplicate/confirmation/lost-ACK and three actual TLS-to-PG
assertions PASS. Overall command exits 1, NOT VERIFIED / TimeoutError at
SESSION_MAXIMUM_RESOURCES after 179 executed PASS checks; duration71,232 ms,
cleanup PASS, sourceUnchanged true. No full-transaction PASS claim. No existing
runtime wiring or DB changes. Full Node regression:
`node --test --test-concurrency=1`, exit 0, 413/413 PASS, 68,077.8425 ms.
Digest matches the manifest and all captured current source hashes match. These
Node results do not override the actual full-transaction NOT VERIFIED result.

Preserved failed verification:
`hp-v3-identity-tx-2026-10-08T01-20-24-332Z-cc5ec887` exited 1 with
NOT VERIFIED / TimeoutError / SESSION_MAXIMUM_RESOURCES before the new adapter
gate. Its unrelated prior 42501 diagnostic is not the timeout cause. Runner now
observes only fixed maximum-request phase times/status and executes independent
pre-auth checks first; all original legacy gates still run with unchanged limits.
Current rerun is not a skipped maximum-body test or blanket PASS substitution.
Pure local diagnostic for 3,189,305-byte synthetic resource JSON: parsing 51 ms,
structural normalization 48 ms in that invocation; this does not diagnose actual
HTTP upload, PG/commit latency or prove the existing intermittent timeout fixed.

Remaining: actual conflicting UUID, actual open transaction, full actual sink
fault/TLS readiness matrix, HTTP/JWT/ingress observer, long-outage reconciliation,
retention/ownership, IdP/human PoP/D1..D6 and hash-chain/WORM/SIEM. Generated evidence
remains DRAFT/UNASSIGNED; scoped 김범희 approval is not independent review of this
implementation or production/legal/hospital approval. Overall MVP/v3 IN PROGRESS.

Next [adversarial gate prompt](../implementation/highpass-v3-p0-06-preauth-durable-adversarial-prompt.md)
was written/read and its gap analysis started. A higher-priority current regression
issue now takes precedence: [maximum Session latency prompt](../implementation/highpass-v3-session-maximum-latency-prompt.md).
Server observation shows21 ms to finish receiving body and4982 ms afterward before
201 completion, crossing the unchanged5000 ms client deadline. This narrows the
problem to processing/DB/commit and response timing; it does not yet isolate a
particular SQL or prove a remedy. Never count a late201 as client E2E PASS.
The latency prompt was read and initial source/evidence analysis executed:
bounded body parser, resource normalization and deferred SQL assembly/scope-count
triggers inspected. A fixed SQL phase profile is the next implementation step;
no trigger or deadline was relaxed. Actual open-transaction/role/fault matrix and
long-outage confirmation remain the following adversarial gate, not inferred PASS.
