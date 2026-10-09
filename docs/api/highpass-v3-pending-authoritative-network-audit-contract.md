# Preparation authoritative network audit — additive design

2026-10-08 / DRAFT / REVIEW REQUIRED / STRICT ATOMIC PATH PARTIAL / NOT DEPLOYED.
Related legacy FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

## Confirmed facts

The domain preparation outbox uses transactionally authenticated actor, tenant,
hospital and fixed domain reasons. Correlation alone is not trusted network data.
The capstone edge verifies backend client mTLS, exact proxy SAN/EKU and signed
ingress before human JWT/mock assurance. Pre-auth TLS failure never enters HTTP.
These facts do not prove durable security-denial audit or downstream hash-chain.

## Implementation decision for next injection-only gate

Keep domain and pre-authentication security events distinct. Preserve existing
creation-audit foreign-key tuple, exact original receipt, RLS, atomic rollback and
minimal disclosure. Do not add network columns to an immutable historical receipt.
An internal opaque capability may carry verified network facts; caller JSON,
forwarding headers without signature and a cloned object cannot confer provenance.
It must be created only after TLS peer and ingress verification, bound to this
request/correlation and short-lived, and fail closed if required context is absent.

Minimal network facts: validated normalized source IP, fixed trusted ingress mode,
dedicated public proxy-certificate SHA-256 fingerprint and server observation time.
No JA3 fabrication, raw authorization/JWT, client secret, certificate/private-key
path, body, patient name or unrestricted diagnostic exception. Treat IP as sensitive
audit metadata: no general-user projection, bounded retention and security-role
read policy. Production retention periods require explicit organizational policy.

The additive domain network record references the committed preparation audit
event, uses the same authenticated actor/tenant/hospital and transaction, and must
not survive rollback. Tests must prove tuple mismatch, untrusted/forged/cloned
context, lost COMMIT acknowledgement/retry, and cross-tenant access fail closed.
Existing non-edge tests are not evidence of authoritative network context.

Pre-auth events cannot invent an authenticated human actor, patient, hospital or
domain audit event. TLS rejection belongs to a separate bounded security-event
sink supplied by the owned fixture. Fixed reasons and observed server facts only;
health checks and volume protection must not enable unbounded event flooding.
Durability, sink failure policy, privileges, retention, exporter, deduplication and
hash-chain/SIEM delivery require a separate explicit contract before runtime use.
An in-memory observer is test evidence ONLY, not durable audit compliance.

## Implemented provenance boundary (not persistence)

src/v3-pending-network-context.js now provides a branded, injection-only authority.
It copies the ingress key privately and creates opaque frozen capabilities only
after mTLS/role/ingress verification. A private WeakMap binds each capability to
the exact request/socket and a hash of method/path/authorization/ingress plus
idempotency, If-Match, audit correlation and media headers. It returns only the four
minimal internal facts. IPv6 is canonicalized; authorization never becomes a fact.
Capabilities expire within10 seconds, the signature acceptance window and public
certificate validity; monotonic deadline also prevents clock rewind extending life.
Replacement capability and disposal invalidate earlier authority. Different request,
factory, clone or plain JSON cannot confer authority.

The capstone edge captures context and the strict injected HTTP handler rechecks it
after asynchronous body parsing, before service/storage. Original internal non-edge
fixtures remain explicitly non-network evidence. Private audit input now binds
authenticated actor/tenant/hospital and exact correlation (including generated trace)
to still-live request context; no context is projected in the HTTP receipt.
This module cannot authenticate a compromised server process or authorized
proxy; the trusted-server API and TLS CA configuration remain trust prerequisites.

## Additive schema/helper alignment for the next gate

Proposed network record: unique domain eventId, authenticated tenantId/hospitalId/
actorId, auditSessionId/traceId, PostgreSQL inet sourceIp, fixed ingress mode,
32-byte public certificate fingerprint, server observedAt and database recordedAt.
Require a composite FK to the existing domain outbox event and complete authority/
correlation tuple; retain the existing immutable creation FK unchanged. Add only the
necessary unique referenced tuple, no rewrite or backfill of historical evidence.
FORCE RLS must match pending source actor/tenant/hospital, SELECT/INSERT only with
explicit dedicated role grants. UPDATE/DELETE must not be an ordinary capability.

Helper admission must accept a still-live opaque capability, not an arbitrary facts
object. The domain event and network record commit atomically; insertion failure
must roll back request/scopes/actions/outbox/ledger. Replay gets a new audited event
with current request network facts while preserving the original six-field receipt.
Denials must reference their actual domain event without guessed patient/session
identifiers. Pre-auth denials cannot be inserted into this domain table.
Test nonowner privileges, wrong tuple/FK, missing/cloned context, cross-tenant and
maintenance invisibility, immutable mutation, inserted-event/network failure,
ambiguous COMMIT/retry, deadlines and no plaintext token/key fields.
Migration021 now implements the additive table/tuple FK, host-only inet IP,
fixed mode/public fingerprint constraints, ten-second observed/recorded window,
FORCE RLS, pending actor SELECT/INSERT policies and immutable mutation trigger.
It grants no runtime privileges and preserves historical data/creation FK. Owned
SQL fixture alone grants the minimum insert columns and read access. Tests prove
schema integrity/RLS only; SQL-written fixture facts are NOT application provenance
evidence. Strict service admission, atomic application insertion and pre-commit
dispatch context guard are now implemented. The capstone edge refuses non-strict
services; standalone non-network internal fixtures remain expressly limited.
readPendingNetworkAuditInput accepts only a private branded input, bound principal
and correlation; appendPendingNetworkAudit uses actual domain eventId and minimal
parameterized fields. Created/replayed/domain-denied events insert paired rows;
failure rolls back the guarded transaction and original receipt stays unchanged.
Actual proxy/nonowner PG verifies normal/replay IP/fingerprint, network insertion
fault rollback and domain-denial pairing. Privileged wrong tuple now also proves FK
denial independently of RLS. Commit-time disposal guard is unit-tested.
Strict lost-ACK/concurrent creation, actual PG expiry/disposal before commit,
maintenance/cross-tenant visibility and recheck after pool/DB-lock acquisition before
callback remain next verification work. Pre-auth sink/hash-chain/SIEM not delivered.

## Remaining uncertainty / activation gates

Production sink and ownership/retention approval, actual IdP and human PoP/DPoP
binding remain unresolved. This draft grants no production or clinical permission.
Start by implementing and testing unforgeable network-context provenance in an
isolated module; then align schema/RLS/audit transaction and denial sink in order.
New evidence is DRAFT / UNASSIGNED. Prior 김범희 approval does not auto-approve this
new design or substitute independent review. D1..D6 remain unresolved.
