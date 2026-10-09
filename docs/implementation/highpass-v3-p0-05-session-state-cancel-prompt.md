# P0-05 next execution: state machine, cancellation and durable retry snapshots

Use current HTTP/PG source and canonical Requirements/Architecture/OpenAPI/Acceptance
contracts. Existing server/DB activation is not authorized by this gate. Synthetic only.

1. Derive the complete canonical Session transition table and required evidence for
   each edge. Keep future edges to IDENTITY/CONSENT/AUTHORIZED/PREFLIGHT/READY/clinical
   activities fail-closed until their real prerequisite services exist. Do not replace
   the target state machine with a permanently smaller REQUESTED-only design.
2. Define versioned state events and immutable identity/resource/action fields. Extend
   precise SQL checks/triggers/RLS with minimum UPDATE authority; do not disable FORCE
   RLS or remove all immutability triggers. Terminal states cannot be reopened.
3. Implement exchange:cancel with source/patient/requester policy, exact If-Match,
   reason codes, typed HMAC idempotency, one audited atomic state/version change. Prove
   stale412, terminal409, INVITED/foreign denial, duplicate retries and races in PG.
4. Preserve the original create response snapshot after state mutation, while never
   letting create replay resurrect cancelled/expired sessions or issue new capability.
   Define/test whether terminal replay returns safe original receipt plus current
   state or a typed denial; align OpenAPI explicitly, not implicit DTO changes.
5. Implement expiry semantics with bounded DB clock checks/events and deterministic
   denial. Define metadata tracking versus clinical eligibility separately.
6. Design cancel/revoke cascade into Consent/Grant/running work with durable outbox.
   Where prerequisites are not built, mark integration NOT VERIFIED; never fabricate
   revoked grants or claim completed downstream cancellation. Ready/clinical routes
   must remain unavailable until cascade/authorization are implemented and tested.
7. Add injection-only cancel HTTP adapter, bounded error handling and correlation;
   actual isolated PG/HTTP concurrency/audit/COMMIT lost-ACK tests, full Node, evidence,
   manifest verification, report and next prerequisite prompt. DRAFT/UNASSIGNED.

## Initial execution inspection — 2026-10-07

Read current 011, create-service replay branch, target API cancel and acceptance EX-003.
011 fixes Session state REQUESTED/version1, updated_at=created_at and audit version1,
and rejects all Session UPDATE with the generic immutable trigger. It cannot support
cancellation by merely adding a route. Session create ledger has original typed
response_state/version/created_at but current replay builds DTO from current row:
state mutation would silently change the original result without further work.
Target cancel requires exchange:cancel, Idempotency-Key, If-Match, audit correlation,
stale412 and terminal409. No Consent/Grant/work tables are implemented yet; cascade is
an explicit dependency, not a successful no-op. The next implementation must first
align these contracts and exact SQL transition authority. No state code changed yet.
