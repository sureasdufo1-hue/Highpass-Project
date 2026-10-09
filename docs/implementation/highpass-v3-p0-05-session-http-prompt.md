# P0-05 next execution: bounded Session HTTP adapter

Use the current internal create/read services and 006~014 isolated PG authority.
Do not activate the existing server, apply migrations to its DB, or grant clinical access.

1. Align POST /api/v3/exchange-sessions and GET /api/v3/exchange-sessions/{sessionId}
   with target OpenAPI. Inject registry/services; resolve server-bound principal and
   exchange:create/read before DB operations. Exact route/method/query/header handling.
2. Validate duplicate sensitive headers, idempotency/audit/trace IDs, JSON type and
   content encoding. Use a finite bounded UTF-8 body reader and safe socket cleanup.
   Session accepts up to 100 Studies x 500 Series: do not silently impose Mapping's
   16KiB limit or weaken resource constraints. Choose/document a finite wire ceiling
   compatible with canonical maximum input; safely reject oversized/slow/aborted bodies.
3. Return safe 201/200 metadata and Problem responses; no stack/SQL/token/key exposure,
   no query-based bearer, no new Grant. Fixed correlation and no-store headers.
4. Exercise actual ephemeral HTTP + nonowner PG success, idempotent replay/conflict,
   patient/provider source ownership, INVITED/foreign/missing uniform404, expired/ref
   deletion, malformed/duplicate/body timeout and audit failure. Test boundary sizes.
5. Review JSON duplicate-field handling and GET body/encoded path ambiguity explicitly.
   Preserve pre-auth vs authorized DB denial audit distinction; never manufacture audits.
6. Run targeted/full tests, hash-backed evidence and manifest verification; update
   report and next state/cancel prompt. New evidence remains DRAFT/UNASSIGNED.

## Initial execution findings — 2026-10-07

Inspected OpenAPI Session POST/GET and both existing Mapping handlers after read gate.
The Mapping write reader caps input at 16384 bytes and its constructor forbids larger
limits: direct reuse would reject valid larger Session resource selections. Its finite
listener/timer and error-socket lifecycle are useful patterns, not a complete Session
adapter. Mapping read does not check duplicate headers; do not copy that omission.
Session service requires correlation as options {auditSessionId, traceId}, whereas
Mapping read accepts traceId directly. POST audit/key headers are required by OpenAPI;
GET correlation is server-generated unless an explicitly validated header is accepted.
No Session HTTP route/adapter implemented yet; this prompt's inspection has begun.
