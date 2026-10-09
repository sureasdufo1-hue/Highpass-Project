# Next execution — guarded patient preparation projection service

2026-10-08 / DRAFT / UNASSIGNED. Policy reviewer/approver 김범희2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.

1. Read024, [projection contract](../api/highpass-v3-patient-approval-projection-contract.md),
   [ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md), registry/
   tenant transaction, pure patient command and minimum-column actual PG fixture.
   Preserve whole Consent→Decision→Grant target and all user changes.
2. Implement dedicated branded transaction factory and guard pool before registry
   RLS planning. Require approval capability only, reject clinical/pending/expiry/
   preauth roles and inherited admin/owner/BYPASSRLS. Unknown memberships fail closed.
3. Private verified PATIENT binding and recent signed synthetic reauth must precede
   pool acquisition; repeat against DB clock/wall clock after locks and before commit.
   No body actor/claims/MFA or arbitrary unbranded transaction establishes authority.
4. Read immutable own-patient preparation selector to locate parent (no new row
   UPDATE lock), then Session SHARE → PatientRef SHARE → target hospital SHARE →
   target tenant SHARE. Source registry remains locked first by common transaction.
   Revalidate REQUESTED version/live parent, ref, active source/target and immutable
   scopes/actions/window. Reject changed/terminal/expired context safely.
5. Obtain canonical SQL digest and complete displayed snapshot using exact internal
   clause policy, never body strings or submitted commitment. Freeze owned copies;
   bind projection provenance to the same private binding and same live transaction.
   Parameterize every query. No raw DB errors, actor audit, Mapping or tokens exposed.
6. Keep internal helper distinct from public read API: no runtime route until its
   safe mandatory audit contract/persistence and transport tests are implemented.
   No ceremony INSERT policy, ACTIVE artifact, recipient activation or Grant yet.
7. Unit tests cover wrong role/scope/brand/assurance, mixed/unsafe pool, malformed
   stored data/clock/digest, expiry, terminal/version/ref/target and locked ordering.
   Actual minimal-column nonowner PG tests must execute the helper, not SQL-only
   surrogate. Test current cancellation/expiry and lock waits with finite deadlines.
8. Regress scoped/full Node and current existing PG tests; include023/024 only in
   owned fixture. Verify source hashes/manifest/cleanup, preserve old failures.
   Do not claim D6 approval/withdraw races from read-only helper checks.
9. Next verified challenge issuance and immutable content/state-event/audit/result
   persistence, then exactly-once/replay/lost ACK/races and HTTPS/UI. Whole MVP/v3
   remains incomplete; all new technical evidence DRAFT/UNASSIGNED.
