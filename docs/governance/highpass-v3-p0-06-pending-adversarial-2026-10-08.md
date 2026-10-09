# P0-06 PENDING authority, integrity and actual lifecycle races

2026-10-08 KST / DRAFT / UNASSIGNED / IN PROGRESS.
HEAD59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc plus preserved dirty tree.
Related V3-FR-CON-001/002, EX-005/006/007;
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; FR-001..005/014..020/037..041.

## Implemented scope and security review

Added scripts/test-support/v3-pending-adversarial-fixture.js and
scripts/test-support/v3-pending-race-fixture.js. Extended the existing pending
projection/write fixtures and actual v3 transaction checker; production source and
DDL unchanged in this gate. All new fixtures operate on the checker-owned ephemeral
PostgreSQL database, not the user stack. No new clinical activation/Grant/approval.
No dependencies, actual patient data, authentication bypass or timeout relaxation.

Actual PATIENT bound-ref and requester DOCTOR create immutable PENDING/UNVERIFIED.
Other doctor, wrong patient, destination INVITED and foreign/other actor receipt reads
deny. No-context pooled queries see zero staging/results. Revoked persisted patient
is rejected before repository callback; do not claim a committed domain audit for it.
Synthetic role authentication claims include required doctorId/patientId; authority
still comes from server registry UUIDs and fresh DB binding, not those legacy labels.

Direct admitted-role SQL: forged audit actor denied, incomplete cloned request and
append-to-sealed scope cannot commit; temporary UPDATE/DELETE table privileges still
produce zero changed rows due to RLS. Scope/action INSERT faults roll back assembly.
Audit/result faults, exact replay, concurrent key and lost ACK previous cases retained.
Deferred COMMIT rejection conservatively reports outcome unknown at the service
boundary; owned DB row counts confirm rollback, without changing production behavior.

Actual source/target suspension updater is observed in pg_stat_activity Lock wait
while preparation holds SHARE locks. Preparation commits before suspension; later
replay denies with403 source or404 target. Fixed-window work pauses after ledger
INSERT; crossing cutoff returns422 and rolls back request/children/audit/receipt.
No persisted DENY is claimed for this rolled-back cutoff.

Actual V3ExchangeCancelService on a separate clinical pool waits on the same Session
SHARE lock, then commits CANCELLED/v2/event after preparation. Old If-Match replay
returns412; no terminal ALLOW is returned. Expiry uses actual V3ExchangeExpiryService
and dedicated maintenance pool; SKIP LOCKED leaves the held Session unchanged.
Preparation crossing parent expiry returns404 with no staging, then expiry commits
one EXPIRED event; post-expiry preparation remains denied. Finite3s barriers,1s lock
observation, bounded clock polls and existing8s transaction deadlines are retained.

## Actual commands and evidence

| Command / run | Result | Evidence |
|---|---|---|
| node scripts/v3-identity-transaction-check.js — first expanded run | NOT VERIFIED / exit1 |incomplete synthetic DOCTOR claims stopped after229 PASS; no production defect asserted |
| same command — authority/suspension/cutoff run | PASS / exit0 |244 PASS;45,954ms;cleanup PASS/sourceUnchanged true |
| same command — current cancel/expiry-integrated run | PASS / exit0 |251 PASS;42,803ms;cleanup PASS/sourceUnchanged true |
| node --check scripts/test-support/v3-pending-adversarial-fixture.js | PASS / exit0 |syntax |
| node --check scripts/test-support/v3-pending-race-fixture.js | PASS / exit0 |syntax |
| git -c core.safecrlf=false diff --check | PASS / exit0 |tracked whitespace only |

Failed evidence retained unchanged:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-55-25-000Z-21637b6d/manifest.json.
Intermediate scoped evidence:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-56-37-469Z-e63dfc3a/manifest.json.
Current evidence:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-58-04-109Z-a3bf4f66/manifest.json.
The current manifest binds all added fixture/source hashes and dirty repository SHA.
Earlier lastDbFault belongs to a legacy expected expiry fault and is not evidence
that it caused the later unclassified fixture authentication error.
Label-checked owned containers removed; no user volumes or data were removed.
Full Node regression completed: node --test --test-concurrency=1 exit0/PASS,
374 tests, fail/skip0,69,397.7274ms. Live HTTPS/staging checks are not executed by
their node --test entrypoints and are NOT VERIFIED here. Existing intermittent
DPoP timeout is not declared fixed by this successful serial run.
Document checker exit0/PASS:24 documents/108 links; paths and labels only.
Current manifest evidence digest independently checked with Get-FileHash SHA256:
matches=true,reviewStatus=DRAFT,reviewer=UNASSIGNED. No human review inferred.

## Coverage audit and next gate

PA-01 patient/provider controls, PA-05 replay and PA-07 child/audit/result/lost-ACK
have actual evidence. PA-02/03/04/06 remain PARTIAL: explicit false creation-audit
tuple, foreign FK/digest, maintenance staging reads and full scope/action/purpose/
Series/tenant/ref negatives still require current admitted-role tests. Do not use
pure parser or018 default-deny evidence to close these. PA-08 tested cases prove
the observed serialization directions only, not global deadlock freedom or all
multi-institution orders. Public transport remains NOT IMPLEMENTED/NOT VERIFIED.

[Next residual-matrix/transport prompt](../implementation/highpass-v3-p0-06-pending-transport-contract-prompt.md)
written and immediately inspected existing strict bounded Session body reader and
pending minimal receipt. It requires residual PA cases before transport completion,
separate interface design and injection-only HTTP before any live route deployment.
No consent-artifacts relabelling; D1..D6 clinical approval remains unresolved.
Full MVP/v3 is NOT achieved. No commit/push/merge/PR or existing DB migration.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
