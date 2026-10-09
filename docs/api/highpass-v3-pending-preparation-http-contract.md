# PENDING preparation transport contract

2026-10-08 / DRAFT / REVIEW REQUIRED / NOT DEPLOYED.
Related V3-FR-CON-001/002, EX-005/006/007; V3-SR-IAM-004/TEN-001..003/AUTH-001..004;
FR-001..005/014..020/037..041.

Proposed injection-only POST /api/v3/exchange-sessions/{sessionId}/consent-preparations.
This is immutable PENDING/UNVERIFIED staging, NOT POST consent-artifacts, approval,
ConsentArtifact, TransferGrant or a Session state transition. It is not wired to the
runtime router or advertised as a deployed OpenAPI path. No browser UI change.

Authentication: existing server V3PrincipalRegistry, consent:write and PATIENT/DOCTOR/
HOSPITAL_ADMIN only. Server registry and fresh transactional DB binding remain
authoritative. Bearer over ephemeral loopback HTTP is fixture transport ONLY;
deployment requires separately verified HTTPS/trusted ingress and PoP policy.
Token/actor/tenant/clock/selection in query or extra JSON fields are not authority.

Headers: one Authorization, Idempotency-Key (16..128 existing ASCII allowlist),
If-Match (strong quoted positive integer <=2147483646), X-Audit-Session-Id (UUID).
Optional X-Trace-Id (16..64 existing safe ASCII). application/json with optional
charset=utf-8 only; identity content encoding only. Duplicate sensitive headers,
encoded/noncanonical path, query string, wrong method and malformed headers deny.

Body: exact11 fields of pending input contract. Strict UTF-8, duplicate decoded
object keys rejected at every depth, JSON depth<=32, maximum4MiB (covers100 Studies
with500 Series per Study). Body deadline5s maximum; service transaction8s default,
<=10s. HTTP server/request budgets must also be finite in actual integration gate.

Success201 on both initial creation and eligible exact retry, with identical six-field
original receipt: preparationId,sessionId,expectedSessionVersion,state=PENDING,
evidenceStatus=UNVERIFIED,createdAt. Receipt contains no patient data, resource UID,
submitted evidence, commitment, token or idempotency key. Handler whitelists and
validates the receipt; unexpected shape is503 rather than accidental disclosure.

Errors: 400 aborted input;401 authentication;403 role/scope/current principal;
404 missing/inaccessible/terminal/expired parent or replay window;405 method;
408 body timeout;409 changed-key command conflict;412 stale version;
413 size;415 media/encoding;422 malformed/scope/window;503 storage/unknown commit.
Problem body: type,title,status,allowlisted code,traceId. No exception message, SQL,
stack, raw body/headers or certificate paths. cache-control:no-store on all responses.
Wrong method sets Allow:POST. Domain DENY is recorded by service where authorized;
pre-service parser/auth errors and rolled-back faults are NOT domain audit evidence.

Design decision: stable201 replay avoids inventing a replay marker or issuing a fresh
receipt; service preserves original creation response. Connection-close on rejected
input bounds unread-body handling. No fail-open or automatic uncertain-COMMIT retry.

Verification boundary: ephemeral HTTP mock-service tests prove transport only.
Actual PostgreSQL through handler, TLS/mTLS, ingress/DPoP, deployed route and external
IdP are separate required gates. Patient ceremony D1..D6 remains unresolved.

## Actual transport follow-up — 2026-10-08

Owned fixture now invokes real handler/registry/nonowner PG over ephemeral HTTP and
HTTPS, including original201 replay, status negatives/storage rollback, input
timeout/abort and certificate hostname/trust DENY. This is isolated direct service
TLS, NOT deployed path, ingress/mTLS/PoP/MFA verification or approved consent API.
See [actual transport report](../governance/highpass-v3-p0-06-pending-live-transport-2026-10-08.md).
