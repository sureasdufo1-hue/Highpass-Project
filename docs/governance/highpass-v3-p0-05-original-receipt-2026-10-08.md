# P0-05 original creation receipt and expired retry audit

2026-10-08 KST / HEAD 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + dirty tree.
Status: scoped implementation tested / P0-05 IN PROGRESS / DRAFT / UNASSIGNED.
Earlier 김범희 legacy r3 review does not cover these changes.
Requirements: V3-FR-EX-005/006/007, V3-SR-TEN-001/003, V3-SR-AUTH-003/004,
V3-AT-EX-005; legacy FR-014~025/037~041.

## Existing structure and implemented change

Session service previously rejected elapsed input before reading its idempotency
ledger, and reconstructed receipt lifecycle fields from the current Session row.
The immutable ledger already preserves response_state/version/created_at.

- src/v3-exchange-session-contract.js: exact authenticated structural parsing separated
  from fresh-request finite lifetime eligibility. Existing public prepare validator
  still rejects elapsed fresh commands. No input flag can bypass fresh validation.
- src/v3-exchange-session-service.js: read original typed receipt fields from scoped
  ledger; initial INSERT RETURNING supplies the same representation. Verify ledger
  identity/timestamp/version and immutable request/scope digest before returning.
  Original updatedAt is original createdAt, not later mutation time.
- Absent ledger: validate fresh lifetime against authoritative DB clock before INSERT;
  existing DB RLS repeats finite expiry enforcement. No expired new Session is allowed.
- Existing ledger: digest conflict remains409; recheck current actor/source/reference/
  institution authority and eligibility. Exact elapsed replay commits SESSION_EXPIRED
  DENY audit then uniform404; audit fault yields503, never receipt or success.
- test/v3-exchange-session-service.test.js and scripts/v3-identity-transaction-check.js:
  parsing, malformed receipts, later current-state reconstruction, immutable terminal
  ledgers, elapsed HTTP retry/fault and cancellation-before-deadline checks.

No API path/body/response shape change. Existing create screen/handler still receives
REQUESTED/v1 metadata or safe errors; test fixture only, runtime not activated.
Actual current replay still requires REQUESTED/v1. A pure READY/version5 fixture tests
reconstruction only and does not demonstrate an authorized live transition.

## Verification

| Command | Result | Scope |
|---|---|---|
| node --test test/v3-exchange-session-contract.test.js test/v3-exchange-session-service.test.js | PASS / exit0 | 11 tests, 601.7498ms |
| node --test test/privacy-filter.test.js | PASS / exit0 | 21 tests, 4,507.344ms; diagnostic rerun |
| node --test --test-concurrency=1 | PASS / exit0 | all352, fail/skip0, 70,594.1813ms |
| node scripts/v3-identity-transaction-check.js | PASS / exit0 | 197 real nonowner PG/loopback checks, 48,966ms |
| node scripts/verify-evidence-manifest.js <final manifest> | PASS / exit0 | 1 digest, DRAFT/UNASSIGNED |
| node --check <contract/service/helper> | PASS / exit0 | 3 current sources |
| git diff --check | PASS / exit0 | tracked diff whitespace |

Final evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T22-41-04-155Z-d8b183fa/manifest.json.
The directory uses UTC; report date is KST 2026-10-08.
Manifest SHA256 79a571e9243498a9278aa182f734d762d54376dd512a2fddca28bece9fbdfe74.
35 source hashes stable; cleanup PASS. Cached
PostgreSQL16 isolated tmpfs with dedicated nonowner roles; no existing DB migration.

Actual checks include effective-expiry replay denial/audit, fresh elapsed creation
rejection, HTTP404/503, unchanged ledger across CANCELLED/EXPIRED, one terminal event,
and cancellation committed before deadline remaining CANCELLED after expiry scan.
Malformed ledger and later nonterminal receipt reconstruction are unit-controlled;
live nonterminal lifecycle, current HTTPS/mTLS runtime and full MVP E2E are NOT VERIFIED.

## Preserved intermediate results

Two default-concurrency node --test executions: 351/352, exit1, respectively
40,680.9699ms and 41,380.3305ms. The existing Privacy Filter fake-Python bridge readiness/
MODEL_TIMEOUT test failed. Standalone21 PASS and later entire serial352 PASS do not
rewrite those results. Test selection and runtime timeout were not weakened; only
runner concurrency was limited. Default-concurrency load sensitivity remains a risk.

PG intermediate evidence hp-v3-identity-tx-2026-10-07T22-39-05-844Z-58b0b97b:
193 checks PASS but cleanup NOT VERIFIED, overall NOT VERIFIED/exit1, 94,674ms.
Later exact-container read-only inspection reported no such container. This confirms
subsequent absence but does not retroactively change the cleanup command result.
Final independent fixture197 PASS and cleanup PASS supersede current coverage only.

## Security review and remaining work

Source-scoped keyed digests, registry locks, RLS, immutable triggers and audit atomicity
remain. No raw idempotency key/token/PHI is added to receipt/audit. Final evidence private
key/JWT patterns: 0 matches; tracked key/pem/p12/pfx paths: 0. Narrow checks, not a
comprehensive secret/privacy audit. No TLS/mTLS bypass, dependencies or lockfile changes.

New evidence DRAFT/UNASSIGNED. PIPA/ISMS-P/hospital approvals remain DEFERRED; external
IdP/KMS/PACS and DB TLS production integration remain external-resource gates.
Complete clinical state/Consent/Grant/membership and actual cascade acknowledgements,
deployed worker drain, runtime rebuilding/HTTPS/mTLS and new human review remain pending.

Recommended commits only: 1) parser/receipt service + unit tests, 2) real PG/HTTP
regression cases, 3) contract/plan/report and next prompt. No commit/push/merge/PR.

Next prompt written and initial inspection executed:
[lifecycle dependency alignment](../implementation/highpass-v3-p0-05-lifecycle-dependency-prompt.md).
This is not whole P0-05 or whole MVP/v3 completion.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
