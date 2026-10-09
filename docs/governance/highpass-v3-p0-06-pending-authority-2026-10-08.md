# P0-06 PENDING authority contract and retry timing result

2026-10-08 KST / DRAFT / UNASSIGNED / P0-06 IN PROGRESS.
Repository HEAD: 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + preserved dirty tree.
Previous human review does not approve these changes.

## Purpose / related requirements

Execute the prepared authority-contract prompt before persistence implementation.
Related V3-FR-CON-001/002, V3-FR-EX-005/006/007,
V3-SR-IAM-004/TEN-001..003/AUTH-001..004;
legacy FR-001..005/014..025/037..041.

## Analysis and decisions

The pure parser's matching selection is untrusted, not database authority.
Existing Session reads require exchange:read; creation directory requires
exchange:create. Neither may be added merely to make consent:write work.
Registry-first transactions and FORCE RLS remain required.

Created [authority/storage contract](../api/highpass-v3-consent-pending-authority-contract.md):
same-transaction server-selected source authority, persisted principal/reference/
institution checks, dedicated minimum-privilege preparation role, immutable staging,
typed audit and keyed original-receipt ledger. This is a proposed contract, not
applied SQL or patient approval. PENDING/UNVERIFIED never grants clinical access.
PA-01..09 define actual database, rollback, replay, integrity, race and transport tests.
Unresolved D1..D6 decisions are preserved.

Created [next implementation prompt](../implementation/highpass-v3-p0-06-pending-persistence-prompt.md)
and executed its first timing task. src/v3-consent-pending-contract.js now separates
structural parsing from FRESH/REPLAY clock validation. New requests reject elapsed
starts; a future service may select REPLAY only from a matching durable own ledger.
Eligible replay retains the exact window and intent; expired windows, forged intents
and malformed policy fail closed. The pure validator cannot prove ledger or DB authority.

## Files

New: authority contract, persistence prompt and this report.
Modified: pending parser/tests, pending input contract, API alignment, ERD,
master plan, authority execution prompt and lifecycle document checker.
No dependencies, lockfile, production route or TLS setting changed in this gate.
No existing DB migration, runtime role activation, commit, push, merge or PR.

## Actual verification

| Command | Exit / result | Evidence scope |
|---|---|---|
| node --test test/v3-consent-pending-contract.test.js test/v3-exchange-session-contract.test.js test/v3-exchange-session-service.test.js | 0 / PASS | 20 tests; 1,063.4303ms |
| node --test --test-concurrency=1 | 1 / FAIL | 361 tests; 360 PASS, 1 FAIL, 0 skipped; 100,918.2308ms |
| node --test test/dpop-enforcement.test.js | 0 / PASS | 4 tests; 38,817.1107ms; same per-request limits |
| node --test --test-concurrency=1 (full repeat) | 0 / PASS | 361/361; fail/skip0; 124,195.6172ms; unchanged limits |
| node scripts/v3-lifecycle-document-check.js | 0 / PASS | 14 Markdown targets, 95 local links after report links; labels/paths only |
| node --check src/v3-consent-pending-contract.js | 0 / PASS | syntax only |
| git diff --check | 0 / PASS | tracked whitespace; existing LF/CRLF warnings |

Full-suite failure: test/dpop-enforcement.test.js:80 protected HTTP route scenario
raised TimeoutError after 43,758.3165ms. A bounded per-request timeout is present.
This is a technical timeout, not an expected policy DENY. Root cause is not established;
no timeout or security requirement was relaxed. Isolated rerun outcome is recorded below.
Do not replace this failed full regression with an isolated PASS.

The second full serial execution subsequently passed all 361 tests with unchanged
source, security checks and timeout limits. Latest full run is PASS, while the earlier
intermittent timeout remains an unresolved reliability risk, not a fixed root cause.

Inspection also found active rule-based tarpit delays on requests (src/server.js,
src/services.js), including up to 5 seconds per request, while this fixture submits
multiple intentional denials from the same IP. This explains some expected runtime
but does not by itself establish the timeout cause; the protection is unchanged.

Source SHA256: 53046ebb0d8d2c02b5d8ecf4e458e4c109d9b03c2764c650484716bc8dd69ae0.
Test SHA256: cd4b082783f00f7ce3dc1a7959df3f89cf7c09912bbfde5bc2627123933597ac.
These identify unit-tested sources, not signed approval.

## Security / remaining work

No raw evidence string is proposed for persistent receipt/audit storage; the proposed
keyed commitment is explicitly unverified and does not prove patient approval.
No real patient data or new secret is introduced. No global exhaustive secret/PHI
scan was performed in this gate. Existing user changes are retained.

Pending schema, nonowner RLS, storage service, atomic DENY audit, actual races,
HTTP/HTTPS/mTLS and runtime activation: NOT VERIFIED / NOT IMPLEMENTED here.
Previous 197-check PostgreSQL regression is historical Session/identity evidence,
not evidence of new pending persistence. Full MVP/v3 is not achieved.

Next: diagnose the intermittent DPoP timeout without weakening limits, then isolated
additive schema/RLS and staging service under the prepared persistence prompt.
Recommended commits only: parser/time negatives; authority/data/API contract;
verification report/next prompt. All new artifacts remain DRAFT / UNASSIGNED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
