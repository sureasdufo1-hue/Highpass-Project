# Actual pre-auth PG timeout / termination / clock gate

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

[Outage/HTTP prompt](../implementation/highpass-v3-p0-06-preauth-outage-http-prompt.md)
was executed for actual outage/flood and clock verification. Owned admin transaction
locks the event table; actual pg_stat_activity witnesses publisher INSERT waiting
on Lock. Original real TLS handshake is denied, three further TLS denials hit
bounded sink OVERFLOW, authenticated synthetic health200 remains responsive.
Dispatched timeout is OUTCOME_UNKNOWN, never NOT_RECORDED or durable success.
A separate witnessed backend termination also produces OUTCOME_UNKNOWN/TLS DENY.

Only the witnessed publisher backend in this owned validation DB is terminated,
before releasing the lock. Row absence is checked after that explicit intervention;
it does NOT prove that a timed-out INSERT normally cannot later commit. Existing
DBs/processes/containers are not touched. Lock rollback and sink restoration happen
in finally. Real ten-second wall/monotonic wait, without Date.now substitution,
rejects stale admission before counted publisher pool acquisition.

`node scripts/v3-identity-transaction-check.js` exit0, 394 checks PASS, 77,269 ms,
cleanup PASS, sourceUnchanged true. Manifest:
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-38-25-674Z-de1ee1ae/manifest.json`.
Transaction digest and current captured source hashes independently match.
Twelve added actual-outage/clock checks PASS. Full Node regression:
`node --test --test-concurrency=1`, exit0, 413/413 PASS, 74,387.9028 ms.
New outage fixture syntax check exit0. Document cross-reference check PASS
(links/labels only, not semantic contract or independent human approval).

This is an owned technical matrix, not a full sustained DoS/load/HA test. Slow
blocked INSERT and forced backend termination are actual PG evidence; no promise
mock is substituted. No long-outage operator reconciliation, HTTP publication,
production retention/reader purpose, actual IdP/human PoP or D1..D6 completion.
Historical Session timeouts remain unresolved; new PASS does not erase them.
No WORM/hash-chain/SIEM or whole-MVP/v3 completion claim. 김범희 approval is scoped
synthetic preparation, not independent approval of these new artifacts.

Next [paired HTTP binding prompt](../implementation/highpass-v3-p0-06-preauth-http-binding-prompt.md).
That prompt was read and its initial contract/source analysis executed. Factory
pairing, bounded outcome history and safe HTTP stage boundaries are aligned in
the HTTP observation draft; emitter and HTTP-to-PG wiring remain unimplemented.
Long-outage confirmation beyond expired admission remains a separate unresolved
purpose/ownership contract, not an excuse to refresh event time or relax TTL.
