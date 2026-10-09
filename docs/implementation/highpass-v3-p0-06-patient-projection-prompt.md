# Next execution — isolated patient approval projection

2026-10-08 / DRAFT TECHNICAL IMPLEMENTATION / UNASSIGNED.
Policy reviewer/approver 김범희, 2026-10-08. Not new evidence approval.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.

Environment prerequisite: the existing published-port PG regression twice ended
POSTGRES_START_UNAVAILABLE on2026-10-08, while network-isolated schema checks passed.
First perform bounded owned-fixture start-ACK/readiness/port diagnostics; resolve
and rerun current PG regression before admitting new approval service writes.
Do not infer the root cause, raise limits/disable checks to pass, restart unrelated
runtime stacks, prune/delete data or replace current evidence with older PASS.

Follow-up: [bounded startup recovery](../governance/highpass-v3-docker-start-recovery-2026-10-08.md)
cleared functional verification barrier with actual three profiles and current
PG427 PASS. Underlying daemon latency is not repaired/diagnosed as a specific root
cause.024 read/lock RLS is the next incremental foundation; JS guard/service and
current eligibility remain incomplete until actual tests prove them.

1. Read [ceremony ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md),
   [command contract](../api/highpass-v3-patient-consent-command-contract.md),023,
   current registry/tenant transaction and018..022 RLS. Preserve all user changes.
2. Add patient-only source-bound read/lock projection under a dedicated
   hp_v3_consent_approval_policy pool. Never reuse/broaden pending own-actor RLS:
   a doctor-created request must be visible to its registered patient, not another
   patient, doctor, administrator or invited recipient.
3. Guard nonowner pool before registry planning; reject owner/super/BYPASSRLS,
   clinical/pending/expiry/preauth memberships and unsafe inherited roles. Use
   exact private binding and fresh signed synthetic reauth; body MFA is not proof.
4. Separate immutable preparation read from current live Session/ref/institution
   checks. Set target directory context only from locked source metadata. No
   patient/Study data in invitation projection. Minimal columns, no Mapping read,
   staging commitment exposure, write/recipient activation or Grant authority.
5. Follow ADR registry→idempotency→Session→ref→target order and final live checks;
   include a domain-safe audit plan before any public read route is activated.
   This gate's internal projection does not claim an audited public patient API.
6. Obtain displayed content and canonical digest from immutable server snapshot
   and versioned clause policy, not arbitrary body strings. Policy text/version/
   purpose/finite link validity are server-selected, not client-provided evidence.
7. Test actual minimum-column nonowner RLS, doctor-created prep→correct patient,
   foreign patient/tenant/source, missing scope, revoked principal, deleted ref,
   cancelled/expired Session and suspended institution. Assert no writes/side effects.
8. Actual locks and bounded races are required for D6 PASS; a read-only projection
   or schema owner assembly does not pass approval/withdrawal/consumption races.
9. Run scoped/full Node and owned PG checks; finite cleanup, source hashes and
   DRAFT/UNASSIGNED manifests. Retain failed or cleanup-uncertain previous evidence.
10. Next implement verified nonce issuance and atomic content/event/audit/result
    consumption with safe idempotency/lost ACK. Do not enable runtime migrations,
    routes, real IdP/KMS/PACS or claim complete MVP/v3/legal/hospital readiness.
