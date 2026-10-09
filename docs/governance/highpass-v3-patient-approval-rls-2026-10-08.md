# Patient approval read/lock RLS execution

2026-10-08 / DRAFT / UNASSIGNED. Policy reviewer/approver 김범희2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, existing dirty changes preserved.

## Purpose and existing structure

Continue the [projection prompt](../implementation/highpass-v3-p0-06-patient-projection-prompt.md)
after [startup recovery](highpass-v3-docker-start-recovery-2026-10-08.md) actual PG427
PASS.018/020 preparation read binds original creator; approval needs its separate
PATIENT/consent:approve/source PatientRef capability.023 ceremonies remain
immutable, default-deny and not a consumed or approved artifact.

## Files and implementation

Added024 migration and [projection contract](../api/highpass-v3-patient-approval-projection-contract.md).
Expanded `v3-patient-ceremony-schema-check.js` to apply006..024 in disposable PG and
perform actual minimum-column read/lock tests; shared owned startup/cleanup helper
is source-hashed. Updated projection prompt, ERD, traceability, master plan and
document checker. Added this record and next guarded-helper prompt.

024 adds direct patient preparation root policy, child scope/action visibility,
Session/ref SHARE and source-only participant, plus minimal target registry
read/lock. No recursive Session↔participant/preparation root dependency. Directory
caller intentionally reads only self principal, not source directory recursively.
No existing pending/clinical visibility policy is broadened. No SQL SECURITY
DEFINER, LOGIN enrollment, runtime DB apply, public API contract/route or UI change.

Fixture-only grants expose needed columns, NOT submitted commitment, creator audit,
Mapping or invitation/recipient participant. A historical immutable request can
remain internally readable; it does not constitute current live eligibility.
Service must enforce signed synthetic reauth, private binding, guarded role pool,
current Session/ref/institutions and mandatory public-read audit before activation.

## Tests and security review

`node --check scripts/v3-patient-ceremony-schema-check.js`: PASS exit0.
`node scripts/v3-patient-ceremony-schema-check.js`: PASS exit0,62 checks,78,768ms.
Includes prior ceremony owner constraints/default-deny and actual nonowner patient
read/lock RLS, NOT a tested JS approval service. Independent link/digest/finite reauth
storage checks remain owner fixture facts, not authenticated human proof.

| Actual SQL verification | Result | Observation |
|---|---|---|
| Correct patient reads creator-independent preparation/children | PASS | exact synthetic IDs/UID/action |
| Session/ref and source registry SHARE | PASS | minimum-column actual locks |
| Target hospital then tenant SHARE | PASS | configured exact registry metadata |
| Invited recipient participant | PASS | invisible; SOURCE only |
| Missing/foreign context, patient, admin-with-approve scope | PASS | zero preparations/Sessions |
| Missing scope, revoked patient, suspended source | PASS | zero preparations/Sessions |
| Deleted ref / suspended target active lookup | PASS | zero eligible row |
| Commitment/creator audit/Mapping SELECT | PASS | SQLSTATE42501 |
| Session/ref/target actual UPDATE | PASS | SQLSTATE42501 |
| Digest on admitted immutable fields | PASS | canonical32-byte SQL hash |
| Approval/ceremony write side effects | PASS | ceremonies still invisible; PENDING/UNVERIFIED and REQUESTED1 unchanged |
| JS guarded helper, live cancel/expiry, actual approval/withdraw races | NOT VERIFIED | not implemented by this RLS gate |

[Latest schema/projection manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-10-53-777Z-30d95366/manifest.json)
records cleanup PASS/sourceUnchanged true and22 captured source hashes. Separate
current hash comparison22/22 and manifest verification PASS, exit0. New evidence DRAFT/UNASSIGNED despite
policy adoption. Prior39 baseline remains historical, with checker evolution now
captured by this new manifest; old source hashes are not claimed as current.
Full Node430 PASS and existing PG427 PASS belong to the startup recovery gate
(current unchanged runtime JS /006..022), not complete patient approval or full MVP.

Only exact owned tmpfs synthetic fixture removed; no runtime/user data deleted.
No real patient data, nonce/token/private-key logs or tracked secrets introduced.
All commands/polls/SQL have finite bounds. No TLS/access-gate relaxation.
Final startup/identity-tx/ceremony-schema label inventories exit0, all empty.
Document links/coverage checker exit0,79 files/226 local links PASS; this checks
references, not semantic OpenAPI/clinical eligibility/human policy approval.

## Remaining scope and immediately following execution

Projection prompt remains PARTIAL: admitted SQL-only visibility/locks now proven,
but guarded JS pool/transaction helper, private signed reauth and current live
eligibility must be implemented/tested. No public read without mandatory audit.
[Next guarded projection prompt](../implementation/highpass-v3-p0-06-patient-guarded-projection-prompt.md)
is written/read and source analysis started. Subsequent challenge issuance,
immutable consent content/event/audit/result and exactly-once consumption remain
required, followed by recipient acceptance/Decision/Grant/preflight/provenance.
No commit/push/merge/PR. Whole MVP/v3 NOT ACHIEVED; D6 remains NOT VERIFIED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
