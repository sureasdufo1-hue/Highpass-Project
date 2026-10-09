# P0-06 regression recovery and network audit SQL foundation

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004 and FIX-006/TST-001.

## Verification chronology

Previous full Node396 run:395PASS/1FAIL due DPoP HTTP TimeoutError, retained.
Focused reproduction4/4 PASS did not identify cause. Latest full serial Node run
with safe operation diagnostics:396/396 PASS, fail/skip0, exit0,98,456.7504 ms.
DPoP HTTP test37,201.3682 ms. No timeout or security policy relaxed. The latest full
run recovered; intermittent root cause is STILL UNRESOLVED, not a proven fix.

After that run, added migration021, owned network schema fixture and transaction
runner/projection fixture integration. Application service/handler code unchanged.
Actual owned PG318/318 PASS exit0,93,098 ms. [Manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-40-37-726Z-7ecdab99/manifest.json)
independently matches transaction JSON SHA-256; sourceUnchanged=true, cleanup PASS.
SHA59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc, dirty worktree. Historical evidence
and earlier failure remain preserved; new evidence DRAFT/UNASSIGNED.

## Implemented SQL scope

db/migrations/021_highpass_v3_pending_network_audit.sql adds a network audit table
referencing complete event/tenant/hospital/actor/auditSession/trace domain tuple.
Host-only inet IP, fixed capstone ingress mode,32-byte public fingerprint and finite
observed/recorded timestamp window are constrained. FORCE RLS permits dedicated
pending actor SELECT/INSERT only; privileged mutation also fails immutable trigger.
Existing creation FK and historical records unchanged; no backfill/runtime grants.

Owned nonowner SQL tests cover matching tuple insert/read, foreign tenant,
wrong/missing domain correlation, subnet IP, bad mode/fingerprint, no-context
invisibility and UPDATE/DELETE refusal. Public-grant/RLS and migration rollback
checks pass. Wrong tuple can be denied at RLS before FK; privileged FK-specific
negative, maintenance/cross-tenant variants and helper/transaction faults remain.

These rows are explicit SQL integrity fixtures using synthetic loopback metadata,
not proof that application HTTP requests automatically stored authoritative facts.
Application context admission and atomic domain/network insertion are NOT IMPLEMENTED.
No public APIs or receipts project this table or IP. No security-sink/hash-chain/
SIEM, actual MFA/IdP, human PoP or clinical approval claim.

## Next gate started

[Strict helper/atomic writes prompt](../implementation/highpass-v3-p0-06-pending-network-audit-helper-prompt.md)
written and source inspection executed: appendPendingAudit returns eventId, but
current prepare only accepts strict two-field correlation and ignores network
facts; deny/replay event IDs are not yet used for network rows. Preserve original
receipt while admitting only private request/correlation-bound context. Validate
before storage and commit; audit insertion fault must roll back all preparation.

Full MVP/v3 IN PROGRESS; D1..D6 unresolved. 김범희2026-10-08 approval is scoped
synthetic integration preparation, not independent review of new evidence or
hospital/legal/production approval. No commit/push/merge/PR or existing DB/stack
changes. Owned disposable container removed and exact absence verified.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
