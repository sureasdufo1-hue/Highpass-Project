# Expiry maintenance identity contract

2026-10-07 / DRAFT / UNASSIGNED / isolated technical enrollment only.
Related V3-FR-EX-007, V3-FR-TEN-002/003, FR-014~025/037~041.

## Confirmed baseline / decisions

The existing auth module already defines INTERNAL_SERVICE and verifies signed test/OIDC
bearers. v3 registration previously admitted only five human roles. This gate reuses
INTERNAL_SERVICE rather than impersonating a HOSPITAL_ADMIN or inventing SERVICE.
The legacy InternalServiceProvider shared x-hipass-service-token remains unsupported
by V3PrincipalRegistry; no shared-token path or human developer header is introduced.

Server enrollment requires independent issuer/subject, unique actor UUID, exact tenant/
source hospital, servicePurpose SESSION_EXPIRY, no patient binding and sole scope
exchange:expire. The service purpose is server-configured, never taken from a JWT/body/
header claim. Test fixture uses its own issuer/audience and randomly generated signing
secret. Real workload identity enrollment/rotation is not implemented or certified here.

Service JWT must have a single INTERNAL_SERVICE role and sole expiry scope. Other
issuer/audience/subject/hospital, suspended registration or mixed roles/scopes deny.
Human enrollment cannot carry expiry purpose/scope. Clinical v3 routes continue to
require human roles; maintenance cannot call create/read/cancel/mapping/audit APIs.
Resolved bindings remain immutable, server-branded and finite. Batch input only accepts
integer limit1..100, default25; no client tenant/actor/clock override.

## Persistent authority and current boundary

016 adds principal_bindings.service_purpose and exact role/purpose/scope CHECK.
V3TenantTransaction compares persisted purpose to authenticated binding under active
principal/source registry locks. It requires migration016 in its isolated DB; databases
without that column fail closed and must not activate new v3 code prematurely.

Restrictive clinical_principal_context policies cover refs, mappings, registrations,
identity audit/ledger, Session participants/resources, creation ledger/context and
cancel ledger. Existing permissive policies cannot give maintenance clinical metadata
or fabricated identity audit writes. Registry health and own principal are excluded.
Session/event/audit/cascade policies still grant no maintenance rows at this stage;
the expiry mutation/read projection is the next additive gate, not broad SELECT.
No existing project DB migration or worker deployment is performed.

## Next implementation requirements

## 017 persisted batch update — 2026-10-07

017 now provides REQUESTED/v1 -> EXPIRED/v2 with DB time, immutable-column guard,
deferred event/audit/cascade proof and source-scoped RLS. Capability NOLOGIN groups
hp_v3_clinical_policy and hp_v3_expiry_policy separate clinical policy evaluation from
maintenance; deployment must explicitly grant only the appropriate group to each
nonowner pool role. No existing DB or runtime credentials are changed here.
The dedicated expiry pool must not also belong to the clinical group; the service
checks this before scanning. Column privileges permit only correlation/state fields,
never clinical resources or arbitrary full Session SELECT.

V3ExchangeExpiryService processes limit1..100/default25, FOR UPDATE SKIP LOCKED and
a transaction deadline <=10s. Each batch atomically persists state/event/audit and
EXPIRY_REQUESTED. A committed batch whose ACK is lost returns outcome unknown; retry
does not duplicate the event but returns an empty scan, not the lost receipt.
close() initially blocked new admission only. The follow-up below adds service drain;
actual deployed scheduler shutdown remains pending.
189 actual nonowner PG/loopback checks and 349 Node tests PASS; see the
[scoped report](../governance/highpass-v3-p0-05-expiry-transaction-2026-10-07.md).

The following requirements remain in force for deployment and subsequent work.

Use a dedicated nonowner/NOBYPASSRLS maintenance DB role/pool with column-level Session
projection and explicit event/audit/cascade privileges, not broad clinical SELECT.
Minimal source-scoped pseudonymous correlation needed to build a state event is not
a right to Study/Series, PatientMapping, Viewer, Grant/key release or admin audit.
REQ->EXPIRED uses DB time and exact versioned event/proof. Expiry service output
is a minimal technical receipt, never patient/Study metadata. No new public API is
implied. Cross-tenant scan, real credentials, worker scheduler/rotation and downstream
cascade delivery remain pending. Full original receipt lifecycle and clinical state
machine requirements are preserved rather than replaced by this identity foundation.

## Follow-up service drain

close() now stops admission and returns one idempotent promise observing all admitted
transaction promises with allSettled. Calls retain their own success or failure;
drain never changes an outcome to PASS. Transactions retain finite <=10s deadlines.
Unit-controlled in-flight success/failure and late admission PASS; 350 full Node tests
and repeated 189 actual PG checks PASS. Deployed signal/scheduler shutdown is not verified.
See [drain report](../governance/highpass-v3-p0-05-expiry-drain-2026-10-07.md).
