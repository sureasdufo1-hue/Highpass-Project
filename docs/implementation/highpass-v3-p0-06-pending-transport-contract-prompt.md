# Next execution: residual PA matrix and injection-only preparation transport

2026-10-08 / DRAFT / UNASSIGNED. Do not activate a deployed route.
Related V3-FR-CON-001/002, EX-005/006/007; V3-SR-IAM-004/TEN-001..003/AUTH-001..004;
legacy FR-001..005/014..020/037..041.

1. Read the latest pending write/adversarial reports and actual transaction manifest.
   Audit PA-01..08 against actual named cases, not aggregate counts. Preserve old
   failed/cleanup-unverified evidence and current source hashes.
2. Complete residual direct false audit tuple/foreign FK/digest and maintenance-read
   cases; scope action/purpose/Series expansion and source/reference/tenant negatives.
   Existing pure parser/default-deny tests do not substitute admitted-role DB cases.
3. Preserve actual patient and own-requester doctor controls, wrong actor/destination
   denial, no-context own receipts, child/audit/result rollback, lost ACK, exact replay,
   suspension SHARE lock waits, actual cancel and expiry services, cutoff rollback.
   If one fails, fix and re-run before claiming completion of its gate.
4. Design a separate injection-only preparation POST interface and minimal receipt.
   Explicitly distinguish this from approved POST consent-artifacts. Document path,
   authentication, consent:write human roles, strong If-Match, idempotency/correlation,
   status codes, body limits, finite timeouts and replay semantics before code.
   No router/server wiring or schema deployment. Endpoint remains review-required.
5. Reuse existing strict body reader/duplicate decoded-key rejection if appropriate,
   without changing Session behavior or weakening header/media/UTF-8 protections.
   Exact JSON shape and no URL/query token/context authority. Parameterized service
   only. Public responses expose no raw evidence, commitment, key, SQL or stack.
6. Injection-only handler tests over ephemeral loopback HTTP: 401/403 auth, duplicate
   headers/key/If-Match/content type, body size/malformed UTF-8/JSON/nested aliases,
   request timeout/abort, unavailable storage, idempotent status and minimal receipt.
   Mocks prove transport only; actual PG transport integration is a later required
   gate. Loopback HTTP never proves TLS/mTLS/ingress/production readiness.
7. Run related/full Node, actual PG current regression, docs path/label check and
   whitespace/syntax. Record commands/exit/count/time and exact source scope honestly.
8. Keep clinical D1..D6 unresolved, all new evidence DRAFT/UNASSIGNED and full MVP/v3
   IN PROGRESS. No user stack/data changes or commit/push/merge/PR. Write next prompt
   for actual PG + HTTPS transport and immediately execute safe scoped work.

## Immediate contract inspection

Existing Session handler exports readV3SessionBody and parseSessionJson with finite
5s maximum,4MiB maximum, fatal UTF-8 and duplicate-key/depth rejection. Its headers
and public route concern Session create/read/cancel; do not relabel it as patient
approval. Current pending service requires branded transactions and immutable
current-authority receipt replay. No public preparation handler or OpenAPI path has
been implemented by this inspection. Transport design remains review-required.
