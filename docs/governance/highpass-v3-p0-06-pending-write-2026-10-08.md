# P0-06 atomic PENDING preparation — internal write gate

2026-10-08 / DRAFT / UNASSIGNED / IN PROGRESS.
HEAD59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc plus preserved dirty worktree.
No inherited human PASS or institution/production approval.

## Purpose, requirements and implementation

Related V3-FR-CON-001/002, V3-FR-EX-005/006/007,
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; FR-001..005/014..020/037..041.

Existing018 immutable staging/deferred integrity,019 source projection, typed audit
and transaction runner were retained. Added020 own-actor SELECT/INSERT policies;
no runtime grants, UPDATE/DELETE policies, SECURITY DEFINER or Mapping privilege.
Added internal V3PendingPreparationService and factory-branded guarded transactions.
Structural request normalization precedes keyed ledger lookup without granting
authority. Fresh admission/replay use live same-transaction DB projection and clock.
Canonical request/scopes/actions, CREATED audit and minimal original receipt persist
atomically. Matching replay revalidates current authority/window/parent; changed
payload commits safe conflict audit. Evidence input becomes keyed commitment only.
Stored malformed digest length is a technical integrity error, never normal conflict.

No HTTP route, patient approval, ConsentArtifact/Grant, INVITED activation or Session
mutation was introduced. Statements are parameterized; errors stay secret-safe.
Own synthetic fixture grants staging SELECT/INSERT for deferred proof, not deployed
credentials. Public transport and all PA cases are not completed by this internal gate.

## Actual verification

| Command / evidence | Result | Scope |
|---|---|---|
| node scripts/v3-identity-transaction-check.js — PG217 initial run | NOT VERIFIED / exit1 |217 PASS, but cleanup observation unverified; retained unchanged |
| same command — PG222 expanded run | PASS / exit0 |222 PASS, sourceUnchanged true, cleanup PASS;57,191ms |
| node --test test/v3-pending-service.test.js test/v3-pending-projection.test.js test/v3-pending-audit.test.js test/v3-consent-pending-contract.test.js | PASS / exit0 |22 tests,536.2762ms; pure/mock checks are not DB evidence |
| node --check src/v3-pending-service.js | PASS / exit0 |syntax |
| git -c core.safecrlf=false diff --check | PASS / exit0 |tracked whitespace only |

Initial evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T23-48-16-508Z-31c7d4cc/manifest.json.
Expanded evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T23-50-55-984Z-b6b90a26/manifest.json.
Manifests bind repository SHA, dirty tree and actual source hashes; DRAFT/UNASSIGNED.
Cleanup now confirms exact-name absence with successful container inventory after
label-checked removal; a CLI timeout or failed inspect alone never proves cleanup.
Owned ephemeral test container removed; no user stack/data was deleted.

Actual new pending tests: HOSPITAL_ADMIN create/replay/conflict, stale and wrong
target/Study/window denial, recreated coordinator/elapsed-start replay, raw evidence
absence, parent unchanged, concurrent identical writes, real COMMIT with lost ACK
and durable retry, expired-window denial, audit/ledger fault complete rollback.
The three new creations yield four total fixture preparations; no duplicate CREATED
event is allowed. Concurrent pool has two physical connection capacity.

## Remaining risk / next work

PA-01 patient/doctor positives; PA-02 full actor/tenant negatives; PA-03 lifecycle
coverage; PA-06 admitted-pool direct assembly attacks; child storage faults;
PA-08 actual cancellation/expiry/suspension competition and work-crosses-cutoff.
PA-09 HTTP/HTTPS/mTLS, deployment/minimum-column provisioning, audit chain/SIEM
delivery and D1..D6 patient ceremony remain NOT VERIFIED or separate scope.
Historical52 source/schema checks are not020 admission evidence. Full Node outcome
is exit0/PASS:374 tests, fail/skip0,90,276.2513ms using
node --test --test-concurrency=1. Live E2E/staging script entrypoints explicitly
do not execute live checks under node --test; this is not HTTPS or staging evidence.
Document checker exit0/PASS:22 documents/106 links, path/label scope only.
Existing intermittent DPoP timeout
is not fixed or hidden by successful serial runs.

[Next execution prompt](../implementation/highpass-v3-p0-06-pending-adversarial-races-prompt.md)
has been written and its current policy/lock/fixture gaps inspected immediately.
Full MVP/v3 is not achieved; no existing DB migration or commit/push/merge/PR.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
