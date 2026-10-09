# P0-05 Session creation contract execution

2026-10-07. DRAFT / UNASSIGNED. P0-04 and P0-05 remain IN PROGRESS.

## Purpose and inspected structure

Executed the cross-institution contract prompt and subsequent Session contract
prompt. Existing requirements, architecture §§3–5, target OpenAPI, logical ERD,
migrations 006~010, principal registry and tenant transaction were inspected.
No v3 Session/Consent persistence or runtime routes currently exist. The existing
principal_bindings.patient_ref and transaction equality/active checks can verify
a registered patient binding; real patient identity registration/approval evidence
must not be inferred from that synthetic registry or the submitted evidence hash.

The former strict P0-04→05→06 sequencing had a dependency cycle: cross-institution
identity linking needs Session participation and patient approval. The dependency
contract now separates foundation milestones without closing any acceptance gate.
No global membership, copied owner, broader SELECT or new clinical action added.

## Implemented

- `prepareExchangeSessionCreate` validates the existing exact request contract and
  authentic v3 registry binding; returns a copied, deeply frozen internal command.
- Patient initiation must match its server-bound PatientRef; provider initiation
  uses DOCTOR/HOSPITAL_ADMIN, never security/platform admin as clinical requester.
- Owner/source/requester must match authenticated context. Target must be distinct;
  actual target activity/registry and source ownership checks remain DB work.
- Finite injected expiry policy; valid calendar/time input, future bounded window.
- At most 100 Studies and 500 Series per Study, UID syntax/length checks, no raw
  patient fields, duplicate Studies/Series, empty Series lists or accessor values.
- Whole-Study selection remains explicit omission of Series; supplied selections
  are copied and sorted deterministically. Nothing issues consent/grants/payload.

## API change/impact

Before: target ResourceScope permitted an empty Series array and lacked duplicate
Study semantics. After: minItems 1 on supplied Series arrays; empty is invalid,
not all-Series. Duplicate Study entries are rejected rather than merged.
No path, response, authentication scope or deployed legacy API changed. Target
Session/Consent/Grant scope clients need this documented clarification; no v3 UI
currently invokes the validator. A future adapter must enforce configured expiry
and timestamp precision, not silently override the principal or selection.
Related requirements: V3-FR-EX-001/002/004/005, V3-FR-ID-001~005,
V3-FR-TEN-002/003; legacy FR-014~025/FR-037~041 are impact references only.

## Actual verification

| Test/command | Result | Evidence |
|---|---|---|
| Targeted 3 suites | PASS | 21/21, fail/skip 0, exit 0, 215.0762 ms |
| `node --test` | PASS | 325/325, fail/skip 0, exit 0, 38,639.5731 ms |
| JS syntax + diff whitespace | PASS | `node --check` / `git diff --check`, exit 0 |
| OpenAPI YAML/internal references | PASS | Python PyYAML: 21 paths, 312 refs resolved, exit 0 |
| Secret pattern scanner | PASS | zero findings, 2026-10-07T12:15:01.145Z; not comprehensive PII certification |
| Session DB/participants/audit/idempotency | NOT VERIFIED | not implemented by this contract-only gate |
| v3 HTTPS/mTLS/deployed routes/linking | NOT VERIFIED | no activation or image rebuild performed |

Initial targeted run failed 5 new tests (16 passed): synthetic patient/doctor JWT
fixtures omitted required legacy patientId/doctorId claims. Fixtures were corrected
with synthetic values, no authentication bypass or production auth modification.
Then all 21 passed. Existing live-script entry guards in `node --test` are not
actual HTTPS E2E/staging execution; this report does not count them as live gates.

## Remaining risk and next prompt

Structural preparation is not database authorization or creation. Persistent source
ownership, patient binding, target activity, participant activation authority,
atomic session/scope/audit/idempotency, versioned state machine, patient approval,
cross-institution linking and end-to-end v3 remain unfinished. The exact linking
approval clause is still a P0-06 design gate. Human approval is UNASSIGNED; legacy
김범희 PASS is not copied. No commit/push/merge/PR or existing DB migration.

Next: [Session DB foundation prompt](../implementation/highpass-v3-p0-05-session-db-prompt.md).
