# P0-05 next execution: Session read/audit and creation race verification

Use the current internal source Session creation implementation and exact 012
authority. Do not activate routes or recipient membership yet.

1. Implement a dedicated bounded metadata read service with exchange:read and
   active participant/patient binding checks; fixed whitelist, foreign/missing
   uniform 404, ALLOW/DENY audits in the same transaction. Invited target still denies.
2. Add typed, semantically accurate idempotency-conflict and other creation denials
   to audit; do not call a conflict NOT_FOUND or silently swallow pre-auth failures.
   Keep admin audit reads separate from clinical/patient metadata responses.
3. Prove with two actual PG connections that target suspension/revocation serializes
   against source creation locks, then denies replay/new commands. Add actual DOCTOR
   integration, deleted source ref, altered patient binding and expiry cases.
4. Align requested access modes with the existing Session/Consent/Grant contract
   before adding fields; request intention alone is never a clinical capability.
   Preserve original typed idempotency snapshot while defining later state changes.
5. Run affected/full tests and independent DB helper, update evidence and next HTTP
   adapter prompt. Keep new reviewer UNASSIGNED and overall v3 incomplete.

Initial inspection after creation gate: current audit insert policy requires
exchange:create and the service has only create(); GET and conflict audit need
explicit contracts/policies. Directory locks are held by V3TenantTransaction, but
actual concurrent suspension race has not been exercised. 011 keeps Sessions
REQUESTED/version 1, so current original-response retry is not proof of future
mutable-state cancellation safety. These are the next concrete implementation tasks.
