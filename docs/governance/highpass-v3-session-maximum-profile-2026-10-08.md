# Maximum Session SQL phase diagnostics

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related v3 ExchangeSession acceptance, FR-014..025/FR-037..041.

The [latency prompt](../implementation/highpass-v3-session-maximum-latency-prompt.md)
was executed by adding at most64 fixed phase/duration entries to the existing
owned validation runner. No SQL text, values, UID, credentials or raw errors are
captured. POOL_ACQUIRE/RESOURCE_INSERT/RESOURCE_READ/LEDGER_INSERT/COMMIT/OTHER_SQL
labels only. Request reception/body-end/response completion are fixed synthetic
maximum-request observations. No runtime handler/service/DDL or deadline change.

Actual full command `node scripts/v3-identity-transaction-check.js`: exit0, 374
checks PASS, 58,946 ms, cleanup PASS, sourceUnchanged true.
Manifest `evidence/generated/hp-v3-identity-tx-2026-10-08T01-28-05-329Z-20531df3/manifest.json`:
transaction JSON digest independently matches; all captured source hashes match.
Maximum100 Studies x500 Series traversed real HTTP/nonowner PG unchanged:
received31638/body-end31641/response201 finished32835 ms from start.
Post-body processing1194 ms; resource INSERT136 ms, resource READ91 ms,
COMMIT721 ms, pool acquisition0 ms in this invocation. COMMIT is the largest
measured SQL stage here, not proven cause of earlier failed runs.

Preserved prior manifest `hp-v3-identity-tx-2026-10-08T01-23-09-849Z-74a1e7bc`
remains NOT VERIFIED due unchanged5000 ms client timeout and late server201.
Current PASS does not erase or establish the root cause of that failure.
Body parse/service preparation are not individually instrumented in the actual
HTTP handler yet; SQL phase totals and post-body time alone cannot resolve their
separate contribution. No speculative trigger optimization or skipped test.

Deferred scope-count/assembly, immutable parent count, ordinal uniqueness/bounds
and RLS were inspected. Repeated deferred checks are a possible cost source, but
no constraint was replaced on the strength of a single successful profile.
Full Node regression: `node --test --test-concurrency=1`, exit0, 413/413 PASS,
67,310.8943 ms (before subsequent fixture-only adversarial expansion).
Overall MVP/v3 remains incomplete, not production
readiness; scoped human approval is not new independent review. No commit/push.

Next: [pre-auth adversarial gate](../implementation/highpass-v3-p0-06-preauth-durable-adversarial-prompt.md),
while retaining intermittent latency as an unresolved regression risk.
