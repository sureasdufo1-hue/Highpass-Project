# Next execution — patient ceremony / immutable consent persistence foundation

2026-10-08 / DRAFT TECHNICAL IMPLEMENTATION / UNASSIGNED.
Policy choices approved by 김범희2026-10-08, not independent evidence approval.
Related CON-001..006, IAM-003/004, AUTH-001/004, TEN-003, EX-006/007.

1. Read patient consent command contract, adopted decisions, D6 source audit,
   migrations018..022 and current registry/transaction/PENDING code. Preserve full
   downstream Consent→Decision→Grant/Preflight/Provenance scope, no substitute goal.
2. Define additive isolated schema and patient-only consent:approve capability,
   separate from clinical/pending/maintenance. A source doctor-created preparation
   must be readable only by its server-bound patient for explicit confirmation;
   existing own-actor pending RLS cannot simply be reused or broadened globally.
3. Define canonical displayed content digest from server-owned immutable snapshot,
   preparation ID, parent version, source/target/purpose/actions/resources/window/
   policy and independent identity-link clause text/version/purpose/finite validity.
   Existing submitted evidence commitment must never become approval evidence.
4. Create bounded server-owned challenge/ceremony, random opaque nonce hash only,
   binding patient/preparation/content/version/re-auth. Finite TTL and exactly-once
   consumption, safe idempotency/lost ACK; no token/nonce/private-key logging.
5. Keep immutable consent content version separate from append-only status events,
   approval/reject evidence, audit and typed result. Atomic commit/rollback; no
   in-place PENDING→ACTIVE staging mutation, recipient activation or Grant issuance.
6. Write technical ADR/lock DAG compatible with registry-first transactions and
   existing create/cancel/expiry/ref/target paths before DDL/service mutation. Include
   implicit FK/deferred-trigger locks and actual witnessed competing PG operations.
   D6 PASS only after real races, not static ordering labels or user approval.
7. Start with schema/constraints/default-deny rollback in owned PostgreSQL, then
   guarded projection/challenge/approval transactions, API/HTTPS and UI. Review
   each gate with exact evidence; do not apply migrations to existing runtime DB.
8. Test foreign patient/tenant/role, forged challenge/body MFA, expired/replayed/
   changed content/version, link clause mismatch, cancel/expiry/suspension/revoke
   competition, audit/result faults, duplicate/lost ACK and no clinical side effects.
9. Regress focused/full Node and actual current-source PG, retain prior DPoP and
   Session failures, verify digest/hash/cleanup. New evidence DRAFT/UNASSIGNED.
10. Write/start next justified implementation gate. No commit/push/deploy, real
    patient data, legal/certification/hospital/whole MVP completion claims.
