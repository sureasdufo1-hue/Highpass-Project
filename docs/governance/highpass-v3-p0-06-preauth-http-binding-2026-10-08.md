# Pre-auth HTTP observation binding execution record

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002. Overall MVP/v3 IN PROGRESS.

Executed [paired binding prompt](../implementation/highpass-v3-p0-06-preauth-http-binding-prompt.md).
Optional edge observer requires privately branded same-factory sink pairing.
Trusted server rejection branches publish fixed INGRESS/HUMAN_AUTH/MOCK_ASSURANCE
events asynchronously, never awaiting storage before safe403. No fabricated
domain actor, patient, tenant, token or session is attached. Source IP is immediate
socket only, not forwarded input. Bounded16 stage/outcome observations expose no
payload. Disposal prevents new admission but never bypasses edge authentication.

Changed `src/v3-preauth-security-events.js`, `src/v3-pending-secure-edge.js`, owned
HTTP fixture, pending projection/secure-edge fixtures and source hash registry.
Added emitter pairing/history and actual HTTPS slow-sink/overflow/disposal tests.
Reused PG clients register one safe error listener across factories; a discovered
MaxListeners warning was corrected rather than suppressed by raising the limit.
No dependency/lockfile, runtime listener, existing DB migration or stack change.

First actual run FAIL, exit1,106,731 ms:
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-49-51-662Z-667cba5c/manifest.json`.
Ten unpaced HTTP rejection responses were403 but durable row cardinality failed.
That run did not capture aggregate outcomes, so OVERFLOW is a hypothesis, not
proven cause. Sequential delivery fixture now waits for each outcome with finite
deadline and records safe aggregate counts; real capacity/deadlines remain intact.
Intentional burst is tested separately, not claimed lossless.

Intermediate actual run409 PASS,107,894 ms, then exposed repeated client listener
warning. After correction, current `node scripts/v3-identity-transaction-check.js`
exit0,409/409 PASS,119,580 ms, cleanup PASS,sourceUnchanged true. Manifest:
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-54-51-234Z-2d67ab78/manifest.json`.
Manifest digest and every captured current source hash independently match.
Ten actual HTTP rejection events RECORDED_DURABLE; stage distribution ingress5,
human admission2,mock assurance3. Actual publisher INSERT privilege revocation
leaves403 unchanged and records NOT_RECORDED with no new event. Domain preparation,
ledger and authenticated audit counts remain unchanged for pre-auth denials.

Focused tests16 PASS before listener regression addition, exit0,1,245.1374 ms.
Full `node --test --test-concurrency=1` regression exit0,417/417 PASS,
85,448.5575 ms, including the reused-client listener regression. Documentation
checker exit0,62 files/162 links PASS (links/coverage labels only, not semantics).
Syntax checks exit0 and secret pattern scan PASS,findings empty; this is a limited
pattern scan, not proof of absence of every type of secret or personal information.
Node discovery does not execute separate live HTTPS/staging scripts.

김범희 review/approval dated2026-10-08 covers synthetic nonoperating preparation,
not independent review of new evidence. New manifest stays DRAFT/UNASSIGNED.
No legal PIPA, ISMS-P, hospital approval, full sustained DoS/HA, staging or whole
MVP/v3 claim. Prior intermittent Session latency cause remains unresolved.

[Next HTTP outage prompt](../implementation/highpass-v3-p0-06-preauth-http-outage-prompt.md)
is written, fully read, and source/contract analysis started. Real TLS-to-PG outages
are prior evidence; actual HTTP-to-PG blocked INSERT/termination/burst/recovery is
not yet verified. Long-outage reconciliation after admission expiry, production
reader purpose/retention, actual IdP/human PoP and D1..D6 remain unresolved.
