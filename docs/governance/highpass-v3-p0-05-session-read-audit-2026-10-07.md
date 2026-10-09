# P0-05 Session metadata read / denial audit / requested actions

Date: 2026-10-07. HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + dirty worktree.
Status: INTERNAL READ/CREATE VERIFIED; HTTP/state/cancel/clinical access NOT VERIFIED.
Review: DRAFT / UNASSIGNED. 김범희의 기존 r3 검토를 새 변경에 승계하지 않는다.

## Implemented scope

- Dedicated exchange:read service validates branded active principal, visible active
  participant/patient binding, finite expiry and live source reference. INVITED target
  remains denied; missing/foreign/expired resources return uniform 404.
- Metadata is whitelisted; canonical resource digest is checked. Read ALLOW and typed
  DENY audits commit in the same transaction; audit failure rolls back and denies.
- 013 adds read-lock-only RLS and read-audit INSERT authority, not clinical capability.
  Conflict audit uses IDEMPOTENCY_CONFLICT; unavailable ref/target have distinct reasons.
- 014 records immutable requested_actions. New commands require 1~4 unique AccessAction
  values. Old rows keep empty NOT CAPTURED; no inferred consent/Grant/default VIEW.
  OpenAPI/API/ERD/architecture are aligned. Later Consent/Grant enforcement is pending.
- Actual PG proves patient binding drift denial, patient metadata without admin audit,
  Doctor create/read, deleted ref denial, expiry denial audit, and a two-connection
  target suspension race observed via pg_blocking_pids (not a sleep-only assumption).
- Timed-out Docker launch cleanup now resolves exact fixture name/ownership label.

Related requirements: FR-014~025/037~041; v3 Session, tenant isolation and audit contracts.
Metadata read is not a DICOMweb permission or completed Consent/Grant workflow.

## Commands and evidence

| Command | Exit | Result |
|---|---|---|
| node --test test/v3-exchange-session-contract.test.js test/v3-exchange-session-service.test.js test/v3-exchange-read.test.js | 0 | 13 PASS, 656.5329ms |
| node --test | 0 | 333 PASS, 0 FAIL/skip, 40411.3536ms |
| node scripts/v3-identity-transaction-check.js (first attempt) | 1 | NOT VERIFIED, Docker start timeout; no DB checks |
| node scripts/v3-identity-transaction-check.js (retry) | 0 | 122 PASS, 41594ms, source unchanged, cleanup PASS |
| node scripts/verify-evidence-manifest.js <latest manifest> | 0 | 1 digest verified, DRAFT/UNASSIGNED |
| node scripts/security-secret-scan.js | 0 | PASS, no findings |
| git diff --check | 0 | No whitespace errors; CRLF notices only |

Latest evidence: `evidence/generated/hp-v3-identity-tx-2026-10-07T13-16-52-479Z-505efa97/manifest.json`.
Manifest SHA-256: `dcbc529b6d84fad8d95839e6e079ad6f8f4e87467491df4d5c5cb7678eb4eb18`.
27 covered source hashes stayed unchanged during the run; this does not attest every
dirty file. 014 SHA-256: `021f292aeebfae40013bf5fb4f5ad6b9cb8a94c8f17307302d8b337d0b898b7d`.

First failed evidence retained:
`evidence/generated/hp-v3-identity-tx-2026-10-07T13-15-07-043Z-94c99eab/manifest.json`.
The run CLI timed out but its exact labelled container later existed. It was inspected
and removed with docker rm -f -v; only this tmpfs synthetic fixture was removed, not
project containers or persistent data. Its historical cleanup NOT VERIFIED is not rewritten.
Earlier helper syntax collision was fixed before Docker launch; no PASS claimed for it.

## Limits and next gate

No existing server/DB activation, clinical route, recipient approval, state transition,
cancel/revoke cascade, outbox delivery/hash-chain integration, live HTTPS/mTLS or full
MVP/v3 claim. Malformed/pre-auth requests are not claimed to have DB audit events.
Expiry checks deny metadata but do not mutate Session state to EXPIRED.
Actual OpenAPI runtime conformance and complete YAML validation remain separate checks.

Next prompt: [Session HTTP adapter](../implementation/highpass-v3-p0-05-session-http-prompt.md).

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
