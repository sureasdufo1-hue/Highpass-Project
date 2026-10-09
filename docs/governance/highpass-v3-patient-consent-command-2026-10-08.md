# Patient consent command / approved decision implementation

2026-10-08 / POLICY USER-APPROVED / NEW EVIDENCE DRAFT / UNASSIGNED.
Reviewer/approver 김범희 / approval date2026-10-08. Direct user adoption is recorded
in the [decision packet](highpass-v3-lifecycle-decision-packet-2026-10-08.md).
Related CON-001..006, IAM-003/004, AUTH-001/004, FR-001..005/014..020.

Executed [command prompt](../implementation/highpass-v3-p0-06-patient-approval-contract-prompt.md).
Added `src/v3-patient-consent-command.js` and corresponding unit tests. Registry
privately captures verified TestProvider synthetic MFA/auth_time, with bounded
freshness and future-time rejection. No body/header chooses authentication facts.
Command requires server-bound PATIENT/consent:approve, fixed preparation ID/current
Session version/content digest and explicit APPROVE/REJECT plus independent link
choice/clause version. Exact types/properties/context/state/expiry are validated.
Frozen command branding is parser provenance, NOT durable consent or authority.
Doctor/admin cannot approve for patient; existing maker/checker policies unchanged.

Updated decision/dependency/security/requirements/traceability and target OpenAPI
description only; no new runtime route, DDL/grant, recipient activation, clinical
Decision/Grant, UI, secret or package change. [Technical contract](../api/highpass-v3-patient-consent-command-contract.md)
identifies challenge/replay/evidence and locked projection requirements still open.

## Executed checks

Focused command tests/registry/HTTPS secure-edge: exit0,27/27 PASS,599.586 ms.
Initial full `node --test --test-concurrency=1`: exit1; existing FIX-006 DPoP HTTP
regression failed. That failure is retained, not converted to PASS; full result
does not demonstrate approval lifecycle completion. Focused DPoP retry: exit0,
4/4 PASS,39,352.4236 ms. Intermittent HTTP regression failure cause remains unresolved.
Full serial retry: exit0,423/423 PASS,85,432.5012 ms. This includes six new command
cases; retry PASS does not erase the initial FAIL or prove its cause was corrected.

Actual `node scripts/v3-identity-transaction-check.js` initial run: exit1,
NOT VERIFIED/POSTGRES_START_UNAVAILABLE,68,773 ms,cleanup PASS,sourceUnchanged true.
Preserved manifest:
`evidence/generated/hp-v3-identity-tx-2026-10-08T02-20-31-730Z-02fcd32d/manifest.json`.
Docker Engine subsequently returned server version29.8.0 and no owned fixture
remained. Terminal-run retry: exit0,427/427 PASS,108,296 ms,cleanup PASS,
sourceUnchanged true, manifest digest/all captured source hashes independently match:
`evidence/generated/hp-v3-identity-tx-2026-10-08T02-22-54-990Z-9e0b025e/manifest.json`.
That PG gate tests existing identity/Session/PENDING/preauth paths with changed
registry, NOT the new consent persistence/ceremony. No gate/deadline was removed.
New JS syntax checks exit0. New module/test source hashes below bind unit scope;
those files are not falsely described as executed approval PG migration evidence.
Documentation cross-reference check exit0,71 files/194 local links PASS (links and
coverage labels only, not semantic policy/approval). Three recorded module/test
source hashes independently match current files. No owned validation container remains.

Repository HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`; dirty tree retained.

```text
src/v3-patient-consent-command.js 64dbe68f6967fa68b2daed8c05431ae525d8f240635f1f8eddb4438175b73de1
src/v3-principal-registry.js 24b79d3f42f4986e0df1d3067f40e1dabd84eecff587accb2f91b25433f6f103
test/v3-patient-consent-command.test.js 13ef159ca8830c8bff2c5fb30c8330415c56707f66e764acae9759a468b35990
```

## Remaining scope and next gate

Actual consent artifact/challenge/state events, patient projection RLS, replay/
lost ACK, displayed evidence, D6 real races and browser flow NOT IMPLEMENTED or
NOT VERIFIED. Signed mock MFA is not real MFA or human proof; actual IdP external.
Link choice/version alone is not complete identity linking authority. Downstream
recipient acceptance/Decision/Grant/preflight/provenance remain full target backlog.
New evidence DRAFT/UNASSIGNED, not independently reviewed by user adoption.
No entire MVP/v3, PIPA/ISMS-P/hospital/production conclusion.

[Next persistence/ceremony prompt](../implementation/highpass-v3-p0-06-patient-ceremony-persistence-prompt.md)
is written/read and initial schema/policy analysis started:018 staging is immutable
UNVERIFIED and020 read policies bind original actor. Separate patient-only guarded
projection is required for doctor-created preparation; do not mix capability roles
or broaden existing author-only RLS. ADR/lock DAG precedes additive schema/service.

Recommended future commits: policy adoption/contracts; registry/command plus unit
tests; execution record and scoped evidence. No commit/push performed.
