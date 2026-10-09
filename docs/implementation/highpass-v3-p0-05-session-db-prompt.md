# P0-05 Session DB foundation execution prompt

Build the next additive highpass_v3 migration and source-owned Session repository
using the current CreateExchangeSessionRequest validator and bounded transaction.
Inspect migrations 006~010 first; keep existing data and runtime inactive.

1. Introduce Session, resource snapshot, SOURCE/DESTINATION participant and scoped
   Session audit/result storage aligned with the target ERD/API. Store no payload,
   raw patient IDs, credentials or linking consent inferred from participant data.
2. Source caller must have active registry role/scope and source-owned PatientRef;
   patient requester must match persistent registered patient_ref too. Target registry
   must be active but target existence alone is not recipient access authorization.
3. SOURCE can be active after authorized creation. DESTINATION is invited/pending
   until the explicit authority contract is implemented; never silently activate it
   or expose patient metadata merely because its hospital was named. Creation stays
   REQUESTED or documented identity/consent pending, not CONSENTED/AUTHORIZED.
4. Enforce participant-scoped RLS without recursive policies or SECURITY DEFINER;
   use nonowner/NOBYPASSRLS fixtures, lock-only permissions and immutable snapshots.
   Cross-institution linking and clinical operations still deny.
5. Resource, correlation audit and durable keyed-digest idempotency must commit in
   the same transaction. Replays recheck active authority; lost COMMIT acknowledgement
   is outcome unknown, not proven rollback. Versioned transitions/cancel require
   separate tests and must not claim Grant cascade before Grant implementation.
6. Independently test bounded migration rollback, two-institution visibility,
   participant states, raw SQL bypass, audit fault rollback, concurrent retry and
   distinct-key/command behavior. Keep old DBs/volumes untouched and clean only owned
   fixtures. Then run affected/full Node tests and generate DRAFT/UNASSIGNED evidence.

First inspection result (2026-10-07): principal_bindings already stores patient_ref;
V3TenantTransaction locks and compares it with the branded binding and active
institution/principal. Migration 010 provides a non-recursive root registration
record suitable for own-source ownership, not destination permission. Existing
identity_audit_outbox action constraints and IdentityIdempotency operation whitelist
are Identity-specific: do not reuse by weakening their enum/DTO validation. Align
dedicated Session storage/authority before implementation. No new migration yet.
