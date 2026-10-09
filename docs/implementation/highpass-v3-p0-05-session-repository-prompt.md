# P0-05 Session repository and write authority execution prompt

Continue the incomplete Session DB gate from migration 011. Do not claim the schema
fixture proved authenticated application creation. Inspect its policies first.

1. Specify minimal active target-hospital registry lookup/locks. Existing app RLS
   sees only its own institution; do not use schema-owner credentials, SECURITY
   DEFINER, global patient reads or target impersonation to bypass this. Target
   registry metadata lookup must not authorize patient or Session access.
2. Specify creation-scoped SOURCE authority and source creator's pending invitation
   metadata visibility. Invited DESTINATION must still see no patient/Session/scope.
   Current assembly trigger needs all assembled rows visible to its trusted caller;
   do not disable constraints or make all pending participants globally readable.
3. Add reviewed, additive application INSERT/lock-only policies and the actual
   repository. Reuse V3TenantTransaction to lock active principal and persistent
   patient binding; lock source PatientRef and both institution statuses until commit.
   Target suspension/deleted ref/credential expiry/timeouts must fail closed.
4. Use prepareExchangeSessionCreate, DB/server time and finite injected policy.
   Derive target tenant from registry, never from body; derive requester/source
   binding; compute canonical selected-scope hash and preserve immutable snapshot.
5. Implement dedicated scoped Session HMAC idempotency, not a weakened Identity
   coordinator. Same key/command repeats original safe metadata; different command
   409; actual concurrent DB sessions and lost COMMIT ACK retry have one Session/audit.
   Registry and resource/expiry checks apply again on replay. Missing HMAC key fails.
6. Save Session, both participants, all scopes, audit and result in the same tx.
   Add safe read/denial audit paths; no raw token/local ID/SQL detail. No consent or
   authorization is inferred from REQUESTED, participant row, evidence digest or
   patient UUID. State/cancel/Grant cascade are subsequent gates.
7. Validate with nonowner/NOBYPASSRLS pools, actual PG transactions and bounded
   migration rollback. Cover patient/provider, foreign/expired/suspended, forged
   inserts, snapshot append, audit fault, replay/parallel retry, then full Node.
   Keep runtime routes disabled until scoped HTTPS/mTLS/live image gates.

Initial execution inspection (2026-10-07): 011 has no app writes, invited target
is invisible, and source assembly currently uses the owner fixture. Source-only
registry policies cannot satisfy foreign target lookup/locks. These are deliberate
remaining authority dependencies, not reasons to replace app credentials with
admin credentials or remove RLS. Next implementation begins with those policies.
