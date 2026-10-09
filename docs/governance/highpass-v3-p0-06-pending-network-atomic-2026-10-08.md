# P0-06 strict atomic domain/network audit path

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

## Changes

Opaque network audit input is private, frozen and bound to authenticated actor,
tenant/hospital, exact request and audit correlation. Server-generated trace binds
once; correlation/header mutation, clones, wrong principal, expiry and disposal
reject. Existing two-field correlation API is unchanged; input is separate internal
service argument. No raw request, token or freely supplied facts are service authority.

Added src/v3-pending-network-audit.js. Strict preparation service requires live input
before transaction admission; appendPendingAudit's actual eventId drives network
insertion in that same transaction. Transaction dispatcher checks live input again
immediately before COMMIT. Network helper checks before and after async insert.
The capstone edge refuses services without privately configured required audit.
Original six-field receipt/creation FK, RLS and nonnetwork internal tests preserved.
No new runtime route, existing DB/stack mutation, clinical state or approval.

## Verification

Focused Node41/41 PASS exit0. Includes input/principal/correlation forgery, helper
affected-row/disposal failures, pre-COMMIT guard rollback and strict service refusing
missing input before pool acquisition. Unit sockets/mock DB do not prove actual PG
expiry or ambiguous network COMMIT races.

Actual complete proxy/backend/nonowner PG322/322 PASS exit0,66,488 ms,
sourceUnchanged=true, owned cleanup PASS. [Manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-48-19-489Z-d6a95620/manifest.json)
independently matches transaction SHA-256, SHA59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc
dirty worktree. Public certificate hashes only, no key material captured.
Normal/create/replay stored observed loopback IP and dedicated public certificate
fingerprint. Network INSERT fault503 rolled back preparation, ledger, domain audit
and network row. Domain version denial412 persisted paired audit without a new
preparation. Privileged wrong correlation tuple failed23503 independently of RLS.

Two failed owned runs preserved:
[first](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-45-31-542Z-29e95ec3/manifest.json),
[second](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-46-54-076Z-1e86491f/manifest.json).
Fixture reused an existing idempotency key with changed If-Match and expected412;
correct service classifies changed command409 before version check. New key isolates
version denial. Fault injection now revokes the explicitly granted INSERT columns;
no production policy/timeout weakened. Both failed-run cleanup PASS.

Full serial Node regression402/402 PASS exit0,fail/skip0,70,627.5609 ms.
Documentation checker42 documents/130 links PASS (links/labels only), whitespace
check exit0. Earlier DPoP timeout failure and recovered396 full run remain preserved;
intermittent cause unresolved. Latest DPoP HTTP test36,550.3012 ms passed.

## Next gate and limitations

[Atomic race verification prompt](../implementation/highpass-v3-p0-06-pending-network-atomic-races-prompt.md)
written and source inspection started. Admission after acquisition/DB lock before
callback needs an explicit recheck; current pre-insert/pre-COMMIT guards already
rollback invalid authority but must not substitute for that earlier boundary.
Strict actual PG expiry/disposal, lost COMMIT ACK/retry/concurrent network counts,
maintenance/foreign visibility remain NOT VERIFIED. Existing generic tests are not
evidence for these paired-network paths. Separate pre-auth security sink/hash-chain/
SIEM, human PoP, actual MFA/IdP and D1..D6 remain open; overall MVP/v3 IN PROGRESS.

김범희2026-10-08 approval covers synthetic integration preparation only, not
independent review of new evidence or legal/hospital/production readiness.
No commit/push/merge/PR, real patient data, TLS relaxation or secret output.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
