# P0-06 preparation secure-edge verification

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY / NOT DEPLOYED.

## Scope and changes

Related V3-SR-IAM-001..004, TEN-001..003/AUTH-001..004,
V3-FR-CON-001/002; legacy FR-001..005/014..020/037..041.
The injection-only capstone wrapper requires an authorized client TLS chain,
dedicated proxy URI SAN/clientAuth EKU, authenticated ingress metadata and
registry-verified JWT containing explicit synthetic mock-MFA claims. No existing
server routes, runtime database, Consent/Grant state, or approval ceremony changed.

Added test/v3-pending-secure-edge.test.js and
scripts/test-support/v3-pending-secure-edge-fixture.js; updated projection fixture
and transaction evidence source/public-certificate hashes. Existing user edits
preserved; no commit, push, merge or PR.

## Actual verification

| Command | Exit | Result and scope |
| --- | --- | --- |
| node --test test/v3-pending-secure-edge.test.js test/v3-pending-http-handler.test.js | 0 | PASS 15 tests; actual TLS/proxy, mocked persistence |
| node --test --test-concurrency=1 | 0 | PASS 389; 72,970.3654 ms; not live staging/full MVP |
| node scripts/v3-identity-transaction-check.js | 0 | PASS 294 actual PG checks; 67,273 ms |
| node scripts/v3-lifecycle-document-check.js | 0 | PASS existing 29 documents/115 links; does not cover this new report |
| git diff --check | 0 | PASS whitespace check; untracked files not covered |

Actual PG additions cover dedicated client mTLS/ingress/mock-MFA to nonowner
storage, exact original receipt retry, missing/forged/stale metadata, missing and
single-factor mock assurance, trusted wrong-role Gateway client, no-client,
untrusted and expired-client denial and absence of preparation/domain-audit writes
after pre-callback rejection. Actual frontend proxy test replaces forged forwarded
headers, but uses mocked persistence. These are distinct evidence scopes.

Manifest: [latest transaction evidence](../../evidence/generated/hp-v3-identity-tx-2026-10-08T00-22-13-333Z-3ac0dbc5/manifest.json).
Repository SHA 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc, dirty worktree; sourceUnchanged=true;
independent SHA-256 comparison matched; owned container cleanup PASS.

## Development certificate

Dedicated proxy subject CN=highpass-pending-edge-dev-proxy; issuer
CN=hipass-dev-root-ca; URI SAN spiffe://highpass.local/dev/pending-edge-proxy;
clientAuth EKU. Valid 2026-10-08 00:16:19 UTC to 2026-11-08 00:16:19 UTC.
Fingerprint SHA-256:
70:76:CA:A7:40:19:E1:FA:5F:4A:50:CA:18:44:A7:78:48:1C:AC:DF:E6:CE:0B:1E:4F:25:90:50:84:3E:AC:B8.
Actual certificate/private-key match and CA signature checked in memory; private
key remains Git-ignored under tmp/. Private bytes and key hashes are not evidence.
Existing CA/runtime certificates were not replaced. No runtime rollback asserted.

## Remaining gates

Combined actual frontend -> mTLS backend -> nonowner PG: NOT VERIFIED as one path.
TLS negatives reject before persistence, but tests permit ECONNRESET; exact
server-side certificate rejection reason is NOT VERIFIED for that branch.
Certificate generator subprocess deadlines need review. Fresh machine requires
explicit local development fixture provisioning; missing files fail, not skip.

Authoritative ingress IP/proxy identity and pre-auth security-denial durable audit,
hash-chain/SIEM delivery: NOT VERIFIED. Domain outbox correlation does not establish
these properties. Human preparation PoP/DPoP binding: NOT VERIFIED; HMAC metadata
does not bind body/idempotency or prove possession of a human JWT signing key.
Mock-MFA is not actual MFA. External IdP and production certificate lifecycle are
separate prerequisites. D1..D6 clinical ceremony unresolved; full MVP/v3 IN PROGRESS.

Next prompt: [combined proxy/PG and audit alignment](../implementation/highpass-v3-p0-06-pending-proxy-pg-audit-prompt.md).
Initial inspection executed: migration018/appendPendingAudit have server-bound
actor/tenant/hospital/correlation but no authoritative network context. No new
audit schema or production authentication contract silently activated.

김범희's 2026-10-08 approval covers synthetic nonoperating integration preparation
and technical verification, not independent review of this new evidence, real
patient data, hospital approval, legal compliance or production deployment.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
