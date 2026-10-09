# P0-05 atomic cancellation / safe retry gate

2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + dirty worktree.
Result: REQUESTED cancellation ISOLATED PG/HTTP VERIFIED; overall state-machine gate IN PROGRESS.
Evidence DRAFT / UNASSIGNED; previous 김범희 r3 review does not cover new code.
Related V3-FR-EX-003/006/007; V3-AT-EX-003; FR-014~025/037~041.

## Changes and security

- 015 additive migration preserves FORCE RLS, immutable identity/resources/actions,
  participants and creation ledger/context. Only Session guard changes: exact
  REQUESTED/v1 -> CANCELLED/v2. Terminal reopening and READY shortcuts deny.
- New immutable state-event/cancel-result/cascade tables and deferred proof bind state,
  version, timestamp, actor, audit FK and durable cascade REQUEST. Missing pieces roll
  back the mutation. Restrictive audit policy prevents permissive create/read policies
  bypassing cancellation authority. Nonowner fixture gets minimum UPDATE columns.
- V3ExchangeCancelService has authenticated principal/source/patient/requester checks,
  finite transactions, scoped HMAC digests, advisory/row locks, If-Match, precise denial
  audit and safe metadata receipt. No raw keys/comments/tokens in ledger/audit.
- Same-key retry returns original cancellation receipt; different command409, stale412,
  terminal409, invited/foreign404. Actual COMMIT lost ACK retry creates no duplicate.
- Create retry of cancelled Session commits DENY audit and cannot resurrect it.
  Eligible nonterminal receipt remains REQUESTED/v1; broader future receipt lifecycle pending.
- Injection-only cancel HTTP: 4096-byte/maximum5s body, duplicate headers, strong
  If-Match, role/scope and no-store Problem response. Read audit carries actual version2.
  No existing src/server.js registration or runtime DB migration performed.

## Commands / evidence

| Command | Exit/result |
|---|---|
| node --check cancel service / HTTP adapter / PG helper | 0 |
| node --test cancel contract/read (initial) | 0 / 8 PASS |
| node --test cancel contract/service/read/HTTP reader | 0 / 15 PASS |
| node --test | 0 / 344 PASS, 0 FAIL/skip, 40020.6499ms |
| node scripts/v3-identity-transaction-check.js (final) | 0 / 169 PASS, 41478ms; cleanup PASS |
| node scripts/verify-evidence-manifest.js <final manifest> | 0 / 1 digest verified; DRAFT/UNASSIGNED |
| node scripts/security-secret-scan.js | 0 / PASS, no findings |
| git diff --check | 0; CRLF notices only |

Final manifest: `evidence/generated/hp-v3-identity-tx-2026-10-07T13-41-53-904Z-945d6b89/manifest.json`.
SHA-256: `18f3f83b745ed4eda4a9595a539f2503ef38f24f0cfa3c564864e64934df3594`.
31 covered source hashes unchanged during run; not whole dirty-tree attestation.
015 SHA-256: `a31fc289e0f46ccfa9d3b16eb67a8cf1ad51cae9ed3be7b7acef7df6483cb7ad`.
Intermediate PASS runs `...13-37-51-959Z-115938b1` and `...13-40-30-830Z-31a806da`
are retained; final evidence covers later Doctor/race checks. Node script entry guards
are not live E2E. Secret scanner is not proof of absence of all personal-data patterns.

Actual checks cover same-key concurrent calls, different-key one-success/one-stale race,
one audit/event/cascade/result, no create resurrection, version2 metadata audit,
conflict/stale/terminal, invited denial, cascade/audit failures, raw no-proof deferred23514,
unsupported READY, immutable purpose with temporary column grant, owner cascade delete,
terminal reopen, COMMIT lost ACK, HTTP200/replay/412/409/weak match/wrong scope,
patient binding drift/audit isolation, expired denial and requester Doctor HTTP.

## Remaining / next gate

Persisted EXPIRED worker; complete canonical clinical transitions; exhaustive mutation/
HTTP negatives; actual cascade delivery/Grant revoke/work cancellation; cross-institution
approval/membership; live v3 HTTPS/mTLS/DPoP; audit hash-chain delivery; external IdP/KMS/
DB TLS. A cascade REQUEST is not a delivery acknowledgement or readiness claim.
[Expiry/receipt prompt](../implementation/highpass-v3-p0-05-expiry-receipt-prompt.md) was
written and initial registry/SQL/ledger inspection executed. No commit/push/merge.
Full P0-05 and MVP/v3 are not complete.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
