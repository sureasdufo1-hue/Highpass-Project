# P0-06 request-bound network provenance

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

## Implemented change

Added src/v3-pending-network-context.js and six dedicated unit tests. Refactored
the injection-only capstone edge to use the same TLS/ingress verifier rather than
duplicate it. The strict injected HTTP handler validates branded authority and
rechecks network context after async body parsing, before preparation service.
Added a handler test proving post-capture correlation mutation denies503 without
calling preparation; unchanged request reaches201. No network facts enter receipts.

Opaque frozen capabilities live in private WeakMaps, bound to exact request/socket
and sensitive header digest. Clone, plain JSON, another request/factory, request
mutation, replacement, deadline/clock rewind and disposal cannot supply authority.
Facts contain normalized IP, fixed test ingress mode, public certificate fingerprint
and observation time only. The original ingress key is copied and disposal zeroizes
the private copy. No bearer/raw key/JA3/body/clinical data is stored in facts.
The module is a trusted-server API, not defense against compromised server code.

## Actual evidence

Focused tests22/22 PASS exit0. Initial21-test run was20PASS/1FAIL because its test
incorrectly expected undefined instead of rejection for an unminted request; test
expectation corrected, no production guard weakened. Fail output retained in chat.

Actual complete HTTPS proxy/mTLS/backend/nonowner PG regression305/305 PASS exit0,
89,093 ms, sourceUnchanged=true, cleanup PASS. [Manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-32-18-126Z-e1eb7d86/manifest.json)
independently matched transaction JSON SHA-256; includes new module source hash.
SHA59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc, dirty worktree. Previous evidence
preserved. Public certificate bytes only are hashed, not private keys.
Full serial Node regression exit1:396 tests,395 PASS/1 FAIL,78,929.5475 ms.
The existing FIX-006 protected HTTP route test failed with request TimeoutError;
new provenance/handler tests passed. Overall full regression is FAIL, not PASS.
Added fixed safe operation labels to its test diagnostics without changing request
deadline, DPoP/ingress checks or production security controls. Focused reproduction
node --test test/dpop-enforcement.test.js exited0 with4/4 PASS,37,836.5451 ms.
It does not retroactively erase the failed full run or prove the intermittent
timeout fixed. No causal transport operation was reproduced; root cause unresolved.
Observed default tarpit maximum5000 ms and no relevant inherited environment
overrides; this is not evidence that tarpit caused the timeout. Before persistence,
[diagnostic stability gate](../implementation/highpass-dpop-http-timeout-diagnostics-prompt.md)
must rerun full regression with safe operation labels and preserve failures.
Documentation link/coverage checker37 documents/123 links PASS before this update;
runtime, semantic API and independent human review are not proved by that checker.

## Remaining contract and next execution

Network persistence is NOT IMPLEMENTED: preparation service/outbox still accepts
only domain correlation, not these network facts. Updated additive audit design
aligns inet IP/public fingerprint, complete event/authority/correlation FK, pending
FORCE RLS/immutable SELECT+INSERT scope, transaction rollback and replay audit with
unchanged original receipt. No migration, runtime privileges or deployment added.

[Next persistence prompt](../implementation/highpass-v3-p0-06-pending-network-audit-persistence-prompt.md)
started with actual service/helper and migration018..020 inspection. Existing
creation FK must be preserved; separate referenced tuple required for network rows.
Pre-auth security sink/durable delivery/hash-chain/SIEM, human PoP and actual MFA/
IdP remain separate gates. D1..D6 unresolved; full MVP/v3 IN PROGRESS.
Kim Bumhee/김범희2026-10-08 synthetic integration approval is not independent
review of this new evidence or hospital/legal/production approval.

No commit/push/merge/PR, clinical activation, existing runtime DB/stack change,
actual patient data, TLS relaxation or secret output performed.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
