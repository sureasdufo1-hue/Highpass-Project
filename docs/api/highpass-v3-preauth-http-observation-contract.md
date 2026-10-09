# Pre-auth edge rejection observation — alignment draft

2026-10-08 / DRAFT / UNASSIGNED / INJECTION-ONLY IMPLEMENTATION / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

Confirmed: actual TLS-to-PG fixture observes handshake failures. The injection-only
pending edge sends safe403 for trusted-hop validation, verified-registry
rejection and signed mock-assurance rejection. Optional factory-paired observer
now publishes those HTTP events in the isolated fixture. Existing domain/network audit must not be reused without authenticated
domain actor; no fabricated patient/tenant/human identifiers.

Proposed stage alignment: networkAuthority.capture failure => INGRESS_REJECTED;
registry.resolve rejection => HUMAN_AUTH_REJECTED (generic authentication/policy
admission rejection, not a claim JWT signature always failed); verified claims
missing exact synthetic assurance => MOCK_ASSURANCE_REQUIRED. A valid TLS chain
but wrong proxy role is trusted-hop admission rejection, not falsely classified
as an untrusted CA handshake. No parsing unverified JWT for principal/tenant.

Observation happens in trusted server branches using request.socket immediate
peer facts, not body/headers/forwarded IP. Event publisher must be observer-owned
and bounded. Optional injection configuration must be validated as a paired
observer/sink authority; never accept a request field or arbitrary result callback
as proof of storage. Existing default edge behavior remains unchanged when absent.

Response remains original safe403 and closes unauthorized connection regardless
of storage result. Publication must not await a hanging sink before denying or
readiness. Every fixed recording outcome is explicitly retained in owned tests;
no silent claim of durable audit if publication failed. Disposal/invalid internal
configuration must fail closed, never skip authentication or invoke preparation.
No extra raw error, certificate path, request URL/body/token/proof or attacker
chosen reason/code in UI. Pre-auth event IDs are server-generated, not body IDs.

Acceptance before implementation claims: actual owned HTTP/TLS edge produces one
minimal event per rejection branch, actual PG rejection remains403, preparation/
ledger/domain rows unchanged, spoofed forwarded facts cannot become source IP,
no sink bypass/foreign authority/cloned input, disposal/outage/flood and readiness.
Mock assurance is not actual IdP MFA or human PoP. Production reader/retention,
long-outage reconciliation and D1..D6 remain unresolved. No runtime wiring or
existing DB modification authorized by this draft.

Binding design: observer factory must privately register its own created sinks;
edge emitter creation requires that same-owner sink, not arbitrary callback or
foreign factory instance. Only privately branded emitters may be passed in
optional edge configuration. The emitter observes fixed stage/socket facts and
returns fixed recording outcomes; it exposes no event capability, payload, token
or caller-selected identity. Outcome history, if added for internal verification,
is bounded and contains only stage/status. A publication exception after possible
dispatch is OUTCOME_UNKNOWN, not false certainty of no recording. Disposed emitter
cannot mint new events. The emitter is now implemented with at most16 safe
stage/outcome history entries, same-factory sink pairing and private branding.
Absent observer preserves previous behavior; disposed observer cannot be enrolled
in a new edge. Existing enrolled edge still denies invalid authentication and
reports NOT_RECORDED if its observer is disposed. Lifecycle disposal is owned by
the injecting application, not automatically shared across unrelated edges.

Owned HTTPS/nonowner-PG sequential rejection tests cover ten events over all
three branches, immediate socket IP, spoofed forwarded values and real INSERT
privilege revocation. The first unpaced run failed storage cardinality; that
failure remains evidence, not retroactively PASS. Subsequent delivery checks wait
for each observation before the next request, keeping real capacity/deadlines
unchanged. Unit HTTPS slow-sink/overflow/disposal evidence is not an actual PG
HTTP outage matrix. That matrix is the [next execution gate](../implementation/highpass-v3-p0-06-preauth-http-outage-prompt.md).
Exact current-source regression and manifest results belong in the execution
report, not inferred from this contract. No deployment or reader-purpose approval.

## Identity optional observer alignment — 2026-10-09

The injection-only identity edge/router/read/write factories now accept the same
privately branded `preauthObserver`. Invalid arbitrary/cloned/disposed enrollment
fails configuration. Absent observer retains prior behavior. Trusted-hop capture
rejection publishes INGRESS; each actual handler's registry.resolve rejection
publishes HUMAN_AUTH at the original authentication point, preserving401/403,
route/header/body ordering and safe Problem/no-store responses. There is no
pre-resolution of a weaker scope at the edge, no unverified JWT parsing and no
manufactured MOCK_ASSURANCE/DPoP/MFA assertion. Valid-principal domain404/403 stays
in domain auditing and is not duplicated as an actorless admission failure.

Publication is fire-and-observe through the existing bounded owner-paired sink;
failure/timeout does not delay or open access. Fixed delivery outcomes remain in
the observer's bounded safe history. Disposed edge does not mint new observations;
disposed observer on an already-enrolled edge reports NOT_RECORDED while denial
continues. Edge does not dispose a publisher owned by the host. Actual TLS
handshake events occur before HTTP callback and still require listener-owned TLS
observation wiring; this increment must not claim that coverage for identity.
No current server listener, live DB credential or cloud deployment is activated.

## Listener-owned identity TLS lifecycle — 2026-10-09

`createV3IdentityCapstoneHost` now owns an explicit loopback-only HTTPS listener,
strict client-certificate verification and a privately branded observer. Its
native `tlsClientError` callback calls `observeTlsFailure` using the actual
TLSSocket; arbitrary JSON sockets are rejected. Existing safe fixed TLS reason
classification is reused. Missing library detail remains `UNKNOWN_TLS`; missing
socket IP remains null. Do not derive a certificate cause/IP from the test
fixture name, unverified certificate text or forwarded headers. Delivery outcome
and exact certificate-denial evidence are separate facts.

The host validates CA/leaf validity, server EKU/localhost and private-key match;
enforces handshake/request/socket/bind/stop deadlines; owns connection teardown
and edge disposal. Listener start/stop and safe bind failure are explicit, not
silently retried. Its public state deliberately reports readiness NOT VERIFIED:
LISTENING proves transport availability, not database/schema/identity bootstrap,
publisher credentials, durable outage reconciliation or deployment readiness.
The injecting host/application still owns external publisher pool lifetime.

### Explicit read-only Identity readiness

The host's optional branded `V3IdentityReadiness` checker exposes a fresh
`checkReadiness(binding)` result only while LISTENING. It accepts a real unexpired
registry binding with mapping:read, not request JSON. Three distinct nonowner
clinical/publisher/reader probes use BEGIN READ ONLY and ROLLBACK with finite
deadlines. It verifies current registration, required identity storage/guards,
exact validated domain/network FK and scoped grants without fabricating a health
event. Missing schema, unsafe role, revoked principal or unavailable connection
fails; missing checker/stopped host remains NOT VERIFIED. No stale PASS is cached.
This is not clinical authorization, complete policy equivalence, a migration or
actual write-delivery/deployment approval. The host does not own external pools.

### Preflight-gated synthetic runtime composition

`createV3IdentityCapstoneRuntime` assembles strict paired-audit mapping services,
same-owner bounded actorless observer and loopback mTLS host. It requires existing
operator-owned registry, identifier-protection provider and three separate pools;
ingress and idempotency keys must be distinct 32-byte buffers. It neither issues
credentials nor runs migrations. `start(binding)` validates the real capability,
checks read-only readiness before bind, checks freshness again, then starts the
listener. Forged bindings never touch a pool; failed readiness never binds.
Repeated startup requests reject rather than borrow a different caller's result.
Startup exceptions are safe fixed messages, not raw PG or TLS errors.

Stop during preflight prevents later activation. Stop owns its host, observer,
readiness checker and internal idempotency key copy, but not externally supplied
pools, registry, protection provider or caller's key buffers. The caller must
close those resources after shutdown; disposal is not a claim that all in-flight
actorless publications were durably reconciled. State still reports readiness
NOT VERIFIED; only explicit fresh checks may report current readiness. This is
an opt-in composition API, not a launched VM/cloud service or complete deployment.

Follow-up: [actual HTTP PG outage record](../governance/highpass-v3-p0-06-preauth-http-outages-2026-10-08.md)
now verifies owned blocked INSERT, timeout/backend disconnect OUTCOME_UNKNOWN,
burst OVERFLOW, recovery and disposal. This supersedes the prior unverified HTTP
fault-matrix note only within that isolated test scope. Separate frontend health
is not clinical readiness; long-outage reconciliation/production ownership remain open.
