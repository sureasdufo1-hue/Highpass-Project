# P0-06 immutable PENDING staging foundation result

2026-10-08 KST / DRAFT / UNASSIGNED / P0-06 IN PROGRESS.
HEAD: 59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc + preserved dirty tree.
No previous human review is inherited. Full MVP/v3 is not achieved.

## Purpose / requirements

Continue the prepared persistence prompt after structural/FRESH/REPLAY parsing.
Related V3-FR-CON-001/002, V3-FR-EX-005/006/007,
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; legacy FR-001..005/014..025/037..041.

Confirmed: staging is separate from patient-approved ConsentArtifact and remains
PENDING/UNVERIFIED. Assumption: initial REQUESTED/v1 is the only implemented parent
edge eligible for this staging gate. Decision: immutable default-deny schema before
nonowner admission policies. Uncertainty: approval D1..D6 and actual write/transport
gates remain unresolved/unimplemented; no clinical authority is inferred.

## Existing structure / changes

Inspected migrations006..017, transaction wrapper, Session resource/receipt parsing,
existing schema and real PG validation harness. 018 was unused before this gate.

New db/migrations/018_highpass_v3_pending_preparation_foundation.sql:

- Separate NOLOGIN/NOBYPASSRLS pending capability, no runtime enrollment.
- Five FORCE-RLS tables: requests, scopes, actions, typed audit outbox, keyed results.
- PENDING/UNVERIFIED-only state, bounded timestamps/actions/resources and opaque keyed
  evidence commitment; no original submitted evidence, raw token/key/local patient ID.
- Source/target/actor composite references and exact creation audit/time correlation.
- Immutable parent/children/audit/result, unique scoped ledger and original receipt.
- Deferred complete assembly, canonical resource digest, parent scope/action/purpose/
  time subset, persisted source authority/reference/participant and target activity.
- All admission policies absent: even explicitly table-privileged nonowners cannot
  read/insert staging. This is intentional rollout state, not a working prepare service.

New scripts/v3-pending-schema-check.js: cached PostgreSQL image, network none, owned
random-labelled tmpfs fixture; finite Docker/readiness/query/lock/cleanup timeouts.
Checks owner assembly and nonowner default deny without touching the project's DB.
Cleanup resolves exact container and verifies ownership label before removal.

Modified scripts/v3-identity-transaction-check.js includes018 in migration/source
hash lists. Its existing197 actual PG/loopback cases remain; it does not test new
nonowner preparation writes. API authority/ERD/master plan/persistence prompt updated.
No existing runtime migration, route/body/response change, dependencies, TLS weakening,
commit/push/merge/PR, actual clinical access or recipient activation.

## Actual verification

| Command | Exit / result | Scope / time |
|---|---|---|
| node --check scripts/v3-pending-schema-check.js | 0 / PASS | JS syntax |
| node scripts/v3-pending-schema-check.js | 0 / PASS | 28 actual PG checks;57,875ms;sourceUnchanged and cleanup PASS |
| node --check scripts/v3-identity-transaction-check.js | 0 / PASS | JS syntax |
| node scripts/v3-identity-transaction-check.js | 0 / PASS | existing197 regressions with018;74,335ms;sourceUnchanged and cleanup PASS |
| node --test --test-concurrency=1 | 0 / PASS | 361/361;fail/skip0;95,845.3096ms |
| node scripts/verify-evidence-manifest.js (each manifest below) | 0 / PASS | one digest each;DRAFT/UNASSIGNED, not approval |
| git -c core.safecrlf=false diff --check | 0 / PASS | tracked whitespace |
| node scripts/v3-lifecycle-document-check.js | 0 / PASS |16 document targets/97 local links; paths and labels only |

PENDING evidence:
evidence/generated/hp-v3-pending-schema-2026-10-07T23-23-32-539Z-d2f08367/manifest.json.
Legacy regression evidence:
evidence/generated/hp-v3-identity-tx-2026-10-07T23-24-22-019Z-fd675bd2/manifest.json.
UTC path dates correspond to 2026-10-08 KST. Sources and hashes are in each JSON.
018 SHA256:7e7531e6fce717614e5def22ba17994521f7f099367045f32784068e346d4de2.

Actual negatives: missing scope/action/result/audit, wrong digest, Study/Series/action
expansion, ACTIVE/VERIFIED assertion, different actor, late scope append, immutable
mutation/deletion, suspended target and nonowner INSERT. Expected SQLSTATE23514/
23503/42501 counts as policy/integrity denial, not Docker/DNS/TLS failure. All failed
assemblies rolled back; one valid historical preparation and REQUESTED/v1 remain.
No domain DENY audit service exists yet: SQL rejection is not claimed as persisted
application audit. Owner fixture is never treated as minimum-privilege service proof.

## Security / remaining work

Only synthetic refs/UIDs and ephemeral generated credentials. No real patient data
or new tracked secrets; manifests use digest/source metadata, not credentials.
No exhaustive repository PHI/secret scan is claimed. Parent source authority helper
needs server-selected tuples under future RLS, not caller-supplied requester IDs.
Limited generated-evidence JSON scan for private-key headers/JWT patterns:0 matches
(rg exit1 means no matches, not failed document checking). This is not an exhaustive
secret/PHI detector; no broad repository absence claim is made.
Default-deny schema is NOT the final requested persistence outcome.

Remaining: purpose-built nonowner RLS/column privileges, same-transaction projection,
atomic write and safe DENY audit, HMAC ledger/exact replay, storage/lost-ACK faults,
actual preparation cancellation/expiry/suspension races, HTTP/HTTPS/mTLS, approval
ceremony and PA-01..09. Existing197 expiry/replay cases are not pending-service cases.
Previous intermittent DPoP timeout remains an unfixed reliability risk despite this
full PASS; prior failure record is retained. Real IdP/KMS/PACS and operational/legal
approval remain external/deferred, not covered by schema tests.

## Next execution / recommended commits

[RLS/projection execution prompt](../implementation/highpass-v3-p0-06-pending-rls-projection-prompt.md)
written and immediately started: inspected legacy Mapping-based ref policy, broader
owner policy, root/scope recursion and wrapper role checks. New numbered RLS policy
and minimal nonowner fixture are the next concrete edits. This inspection is not
implementation or verification of nonowner admission.

Recommended only:018 foundation; owned schema negative harness and legacy regression
extension; contract/ERD/status/report/next prompt. No Git publication performed.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
