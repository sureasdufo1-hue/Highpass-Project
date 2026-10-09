# P0-06 source preparation RLS and internal projection

2026-10-08 KST / DRAFT / UNASSIGNED / P0-06 IN PROGRESS.
HEAD:59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + preserved dirty tree.
No earlier human approval is inherited; no whole MVP/v3 completion.

## Purpose / related requirements

Execute source authority prompt before atomic preparation writes.
Related V3-FR-CON-001/002, V3-FR-EX-005/006/007,
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; legacy FR-001..005/014..025/037..041.

Confirmed: consent:write must not imply exchange:create/read or Mapping privileges.
Decision: purpose-built read/lock policies using nonrecursive creation root, minimal
column grants and source-only persisted actor checks. Directory selection is limited
nonpatient registry visibility, not recipient authorization. D1..D6 remain unresolved.

## Implemented / files

019_highpass_v3_pending_source_projection.sql: scope legacy permissive ref/root/
participant/resource/directory policies to existing clinical capability; pending
root uses active source tuple, patient bound ref or doctor requester, never parent
RLS. Session/ref locks have WITH CHECK(false); scoped child reads preserve immutable
selection. Pending directory helper reads principal only, avoiding registry recursion.
No staging admission policy, runtime role enrollment or clinical transition.

src/v3-pending-projection.js: trusted internal SAME-TRANSACTION helper. Live branded
consent binding and pending-only pool; locked source Session, current version/state,
owned undeleted ref and immutable SOURCE participant; server-selected target share
locks; canonical scope/hash/action validation and final DB clock. Returns internal
immutable selection or safe internal reason, never a public unaudited metadata API.
Future write service must commit audit and recheck time before receipt/commit.

test/v3-pending-projection.test.js:4 groups covering lock/order/scoping, denial
classifications, mixed pool/digest/count/action/clock failures, forged bindings/input.
scripts/v3-pending-schema-check.js:52 actual PG/schema/minimum-column RLS cases.
scripts/test-support/v3-pending-projection-fixture.js and existing transaction helper:
dedicated nonowner consent-only pool, real JS projection controls and negatives.
No Mapping SELECT, broad clinical membership or owner connection is used for projection.
The standalone SQL fixture deliberately tests denial even with table privileges;
the projection fixture uses only the documented columns/lock privileges.

## Actual verification

| Command | Exit / result | Scope |
|---|---|---|
| node --test test/v3-pending-projection.test.js | 0 / PASS |4 tests;341.053ms; mock SQL, not real DB |
| node scripts/v3-pending-schema-check.js | 0 / PASS |52 actual PG/schema/RLS checks;latest evidence below |
| node scripts/v3-identity-transaction-check.js (before JS extension) | 0 / PASS |197 existing regressions with019; no JS projection |
| node scripts/v3-identity-transaction-check.js (first extended run) | 1 / NOT VERIFIED |stopped after143 PASS; JS projection not reached |
| node --test --test-concurrency=1 | 0 / PASS |365/365;fail/skip0;105,179.0356ms |
| node --check (projection and new fixture) | 0 / PASS |syntax only |
| git -c core.safecrlf=false diff --check | 0 / PASS |tracked whitespace |

Latest SQL RLS evidence:
evidence/generated/hp-v3-pending-schema-2026-10-07T23-34-23-867Z-c129298d/manifest.json.
Before-extension197 evidence:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-31-13-149Z-07b37bfc/manifest.json.
Preserved incomplete extended run:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-33-43-670Z-65ec5a9d/manifest.json.

The incomplete run stopped around existing maximum100 Study x500 Series HTTP scenario,
before actual JS projection. Root cause is NOT established. Last recorded PG fault
is historical context, not necessarily the current exception. Added safe outer
failureCode classification without raw message/SQL/token. No timeout or security
check weakened. A same-limit single-process rerun is tracked below when terminal.

Extended rerun after safe failure classification reached all197 baseline cases and
four actual JS projection checks, then FAILED the mixed-policy-group error test:
registry RLS was evaluated before the helper's role check, producing a storage
failure instead of the dedicated mixed-role rejection. Preserved evidence:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-35-40-745Z-0b2dd7d9/manifest.json.
This is a real guard-order defect, not an expected PASS. Added guardPendingPool:
check pending-only membership on connection acquisition BEFORE BEGIN/registry RLS,
fixed3s query timeout, destroy failed connections and expose safe errors only.
The original inner role check stays. Five targeted unit tests PASS/182.7968ms after
fix; real PG rerun and latest full-suite results will be appended when terminal.

Fixed-guard actual PG rerun:202/202 PASS (197 baseline +5 real projection cases),
exit0,57,425ms;sourceUnchanged true,cleanup PASS. Manifest digest verified PASS:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-37-35-929Z-cfbcec69/manifest.json.
The mixed membership test now returns the dedicated rejection before registry RLS.

Full serial run after guard fix:exit1,366 tests/365 PASS/1 FAIL,65,112.1665ms;
existing DPoP HTTP test TimeoutError at25,934.7536ms. This is technical timeout,
not policy denial, and not a new projection failure. It remains a regression FAIL
until separately rerun; do not substitute the earlier365-test PASS. Limits unchanged.

Final full serial repeat with all DB fixtures terminal:exit0,366/366 PASS,fail/skip0,
81,732.0655ms. Latest complete regression is PASS, but intermittent existing DPoP
timeout is not declared fixed. Both earlier failure records remain. No security
limits changed. Latest targeted test5 PASS and PG202 PASS cover the corrected guard.
SQL minimum-column52 evidence duration87,381ms; baseline197 with019 duration86,400ms.
Manifest verification for final SQL and PG evidence:PASS/exit0,DRAFT/UNASSIGNED.
Document checker:18 targets/100 local links PASS/exit0; paths/labels only, not approval.

## Security / remaining risks

Only synthetic identifiers, ephemeral generated credentials and owned disposable
fixtures. Existing runtime/DB untouched. No actual patient approval, INVITED activation,
Grant, raw key release or external KMS. No exhaustive repo PHI/secret scan claimed.
019 changes capability enrollment expectations for future clinical pools; existing
clinical regression evidence is required and preserved. Runtime rollout not performed.

Staging write service, typed domain DENY audit, HMAC scoped exact original replay,
pending storage/lost-ACK faults and cancellation/expiry/suspension races are still
NOT IMPLEMENTED/NOT VERIFIED. Existing197 replay/race checks are legacy paths.
Public HTTP/HTTPS/mTLS and later approval ceremony remain separate gates.

## Next execution

[Atomic write execution prompt](../implementation/highpass-v3-p0-06-pending-atomic-write-prompt.md)
written and immediately started by inspecting018 deferred creation-audit FK, sealed
child/count/result proof and absent admission policies. A read projection success
must not stand in for audited preparation persistence. Full PA-01..09 remains intact.

Recommended commits only:019 RLS; internal projection + tests; actual nonowner fixtures/
safe diagnostics; contract/report/next prompt. No commit/push/merge/PR performed.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
