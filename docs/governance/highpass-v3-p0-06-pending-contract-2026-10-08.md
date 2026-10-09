# P0-06 PENDING consent preparation input result

2026-10-08 KST / HEAD 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + dirty tree.
PURE INPUT FOUNDATION TESTED / DRAFT / UNASSIGNED / P0-06 IN PROGRESS.
Previous 김범희 legacy r3 review is not inherited.

## Purpose and requirements

Implement non-authorizing preparation only, preserving approved clinical flow.
Related V3-FR-CON-001/002, V3-FR-EX-005, V3-SR-IAM-004/TEN-001/AUTH-001/002,
legacy FR-001..005/014..020; planned V3-AT-CON-001/002 and AUTH-002 coverage remains
partial until DB/approval workflow exists. This parser is not ConsentArtifact approval.

## Existing structure / changes

Existing V3PrincipalRegistry supplies immutable server-branded actor/binding; Session
parser validates DICOM hierarchy, unique actions/resources and timestamps. Minimal
factoring exports the same pure normalizers, leaving Session acceptance/error semantics.

New src/v3-consent-pending-contract.js: exact source-bound PATIENT/DOCTOR/HOSPITAL_ADMIN
consent:write intent with fixed PENDING, patient binding, canonical subset and bounded
window validation. Copies/deep-freezes caller selections. Evidence is explicitly
UNVERIFIED; submitted digest does not prove its algorithm, authenticity or approval.
WeakMap branding associates the output with its original live binding, not DB authority.
Whole Study may narrow to Series; Series-scoped selection cannot expand to whole Study.

New test/v3-consent-pending-contract.test.js: 7 test groups cover role/scope/binding/
patient/source spoofing, ACTIVE/authority fields, malformed evidence, selection/window
expansion, empty/duplicate/sparse selection, prototype/getter and cloned-intent negatives.
Modified src/v3-exchange-session-contract.js shares normalization functions.

New docs/api/highpass-v3-consent-pending-contract.md and next authority prompt;
updated API alignment/master plan/execution prompt. No API route/body/response
compatibility change. No migration or application service integration.

## Tests and evidence

| Command | Exit/result | Actual scope |
|---|---|---|
| node --test test/v3-consent-pending-contract.test.js test/v3-exchange-session-contract.test.js test/v3-exchange-session-service.test.js | 0 / PASS | 18 tests,575.5695ms |
| node --test --test-concurrency=1 | 0 / PASS | 359/359, fail/skip0,70,369.1539ms |
| node scripts/v3-identity-transaction-check.js | 0 / PASS | existing197 real PG/loopback regressions,47,925ms |
| node scripts/verify-evidence-manifest.js <manifest below> | 0 / PASS | 1 digest,DRAFT/UNASSIGNED |
| node --check src/v3-consent-pending-contract.js and Session contract | 0 / PASS | current syntax |
| node scripts/v3-lifecycle-document-check.js | 0 / PASS | 10 document targets/87 local links and coverage labels |
| git diff --check | 0 / PASS | tracked whitespace |

PG evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T23-03-31-004Z-bfe254b7/manifest.json.
UTC directory corresponds to 2026-10-08 KST. Source stable and cleanup PASS. The PG
helper verifies existing Session/identity paths with the refactored shared parser;
it does NOT persist/test new Consent requests or contain the new pending module in
its source list. Do not use it to claim P0-06 DB or HTTP completion.

Pending source SHA256: 8c01e9e241994b3fce5d4c30d3b5e2a5c7a11909157a10f2fc3b9e5c5ac971d8.
Pending test SHA256: d81b1acfa4940e1893fbcf88155397d01262f4bba502cf0fdcadd4c6fbed1ab0.
These identify unit-tested sources, not signed human approval.
Pattern scan of PG evidence private-key/JWT:0 matches (rg exit1 = no match);
the document checker itself returned0 before that subsequent scan. No scan proves
exhaustive absence of every form of PHI/secret.

## Security review / uncertainty

Untrusted selection can be fabricated and pass structural validation: a passing
PENDING intent is not clinical authority. Future service must lock/reread canonical
DB scope and active registry/ref/institutions under consent:write. assertPendingConsentIntent
proves parser provenance only. policy time is injected structure, not verified DB clock.
No prepared actor or reviewer is described as the patient's approved delegate.

No DB access, write, DENY audit, active consent, invitation membership, Grant, token,
key or payload is implemented. Malformed input returns fixed errors without supplied
text. No secrets/dependencies/lockfile/TLS changes or existing user change overwrite.
D1..D6 approval/representation/recipient/edge/locking decisions remain unresolved.
Default-concurrency load sensitivity in existing Privacy Filter remains previous risk;
current full regression was deliberately serial without skipping tests/timeouts.

## Remaining / next execution

New pending persistence/HTTP/HTTPS/mTLS and approval ceremony NOT VERIFIED; runtime
not activated. Full P0-04..06/MVP/v3 incomplete. External IdP/KMS/PACS and production
legal/hospital approval remain DEFERRED/BLOCKED, not parser PASS.

Next [authority/read-write contract prompt](../implementation/highpass-v3-p0-06-pending-authority-prompt.md)
written and initial source inspection executed. Separate pending staging from approved
ConsentArtifact; require same-transaction fresh DB selection and DENY audit before
isolated persistence implementation. No approval-bearing activation without decisions.

Recommended commits only: shared parser+new intent module; negative tests/regression;
contracts/report/next prompt. No commit/push/merge/PR or existing Docker stack changes.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
