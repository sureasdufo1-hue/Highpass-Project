# Next execution — immutable consent content and exactly-once patient decision

2026-10-08 / DRAFT / UNASSIGNED. Adopted policy reviewer/approver 김범희2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-001/004, TEN-003,
FR-001..005/014..020/037..041. Whole Highpass MVP/v3 target remains intact.

1. Read latest [issuance contract](../api/highpass-v3-patient-challenge-issuance-contract.md),
   [ceremony ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md),
   [patient command](../api/highpass-v3-patient-consent-command-contract.md),023..025,
   private registry/factory/projection/issuance and Requirements CON-001..006.
   Inspect current latest actual PG/Node evidence, not historical PASS only.
2. Align [decision persistence design](../api/highpass-v3-patient-consent-decision-persistence-contract.md),
   ERD/OpenAPI boundary and lock graph before DDL. Separate immutable contentVersion,
   eventSequence and decision idempotency. Keep preparation PENDING/UNVERIFIED.
3. Implement append-only content/scope/action/link-clause snapshot plus patient
   APPROVE/REJECT events, mandatory safe audit, unique ceremony consumption and
   original typed decision receipt. Content scope/window changes cannot mutate
   an existing version or carry forward old evidence. No arbitrary JSON authority.
4. Outer command adds ceremonyId/canonical nonce to the existing exact patient
   decision command without weakening its private principal/reauth checks. Only
   exact32-byte base64url nonce, matching stored hash/patient/parent/content/clause,
   live locked context and currently fresh signed synthetic reauth may consume.
   Never store/log raw nonce or accept body evidence/actor/MFA as authority.
5. Serialize preparation-wide decision before resource locks; actor scoped key
   precedes preparation/session/ref/target/ceremony writes, with finite waits.
   Distinct challenges/keys for one preparation must not approve conflicting
   decisions. Retried exact consumed command returns original safe receipt only;
   different nonce/key/payload cannot alter prior decision. No ordinary consumed
   boolean UPDATE on immutable023 ceremony. Trace actual blockers/implicit FKs.
6. Additive migration with FORCE RLS/default deny/minimum nonowner grants only
   inside owned fixture, complete deferred assembly and immutable triggers.
   Implement internal service then actual PG tests: normal APPROVE/REJECT/link
   independent choice, copy/admin/foreign patient, stale/expired/altered nonce,
   digest/clause/context, missing audit/receipt, replay/conflicting decision,
   same/different-key races, cancellation/expiry/institution stop and lost ACK.
7. Initial artifact persistence does not activate Session CONSENTED, recipient
   ACTIVE, Mapping VERIFIED, AuthorizationDecision ALLOW or TransferGrant. Full
   WITHDRAWN/EXPIRED lifecycle and safe access checks remain subsequent mandatory
   gates; no clinical consumers are wired to a partially completed artifact.
8. Regress current scoped/full Node and existing/new PG, source hash/manifest,
   secrets scan and exact owned cleanup. Preserve failures; DRAFT/UNASSIGNED.
   Write result report and next withdrawal/expiry/transport prompt, then proceed
   automatically within approved scope. Do not mark full MVP/v3 complete.
