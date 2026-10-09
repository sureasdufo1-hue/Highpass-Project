# P0-04 Mapping write HTTP execution prompt

Implement the documented reconcile and review HTTP adapters using the existing
principal registry, write service, transaction and idempotency contracts.
Do not activate routes in the existing server or migrate an existing database.

1. Authenticate server-owned role/scope before reading the body.
2. Require Idempotency-Key and X-Audit-Session-Id; validate optional X-Trace-Id.
   Reject duplicate security headers, query parameters, encoded bodies and
   unsupported content types. Preserve the OpenAPI idempotency alphabet.
3. Limit body size to 16 KiB, enforce a finite read deadline, decode strict UTF-8,
   and return no-store safe Problem responses without input or internal errors.
4. Return 201 for reconcile and 200 for review; use the existing audited,
   atomic service and durable idempotency rather than HTTP-side state.
5. Test transport failures and real services; then extend independent synthetic
   PostgreSQL/loopback HTTP verification. Loopback HTTP is not HTTPS/mTLS evidence.
6. Keep new evidence DRAFT / UNASSIGNED. Document remaining runtime activation,
   cross-institution approval/membership, HTTPS/mTLS and human review gates.

Related: V3 Identity/PatientMapping P0-04, security request boundaries and audit;
legacy FR-014~FR-025/FR-037~FR-041 are impact references, not completion claims.

## Host composition increment — 2026-10-09 KST

`src/v3-identity-runtime-router.js` composes the existing registered-principal,
mapping read/reconcile/review handlers under an explicit CAPSTONE_SYNTHETIC_ONLY
factory. It does not create a listener, issue identities, migrate a database or
activate legacy server routes. Exact namespace selection, encoded/normalized path
alias denial, duplicate security-header rejection and disposed-router fail-closed
responses precede dispatch. Other legacy/v3 domains remain the host's responsibility.
Existing ownership, separate maker/reviewer, protected local-reference and durable
idempotency services are reused; no synthetic-ID-to-P-1001 merge is added.

Unit HTTP boundary tests PASS; actual pool/HTTP regression now uses the composition
instead of fixture-local ad hoc routing. A first full independent run after mapping
checks failed at later maintenance DB access and remains NOT VERIFIED; follow-up
uses fixed safe timeout classification without SQL/input/error-text disclosure.
It also registers the exact project phantom identifier in the independent fixture,
not the running cloud. Synthetic reviewer verification is not human approval.

Actual follow-up:4 scoped phantom mapping facts PASS, but full PG gate again
NOT VERIFIED at maintenance DB access (see checkpoint). Fix this repeated internal
failure before continuing the TLS/runtime activation gate. Do not call the full
regression PASS, blame network/parallel load without evidence or skip the worker
checks. Latest fixed phase/driver diagnostic enums still need their PG execution.

Next gates: complete actual pool regression, then isolated TLS/mTLS + authenticated
trusted ingress integration before exposing this router. Existing server/cloud DB
activation, actual phantom registration, imaging metadata authorization, cross-
institution PatientRef membership and new-dataset encrypted Viewer remain separate
uncompleted gates. Bearer loopback success is not DPoP/ingress/TLS evidence.

### Current-code verification — 2026-10-09 KST

Deterministic transaction deadline/connection-teardown classification race was
reproduced before correction and fixed without deadline or authorization changes.
Transaction10 and full647 tests PASS. Current-code independent PG/HTTP431 checks
PASS; exact evidence and earlier NV runs are preserved in checkpoint. Historical
intermittent maintenance failure root cause remains OPEN (a diagnostic run already
passed before correction). Do not describe the timing-order correction as a proven
fix for every prior DB failure. Next permitted implementation unit is isolated
TLS/mTLS trusted-ingress host verification; existing live activation remains a
separate gate. No running cloud registration/new-dataset Viewer success yet.

### Isolated TLS/mTLS admission verified — 2026-10-09 KST

Dedicated identity-edge dev certificate preparation and opt-in transport wrapper
now have actual HTTPS/mTLS + nonowner PostgreSQL proof:450 checks PASS; Node649
PASS. Exact evidence, failed diagnostic runs and scope are in the checkpoint.
Run `node scripts/prepare-identity-edge-dev-cert.js` before the transaction check;
this needs the existing local development project CA and never replaces runtime
certificates. The separate untrusted negative is unexpired/self-signed; trusted
expired negative remains expired. No TLS/hostname/signature bypass is permitted.

This gate proves local transport admission, not an actual reverse-proxy deployment,
DPoP, clinical MFA, DB-commit network-context coupling or transport-denial audit.
Do not activate public routes on this proof alone. Keep next work as an explicit
host/proxy/registration/metadata authorization unit; phantom live mapping and
encrypted Viewer are still NOT VERIFIED. Whole distributed MVP is NOT ACHIEVED;
new evidence is DRAFT / UNASSIGNED.

### Dedicated actual frontend composition — 2026-10-09 KST

`src/v3-identity-capstone-proxy.js` is now exercised as an actual local HTTPS
frontend to the dedicated mTLS identity backend and nonowner PG. It strips
client-controlled ingress/actor/institution/service headers, signs actual socket
facts, allows only exact mapping routes, bounds bodies/metadata and total time,
and fails closed on TLS/upstream/disposal failures. Actual PG460 checks PASS and
full Node651 tests PASS; exact scope and original Privacy regression FAIL are
preserved in the checkpoint. New public negative-cert/preparation source hashes
are now included. This does not activate existing server/cloud routes.

Next align identity network-authority/commit-audit and host activation contracts;
do not confuse DPoP header forwarding with verified proof. Existing authenticated
principal scopes, patient ref ownership and separate reviewer requirements remain.
New phantom live registration/scoped metadata/Viewer are still uncompleted gates.

### Identity network capability foundation — 2026-10-09 KST

Opaque identity authority and explicit `runWithIdentityNetwork` transaction gate
now have real mTLS/PG proof:462 checks PASS, including context expiry causing
rollback of an owned audit insertion before COMMIT. Header/request/binding/trace
substitution and fabricated capability rejection have actual TLS unit evidence.
Checkpoint preserves source-change-invalidated first run. This is a foundation,
not completed persistent network audit or mandatory mapping-service activation.

Next implementation unit:
1. Add identity-only immutable network-audit table linked to the exact identity
   audit event/tenant/hospital/actor/correlation tuple; scoped RLS, typed host IP,
   public certificate digest, finite observation/recorded times, no backfill.
2. Add capability-only paired audit writer, same nonowner transaction; insertion
   failure or context expiry must roll back domain/audit/ledger together.
3. Opt-in strict read/reconcile/review handlers/services must obtain input from
   captured request plus the exact resolved binding and correlation. Require
   these strict services at deployment edge, not a raw forwarded header object.
4. Durable replay preserves original receipt while recording the current access
   event/network facts, with current authority/context rechecks. Historical
   receipt must not be overwritten by today's mapping version/correlation.
5. Prove actual PG normal/DENY/replay plus privilege outage, expiry/races and
   cleanup. Keep default legacy routes/schema and running cloud DB unchanged
   until the separate host deployment/registration gate is satisfied.
6. Only then continue live phantom registration, scoped metadata and encrypted
   Viewer. DPoP proof verification and capstone mock assurance remain explicit
   separate contracts; header preservation alone supplies no such assurance.

### Persistent pairing foundation verified — 2026-10-09 KST

Steps1/2 foundation now implemented in additive031 and capability-only
`appendPairedIdentityAudit`. Independent PG475 checks PASS, including exact
tuple constraints/RLS/immutability, privilege outage and expiry rollback of both
rows. Current security gate PASS; initial comment-matching static-test FAIL is
documented in checkpoint. No running database schema or credential changed.

Next implement steps3/4/5 as one coherent strict mapping-service unit: propagation
of the captured request and exact binding/correlation; mandatory paired writer for
read/reconcile/review/DENY; durable replay keeps original receipt but adds a new
current authorized access pair. Require strict services at the edge factory.
Do not treat the helper/table foundation as completed live audit coverage, a
mandatory legacy DB invariant or an authority to bypass the deployment gate.

### Strict service unit integrated — 2026-10-09 KST

Mapping read/reconcile/review handlers and services now support explicit mandatory
network pairing; dedicated secure edge requires those strict services. Durable
replay preserves original receipt while committing today's authorized access pair
with current mapping version. Idempotency conflict commits a minimal DENY pair;
network storage failure or capability expiry rolls back without returning metadata.
Legacy non-strict paths are unchanged; strict PatientRef bootstrap remains excluded.

Actual independent PG483 checks PASS and current Security Gate PASS. Checkpoint
retains the wrong-receipt fixture FAIL and earlier unrelated Privacy regression
FAIL/root-OPEN; do not rewrite either as PASS. Not yet proven: unavailable-resource
replay deletion scenario, complete Identity outcome-unknown/race matrix, preauth
denial observation, live host activation or new phantom encrypted Viewer.
Next close those Identity/host contracts, then enroll the actual capstone mapping
and scoped imaging metadata. Existing server/cloud migration and promotion require
their own non-destructive, scanned deployment verification; no automatic legacy
P-1001 merge or manufactured patient/reviewer approval.

### Unavailable replay fixture closed — 2026-10-09 KST

The actual HTTPS/mTLS/nonowner PG regression now passes497 checks, including
mapping/ref soft deletion, safe404 plus minimal exact DENY/network pair, unchanged
historical receipts/digests, audit-outage rollback and restored-fixture replay.
Initial direct setup mutation was denied by DB42501; retained original evidence
and replaced setup with existing reviewer/version/audit-compliant preparation.
This is not a new deletion lifecycle API and does not activate live host routes.
Current Security Gate and manifest validation PASS; new evidence DRAFT/UNASSIGNED.

Next implementation unit is strict mapping outcome-unknown/concurrent replay:
1. Inject lost acknowledgement only after an actual PG COMMIT in an independent
   dedicated strict transaction pool; no production/network fault injection.
2. First response must be safe503 outcome-unknown, not a fabricated success or
   presumed rollback. Confirm durable original domain/audit/network/receipt once.
3. Same scoped-key retry with a fresh real network capability must preserve the
   original receipt, recheck current authority/resource and append a new access pair.
4. Prove concurrent same-key attempts perform one business mutation and preserve
   per-request access audit; revoked/expired authority must not reuse old capability.
5. Preserve failure evidence, run current regression/security/manifest checks,
   then progress preauth host activation. Do not declare full MVP completion.

### Strict mapping commit/replay increment verified — 2026-10-09 KST

The above post-COMMIT loss and concurrent same-key paths now have actual HTTPS,
dedicated mTLS and nonowner PG proof507 checks PASS,92.751s, source unchanged,
owned cleanup PASS. Current Security Gate, focused18 tests and manifest PASS.
Durable revocation and stale signed-ingress retries deny without historical
receipt disclosure; no generic claim that every Identity race is complete.
Fixture-only fault injection does not modify runtime transaction semantics.

Next coherent host unit:
1. Align optional identity preauth observer stages (trusted-hop INGRESS and
   registry HUMAN_AUTH), using immediate socket facts only and no unverified JWT
   actor/tenant parsing. Do not add fictitious mock MFA or DPoP assurance.
2. Reuse the existing privately branded same-owner bounded observer/sink contract;
   record delivery outcomes, outage and disposal without delaying safe denial.
3. Preserve current401/403/404 status contracts; do not double-publish domain
   DENY events as unauthenticated events or silently activate existing listeners.
4. Prove actual identity HTTPS/mTLS plus actorless PG delivery, wrong proxy role,
   invalid registry authentication, spoofed forwarded IP, sink outage and cleanup.
5. Define host bootstrap/registration/database migration and scanned image
   promotion readiness explicitly, then activate the capstone host separately.
6. Continue phantom mapping/scoped metadata/encrypted Viewer end-to-end; all new
   evidence remains DRAFT/UNASSIGNED and full MVP completion must be proven.

### Identity admission observer implemented — 2026-10-09 KST

Optional branded observer now follows trusted-hop capture and each handler's exact
registry rejection point. No early weak-scope pre-resolution; existing auth/status
ordering and domain auditing remain. Current actual HTTPS/mTLS/nonowner PG529 checks
PASS including actorless delivery, spoof resistance, write outage, recovery,
disposal and no domain double-publication. Full Security Gate/manifest PASS.
Listener-owned handshake events and live deployment are still NOT VERIFIED.

Next execute the identity host lifecycle unit:
1. Reuse strict edge/proxy and same-owner observer/publisher under explicit
   CAPSTONE_SYNTHETIC_ONLY mode with dedicated credentials and exact bindings.
2. Add listener-owned TLS-failure observation without exposing certificate paths,
   raw errors, tokens or unverified actor/tenant. Do not label network/DNS failure
   as an expected certificate DENY or make a synthetic forward header authoritative.
3. Bound handshake/request/body/publisher/readiness/stop deadlines; distinguish
   NOT_RECORDED/OUTCOME_UNKNOWN from durable success and fail readiness honestly.
4. Prove actual strict mTLS normal and no/untrusted/expired client negatives with
   durable actorless events, plus observer/storage failure and graceful teardown.
5. Define non-destructive current-schema checks/bootstrap/migration/image scanning
   and rollback before promoting live capstone host; do not infer deployability
   from a synthetic factory alone or provision real clinical identities.
6. Connect the owned phantom mapping/scoped metadata/consent/encrypted Viewer
   across A/B/cloud and collect actual browser evidence. Whole MVP remains open.

### Owned TLS host lifecycle verified — 2026-10-09 KST

The actual loopback-only listener validates TLS material, strictly admits mTLS,
routes existing identity services, observes native handshake failures through
the same-owner bounded publisher and supports finite deterministic start/stop.
Actual proxy/host/nonowner PG539 checks PASS,93.489s, source unchanged/cleanup
PASS; current Security Gate, targeted4 tests and manifest PASS. Initial native-IP
assertion failures are preserved; absent socket detail stays null/UNKNOWN_TLS.
No listener existence or certificate fixture name is substituted for DB readiness.

Next implement non-mutating identity readiness/bootstrap alignment:
1. Explicitly distinguish transport listening, database reachable, schema/grants
   compatible, trusted principal registration, publisher/reader safe and actual
   end-to-end mapping access. Each unavailable component stays NOT VERIFIED/FAIL.
2. Probe with dedicated nonowner identities and bounded queries; no superuser,
   owner-role fallback, broad SELECT grant, direct production insert or schema
   migration during readiness. Never use an unverified header as principal input.
3. Verify required additive tables/constraints/role separation and approved
   synthetic binding/bootstrap prerequisites against actual scoped records.
4. Storage probe must not manufacture an authentication failure as a health event,
   delete immutable audit, or leak metadata/token/certificate paths in health UI.
5. Cover unavailable DB, unsafe credential, missing schema/grant, revoked binding,
   publisher outage and shutdown races; run current regression/security/manifest.
6. Define scanned, non-destructive runtime configuration/bootstrap/migration and
   rollback before actual capstone promotion and phantom/Viewer enrollment.

### Readiness and preflight-gated runtime composition — 2026-10-09 KST

The read-only checker is implemented with exact current principal registration,
required RLS storage/guards/paired-audit FK and distinct nonowner grants. It never
migrates, issues an identity or manufactures a health event. Standalone readiness
regression547 checks PASS; unavailable acquisition and unsafe role negatives PASS.
Initial pnpm gate failure is retained separately; subsequent current gate PASS.

The new `createV3IdentityCapstoneRuntime` assembles strict mapping read/write,
bounded actorless observer and mTLS host from operator-owned dependencies. Its
start validates an authenticated capability, preflights before bind and rechecks
freshness. Startup is explicit and single-use; stop during preflight cannot bind.
External pools/registry/protection remain caller-owned. No runtime image, database
or A/B/cloud listener is silently changed. Actual PG composed-host evidence is
now553/553 PASS,94.263s, source unchanged, cleanup PASS, with manifest verification:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-44-41-710Z-bd681f90/transaction-check.json`.
Revoked binding refuses bind; restoration starts without health mutation; actual
strict proxy/mTLS/RLS mapping read and deterministic shutdown pass. Targeted4 tests
and current Security Gate PASS. This does not prove live VM/cloud activation.

Next coherent deployment unit:
1. Inspect the existing cloud DB schema/role inventory read-only with no secrets
   in argv/output; keep current data and older P-1001 untouched.
2. Compare immutable local DDL/checksums to that inventory, define additive
   migration prerequisites, rollback and backup verification. Missing prerequisite
   is NOT VERIFIED/FAIL, never automatic superuser fallback or broad grants.
3. Add an explicit operator-owned startup entrypoint with mounted secret files,
   exact pre-enrolled synthetic registry and separate clinical/publisher/reader
   credentials. No automatic identity or patient approval manufacture.
4. Scan and attest the new image/configuration, then promote only with bounded
   startup/readiness/shutdown and recoverable previous-image configuration.
5. Enroll HP-TEST-PHANTOM-001 without merging older patients; connect actual
   mapping/scoped metadata/consent and encrypted A -> Azure -> B Viewer flow.
6. Run real browser positive/expired/revoked/scope-negative cases and audit
   verification. New evidence DRAFT/UNASSIGNED; whole MVP remains NOT ACHIEVED.
