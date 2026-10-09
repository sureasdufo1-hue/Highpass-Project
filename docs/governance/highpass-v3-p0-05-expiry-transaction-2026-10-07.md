# P0-05 persisted expiry transaction

2026-10-07 / HEAD 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + dirty working tree.
P0-05 IN PROGRESS. New evidence DRAFT / UNASSIGNED. Earlier 김범희 r3 review is not inherited.
Related V3-FR-EX-007, V3-FR-TEN-002/003, FR-014~025/037~041.

## Implemented scope

- 017 additive SQL: exact DB-time REQUESTED/v1 -> EXPIRED/v2; immutable identity,
  resources/actions and creation receipt; deferred state/event/audit/cascade proof.
- Distinct NOLOGIN clinical/expiry policy groups prevent the expiry planner from
  requiring clinical creation-context SELECT. Explicit isolated role memberships;
  dedicated nonowner/NOBYPASSRLS pool with column-level Session privileges.
- Bounded SKIP LOCKED batch; transaction deadline <=10s, max100/default25. Typed
  expiry audit and EXPIRY_REQUESTED outbox entry commit atomically; no raw clinical
  metadata in technical receipts. No new route, worker deployment or existing DB migration.
- Wrong clinical pool fails closed. close blocks new admission; drain not implemented.

Changed/added implementation: db/migrations/017_highpass_v3_exchange_expiry_events.sql,
src/v3-exchange-expiry-service.js, src/v3-exchange-audit.js,
scripts/v3-identity-transaction-check.js, test/v3-exchange-expiry-service.test.js.
Contract/API alignment and master plan updated. No package/lockfile or TLS weakening.

## Actual verification

| Command / test | Exit / result | Scope |
|---|---|---|
| node --check scripts/v3-identity-transaction-check.js | 0 / PASS | syntax |
| node --test test/v3-exchange-expiry-service.test.js test/v3-exchange-expiry-contract.test.js | 0 / PASS | 5 tests |
| node --test | 0 / PASS | 349 pass, 0 fail/skip; 38,438.2821ms |
| node scripts/v3-identity-transaction-check.js | 0 / PASS | 189 checks; 37,214ms including cleanup |
| node scripts/verify-evidence-manifest.js <manifest below> | 0 / PASS | 1 digest; DRAFT/UNASSIGNED |
| git diff --check | 0 / PASS | tracked diff whitespace; CRLF warnings retained |

Final evidence: evidence/generated/hp-v3-identity-tx-2026-10-07T14-11-07-988Z-3adae86f/manifest.json.
Manifest SHA256: 09b62e464f2ca4335abfbc53487d478da2b5dabba86eaf9057a0eb45b06ecda4.
35 source hashes unchanged across validation. Cached postgres16-alpine isolated
tmpfs fixture; dedicated app/expiry roles, actual PG concurrency and loopback HTTP.
Not current runtime HTTPS/mTLS or full application E2E. Cleanup PASS; other stacks untouched.

Expiry tests cover full Session SELECT denial, duplicate concurrent worker prevention,
state/event/audit/cascade correlation, metadata denial after expiry, clinical-pool
refusal, audit/cascade privilege faults rolling back state/event, and actual COMMIT
followed by injected lost ACK. Retry does not duplicate the event. Lost receipt is
not redelivered; the next scan returns processed0. After-deadline cancellation races
deny cancellation (expired or stale version) and leave one EXPIRED event.
No before-deadline cancellation winner is claimed.

Final evidence private-key/JWT-pattern scan: 0 matches; tracked *.key/*.pem/*.p12/*.pfx
paths: 0. These are narrow pattern/path checks, not an exhaustive independent audit.

## Preserved failed runs

- 14-00-13-425Z-e805d987: NOT VERIFIED / database unavailable. Earlier safe fault
  diagnostic was stale; no policy DENY/PASS inferred from it.
- 14-02-14-495Z-7a65a95f: NOT VERIFIED / 42501 exchange_creation_context. Clinical
  PUBLIC policy planning demanded a clinical table; fixed by separate policy groups,
  not by granting clinical SELECT to the maintenance pool.
- 14-04-41-468Z-89543f5a: NOT VERIFIED / 42501 valid_exchange_actions. Granted the
  pure CHECK validator function only; no clinical data privilege added.
- 14-06-53-610Z-30759be2: intermediate PASS before the final race coverage.

All directories retain the prefix evidence/generated/hp-v3-identity-tx-2026-10-07T.
Historical files/results are not rewritten as PASS.

## Remaining gates / recommended commit grouping

Original typed creation receipt lifecycle; graceful batch drain/scheduler; full SQL
mutation and HTTP negative matrix; complete canonical clinical state/Consent/Grant
dependencies; actual cascade delivery/Grant revoke/work cancellation; cross-institution
membership; current runtime image/HTTPS/mTLS/hash-chain/outbox delivery; external IdP,
KMS and DB TLS verify-full remain NOT VERIFIED or pending. Full MVP/v3 not achieved.

Recommended commits only: 1) 017 policy/guard + typed service/audit, 2) isolated role and
fault/concurrency verification + unit tests, 3) contracts/report/next prompt. Existing
dirty changes need separate review. No commit/push/merge/PR performed.

Next: execute [receipt/drain prompt](../implementation/highpass-v3-p0-05-receipt-drain-prompt.md).

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
