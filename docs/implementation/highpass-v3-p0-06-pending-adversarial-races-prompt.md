# Next execution: complete PENDING authority / integrity / race evidence

2026-10-08 / DRAFT / UNASSIGNED. Internal synthetic preparation only.
Continue the complete PA-01..08 contract, not a replacement smaller gate.

1. Revalidate current020 policies, internal V3PendingPreparationService and actual
   nonowner PG222 evidence; retain the cleanup-unverified PG217 run unchanged.
2. Expand actual fixtures to PATIENT bound-ref and DOCTOR own-requester controls,
   wrong patient/requester, foreign actor/institution and no-context receipts.
   Never grant Mapping read or clinical membership to the pending pool.
3. Direct nonowner SQL incomplete assembly, false audit tuple, wrong actor/FK/digest,
   child fault, UPDATE/DELETE and maintenance read must fail without extra rows.
   Historical018 owner/default-deny tests do not prove020 admitted writes safe.
4. Actual two-session barriers: pending preparation versus source/target suspension,
   cancellation and expiry. Observe PG lock wait, release a bounded explicit barrier,
   assert serialization and post-transition denial. Use existing cancel/expiry services
   and their dedicated capabilities, not a fabricated terminal row update as proof.
5. Clock-cutoff race: a valid preparation that crosses its fixed window during work
   must not produce success. Distinguish rollback/no domain audit from a committed
   safe DENY. Never expand TTL or weaken transaction/query/TLS deadlines for PASS.
6. Preserve own HMAC-scoped immutable original receipt, exact current principal,
   DB parent/window/version checks and created/replay/deny audit atomicity. Maintain
   lost ACK / concurrent command / changed command / expired retry existing cases.
7. Owned disposable cached PostgreSQL only; finite barriers and label/exact-name
   cleanup. Hash source/test files in DRAFT manifests and preserve failed runs.
   Run related/full Node and current actual PG regression without skipping gates.
8. Update governance, API/ERD/master plan to measured scope. Then write and execute
   injection-only HTTP transport prompt, preserving PA-09 as a separate gate.
   No existing runtime migration/route activation, clinical patient approval,
   INVITED activation, Grant, external KMS, commit/push/merge/PR.

## Immediate inspection performed

020 request/audit policies read the locked parent, but this alone is not proof of
race serialization. Registry-first source SHARE, Session SHARE, PatientRef SHARE
and server-selected target SHARE are implemented in the existing transaction/helper.
Current actual pending fixture covers HOSPITAL_ADMIN only, not all three roles.
It has concurrent identical requests, lost real COMMIT ACK and expired-window retry;
cancel/expiry/suspension competition and admitted-role direct assembly remain open.
Existing legacy cancel/expiry race cases do not test the new pending writer.

Related V3-FR-CON-001/002, V3-FR-EX-005/006/007;
V3-SR-IAM-004/TEN-001..003/AUTH-001..004; FR-001..005/014..020/037..041.
