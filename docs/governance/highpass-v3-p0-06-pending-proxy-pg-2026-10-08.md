# P0-06 complete isolated proxy/backend/PG verification

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY / NOT DEPLOYED.
Related V3-SR-IAM-001..004, TEN-001..003/AUTH-001..004,
V3-FR-CON-001/002; legacy FR-001..005/014..020/037..041.

## Actual result

The owned synthetic fixture now verifies actual HTTPS frontend -> dedicated client
mTLS backend -> real registry/service -> nonowner PostgreSQL as a single path.
Normal and exact receipt retry return201 with one new preparation; forged client
forwarding/signature fields are replaced by observed HTTPS-hop information.
Missing mock assurance, unknown principal and missing authorization return403
through this same proxy. Existing direct backend negative matrix remains covered.
No existing deployment, user database, clinical state, runtime route or approval
ceremony changed. This is NOT external Staging or full MVP evidence.

Node transaction command exit0, 305/305 PASS, 81,753 ms, sourceUnchanged=true,
owned container cleanup PASS. [Manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-25-20-651Z-e241ca14/manifest.json)
independently matched the transaction JSON SHA-256. Repository SHA remains
59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc with dirty worktree.
Historical294 evidence preserved and not retrospectively enlarged.

Certificate negatives now observe server tlsClientError authentication failure
and no application callback, in addition to client TLS error and no persistence.
An expired-fixture public validity check is required. Connection reset alone is
no longer sufficient evidence of policy denial. Fixed failure classifications are
kept separate from DNS, connection refused and timeout. Tests do not capture raw
TLS exception messages, private keys or bearer values as evidence.

## Generator hardening

scripts/generate-pending-proxy-dev-cert.ps1 uses hidden owned OpenSSL subprocesses
with30-second deadlines and bounded termination wait. Existing output refusal,
31..90-day duration, existing CA/serial preservation and ignored key storage remain.
PowerShell parser PASS; actual helper success and nonzero-failure handling PASS.
Owned synthetic35-second child stopped by30-second deadline PASS. First timeout
test setup used a nonexistent PSHOME/powershell.exe and failed before launch;
corrected explicitly verified Windows PowerShell path passed. No certificate was
overwritten or reissued for this diagnostic test.

## Regression and remaining work

Focused Node transport/secure-edge15/15 PASS exit0. Full serial Node regression
389/389 PASS exit0, fail/skip0,114,639.2178 ms. Documentation checker now covers
35 documents/119 local links PASS including this report; scope is links/labels,
not semantic API review or human approval. Existing generator outputs were refused
with nonzero exit and unchanged public certificate hash; no key bytes inspected.

Authoritative network audit contract drafted, not implemented. Current edge
discards verified network facts before the domain helper; traceId alone does not
prove trusted source IP. No durable pre-auth security sink, hash-chain or SIEM
delivery claim. Human preparation proof binding and actual MFA/IdP remain separate.
New [network-provenance execution prompt](../implementation/highpass-v3-p0-06-pending-network-provenance-prompt.md)
has begun with handler/service/outbox inspection; context must be request-bound and
unforgeable before additive transactional storage is claimed.

Overall MVP/v3 IN PROGRESS; D1..D6 unresolved; new evidence DRAFT/UNASSIGNED.
김범희's2026-10-08 synthetic integration approval is not independent review of
these new changes, actual hospital/legal approval or production permission.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
