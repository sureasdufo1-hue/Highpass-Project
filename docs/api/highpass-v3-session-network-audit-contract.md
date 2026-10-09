# Session trusted-ingress audit contract

Status: DRAFT / UNASSIGNED — capstone synthetic environment only.
Related requirements: FR-014~025 and FR-037~041.

## Confirmed requirement and implementation decision

Source-owned REQUESTED Sessions express transfer intent, not patient consent or
clinical access. Their HTTP create/read path must consume actual verified ingress
provenance, not caller-supplied JSON or forwarded headers alone. Existing Mapping
network authority is shared deliberately: exact development proxy certificate,
authorized TLS socket and signed ingress must all pass. Its recorded mode remains
CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY; it is not a new production Session ingress,
DPoP proof, real IdP or legal approval.

V3ExchangeSessionService and V3ExchangeReadService accept requireNetworkAudit:true.
Their read-only getter exposes the configured mode. Strict calls require the opaque
network.input as the last argument, bound to the exact authenticated binding,
request/socket and auditSessionId/traceId. Correlation still uses existing options.
Missing, cloned, expired, replaced or mutated capabilities fail closed before a
pool connection. Internal non-network mode remains explicit and rejects a network
argument rather than silently discarding it.

Strict operations use V3TenantTransaction.runWithIdentityNetwork, which rechecks
the capability before work and before commit. appendPairedExchangeAudit writes
exchange_audit_outbox and exchange_network_audit on that same transaction with
the same event ID and correlation. Network INSERT must affect exactly one row;
loss of provenance or any write failure aborts the transaction. No independent
connection or best-effort fallback. Existing create/read DENY events are paired.

HTTP handler strict mode requires both services to be strict and a genuine shared
network authority. The secure edge must capture the request before dispatch.
It rechecks the captured authority before resolving the actor and reading the body.
Mixed modes, invented authorities and strict cancellation composition are refused.
Cancellation needs its own paired-audit implementation before enabling that route.
The router can now compose Session routes only when both explicitly injected
Session services require network audit. Default Mapping-only composition preserves
other domains. The cloud mounted runtime has NOT enabled this optional composition.

Successful creation receipt replay preserves original sessionId, timestamps,
resource snapshot and version byte-for-byte at the response object level. After
validating the ledger and live eligibility, it appends a new SESSION_READ /
METADATA_READ with fresh event ID and request correlation before returning.
It never emits a second SESSION_CREATED. Strict mode pairs this receipt read with
network provenance. Conflict and expired retries retain existing DENY codes and
commit paired DENY before returning errors. Audit failure suppresses the receipt.
No new token, Consent, Grant or validity extension is inferred from a replay.

Session registry authentication errors are forwarded to an explicitly injected
validated preauthentication observer. Shared edge ingress failures retain its
existing observer path; neither path trusts caller JSON as observation authority.

## Additive database design

032_highpass_v3_exchange_network_audit.sql adds a dedicated append-only table.
Composite foreign key binds event, tenant, hospital, actor and both correlation
fields to exchange_audit_outbox, never identity_audit_outbox. Host-only inet,
32-byte certificate fingerprint and finite timestamps within ten seconds of
recording are enforced. FORCE RLS, PUBLIC revocation and UPDATE/DELETE rejection
remain. No historical backfill or runtime SQL grants are included.

Network audit SELECT requires audit:read; a requester is not granted audit
visibility to satisfy QA. Domain FK checks do not require granting domain SELECT
to its writer. INSERT policy is scoped to current principal and exchange scopes;
SQL privileges do not themselves prove network origin.

## Evidence and remaining gates

Targeted Node tests: 19 PASS, including actual local mTLS branded provenance,
parameterized paired writes and transaction-adapter COMMIT/ROLLBACK assertions.
The transaction adapter is a fixture: this is NOT a live PostgreSQL RLS proof.
Python mounted QA/source-closure tests: 6 PASS. Existing internal Session QA source
closure includes the new dependencies through its recursive import collection.

Schema32 is NOT applied to Azure or added to the approved deployment ledger yet.
No cloud role expansion, persistent listener, clinical consent or Grant activated.
Latest verification: actual local mTLS HTTP POST receipt replay twice, GET,
conflict409, expired retry404, missing bearer401, unsigned ingress403 and encoded
alias422 tested through actual edge/router/services. Failed network audit returns
503 without receipt and rolls back both staged events. Each successful replay has
a distinct event ID/correlation, while response remains identical. This test
uses a transaction adapter fixture, NOT PostgreSQL/RLS or fresh Session creation.
Targeted Node14 and Python14 tests PASS. Initial HTTP test failed on a nonexistent
fixture filename; corrected to existing identity-proxy-dev key/cert, then PASS.
No key contents were output and TLS verification was not changed.

Next gates:

1. Extend HTTP QA to fresh creation and durable preauthentication observation
   with real PostgreSQL, not just the receipt-replay transaction fixture.
2. Enroll optional strict Session composition in the mounted runtime only after
   schema32 and scoped readiness/privilege checks are rehearsed and applied.
3. Rehearse schema32 and least-privilege grants on an isolated nonowner database:
   event-tuple forgery, cross-tenant, audit read denial, mutation, atomic failure.
4. Guarded ledgered Azure apply, source profile rollback/reapply proof, actual
   POST/GET/retry/expired/isolation tests; then scanned persistent activation.
5. Compose patient ownership and Consent before Grant/key release and Viewer.

Whole distributed MVP/v3: NOT ACHIEVED. Production/legal approvals DEFERRED.

## Actual isolated PostgreSQL schema rehearsal — 2026-10-09

Command: `node scripts/v3-session-network-schema-rehearsal.js`, exit0.
Thirty-five checks PASS in28.348s. Existing local PostgreSQL16 image, network-none
container with unique ownership label and tmpfs data; no Azure access or image
download. Frozen25 baseline migrations, exact Identity/source role profiles and
six synthetic bindings were installed only in this owned fixture.

Schema32 was applied under the dedicated NOLOGIN owner after an actual complete
rollback rehearsal. No grants were implicitly created. Named column INSERT and
SELECT were granted only in the fixture; audit:read was NOT added to the requester.
Actual nonowner paired DENY INSERT succeeded even though its domain/network
SELECT remains inaccessible. FORCE RLS and owner checks PASS.

Actual SQLSTATE assertions: missing parent and wrong correlation23503,
foreign tenant/wrong actor42501, subnet/mode/fingerprint/age/infinity23514,
UPDATE/DELETE42501 including privileged immutable-trigger update. Failure of the
second INSERT rolls back the new first domain row: both counts0. Institution
suspension prevents append42501. Schema32 policies now check ACTIVE tenant and
hospital in addition to the principal; this is enforced in SQL, not UI alone.

Initial test FAIL evidence retained: reused existing event ID produced23505,
masking the intended wrong-correlation FK test. Each negative now has a fresh
domain event (except missing-parent test). No expected-denial code was broadened.
Second independent fixture run PASS; owned-container absence verified after
cleanup. Synthetic tmpfs fixture data removed, no user/runtime data deleted.

Evidence:
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-10-30.473Z/result.json`.
Source hashes cover the entire frozen migration baseline and rehearsal source.
New evidence remains DRAFT / UNASSIGNED. Current targeted Node3 PASS and secret
scan PASS. This proves live local schema/RLS behavior, not a fresh Session HTTP
creation over PostgreSQL, cloud migration, TLS DB transport or runtime activation.
Azure schema32 and ledger remain untouched. Next: fresh-create HTTP with actual
PostgreSQL and durable preauth observation, then guarded cloud apply/readiness.

## Actual PostgreSQL + fresh Session HTTP — 2026-10-09

Command `node scripts/v3-session-network-schema-rehearsal.js --http`, exit0.
53checks PASS in34.395s, owned container cleanup/absence PASS. Default no-argument
mode remains network-none schema-only. Explicit --http publishes only an ephemeral
127.0.0.1 PostgreSQL port in the owned tmpfs fixture and runs actual pg pools for
clinical, preauth writer and reader as three distinct nonowner roles. Random
fixture credentials stay in memory, are not source literals or evidence. Database
transport here is loopback plaintext, NOT cloud verify-full/TLS evidence.

Actual V3PatientRefService registers a source-owned synthetic ref. Actual strict
edge/router/Session services create REQUESTED/version1 through mTLS POST201.
Real database retry preserves the original response; GET200 preserves explicit
Study/Series. Changed command409, unknown source ref404 and B forged scope403.
Operator-only aggregate proves exactly one creation, two metadata reads and two
DENY events, each linked to exactly one same-tuple network record. Requester
network audit SELECT remains0; direct B nonowner SQL cannot see the invited Session.

A second short-lived Session is actually created, then wall-clock deadline passes:
GET and receipt retry both404. No validity mutation or replacement. Revoking only
the owned fixture's network INSERT forces fresh HTTP creation503; Session count,
domain/network audits, ledger and resources are all unchanged. No receipt leaked.

Missing bearer401 and unsigned ingress403 are durably recorded using the existing
opaque socket observation factory and separate least-privilege writer/reader pools.
Bounded polling confirms HUMAN_AUTH_REJECTED and INGRESS_REJECTED, both immediate
socket source127.0.0.1. No JSON admission shortcut, synthetic successful approval
or audit privilege added to the requester.

Evidence and verified content-hash manifest:
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-15-45.526Z/manifest.json`.
DRAFT / UNASSIGNED, dirty worktree source hashes distinguish code from baseline SHA.
No actual DICOM bytes were retrieved in this Session test; UID scopes are synthetic
metadata. This is NOT Consent/Grant, cloud deployment, patient approval or Viewer.
Next: guarded schema32 cloud ledger extension/grants rehearsal and apply, mounted
strict Session readiness and actual Azure HTTP, then patient ownership/Consent.

## Azure additive apply — 2026-10-09

Guarded operator script capstone-v3-session-network-cloud.py first ran without
flags: actual Azure DDL/grants/ledger rehearsal8 checks PASS and ROLLBACK baseline
equality verified. Explicit --apply then passed8 checks and committed. Schema32
SHA1b38d397d0db7dc97a279bcc13f9d3e3ab6842a23bd15da921006f4840ace36f.
Only ledger row26 was appended; original25 names/hashes/bundle IDs remain unchanged.
Parent eed5be053b2866916cf759cb809fdfb0ec4d7e439e2ef79fa7a29f0647cacbef,
extension4b6873f9c979341e5fc95554af26e3d12941ceab9090cab28f75592e45ea0868.
Extension digest uses SHA256 of compact JSON array
[HPV3-ADDITIVE-MIGRATION-V1, parent digest, filename, schema digest].
Frozen baseline manifest is not silently rewritten to describe a new full bundle.

Dedicated NOLOGIN owner and FORCE RLS retained. Runtime receives only explicit
INSERT columns, not recorded_at INSERT, SELECT, UPDATE/DELETE or membership.
No historical events were backfilled as trusted provenance. Existing Session/
audit/ledger/ref/Mapping counts unchanged; legacy image/state/health unchanged.
No new Session, Consent, Grant or listener activated. Ambiguous apply outcome
remains NOT VERIFIED/unknown until read-only reconciliation; no automatic retry.
Re-running default/--apply after successful apply intentionally refuses existing
schema/ledger: do not use it as an idempotent overwrite or rollback utility.

Rehearsal and apply manifests both verified:
artifacts/azure/v3-session-network-cloud-20261009T022043660961Z/manifest.json
and artifacts/azure/v3-session-network-cloud-20261009T022125424134Z/manifest.json.
Python operator tests3 and targeted Node3 PASS; secret scanner PASS.

Actual postapply mounted Identity readiness: six registered principals, three
separate strict DB TLS/SCRAM/RLS pools,18 read-only checks PASS and existing
negative bindings DENY. Owned container removed; legacy healthy. Manifest:
artifacts/azure/v3-mounted-readiness-check-20261009T022224Z-2d330169/manifest.json.
This is Identity readiness, NOT Session HTTP/paired-write readiness. Next implement
explicit Session schema/privilege readiness and opt-in mounted composition, then
actual Azure HTTP. New evidence DRAFT/UNASSIGNED; full MVP NOT ACHIEVED.
