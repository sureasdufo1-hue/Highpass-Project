# Patient approval projection — internal read/lock contract

2026-10-08 / DRAFT / UNASSIGNED. Policy adopted by 김범희2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.

024 adds only nonowner read/lock policies under a separate approval capability.
Preparation root checks own source tenant/hospital, registered PATIENT PatientRef,
active principal/source registry and consent:approve; creator actor is deliberately
NOT the visibility owner. Existing own-creator PENDING and clinical policies are
not broadened or reused. Scope/actions follow immutable preparation visibility.
Mapping, creator audit, submitted commitment and recipient membership are excluded
from minimum-column grants. Grants are owned fixture-only, no runtime enrollment.

Session and owned PatientRef SHARE privilege cannot authorize UPDATE (WITH CHECK
false); source participant only is readable, not INVITED recipient. Target directory
settings select minimal nonpatient registry metadata and must come from locked
server snapshot. Caller helper reads principal only to avoid directory/context
recursion; active source/institution authority is checked by the transaction and
preparation context, not arbitrary target GUCs.

This is internal historical immutable snapshot visibility, NOT current approval
eligibility or an audited public read endpoint. Future guarded service must require
private branded PATIENT binding and fresh signed synthetic reauth before connection;
reject mixed clinical/pending/expiry/preauth/owner memberships before RLS planning;
recheck live REQUESTED parent/version, owned undeleted ref and active source/target
under reviewed locks; use server clause policy and canonical SQL content digest;
and pair public reads with safe mandatory audit. No body actor/MFA/evidence authority.

Immutable preparation lookup may locate Session before locking it, but it acquires
no UPDATE locks. Explicit locks then follow registry→idempotency(if used)→Session→
ref→target hospital→target tenant, with final expiry/reauth checks. Read-only SQL
does not prove D6 approval/withdraw/cancel races or future mutated resource ordering.

Ceremony SELECT/INSERT remains default-deny. No approved artifact, one-time nonce
consumption, state event, identity linking, Mapping VERIFIED, recipient activation,
Decision ALLOW or Grant is generated. New schema tests prove only admitted minimal
column read/lock RLS. Guarded JS projection, actual current eligibility/expiry/race,
signed ceremony service and public transport remain next gates.

## Guarded helper implemented, scoped verification

`src/v3-patient-approval-projection.js` now implements the private patient-only
factory, before-acquisition synthetic reauth, before-RLS role guard and same-live-
transaction projection brand described above. Final DB/wall-clock reauth and
deadline checks precede commit. The role guard denies all memberships other than
the current login and approval capability, including unknown future capabilities.
Server clause configuration and canonical SQL timestamps/digest remain authoritative.

[Current execution report](../governance/highpass-v3-patient-guarded-projection-2026-10-08.md)
records actual nonowner helper tests, cancellation/expiry and read lock waits.
This supersedes the earlier future-helper wording only for this internal helper.
No public audit route, challenge issuance, approval artifact or clinical authority
is activated; D6 full approval/withdraw races remain NOT VERIFIED.
