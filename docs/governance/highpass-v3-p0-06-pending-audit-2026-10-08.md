# P0-06 typed preparation audit foundation

2026-10-08 KST / DRAFT / UNASSIGNED / P0-06 IN PROGRESS.
HEAD59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + preserved dirty tree.
New code is NOT covered by previous human PASS or recent reviewer/approver reply.

## Purpose / requirements

Continue atomic PENDING preparation, beginning with its missing audit domain.
Related V3-FR-CON-001/002, V3-FR-EX-005/006/007,
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; legacy FR-001..005/014..020/037..041.

Inspected018 deferred creation-audit tuple/time FK,019 source-only RLS, existing
Session audit writer and atomic-write prompt. Confirmed source projection is NOT
an audited public read service; future preparation must audit same-tx outcomes.
Decision: dedicated typed audit helper, never reuse SESSION_CREATED for preparation.
Uncertainty: actual staging admission/write service, receipt replay and PA races
remain incomplete. Existing architecture, clinical state and D1..D6 are preserved.

## Implemented files / security review

New src/v3-pending-audit.js exports appendPendingAudit trusted repository helper.
Live branded consent:write human binding; exact own-data event fields with fixed
CREATED/REPLAYED/DENIED action and safe reason allowlists. Rejects raw evidence,
tokens, caller timestamps, additional context and accessor/prototype fields.
DENY always stores null Session/preparation/version identifiers; actor/tenant/hospital
come from server binding. Created audit SELECTs exact immutable preparation actor/
source/session/version/state and derives created_at, checking matching creation event
and correlation. Replay uses DB statement timestamp. All SQL parameters are bound.
Exactly one affected row is required; zero/multiple cannot imply success.

This helper proves neither persisted principal nor approval by itself. It MUST run
within guarded V3TenantTransaction and future staging RLS/write service. Raw DB errors
are handled by that transaction boundary, not exposed by a standalone public API.
No RLS admission/grants, runtime route, patient approval, Grant or clinical state
transition is added. No real patient data, dependencies, credentials or TLS changes.

New test/v3-pending-audit.test.js:4 groups covering safe DENY, source-bound creation/
replay SQL, malformed/raw/forged inputs and affected-row failures. SQL is mocked:
these are NOT actual persisted audit or rollback/lost-ACK evidence.
Atomic execution prompt updated; next write-policy/service prompt created and
immediately inspected its INSERT SELECT/independent DENY policy requirements.

## Actual commands / scope

| Command | Exit / result | Evidence |
|---|---|---|
| node --test test/v3-pending-audit.test.js test/v3-pending-projection.test.js test/v3-consent-pending-contract.test.js |0 / PASS|18 tests;201.7426ms; mock SQL/pure validation |
| node --check src/v3-pending-audit.js |0 / PASS|syntax |
| git -c core.safecrlf=false diff --check |0 / PASS|tracked whitespace |

Audit source SHA256:cce86ddef8afc1938577af89802e16e1da611194619208e15cdc9bc8d61826be.
Audit test SHA256:259f505547de98795197a34160cb05403dfc4a930aee86c321044df6054eaddc.
Full serial regression outcome is appended below after terminal completion.
Final node --test --test-concurrency=1:exit0/PASS,370/370,fail/skip0,
84,526.7676ms. No per-request/overall security timeout was weakened. Previous
intermittent DPoP timeout remains a reliability risk, not declared fixed by this PASS.
Document checker:exit0/PASS,20 document targets/102 local links; path/label check
only, not human approval or current OpenAPI/runtime semantic validation.
Previous52 RLS/202 PG source checks are historical source-projection evidence,
not evidence for this new audit module, which those scripts do not invoke/hash yet.
No new PG audit integration or broad secret/PHI scan is claimed in this gate.

## Remaining / next gate

[Write RLS + complete service prompt](../implementation/highpass-v3-p0-06-pending-write-policy-prompt.md)
retains complete atomic preparation requirements: source authority, canonical
narrowing, DB clock/admission, scoped HMAC ledger, original receipt replay, actual
audited storage/rollback/lost-ACK and PA-01..08 concurrency/terminal/suspension races.
No smaller audit-only implementation is substituted for that end state.
HTTP/HTTPS/mTLS and approval ceremony are later gates; full MVP/v3 not achieved.
No commit/push/merge/PR or existing runtime DB changes.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
