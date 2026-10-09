# P0-05 expiry drain follow-up

2026-10-07 / HEAD 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + dirty tree.
P0-05 IN PROGRESS / DRAFT / UNASSIGNED; no earlier human review inherited.
Related V3-FR-EX-007, V3-NFR-REL-001, FR-037~041.

Executed the next [receipt/drain prompt](../implementation/highpass-v3-p0-05-receipt-drain-prompt.md).
Implemented admission stop and in-flight promise drain in src/v3-exchange-expiry-service.js;
test/v3-exchange-expiry-service.test.js verifies admitted success/failure, idempotent
close promise and late-call rejection. Original callers retain outcomes. No scheduler,
process signal handler, pool termination or real runtime activation is implied.

| Verification | Result | Evidence |
|---|---|---|
| targeted expiry tests | PASS / exit0 | 6 tests, 152.158ms |
| node --test | PASS / exit0 | 350/350, fail/skip0, 38,006.778ms |
| independent PG/loopback regression | PASS / exit0 | 189 checks, 37,588ms |
| manifest verifier | PASS / exit0 | 1 digest, DRAFT/UNASSIGNED |
| node --check expiry service | PASS / exit0 | current syntax |

Evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T14-16-26-216Z-29b40efb/manifest.json.
Manifest SHA256 90191817b865a2cdf8d4930bf847fb3967af316b697e85bc304d6594bee1d42b.
35 source hashes stable during run; cleanup PASS. PG regression includes actual expiry
but in-flight drain timing is unit-controlled, not a live scheduler test.
Earlier transaction report remains historical evidence for the pre-drain source.

## Next inspected implementation issue

Original creation receipt is reconstructed from current row state/version and
updatedAt, not explicit immutable ledger receipt fields. Future nonterminal transitions
remain disabled; do not enable them merely to test receipt replay. Additionally,
prepareExchangeSessionCreate rejects validUntil in the past before ledger lookup.
Expired exact-key replay can fail validation before transactional SESSION_EXPIRED
denial audit. Split structural command parsing from new-request time eligibility
without permitting expired fresh creation or changing original command digests.

Continue the same receipt/drain prompt: explicit original receipt reconstruction and
actual terminal replay/audit checks, then full dependency alignment. These are not
complete. Scheduler deployment, grant/cascade delivery, full canonical lifecycle,
current runtime HTTPS/mTLS and independent human review remain NOT VERIFIED/pending.
No existing DB activation, TLS weakening, commit/push/merge/PR or other stack cleanup.
