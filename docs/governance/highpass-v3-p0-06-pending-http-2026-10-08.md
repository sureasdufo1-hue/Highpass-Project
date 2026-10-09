# P0-06 residual preparation negatives and injection-only HTTP

2026-10-08 / DRAFT / UNASSIGNED / IN PROGRESS.
HEAD59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc plus preserved dirty tree.
Related V3-FR-CON-001/002, EX-005/006/007; V3-SR-IAM-004/TEN-001..003/AUTH-001..004;
FR-001..005/014..020/037..041.

## Analysis and implementation

Read next transport prompt, actual PG251 manifest and pending service/audit/Session
body handling. Added current admitted-role PostgreSQL cases to the adversarial
fixture: source/patient/purpose/action/Series mismatch, missing Session, suspended
source/target tenant, deleted PatientRef, real full assembly with forged resource
digest/foreign patient FK/creation-audit timestamp, maintenance-context staging read.
Malformed assembly is sent to the REAL nonowner connection; returned DENY is not a
mock. Failed assembly and input denials cannot create new preparation rows.

The initial Series test chose a whole-Study parent. Its explicit Series narrowing
was legitimately allowed, so the expected DENY test failed. Corrected test to use
the existing Series-restricted Study, without changing parser/policy/TTL behavior.
Failed evidence retained. Source/target suspension and actual cancel/expiry/cutoff,
patient/doctor controls, replay/lost ACK and child/audit/result fault cases retained.

Wrote [transport contract](../api/highpass-v3-pending-preparation-http-contract.md)
before new src/v3-pending-http-handler.js. Proposed separate preparation POST is
injection-only: no src/server.js wiring, deployed OpenAPI path, patient approval,
ConsentArtifact or Grant. Current endpoint/transport design is REVIEW REQUIRED.
Existing strict UTF-8/depth/duplicate decoded-key/body reader reused without modifying
Session behavior. Required key/strong If-Match/audit correlation; exact human binding
and normalized11-field body. Handler accepts only the original six-field receipt and
matching Session, uses201 on creation/retry, no-store, closed rejected connection
and fixed safe problem fields. No raw evidence/SQL/token/key/stack is returned.
No existing runtime DB/schema, user data, credentials, UI or TLS settings changed.

test/v3-pending-http-handler.test.js uses real ephemeral loopback HTTP and actual
registry, but a trusted MOCK prepare method. Seven groups cover receipt/retry,
auth/role/scope, path/method/query/headers, media/JSON/UTF-8/size, timeout/abort,
safe errors/unexpected receipt and invalid dependency/budget configuration.
These prove transport only, NOT HTTP-to-PG or TLS/mTLS/ingress/DPoP enforcement.
Mocked service cannot establish clinical authority or test DB atomicity.

## Actual verification

| Command / run | Exit / result | Scope |
|---|---|---|
| node scripts/v3-identity-transaction-check.js — first residual run |1 / FAIL|Series test chose whole-Study scope; evidence retained |
| same command — corrected current run |0 / PASS|264 PASS;64,879ms;sourceUnchanged true;cleanup PASS |
| node --test test/v3-pending-http-handler.test.js |0 / PASS|7 groups;363.9019ms before added same-Session receipt assertion |
| node --test test/v3-pending-http-handler.test.js test/v3-pending-service.test.js test/v3-consent-pending-contract.test.js test/v3-exchange-http-handler.test.js |0 / PASS|24 tests;680.7195ms; includes current receipt assertion |
| node --check src/v3-pending-http-handler.js |0 / PASS|syntax |
| git -c core.safecrlf=false diff --check |0 / PASS|tracked whitespace only |

Failed evidence:
evidence/generated/hp-v3-identity-tx-2026-10-08T00-02-30-362Z-c01b8dc2/manifest.json.
Current evidence:
evidence/generated/hp-v3-identity-tx-2026-10-08T00-04-41-902Z-8224fac3/manifest.json.
Both are DRAFT/UNASSIGNED. Current PG manifest hashes current SQL/service/fixture,
NOT the new HTTP handler or its mocked tests; do not broaden its scope to transport.
Full serial Node regression completed: node --test --test-concurrency=1,
exit0/PASS,381 tests,fail/skip0,66,847.7585ms. Live HTTPS/staging entrypoints
do not execute live checks under node --test, so these remain NOT VERIFIED here.
Document checker exit0/PASS:27 documents/111 links; paths/labels only, not approval
or OpenAPI semantics. Current manifest evidence SHA256 checked independently with
Get-FileHash: digestMatches=true,reviewStatus=DRAFT. Existing intermittent DPoP
timeout risk is not declared fixed by this serial PASS. Final whitespace check exit0.
Owned synthetic PostgreSQL containers removed; no user volumes/data deleted.

## Remaining verification / next execution

PA-02/03/04/06 named residual cases now have actual DB evidence. This is still not
an exhaustive mutation matrix or global concurrency-order/deadlock proof. Clinical
patient ceremony D1..D6, actual approval/Grant, deployed interface, HTTPS/mTLS and
trusted ingress/DPoP remain separate incomplete gates. No legal/ISMS-P/hospital PASS.
No claim of audit hash-chain/SIEM delivery from a committed preparation outbox row.

[Next real transport prompt](../implementation/highpass-v3-p0-06-pending-live-transport-prompt.md)
written and immediately inspected checker/handler integration boundaries: current
checker calls the service directly, new tests mock persistence, and deployment has
no preparation route. Extend only its owned fixture for real HTTP-to-PG next, then
verify HTTPS without bypassing trust. No commit/push/merge/PR.
Full MVP/v3 is not achieved; active development continues.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
