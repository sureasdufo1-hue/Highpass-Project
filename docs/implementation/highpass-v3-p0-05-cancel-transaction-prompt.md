# Next execution: implement Session cancellation transaction and immutable retry receipt

Continue the full [state/cancel objective](highpass-v3-p0-05-session-state-cancel-prompt.md).
Use [aligned contract](../api/highpass-v3-session-state-cancel-contract.md) and current
pure cancel validator. This is not permission to reduce the final target state machine.

1. Add exact additive migration for versioned Session mutation/event/cancel ledger and
   durable cascade outbox. Retain immutable identity/resource/action columns, participant
   and ledger triggers; FORCE RLS; no arbitrary UPDATE or terminal reopening.
2. First allow actual REQUESTED cancellation/expiry with proper SQL event authority;
   future clinical transitions remain gated by their real prerequisites. Define the
   complete proposed edge/evidence table separately from implemented edges.
3. Implement bounded nonowner cancellation service with active DB principal, source/
   requester/patient checks, row/advisory locks, scoped HMAC idempotency, If-Match and
   exact semantic audits. Version2 must have one event and durable cascade request.
   Do not falsely claim grants revoked or work cancelled while those models are absent.
4. Make create retry return immutable original receipt on eligible nonterminal row and
   deny terminal resurrection. Cancellation retry uses durable original receipt and
   revalidates authority; lost COMMIT ACK and concurrent calls cannot duplicate events.
5. Extend read/audit version handling and dependency-injected cancel HTTP only. PG/HTTP
   tests cover stale412, terminal409, foreign/invited404, patient binding drift, expiry,
   audit/outbox failures, command conflicts, races, raw SQL immutable-column attempts
   and trigger/assembly/ledger rollback. No existing server/DB activation.
6. Full tests, independent source-hashed evidence and manifest; update full-plan progress,
   next prompt and execute it. DRAFT/UNASSIGNED; overall v3 incomplete.

Initial execution inspection: 011 state/version CHECK and timestamp equality plus
generic UPDATE reject trigger are concrete blockers to route-only implementation.
Existing read audit helper hardcodes sessionVersion=1. Creation replay selects current
row rather than original typed ledger receipt. These were inspected and recorded in
the aligned contract; the next action is exact SQL migration/transaction implementation.
