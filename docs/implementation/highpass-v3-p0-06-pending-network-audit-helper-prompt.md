# Next execution — strict opaque network audit admission and atomic writes

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

1. Read migration021 and its exact-source owned SQL evidence. Schema/RLS integrity
   does NOT prove application provenance admission or automatic domain network audit.
   Preserve previous full regression FAIL and latest recovered PASS; DPoP timeout
   root cause remains unproven, and diagnostics must stay available.
2. Define a privately branded opaque audit input minted only from still-live network
   authority and this exact request/correlation. Do not expose raw HTTP requests,
   bearer, arbitrary facts objects or trusted callbacks as public input authority.
   Binding must accommodate server-generated traceId without accepting spoofed
   header authority. Preserve existing two-field exchangeCorrelation contract.
3. Add explicit internal strict service/helper configuration requiring this input.
   Old non-network fixtures remain clearly scoped; they cannot be silently used as
   strict-edge deployment evidence. Validate context before DB callback, before
   network insert and before commit; async expiry/disposal must rollback fail closed.
4. Use actual appendPendingAudit returned eventId and authenticated binding to
   insert its network row in the same transaction. Preserve six-field original
   receipt, creation-audit FK and typed domain-denial semantics. No guessed pre-auth
   principal or historical backfill. Strict edge may not succeed without both rows.
5. Actual PG tests: normal/replay/current trusted IP+fingerprint, denial, wrong FK
   tuple under privileged SQL as well as nonowner RLS, cross-tenant/maintenance
   invisibility, UPDATE/DELETE refusal, insertion faults rollback, deadline cutoff,
   lost COMMIT acknowledgement/retry without duplicate creation. Include helper
   clone/plain-object/correlation forgery tests before SQL.
6. Execute complete proxy/backend/PG and focused/full regression with exact hashes,
   preserve failures and bounded owned cleanup. No existing runtime DB/stack changes.
7. Write and begin the separate pre-auth security-sink/PoP gate. No automatic actual
   MFA/IdP, D1..D6 ceremony, hospital/legal approval, production or overall MVP claim.

Initial execution: source inspection confirms appendPendingAudit already returns
eventId, but V3PendingPreparationService only accepts domain correlation and ignores
network provenance. Private context read must remain authoritative throughout the
transaction; JSON IP/fingerprint alone is insufficient.
