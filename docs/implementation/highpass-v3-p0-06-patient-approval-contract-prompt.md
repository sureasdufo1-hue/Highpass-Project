# Patient approval command contract execution

2026-10-08 / implementation evidence DRAFT / UNASSIGNED.
Policy choices reviewed/approved by 김범희2026-10-08. Related CON-001..006,
V3-SR-IAM-003/004, AUTH-001/004, legacy FR-001..005/014..020.

1. Preserve PENDING/UNVERIFIED staging and separate Consent/Decision/Grant. Record
   approved D1..D4/D5 sequencing/D6 testing, never independent technical PASS.
2. Define exact patient approval command bound to preparation ID, Session version,
   server content digest and explicit APPROVE/REJECT. Separate identity-link choice
   and clause version; rejecting cannot simultaneously approve identity linking.
3. Authenticate with existing private registry binding, PATIENT-only and separate
   consent:approve scope. Capture signed synthetic MFA/auth_time claims privately
   after verification; do not accept request MFA flags or caller-supplied proof.
   Real IdP MFA remains external. Require finite configurable reauth freshness.
4. Add pure structural/context validation with deep copies and branded parser
   provenance. It is not persisted consent or clinical authority. Service must
   re-read/lock current DB authority and record durable evidence before approval.
5. Test normal approval/rejection, principal/body forgery, role/scope/other patient,
   version/digest/clause mismatch, expiry, missing/old/future/single-factor mock
   reauth and cloning. Never claim replay prevention without durable ceremony state.
6. Run focused/full Node regressions, update exact contract and traceability scope,
   write/read/start persistence/ceremony gate with reviewed lock DAG. No existing
   DB mutation, runtime deployment, commit/push, Grant or recipient activation.
