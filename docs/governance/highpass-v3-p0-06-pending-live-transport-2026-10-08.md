# P0-06 actual preparation HTTP-to-PG and isolated HTTPS

2026-10-08 / DRAFT / UNASSIGNED / IN PROGRESS.
HEAD59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc plus preserved dirty worktree.
Related V3-FR-CON-001/002, EX-005/006/007; V3-SR-IAM-001/004,
TEN-001..003/AUTH-001..004; FR-001..005/014..020/037..041.

## Implemented scope / security review

New scripts/test-support/v3-pending-http-fixture.js invokes the real pending handler,
registry and service through actual HTTP/HTTPS, with the same dedicated nonowner
pending-only PG pool. No mock prepare method. Projection/checker fixture now issues
fresh synthetic JWTs and a separate source Session using its existing clinical
creation capability. Pending pool is never given clinical capability or Mapping read.
Handler and new fixture hashes are included in the transaction evidence; public
certificate bytes are added to hashes in the final verification run. No private key
hash/content is captured. No production source, DDL, UI or runtime route is changed.

HTTP checks: actual initial201 and exact original201 replay, stale412, conflict409,
no-auth401, wrong subject/scope403 before callback, suspended DB actor403, audit
INSERT fault503/full rollback, short-window creation and expired replay404. Count/
audit checks distinguish pre-callback denial from committed domain audit. Timeout408
and actual client abort finish without staging or fabricated audit; fixture health
remains responsive. Subsequent real creation proves DB access recovers after fault.
The health endpoint exists only in the owned fixture, not a deployed readiness claim.

HTTPS checks: existing development CA/server cert, CA signature, matching private
key and valid dates/localhost SAN; trusted HTTPS invokes real nonowner PG and creates
201. Wrong servername is ERR_TLS_CERT_ALTNAME_INVALID. Wrong explicit trust anchor
must produce a certificate-chain error from a fixed allowlist, never timeout/DNS/
connection refusal. Failed TLS creates neither staging nor application audit.
All calls preserve verification; no rejectUnauthorized=false/-k/insecure options.

HTTP/HTTPS bind random loopback ports; finite200ms body,3s handshake/header,5s
request,12s socket/client budgets and existing8s DB transaction budgets remain.
Polling/accept/abort observation is finite. Owned servers/connections and disposable
PG container are closed; no user stack/data/volume is touched or removed.

## Development certificate record

Existing certificates were read, not regenerated or rotated. Subject localhost;
issuer development root CA; SAN DNS:localhost/IP:127.0.0.1. Server and CA expire
2026-12-06T23:18:39Z. Certificate generator is scripts/generate-dev-certs.ps1;
this gate requires its existing development files, not production certificates.
Server SHA256 fingerprint:
69:B0:0A:5E:13:B1:62:21:76:AF:9D:46:46:6B:52:3A:D8:A1:7D:1A:73:91:70:BD:D6:8A:8E:B2:D6:54:3E:10.
CA SHA256 fingerprint:
6F:87:AD:DD:55:90:4D:5C:52:FA:DD:01:06:15:F4:9A:1A:47:38:A0:D5:F2:AB:92:78:40:4A:28:D7:88:E1:59.
Private key only enters the TLS server in memory and matching-key check; no log,
evidence, source-file hashing or Git tracking was added for it. This is NOT mTLS:
no client certificate is required by this isolated TLS-server fixture.

## Actual verification

node scripts/v3-identity-transaction-check.js: exit0/PASS,283/283,65,138ms,
sourceUnchanged true,cleanup PASS. Initial actual transport manifest:
evidence/generated/hp-v3-identity-tx-2026-10-08T00-09-45-999Z-5791437a/manifest.json.
This initial run hashes handler/fixture; final rerun also binds public certificate
bytes and will be appended only after terminal execution.
node --check scripts/test-support/v3-pending-http-fixture.js:exit0/PASS.
git -c core.safecrlf=false diff --check:exit0/PASS, tracked whitespace only.
Final public-cert-hashed PG rerun:exit0/PASS,283/283,64,456ms,
sourceUnchanged true,cleanup PASS. Final manifest:
evidence/generated/hp-v3-identity-tx-2026-10-08T00-11-39-101Z-d1e910a9/manifest.json.
Its evidence SHA256 independently matches Get-FileHash;DRAFT/UNASSIGNED.
Certificate source hashes cover localhost.crt,ca.crt and wrong-anchor public
orthanc-server.crt only. Full Node regression completed:
node --test --test-concurrency=1,exit0/PASS,381 tests,fail/skip0,65,725.6034ms.
Live legacy E2E/staging entrypoints do not execute live checks under node --test;
the new preparation HTTPS evidence comes from the actual PG fixture above, not
those entrypoints. Existing intermittent DPoP timeout is not declared fixed.
Final document checker:exit0/PASS,29 documents/115 links; path/label scope only.

## Remaining / next prompt executed

[Secure-edge next prompt](../implementation/highpass-v3-p0-06-pending-secure-edge-prompt.md)
created and immediately inspected actual ingress.js and IAM/GRT requirements.
ingressMeta authenticates forwarded metadata but falls back rather than denies;
pending handler does not enforce it. No client mTLS/workload identity, mock MFA,
human-token PoP, clinical approval or live router deployment is proved by this gate.
Legacy DICOMweb DPoP/image evidence must not be borrowed for this new endpoint.
Outbox trace does not prove trusted network attribution or hash-chain/SIEM delivery.
Certificate/DB fault tests are scoped technical checks, not full mutation matrix,
global concurrency/deadlock freedom, HA or production/security approval.
Current D1..D6 unresolved; evidence DRAFT/UNASSIGNED; full MVP/v3 NOT achieved.
No existing DB migration, commit/push/merge/PR or external account access.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
