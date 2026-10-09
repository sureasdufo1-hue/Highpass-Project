# P0-05 Session HTTP adapter verification

2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + dirty tree.
Result: ISOLATED HTTP/PG VERIFIED; NOT RUNTIME ACTIVATED; overall P0-05 IN PROGRESS.
Review DRAFT / UNASSIGNED; no inheritance of the earlier 김범희 r3 approval.

## Changes and security scope

New `src/v3-exchange-http-handler.js` injects real principal registry and create/read
services. POST/GET implement target Session contracts on isolated ephemeral HTTP only.
Server-bound scopes/roles precede service operations. Header/body/query/path errors
are safely rejected without raw tokens, SQL, stack or internal paths in responses.
Responses are no-store; rejected sockets close; body listeners/timers are cleaned up.

The body ceiling is 4MiB, maximum deadline 5s, nesting depth 32. This supports canonical
compact 100 Study x500 Series selections, demonstrated through actual PG HTTP.
Extra whitespace/escaped expansion beyond the wire ceiling is 413, not unlimited input.
Duplicate decoded JSON keys (including escaped aliases) at any depth deny 422.
GET bodies, percent-encoded/dot paths, query tokens and duplicate sensitive headers
are refused. Tests distinguish malformed422 from principal/source mismatch403.

Related FR-014~025/037~041 and V3 Session/tenant/audit contracts. No new clinical access,
Grant, consent, recipient activation, migration to existing DB, or legacy UI replacement.
Malformed/pre-auth failures are not represented as successfully persisted DB audits.

## Verification

| Command | Exit/result | Evidence scope |
|---|---|---|
| node --test test/v3-exchange-http-handler.test.js | 0 / 4 PASS | Parser, max canonical selection, UTF8/size/abort/deadline |
| node --test affected four Session test files | 0 / 17 PASS, 585.6632ms | Reader and existing Session contract/services |
| node --test | 0 / 337 PASS, 0 fail/skip, 39001.1109ms | Unit/integration; live script guards are not live E2E |
| node scripts/v3-identity-transaction-check.js (final) | 0 / 141 PASS, 32732ms | Actual nonowner PG + ephemeral HTTP, source unchanged, cleanup PASS |
| node scripts/verify-evidence-manifest.js <final manifest> | 0 / PASS | 1 digest; DRAFT/UNASSIGNED |
| node scripts/security-secret-scan.js | 0 / PASS | No findings; not proof of absence of all possible personal data |
| git diff --check | 0 | No whitespace errors; CRLF notices only |

Final manifest: `evidence/generated/hp-v3-identity-tx-2026-10-07T13-25-16-463Z-6e5854bb/manifest.json`.
SHA-256: `d6345cfa1f8837a86c861ee0782355daf590f012f3819dbb5659b2f73f1715e1`.
28 covered source hashes unchanged during validation, not whole-worktree attestation.

HTTP checks include create/retry/changed-action conflict, metadata GET, patient and
Doctor initiation, binding/source spoof denial, INVITED/missing uniform404, auth/scope,
expiry/deleted ref, duplicate keys/headers, slow408, GET body rejection, declared-size413,
maximum resource selection and audit persistence failure503 without metadata.
Actual undeclared oversized chunks/aborted bodies were reader-tested, not separately
attested through PG HTTP; live HTTPS/mTLS and public-route conformance remain unverified.

## Retained intermediate results

- `...13-21-38-232Z-a9a3d4e0`: basic HTTP/PG PASS before expanded matrix.
- `...13-23-04-078Z-0c56cf66`: FAIL because test expected422 for spoofing that correctly
  returned403. Corrected expectation only; no authorization weakening.
- `...13-24-13-909Z-ed12e1cf`: NOT VERIFIED when oversized fetch upload interrupted before
  client response read. No policy DENY/PASS inferred from transport failure. Subsequent
  raw request with oversized declared Content-Length proves explicit413 before upload.
  The historical raw transport cause was not captured and remains unclassified.
- Every fixture cleanup reported PASS. Intermediate evidence remains preserved.

## Next gate

[State/cancel execution prompt](../implementation/highpass-v3-p0-05-session-state-cancel-prompt.md).
Consent/Grant and clinical transitions require their actual prerequisites; never set
AUTHORIZED/READY merely because metadata HTTP passed. No full MVP/v3 completion claim.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
