# Capstone cloud / Workstation checkpoint — 2026-10-08

Status: DRAFT / UNASSIGNED. Whole distributed MVP: NOT ACHIEVED.

## Latest: Azure schema32 additive activation PASS — 2026-10-09 KST

Actual rehearsal8 checks/Rollback baseline PASS; apply8 checks PASS. NOLOGIN owner,
FORCE RLS, explicit INSERT-only columns, no backfill/SELECT/mutation. Ledger26
adds only schema32; original25 immutable hashes/bundle IDs preserved. Business
row counts and legacy health unchanged, no Session or API listener activated.
Rehearsal/apply manifests verified DRAFT/UNASSIGNED:
artifacts/azure/v3-session-network-cloud-20261009T022043660961Z/manifest.json
and artifacts/azure/v3-session-network-cloud-20261009T022125424134Z/manifest.json.
Python3/Node3 tests and secret scan PASS.

Postapply actual mounted Identity readiness18 PASS: six registered bindings,
three strict TLS/SCRAM/RLS roles, negative bindings DENY, owned cleanup PASS.
artifacts/azure/v3-mounted-readiness-check-20261009T022224Z-2d330169/manifest.json.
Identity readiness is not Session HTTP or write-delivery proof. Next explicit
Session readiness and opt-in mounted composition, actual Azure POST/GET/retry/
isolation/audit validation; then patient Consent/Grant/key release. Never rerun
already-applied operator blindly; existing schema/ledger collision is refused.
Whole MVP/v3 NOT ACHIEVED.


## Latest: actual PostgreSQL fresh Session mTLS HTTP53 PASS — 2026-10-09 KST

Explicit `node scripts/v3-session-network-schema-rehearsal.js --http` exit0,
53checks in34.395s. Real nonowner pg pools and strict HTTP services: fresh POST201,
original receipt retry201, GET200, conflict409, unknownref404, B forged scope403,
B direct SQL0, requester audit0. Operator verifies five exact same-tuple audit
pairs. Actual deadline GET/retry404; failed network write503 leaves no new Session,
audit, ledger or resource residue. Separate preauth writer/reader durably confirms
401/403 socket-origin DENYs. No consent or patient approval inferred.

Owned local tmpfs fixture removed/absence PASS. DB loopback plaintext is explicit;
HTTP strict mTLS verified, not cloud DB TLS/production evidence. Synthetic UID
metadata only, no actual DICOM/View/Grant in this test. Azure unchanged.
Content-hash manifest DRAFT/UNASSIGNED and dirty-source provenance:
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-15-45.526Z/manifest.json`.
Next guarded Azure schema32/ledger/grants and mounted Session readiness/HTTP,
then patient ownership/Consent. Full MVP/v3 NOT ACHIEVED.

Latest content-hash manifest validation PASS exit0. Full security gate
2026-10-09T02:16:53.467Z PASS exit0: unit42.068s,secret1.156s,
dependency1.652s. pnpm11.7.0 pin matches; global manifest warning retained.


## Latest: Session schema32 actual local PostgreSQL35 checks PASS — 2026-10-09 KST

FR-014~025/037~041. Independent owned network-none tmpfs PostgreSQL16 fixture
executed the frozen25 baseline plus exact source profile, schema32 owner rollback/
apply and minimal fixture-only grants. Actual RLS/FK/immutable/finite-time negative
checks and nonowner paired DENY INSERT PASS. Requester audit visibility remains0.
Failed second INSERT rolls back both events; suspended institution rejected.
Schema32 now explicitly checks ACTIVE tenant/hospital as well as principal.

Command `node scripts/v3-session-network-schema-rehearsal.js` exit0,
35PASS in28.348s, owned fixture removed/absence PASS. Initial test-ID collision
FAIL23505 retained; corrected fresh IDs isolate intended FK test23503.
Targeted Node3 and secret scan PASS. Existing runtime data and Azure DB untouched.
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-10-30.473Z/result.json`.
All evidence DRAFT/UNASSIGNED. Next actual PG fresh-create HTTP/durable preauth,
then guarded Azure schema32/ledger/readiness. Full MVP/v3 NOT ACHIEVED.


## Latest: Session HTTP receipt replay audit PASS locally — 2026-10-09 KST

FR-014~025/037~041. Original response is preserved, successful retries now emit
new SESSION_READ/METADATA_READ with paired provenance in strict mode. Requester
receives no receipt on audit failure; conflict/expired retries retain paired DENY.
Optional router composition requires strict services and trusted shared authority;
default mounted runtime is not expanded. Authentication observation supports the
existing validated observer, not untrusted caller-supplied audit JSON.

Actual local mTLS HTTP edge/router/services test PASS using explicit transaction
adapter fixture (not live PostgreSQL/RLS): replay201,GET200,conflict409,expired404,
missing bearer401,unsigned ingress403,encoded alias422,audit-failure503/ROLLBACK.
Node14/Python14 targeted PASS. Full gate2026-10-09T02:05:46.968Z PASS exit0:
unit43.150s,secret1.434s,dependency1.817s. Initial fixture-path test failure is
retained in evidence; corrected to existing cert, no TLS relaxation.
`artifacts/azure/v3-session-http-replay-local-20261009T020546Z/result.json`.

Next: schema32 isolated live RLS rehearsal and fresh creation/preauth durable
HTTP tests, guarded Azure ledgered apply/readiness, then mounted cloud Session
HTTP and patient Consent. No full MVP/v3, legal or production readiness claim.


## Latest: Session network provenance foundation — 2026-10-09 KST

FR-014~025/037~041: strict create/read service mode, paired Session domain/network
audit writer, strict HTTP dependency checks and additive schema32 implemented.
Shared actual mTLS/signed-ingress capability is reused without weakening TLS or
granting requester audit:read. Node19 and Python6 targeted tests PASS. Local
transaction-adapter failure rolls back; this is not live PostgreSQL/RLS proof.

Unchanged full security gate2026-10-09T02:00:50.605Z PASS exit0: unit48.415s,
secret1.028s, dependency1.461s. pnpm executed11.7.0; global manifest version
warning preserved. Evidence:
`artifacts/azure/v3-session-network-foundation-20261009T020050Z/result.json`.

Schema32 Azure apply/ledger enrollment, Session HTTP routing/end-to-end,
successful retry network audit, profile rollback/reapply and persistent scanned
activation remain NOT VERIFIED/not implemented. No cloud privilege changed.
Next: retry audit contract, strict HTTP composition/test, isolated schema/RLS
rehearsal, guarded cloud apply; then patient Consent and Grant/key release.
See `docs/api/highpass-v3-session-network-audit-contract.md`.


## Latest: actual REQUESTED Session service and recovery reuse PASS — 2026-10-09 KST

Related FR-006~009/014~025/037~041. Explicit --session mode uses locally
byte-validated CT/MR Series selection, registered version2 A requester and the
existing V3ExchangeSessionService/V3ExchangeReadService over nonowner strict
TLS/SCRAM/RLS pools. Requested actions are study:view and study:pacs-transfer
intentions, not granted capabilities. Mapping stays UNVERIFIED/version1.

Actual service creation persisted one REQUESTED/version1 Session. Same command/
key returns the identical original creation receipt; read preserves the two
Study/two Series snapshot. Changed purpose with same key409, unknown owned-ref404,
B forged exchange scope403 and B direct RLS visibility0 verified. Requester
cannot read audit rows without audit:read; that denial is asserted, not bypassed.

Early attempts remain NOT VERIFIED. Initial DB read-only reconciliation showed
zero Sessions/results. Safe SQLSTATE42501 diagnostics found existing restrictive
audit RLS dependencies: four SELECT-only proof columns on exchange_state_events,
and EXECUTE on SECURITY INVOKER exchange_expirer(uuid,uuid). Both were rehearsed
with ROLLBACK before narrow application. No state-event INSERT/UPDATE/DELETE,
expiry-policy membership, cancel/expiry scope or Session state UPDATE was added.
Existing RLS/trigger policies and TLS verification were not changed.

After creation, the first audit check failed because requester audit visibility
was correctly zero. Its proven creation receipt was retained root-only despite
later QA failure. Explicit --resume-session-operation reuses that exact command,
idempotency key and Session ID; no replacement Session is generated. It refuses
dataset/scope/receipt drift and expired/terminal service replies fail closed.
Fixed remote pointer files are noclobber root0600 under root0700 authority;
opaque Session/ref IDs and retry keys are stripped before public evidence.
Receipt version2 adds private correlation ID for operator audit verification;
historical version1 receipts remain readable for exact recovery.

Latest actual PASS:
`artifacts/azure/v3-mounted-runtime-check-20261009T014612Z-a1e56dae/result.json`.
Thirteen outcome records include existing Mapping HTTPS/TLS and internal Session
QA. Pinned operator aggregate audit proves one original SESSION_CREATED event,
one current SESSION_READ, one IDEMPOTENCY_CONFLICT denial and one SOURCE_REF_UNAVAILABLE
denial. Current create count0 confirms this run reused the existing Session.
This operator check is not requester audit authority, Session HTTP provenance,
WORM, DR or a deployed audit UI. Owned container cleanup and legacy health PASS.
Protected recovery file:
`/opt/highpass/v3-runtime-authority-c956118db69145c0907e9b6f95b03517/synthetic-a-session-a1e56dae383e4f958448910e6f366568.json`.

Final dependency apply evidence:
`artifacts/azure/v3-session-audit-dependency-20261009T014322282981Z/result.json`.
Both latest results have DRAFT/UNASSIGNED content-hash manifests.
Python QA/receipt tests14 PASS. Source profile and phantom selection Node tests8
PASS. The full gate attempt2026-10-09T01:49:46.270Z FAILED: unit process SIGTERM/
timeout and scanner ENOENT for a disappearing generated Python cache file.
This failure is not hidden. Scanner now excludes only __pycache__ (already
gitignored); regression verifies Python source secret markers still FAIL.
Standalone scanner and regression PASS. No test gate was skipped or hardcoded.

Next: mount existing Session HTTP handler behind verified ingress with domain/
network audit binding, test actual POST/GET/retry/isolation, then patient principal/
Consent composition. Session HTTP, patient Consent, Grant, preflight,
encrypted A -> Azure Key Vault -> B Viewer and expiry/revocation remain unproven.
Profile dependency rollback/reapply and scanned persistent activation remain.
Whole distributed MVP/v3 NOT ACHIEVED; production approvals DEFERRED.

Unchanged gate rerun2026-10-09T01:51:50.915Z PASS exit0: full Node unit
suite41.417s, secret scan1.023s, dependency audit1.474s. No timeout increase,
TLS relaxation, signature bypass or test skipping. Original unit timeout cause
is NOT ESTABLISHED; the later pass does not retroactively change its FAIL.

## Latest: source-only registry version2 and DB profile applied — 2026-10-09 KST

Related FR-014~025/037~041. Version1 config and original authority directory are
preserved. Explicit version2 gives only canonical A requester exchange:create/
read in addition to mapping:read/write. All other five principals retain exact
version1 scopes. Broader consent/cancel scopes, foreign identifiers and version3
are refused. Version2 cannot use the fresh-directory bootstrap SQL builder;
only the separate guarded transition supports this scope change.

Actual Azure activation PASS,7 postchecks. New protected authority operation:
`c956118db69145c0907e9b6f95b03517`;
directory `/opt/highpass/v3-runtime-authority-c956118db69145c0907e9b6f95b03517`.
Registry SHA28adc1fa53bbea651e0f0adde2e2453e481bfac349f59431718fd7fc0eeec55c.
Parentroot0700, registry/key filesroot:65532:0640. Existing independent keys
are copied inside cloud only; no private key content is exported. A root0600
operation receipt records stage, SQL hash and postcheck phase. No old mount
file overwritten. DB/source-directory comparison checks all six principals
before/after, not only the A requester. Ambiguous SQL outcome retains staged
state for reconciliation and is not blindly retried.

Actual applied privileges are six explicit Session assembly/audit tables
SELECT/INSERT, Session ID UPDATE for locks and four SECURITY INVOKER predicate/
constraint functions. No state UPDATE, cancel scope, patient approval, consent
tables or preauth privilege merger. No Session created. No persistent API/proxy
activation or scanned deployment. Rehearsal is no longer the current DB state:
Identity-only enrollment verification is historical after this intentional
profile transition. Original version1 authority must not be presented as the
current matching runtime directory without profile rollback/reconciliation.

Actual separate-role TLS/SCRAM/RLS QA and six registered principal checks PASS;
three-pool readiness18 probes PASS, cloned binding/wrong hospital/requester
review/expired mock token DENY. New authority runtime HTTPS Mapping regression
PASS: idempotent same A reference/Mapping, UNVERIFIED/version1, B404, requester
review403, paired/preauth audit and owned container cleanup. Legacy healthy.
Protected pointer/metadata packet are restaged in new authority with identical
previous content hashes; metadata still PENDING_HUMAN_REVIEW and carries its
historical LOCAL_FILES_VERIFIED_LIVE_A_NOT_REVERIFIED qualifier. Separate live A
source evidence from01:21 remains point-in-time, not an authorization freshness
lease. No human review or consent is inferred.

Evidence (each has verified DRAFT/UNASSIGNED manifest):
- `artifacts/azure/v3-source-exchange-activation-20261009T013226Z-c956118d/result.json`
- `artifacts/azure/v3-mounted-readiness-check-20261009T013237Z-b5e88ece/result.json`
- `artifacts/azure/v3-mounted-runtime-check-20261009T013302Z-e01e2fd3/result.json`

Python operator tests3 and targeted Node tests10 PASS. Next: actual source-owned
REQUESTED Session create/retry/resource scope/isolation through existing service
and registered version2 authority, then patient Consent composition. Profile
rollback/reapply must be tested before persistent activation; old files alone
are NOT a proven rollback. Full encrypted A -> Azure Key Vault -> B Viewer,
revocation/expiry and persistent scanned deployment remain.
Whole distributed MVP/v3 NOT ACHIEVED; legal/production approvals DEFERRED.

Latest Security Gate2026-10-09T01:34:19.859Z PASS exit0: full Node unit
suite42.603s, secret scan1.138s, dependency audit1.672s. pnpm11.7.0 pin
matches executed tool; global manifest mismatch warning retained. Runtime
evidence retains its own captured source hashes; no dirty-source commit claim.

## Latest: source Session minimum privilege rehearsal — 2026-10-09 KST

Related FR-014~025/037~041. Current deployment deliberately has Identity-only
grants and six mapping-only synthetic principals. Existing Session code cannot
be called successfully by manufacturing exchange:create in a token: both
registered scopes and DB authorization must be aligned first.

Added fixed source-Session profile builder and pinned operator rehearsal.
The SQL always ends ROLLBACK; no activation mode. It permits only source A
requester's exchange:create/read intentions, six explicit Session assembly/
audit tables SELECT/INSERT and Session ID column UPDATE for FOR SHARE.
Safe nonowner role, exact membership, no schema CREATE, forced RLS, NOLOGIN
schema owner and SECURITY INVOKER predicate ownership are checked before grants.
No consent tables, patient approval, cancel scope/state UPDATE, Grant, expiry
worker, preauth write/read merger or broad schema grants are introduced.

Actual Azure SQL-role rehearsal7 checks PASS: profile privileges, destructive
denial, consent denial, preauth separation, zero unbound Session visibility,
one source principal only and exact scopes. Post-ROLLBACK comparison confirms
original scopes, Session SELECT denial and Session row count unchanged.
Existing legacy service remains healthy. Registry mount was not modified;
no Session, patient consent or clinical access created.
Evidence:
`artifacts/azure/v3-source-exchange-rehearsal-20261009T012715528003Z/result.json`.
SQL hash7d9a595f7e38ff55c5d631cc6e7001bba95cbd2c49f9559a8ddd6ca0cd7e71b8.
Profile/operator tests3 PASS. DRAFT / UNASSIGNED.

Current-source Security Gate2026-10-09T01:28:04.250Z PASS exit0:
full Node unit suite41.323s, secret scan1.250s, dependency audit1.503s.
Executed pnpm11.7.0 matches project pin; the global manifest mismatch warning
is retained. No lockfile recreation, signature bypass or TLS relaxation.

Initial rehearsal attempts remain NOT VERIFIED. Safe diagnosis identified
missing exchange_canceller EXECUTE: existing Session SELECT RLS evaluates that
SECURITY INVOKER predicate. This function grant does not permit cancellation:
the separate exchange:cancel scope and state/event mutation grants are absent.
No RLS/TLS policy was weakened. SQL errors are reduced to fixed diagnostic
codes/function names; private key contents and raw errors are never exported.

Next: version the mounted synthetic registry for this source-only scope change,
apply/reconcile the exact DB profile with an explicit recoverable operator
receipt, then run actual authenticated Session creation/retry/isolation using
the validated phantom Series selection. SQL SET ROLE checks here are not SCRAM
login, service HTTP or Session creation E2E evidence. REQUESTED remains intention,
not source ownership verification, patient consent or clinical authorization.
Then compose patient Consent and encrypted A -> Azure Key Vault -> B Viewer,
revocation/expiry, scanned persistent activation and rollback.
Whole distributed MVP/v3 NOT ACHIEVED.

## Latest: live A phantom reverified and explicit Session selection — 2026-10-09 KST

Related FR-006~009/014~020/026~031. Pinned A VM verify-only run exited0.
All24 existing mathematical CT/MR phantom instances passed strict mTLS WADO
byte-hash and256x256 PNG checks; two QIDO Series returned12 instances each.
PACS count stayed28, zero additions/deletions, original instance IDs preserved.
Owned probe and temporary stage cleanup PASS. This is operator source-integrity
evidence, NOT Gateway user authorization, patient consent or B Viewer E2E.
Evidence and verified DRAFT/UNASSIGNED manifest:
`artifacts/workstation/phantom-source-2026-10-09T01-21-06.138320+00-00/result.json`.
The historical result's cloudMappingAndMetadata field means this source probe
performs no cloud registration; it does not undo the separately registered A
PatientRef/UNVERIFIED Mapping. Live check is point-in-time, not a freshness lease.

`selectPhantomExchangeResources` now consumes only an immutable locally
validated phantom candidate and explicit Study/Series choices, then normalizes
with existing `parseExchangeResourceSelection`. No duplicate Session schema.
Unknown Study, unknown Series, Series belonging to another Study, implicit
whole-Study expansion and parsed/copied/unvalidated candidates are rejected.
Validated nested metadata is frozen against modification after validation.
Selected resources contain only existing contract fields; no token or approval.

Targeted candidate and Session-contract tests9 PASS; actual local dataset CT
Series selection returns the expected existing Session resources shape with
clinicalAuthorization=false and sessionCreated=false. No new catalog HTTP/DDL,
registry scope expansion, Session creation, consent or clinical grant occurred.
The selector intentionally cannot treat the protected JSON review packet as
in-process validated provenance or use source integrity as access authorization.

Next: compose source-owned REQUESTED Session through the existing verified
principal/service transaction, with narrowly scoped exchange:create registration
and DB grants verified before use; then patient authority/Consent and encrypted
A -> Azure Key Vault -> B Viewer, including revocation/expiry. Mapping verification
remains an independent reviewer workflow, mandatory for destination PACS_IMPORT.
Full distributed MVP/v3 remains NOT ACHIEVED.

Current-source Security Gate2026-10-09T01:23:02.117Z exited0: full Node unit
suite PASS(42.486s), secret scan PASS(1.358s), dependency audit PASS(1.715s).
Executed pnpm11.7.0 matches project pin; global manifest11.22.0 mismatch warning
retained. No signature/TLS bypass or lockfile regeneration.

## Latest: synthetic metadata review packet preserved — 2026-10-09 KST

Related FR-014~020/037~041. Deterministic local DICOM validation covers two
synthetic CT/MR Studies, two Series and 24 mathematical phantom instances.
Every file must match the generator byte-for-byte, UID, size and SHA256;
foreign patient identifiers, altered pixels and clinical-use flags are denied.
Only metadata is staged; no DICOM pixels, plaintext patient local identifier,
token or private key is exported to the cloud review packet.

Actual Azure rerun preserves the existing root-only metadata review packet
without replacement: SHA256 e2f30f89fc55e351ff2447b4f3136297efd21599e42371ef8630d059ffa7978e.
The protected registration pointer is also preserved, and actual HTTP Mapping
read remains UNVERIFIED/version1. Requester review is denied403; B isolation404.
Explicit candidate approval/production-scope claims are rejected before remote
writes. Parent ownership/mode is checked before packet reuse or creation.
No human approval, consent, catalog registration or clinical access is implied.
Review status remains PENDING_HUMAN_REVIEW; new evidence DRAFT / UNASSIGNED.

Latest actual result:
`artifacts/azure/v3-mounted-runtime-check-20261009T011939Z-616147ac/result.json`.
Runtime QA exit0; owned container removal and legacy health PASS. Manifest
binds this result to its content hash and baseline repository commit, not to a
claim that dirty source changes have been committed. Source-overlay QA is NOT
persistent/scanned image deployment.
Security Gate2026-10-09T01:19:31.279Z exit0: unit suite, secret scan and dependency
audit PASS. Python receipt/packet tests5 and runtime-program tests5 PASS using
direct test-file execution. Unittest discovery for dotted filenames found zero
tests; that attempt is NOT a passing verification.

Important correction to earlier next-step wording: no approved v3 imaging
catalog persistence/API contract currently exists. This packet is review input,
NOT a substitute catalog. Current contracts require VERIFIED Mapping for
destination PACS_IMPORT, not for every REQUESTED Session creation.

Next implementation work: define the scoped source-metadata connector contract
against the approved Session resource selection model, reverify live A phantom
integrity, then connect patient authority/Consent and A -> Azure Key Vault -> B
Viewer with expiry/revocation. Separate reviewer action must not be fabricated.
Persistent scanned activation, rollback and runtime untrusted/expired certificate
negatives remain. Whole distributed MVP/v3 NOT ACHIEVED; production approvals
DEFERRED.

## Latest: protected synthetic registration pointer stored/reused — 2026-10-09 KST

Related FR-014~025/037~041. Actual successful registration/mapping flow now emits
a private pointer only over pinned encrypted operator SSH. Python removes it
before any public result/evidence/log output. It contains synthetic opaque ref/
Mapping IDs and fixed enrolled A requester/tenant/hospital, dataset label and
UNVERIFIED_AT_REGISTRATION baseline; no token, key, plaintext patient local ID,
human review, consent or authorization. No new HTTP pointer API.

Root-only remote file:
`/opt/highpass/v3-runtime-authority-e66a674ede1a4fcebc5c9043670dfe09/synthetic-a-phantom-registration.json`.
Parent0:0:0700, file0:0:0600, regular nonsymlink/single-link, max4096 bytes.
Exact schema/types/UUIDv4, approved synthetic A owner and qualifier checked.
Creation is noclobber; changed pointer replacement refused; exact same receipt
preserved without overwrite. Remote content SHA verified:
c2a9ba6c066b646b066b8c939a8645e6067e106f54a8d6e151b66ff25e726f9c.
This pointer is not an authority capability; future use must independently
query live registry/ref/Mapping status and obtain real scoped review/consent.
Root can modify it: this is protected storage, NOT WORM or independent approval.

Initial pointer create01:10:49 PASS; actual rerun01:11:18 confirms same pointer/
hash, same PatientRef/Mapping, UNVERIFIED/version1, 201/200, B404/requester-review403.
Evidence:
`artifacts/azure/v3-mounted-runtime-check-20261009T011118Z-4ecf0c60/result.json`.
PASS exit0,11 existing outcome records; stop/container absence/legacy health PASS.
No opaque IDs exported into public evidence. Receipt3 tests PASS, existing QA5
tests PASS, secret scan PASS, manifest verified PASS; DRAFT / UNASSIGNED.
Source-overlay QA is not scanned image deployment; prior full JS gate predates
operator changes and is not claimed as newly executed.

Next: align live A phantom metadata (existing24 CT/MR synthetic slices) to this
UNVERIFIED reference using approved scoped catalog registration, expose separate
reviewer workflow without automatic VERIFIED, and implement B/patient principal
and Session/Consent composition. Metadata alignment is not identity review.
Full encrypted A -> Azure Key Vault -> B Viewer and expiry/revocation, scanned
persistent activation/rollback and untrusted/expired runtime client tests remain.
Whole distributed MVP/v3 NOT ACHIEVED; production approvals DEFERRED.

## Latest: synthetic A PatientRef and Mapping HTTP registration PASS — 2026-10-09 KST

Related FR-014~025/037~041. Explicit --runtime --mapping operator mode added;
baseline transport QA does NOT register refs/mappings. Actual Azure nonowner
V3PatientRefService registers the synthetic A reference idempotently using the
registered requester and fixed operation key CAPSTONE-PHANTOM-REF-A-20261009.
This is internal operator bootstrap, NOT a new patient-ref HTTP endpoint.
Existing internal transaction/idempotency/audit semantics retained; bootstrap
has domain audit but no HTTP network-audit claim. No new grants/migrations.

Local reference HP-TEST-PHANTOM-001 is SYNTHETIC phantom data. Existing identifier
provider encrypts it with context-bound AES-GCM plus scoped keyed lookup.
Actual HTTPS frontend -> trusted proxy -> mTLS strict Mapping API:
reconcile201, identical request/key retry201 with SAME_MAPPING, GET200.
A new QA run reuses the same PatientRef and existing Mapping through idempotent
registration/scoped lookup; no deliberately duplicated patient or identity merge.
Mapping remains UNVERIFIED version1; no reviewer action or patient consent issued.
Synthetic persistence is intentional and not removed during container cleanup.

B requester reading A Mapping404 V3_MAPPING_NOT_FOUND. A requester trying
review403 V3_SCOPE_NOT_ALLOWED. Follow-up GET confirms UNVERIFIED/version1.
Response contains no synthetic local ID, protected envelope or digest.
Actual human identity linkage, cross-institution identity equivalence, verified
mapping, consent and clinical Viewer access remain unproven; do not infer them
from successful registration. Registration itself cannot unlock those gates.

Evidence `artifacts/azure/v3-mounted-runtime-check-20261009T010853Z-e5498d16/result.json`.
PASS exit0;11 outcome records including earlier TLS/proxy/paired audit checks;
owned frontend/runtime/container stop/absence PASS, legacy healthy.
Previous01:08:04 registration QA PASS preserved. No token or opaque ref/Mapping
ID exported to public evidence. Python QA5/5 PASS, targeted ref/mapping JS12/12
PASS, secret scan PASS, manifest verified PASS. DRAFT / UNASSIGNED.
Prior full JS gate predates Python extension, not a freshly run full gate.

Next: persist a protected operator bootstrap receipt to locate the approved
synthetic reference/mapping without public identifier leakage; scoped phantom
metadata alignment and explicit separate reviewer workflow before Session/
Consent integration. Keep independent review and patient approval visibly
pending, not auto-PASS. B own ref/mapping, patient actor registration, scanned
persistent deployment and encrypted A -> Azure Key Vault -> B Viewer remain.
Whole distributed MVP/v3 NOT ACHIEVED; production approvals DEFERRED.

## Latest: actual HTTPS proxy and committed audit verification PASS — 2026-10-09 KST

Related FR-014~025/037~041. Actual owned loopback HTTPS frontend using the dedicated
API server certificate -> real `createV3IdentityCapstoneProxy` -> mTLS Identity
backend -> existing registry/RLS/transactions, with actual Azure database.
No public port, legacy listener replacement, persistent activation or clinical
success claim. Source-overlay QA remains distinct from scanned image promotion.

No-token request through frontend returns401. In-RAM short synthetic requester
token, fresh trace/audit-session and missing Mapping request returns404
V3_MAPPING_NOT_FOUND. A separate nonowner clinical connection, BEGIN READ ONLY
and exact requester RLS context verifies one committed domain/network audit pair
joined by the six-column identity tuple. Action MAPPING_DENIED, result DENY,
reason MAPPING_NOT_FOUND, real immediate source127.0.0.1, expected signed-proxy
ingress mode and actual dedicated proxy certificate fingerprint all match.
Spoofed forwarded source203.0.113.99 ignored. No token/clinical identifier/trace
export; this is a missing-resource denial, not successful Mapping or consent.

Ingress-denial request uses a randomly chosen local-loopback source with a
before/after event-ID baseline. Separate nonowner reader confirms exactly one
fresh INGRESS_REJECTED/DENY/IMMEDIATE_SOCKET record from that actual socket source,
then confirms the same event remains after API stop. Query is read-only and
polling/request/outer container lifetimes bounded. This demonstrates committed
storage across API stop, NOT PostgreSQL crash recovery, DR, WORM or all-event
delivery. Immutable QA audit rows intentionally retained, not deleted.

Evidence `artifacts/azure/v3-mounted-runtime-check-20261009T010553Z-b9ceeebc/result.json`.
PASS exit0;9 outcome records, owned frontend/runtime/container stop/absence PASS;
legacy service healthy. Previous transport and proxy-only QA records preserved.
Python QA4/4 and targeted proxy/network JS4/4 PASS; secret scan PASS.
Manifest verified PASS; DRAFT / UNASSIGNED. Prior full JS gate00:56:28.956Z
predates Python QA changes and is not claimed as a fresh full gate.

Still pending: positive patient-ref/mapping HTTP, independent actual review,
Session/Consent and grant composition, real encrypted A -> Azure Key Vault -> B
Viewer flow, untrusted/expired client cases on this runtime, scanned persistent
deployment and rollback. Next prioritize synthetic patient-ref and mapping
registration through existing bounded nonowner services; never mark review or
consent approved merely by seeding data.
Whole distributed MVP/v3 NOT ACHIEVED; production approval items DEFERRED.

## Latest: actual mounted runtime start/stop and TLS QA PASS — 2026-10-09 KST

Related FR-014~025/037~041. Existing pinned Azure image with28 current source
overlay files, Linux UID65532, read-only filesystem/mounts, no capabilities,
no-new-privileges and owned private DB network. Three separate scoped role
files/pools in one process, dedicated API certificate and trusted proxy client
certificate. No published port or persistent service deployment.

Actual `startCapstoneMountedIdentityService` passed three-pool readiness and
opened owned loopback127.0.0.1:19445. Trusted client mTLS and valid signed ingress
reached router:404 V3_ROUTE_NOT_FOUND for deliberately unknown probe route.
This proves transport admission only, NOT successful clinical/authenticated
mapping API work. Missing ingress signature403 V3_IDENTITY_EDGE_DENIED;
no client certificate TLS denial ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED;
wrong server hostname ERR_TLS_CERT_ALTNAME_INVALID. No reset/DNS/timeout treated
as policy DENY. Actual service.stop PASS; owned container removed/absence PASS,
legacy service healthy. All6 outcome records verified.

First runtime QA01:02:27 PASS retained. Current wrapper additionally requires
actual process exit0, not merely JSON status. Re-run with current wrapper:
`artifacts/azure/v3-mounted-runtime-check-20261009T010311Z-19147755/result.json`,
PASS exit0, manifest verified PASS, DRAFT / UNASSIGNED.
Python QA4/4 PASS; targeted startup/runtime/edge JS6/6 PASS; syntax/secret scan PASS.
Latest full JS gate00:56:28.956Z predates Python operator changes and is not
claimed as a newly run full gate.

Negative ingress/TLS events can enter the existing preauth audit sink; durable
delivery was not queried/proven and remains NOT VERIFIED. No patient consent,
mapping review or clinical domain write requested. Public source stages retained;
private keys never exported. Source-overlay QA is NOT scanned image promotion.
Actual proxy frontend HTTP, untrusted/expired client tests on this runtime,
scoped mapping HTTP, clinical Viewer E2E, persistent activation and rollback
remain pending. Existing local tests cannot substitute for these cloud gates.

Next: actual HTTPS proxy-to-runtime requests and durable preauth audit verification;
then scanned guarded deployment, synthetic patient refs/independent mappings,
Session/Consent and encrypted A -> Azure Key Vault -> B Viewer expiry/revocation.
Whole distributed MVP/v3 NOT ACHIEVED. Production approvals remain DEFERRED.

## Latest: dedicated API/proxy development certificates staged — 2026-10-09 KST

Related FR-014~025/037~041. Actual remote operation
a5e5eedb9664445b88682628b8e3073f generated separate RSA2048 API/proxy keys.
Only public CSR/certificate data crossed SSH; signing used the existing project
development CA. Neither private key nor CA key was exported, logged or Git-added.
Root0700 directory:
`/opt/highpass/v3-identity-tls-a5e5eedb9664445b88682628b8e3073f`.
Runtime key/certificate/CA files root:65532 mode0640, single-link checked.
No database reload, legacy listener replacement or new API activation.

API: CN Highpass Identity API DEVELOPMENT ONLY, serverAuth,
SAN localhost/127.0.0.1, serial5a4535a9d49c48689969d3d9cb59500c,
valid2026-10-09T00:58:16Z through2026-11-08T00:58:16Z,
SHA25614c5372643c9f6c4cd309a67384e55e43bf822c8e18014e5e0a1c0b08ddfbf2b.
Proxy: CN Highpass Identity Proxy DEVELOPMENT ONLY, clientAuth,
URIspiffe://highpass.local/dev/identity-edge-proxy,
serialfcaa3d87c63a4d73825f7b6dde6a5316,
valid2026-10-09T00:59:21Z through2026-11-08T00:59:21Z,
SHA256f3720ba86272f926375235e997277a6034816b9cb0debd1dfac3833d5a7cf8b1.
Both actual CA verification/key match PASS; distinct public keys PASS.
Both wrong-purpose checks DENY (OpenSSL error26); API wrong hostname DENY
(error62). Transport errors/timeouts are not accepted as policy DENY.
These are30-day synthetic-development certificates, not production credentials.

Evidence:
`artifacts/azure/v3-identity-tls-prepare-20261009T010024Z-a5e5eedb/result.json`.
PASS exit0, manifest verified PASS, DRAFT / UNASSIGNED; legacy healthy.
Initial00:58:14 and00:59:17 NOT VERIFIED records retained. First failure's
single combined command did not isolate the precise cause; it remains NOT VERIFIED.
Resume reuses exact existing key/CSR/certificate without renewal/overwrite.
Verification now has per-step diagnostics, numeric UID/GID checks and bounded
NotBefore remote-clock waiting (no date/TLS bypass). Earlier immediate failure
may have involved clock timing; this is inference, not established root cause.

Python certificate checks3/3 PASS, syntax PASS, secret scan PASS.
Latest full JS Security Gate00:56:28.956Z predates this operator; not presented
as a newly run full gate for it. Current stage is certificate staging only,
not runtime TLS handshake/HTTP tests, scanned image promotion or rollback proof.
Next: owned mounted-secret runtime startup QA with these files and actual DB,
trusted proxy/no-client/wrong-client boundaries, then scanned guarded activation.
Whole distributed MVP/v3 NOT ACHIEVED; production approvals remain DEFERRED.

## Latest: mounted Identity entrypoint implemented, not activated — 2026-10-09 KST

Related FR-014~025/037~041. Added
`src/v3-capstone-mounted-service.js` and
`scripts/start-v3-capstone-identity.js`.
Explicit CAPSTONE_SYNTHETIC_ONLY is mandatory; fixed protected mount paths,
Linux UID65532, root/group/mode/link checks, finite DB/TLS/readiness and stop
deadlines. Dedicated API TLS files must be mounted as
`/run/secrets/highpass-v3-api-server.key`,
`/run/secrets/highpass-v3-api-server.crt`,
`/run/secrets/highpass-v3-api-ca.crt` (root:65532 mode0640).
Existing host verifies CA signature, localhost SAN, serverAuth, key match and
valid dates, enforces mTLS and binds loopback only. No reuse of DB server key.

Composition decision: preserve the existing
`createV3IdentityCapstoneRuntime` architecture, with three separately named
nonowner role files and three distinct pools in ONE process. The provisioning
master/directory must never be mounted. DB roles remain disjoint, but process
compromise could expose all three scoped credentials; this is NOT process
isolation or production readiness. Earlier blanket prohibition against all
three credentials in one service overstated the implemented composition and
is superseded by this explicit minimal-file/role boundary, not a weakened DB
grant or removal of a security check. Separate worker processes remain a
pre-production hardening item.

Startup mints an in-RAM30-second synthetic requester token solely to obtain a
fresh registry-assured readiness binding. No token output/save, patient principal,
consent, mapping review, migration or grant. Listener starts only after actual
readiness succeeds; failed startup stops owned runtime/pools and clears copied
key buffers. SIGTERM/SIGINT cleanup returns nonzero on timeout/failure.
This is DEVELOPMENT MOCK AUTHENTICATION, not real patient or MFA proof.

Targeted startup/runtime/mount tests7/7 PASS; entrypoint syntax PASS.
Security Gate00:56:28.956Z PASS exit0 (units41.202s, secrets1.075s,
dependency audit1.612s), executed pnpm11.7.0 matches project pin, global
manifest11.22 warning retained. Evidence:
`artifacts/security/capstone-mounted-identity-entrypoint-gate-20261009.json`.
Dedicated API SAN/EKU profile:
`config/capstone-v3-identity-api-dev-server.ext`; this is not an issued certificate.
Start command after provisioning/scanning, NOT yet executed on Azure:
`HIGHPASS_V3_CAPSTONE_MODE=CAPSTONE_SYNTHETIC_ONLY node scripts/start-v3-capstone-identity.js`.
Default API port9445 is loopback only; this command alone provides no public proxy.
Positive protected-mount API startup/actual trusted proxy HTTP integration NOT VERIFIED.
No new listener, external ingress, Docker deployment or image promotion yet.
Next: remote-generated dedicated API/proxy development keys/certificates,
public CSR signing with existing project CA, key-match/role/expiry negatives,
then scanned guarded runtime/proxy activation and actual Identity HTTP flow.
Whole distributed MVP/v3 NOT ACHIEVED; new evidence DRAFT / UNASSIGNED.

## Latest: actual Azure three-role readiness PASS — 2026-10-09 KST

Related FR-014~025/037~041. Actual mounted-secret read-only diagnostic used the
existing pinned image, current source overlay, Linux UID65532, private verified
DB TLS and three separate exact role credential files (not the provisioning
master). This short-lived QA process has all three role files; this is NOT
process-level isolation or authority to claim the eventual runtime has it.
The runtime credential composition decision remains required before activation.

All six registered A/B requester/reviewer/doctor bindings passed each of the
clinical, preauth-publisher and preauth-reader probes:18/18 readiness role checks.
The probes verify nonowner/no-bypass roles, active enrolled authority, RLS/FORCE
RLS, required guards, composite audit FK, and exact preauth role/grant separation.
Cloned binding denied with VERIFIED_MAPPING_BINDING_REQUIRED before storage.
Existing wrong-hospital/requester-review/expired-token negatives also DENY.
No domain write, consent issue, mapping review, HTTP listener or image promotion.
This point-in-time read-only check does not prove actual write/audit delivery.

Evidence `artifacts/azure/v3-mounted-readiness-check-20261009T005357Z-adf9a323/result.json`.
Exit0, PASS; all previous failed QA containers absent, current QA container
removed and absence checked, legacy service healthy. Public source overlay
retained under operation adf9a323d3f4403c9ba6acf260593eb6.
Manifest verified PASS; all evidence DRAFT / UNASSIGNED.
Python QA tests3/3 PASS; targeted readiness/runtime/secret JS tests7/7 PASS.
Previous full Security Gate00:52:35.479Z PASS predates this Python QA extension;
it is not claimed as a freshly executed gate for the extension.

Next: resolve runtime pool/file versus process boundary explicitly, prepare
separate development API/proxy certificates and mounted-secret entrypoint,
scan/build and guarded start; then synthetic patient registration/mapping,
session/consent and encrypted A -> Azure Key Vault -> B Viewer E2E.
Whole distributed MVP/v3 NOT ACHIEVED. New API HA/Grant NOT VERIFIED.
PIPA/ISMS-P/hospital production approval DEFERRED.

## Latest: synthetic directory enrolled and mounted authority verified — 2026-10-09 KST

Related FR-014~025/037~041. Supersedes the earlier unregistered-directory
prerequisite, not the still-unverified API startup or full clinical workflow.
Actual Azure registration committed atomically:2 tenants,2 hospitals,6 principals.
Each hospital has distinct HOSPITAL_ADMIN requester (mapping:read/write),
SECURITY_ADMIN reviewer (mapping:read/review), and DOCTOR (mapping:read).
No PATIENT principal, patient ref or mapping exists from this enrollment.
No patient consent, clinical approval or mapping review was manufactured.
Legacy service remains healthy; no v3 service/listener activated.

Registry: `config/capstone-v3-synthetic-registry-20261009.json`, SHA256
`b4c82392a68f1c135633ba46c0dba97b9adc2ad27a76615add4781b54e0b6eed`.
Authority mounts are beneath
`/opt/highpass/v3-runtime-authority-e66a674ede1a4fcebc5c9043670dfe09`:
root0700 parent, registry and authority-key files root:65532 mode0640.
Five independent keys cover mock authentication, ingress, idempotency, local
identifier AES-GCM encryption and lookup. No key export/log/Git storage.
This identifier adapter is DEVELOPMENT LOCAL ENCRYPTION, not Azure Key Vault,
real IdP/MFA, patient ownership proof or independent human approval.
Operator receipt is root0600, not immutable/WORM evidence.

Evidence:
- `artifacts/azure/v3-synthetic-registry-20261009T004332Z-e66a674e/result.json`: PASS.
- `artifacts/azure/v3-mounted-authority-check-20261009T004715Z-3d95e4f3/result.json`: PASS.
- `evidence/generated/hp-v3-migration-2026-10-09T00-42-53-747Z-06156960/rehearsal.json`:54/54 PASS,33.943s, source unchanged and cleanup PASS.

Actual read-only nonroot QA uses one clinical credential file, private verified
DB TLS, mounted authority and current source overlay. Six signed synthetic
principal bindings match active DB directory roles/scopes; other-principal
visibility denied by RLS. Wrong hospital, requester attempting review, and expired
mock token DENY with exact policy reason. QA container removed; absence verified.
Prior failed runs retained, including DOCTOR_PRINCIPAL_INCOMPLETE. Only the test
doctorId claim was corrected; authentication requirements were not relaxed.
Overlay QA is not scanned new-image promotion or clinical HTTP E2E.
All new evidence remains DRAFT / UNASSIGNED; manifest hashes verify independently.
Git SHA records the base commit, not a claim that dirty source is committed.

Local regression: targeted8/8 PASS; Python enrollment/QA syntax PASS; all3
manifest verifications PASS. Initial Security Gate00:50:24.593Z FAIL exit1
at unit tests (no captured failure detail); secrets and dependency audit PASS.
Direct full test rerun675/675 PASS,41.441s, exit0. Initial failure cause remains
NOT VERIFIED and is retained in
`artifacts/security/capstone-authority-regression-20261009.json`.
A rerun PASS must not erase this failure or claim its cause was fixed.
Security Gate rerun00:52:35.479Z PASS exit0: units41.156s, secrets1.004s,
dependency audit1.556s. Executed pnpm11.7.0 matches project pin; global manifest
11.22 warning retained. No signature/TLS bypass or lockfile regeneration.

Next execution order:
1. Actual read-only three-role readiness using fresh registered synthetic binding.
2. Explicit role-specific pool composition review: never mount the root master
   credentials; distinguish separate DB roles/pools from process isolation.
3. Dedicated development API server and trusted proxy client certificates, strict
   CA/hostname/mTLS checks; do not reuse the PostgreSQL server private key.
4. Mounted-secret entrypoint, fail-closed preflight, scanned image and guarded
   separate runtime startup without replacing legacy listeners.
5. Synthetic patient ref registration, independent mapping review, scoped
   metadata/session/consent, then encrypted A -> Azure Key Vault -> B Viewer
   plus expiry/revocation and paired audit verification.

Whole distributed MVP/v3 remains NOT ACHIEVED; API HA/new Grant and patient-to-
Viewer flow still incomplete. PIPA/ISMS-P/hospital production approval DEFERRED.

## Latest: actual Azure v3 DB TLS verified — 2026-10-09 KST

Supersedes earlier "DB TLS not activated/connection NOT VERIFIED" observations.
Current PostgreSQL TLS is enabled with the staged development-only server
certificate/key, minimum TLS1.2, via SIGHUP without container/server restart.
Previous auto.conf/HBA preserved as operation-specific configuration backups.
No data/DB reset, clinical rows, principal enrollment or new API activation.

Owned internal Docker network `highpass-v3-db-704b38823c9f`, subnet172.21.0.0/16,
owner704b38823c9f41be8c1a7f60d5ec98d6; PostgreSQL attached with verified DNS alias.
Only three v3 roles have hostssl+SCRAM allowance from that private subnet.
Their nonloopback plaintext and other-network/other-database connections are
rejected before legacy broad rules. Unix/loopback SCRAM remains a diagnostic
exception, not a production encrypted-network claim. PostgreSQL has no published
host ports. Legacy role rules/plaintext compatibility remain unchanged and are
NOT upgraded into a blanket whole-cluster secure/production-readiness claim.

Configuration evidence:
`artifacts/azure/v3-db-tls-apply-20261009T003606Z-704b3882/result.json`.
Actual role-specific nonroot read-only QA containers on the private network:
all3 positive connections PASS, real server pg_stat_ssl reports TLSv1.3/256 bits,
CA/hostname verification required. Each role separately rejects wrong hostname
ERR_TLS_CERT_ALTNAME_INVALID, untrusted CA UNABLE_TO_VERIFY_LEAF_SIGNATURE,
plaintext28000 and wrong password28P01. No DNS/timeout/refusal misclassified as
policy DENY.15 distinct positive/negative checks PASS. No patient rows queried.

Actual configuration rollback restores original file SHA/settings/HBA and ssl=off,
legacy healthy; reapply restores exact TLS snapshots/SHA/settings/HBA, legacy
healthy. This is config recovery only, not data restore/DR/fault-injection proof:
`artifacts/azure/v3-db-tls-rollback-20261009T003800Z-704b3882/result.json`.
After reapply, all15 real TLS/negative cases re-run PASS:
`artifacts/azure/v3-mounted-pool-check-20261009T003808Z-254bf6c8/result.json`.
Owned QA containers removed and absence verified; private runtime network and
protected recovery configurations retained intentionally. No private key/secret
export. Mount-overlay QA is not scanned new-image promotion.

All3 manifests verify PASS, DRAFT / UNASSIGNED. Python HBA3 tests PASS.
Security Gate00:39:25.838Z PASS exit0: units41.682s, secrets1.048s, audit1.618s.
Pinned pnpm11.7.0 matches; global11.22 manifest warning retained.
No signature/positive TLS verification bypass or lockfile change.

Next: explicit synthetic A/B tenant/hospital and distinct requester/reviewer
principal registration; mounted registry/identifier-protection/ingress secrets;
scanned preflight-gated runtime/proxy startup; actual phantom mapping/scoped
metadata/consent and encrypted A -> Azure Key Vault -> B Viewer tests.
Registration is NOT patient consent/human review. Do not merge old P-1001.
Whole distributed MVP/v3 remains NOT ACHIEVED; PIPA/ISMS-P/hospital approval
DEFERRED; new API HA/Grant and actual clinical Viewer flow still incomplete.


## Latest: role-specific mounts and DB TLS prerequisites — 2026-10-09 KST

Related FR-014~025/037~041. Three actual per-role files are now prepared beneath
`/opt/highpass/v3-runtime-mounts-9b402607bcd04240813047ea955ddeb9`.
Parent root0700; each file root:65532 mode0640 and contains exactly one login.
Provisioning master remains root-only and is NOT a runtime mount.
Evidence `artifacts/azure/v3-role-mounts-20261009T002800Z-9b402607/result.json`.

`createCapstoneMountedSecretPool` requires Linux UID65532, exact role-specific
/run/secrets paths, nonsymlink regular single-link file, root owner/group65532
mode0640, bounded exact JSON shape/role/database/synthetic scope and32-byte secret.
No connection URL/env-password/custom plaintext host override. TLS requires
valid trusted CA, rejectUnauthorized=true, fixed verified DNS servername and
minimum TLS1.2 with finite pool/query/connection/transaction limits.
The pool is configuration only; constructing it never claims connection success.

Actual pinned existing Azure image, three owned read-only network-none containers,
UID65532 and individual read-only mounts:3/3 PASS. Other role files absent;
real CA and credential parsing plus TLS-required pool construction PASS.
All owned QA containers removed and absence checked; no application activation.
Evidence `artifacts/azure/v3-mounted-pool-check-20261009T003205Z-927aa6f4/result.json`.
Mounted source overlay QA is NOT a scanned new image promotion or a DB TLS test.

Development DB server certificate staged with existing project CA:
subject Highpass PostgreSQL DEVELOPMENT ONLY, serverAuth, DNS
highpass-v3-postgres.invalid/localhost, IP127.0.0.1. Valid2026-10-09T00:30:02Z
through2026-11-08T00:30:02Z. Private key generated and retained root-only on Azure;
no key/CA-key export, logging or Git tracking. CA/hostname and key match PASS,
wrong hostname DENY. Evidence
`artifacts/azure/v3-db-tls-prepare-20261009T003235Z-82b518a9/result.json`.
Initial preparation result NOT VERIFIED retained; bounded resume reused exact
existing CSR/key/public certificate without overwriting/renewing. Initial remote
failure cause not conclusively proven. Current cryptographic verification PASS.

All three evidence manifests verify PASS; DRAFT / UNASSIGNED. Targeted JS3/3 PASS.
Security Gate00:33:23.557Z PASS, exit0: units41.747s, secrets0.987s,
dependency audit1.508s. `artifacts/security/capstone-mounted-secret-pool-security-gate-20261009.json`.
Executed pnpm11.7 matches pin, global11.22 warning retained; no TLS/signature bypass.
Legacy service healthy throughout. No PostgreSQL config/reload/image/network
change in this unit: actual DB TLS connection and clinical readiness NOT VERIFIED.
Current v3 external DB access remains rejected by the preceding HBA boundary.

Next: read-only ssl/context/network inventory, protected PG configuration backup,
install staged certificate inside PG with proper owner/key permissions, guarded
TLS reload/rollback; isolated v3 Docker DNS boundary; narrow hostssl/SCRAM rule,
hostnossl DENY; real verify-full positive/wrong-host/untrusted/plaintext negatives
through nonowner mounted pools. Then synthetic registry/principal enrollment,
scanned runtime entrypoint and actual phantom consent/encrypted A-Azure-B Viewer.
No production/legal approval claims and no whole MVP/v3 completion declaration.


## Latest: actual nonowner credentials and authentication — 2026-10-09 KST

Supersedes earlier "no runtime credentials/profile installation" observations.
Three distinct safe nonowner Azure DB LOGIN roles now exist:
`hp_v3_app`, `hp_v3_identity_preauth_writer`, `hp_v3_identity_preauth_reader`.
Exact named Identity grant profile installed atomically with role creation.
32-byte random passwords and salted SCRAM verifiers are constructed privately;
only root-owned0700 remote directory/0600 provisioning file contains passwords.
No passwords/verifiers in argv, Git, evidence or console. This root-only master
file is provisioning/recovery material; NEVER mount this combined master into
any runtime service. Split protected role-specific mounts before activation.
See the latest explicit same-process/distinct-pool composition decision above.

Initial `v3-identity-enroll-20261009T002109Z-7283720b` result NOT VERIFIED is kept:
roles/profile committed, but actual negative authentication discovered existing
container-local `trust` rules accepted invalid passwords. It was NOT called PASS.
Added first-match HBA rules ONLY for the three new v3 roles: local Unix and
loopback require SCRAM; nonloopback connections and other-database connections
are rejected until the separate reviewed TLS boundary is ready. Other legacy
roles/configuration unchanged, healthy legacy service verified before/after.

Actual auth evidence:
`artifacts/azure/v3-identity-enroll-20261009T002438Z-2243f2f2/result.json`.
All three real container-local TCP logins PASS; wrong passwords DENY; catalog
membership/privilege separation PASS; temporary passfiles removed with absence
checks. No patient rows/enrollment, principal issuance or service activation.
Host rules/reload record:
`artifacts/azure/v3-auth-boundary-20261009/result.json`.
Both evidence manifests verified PASS and remain DRAFT / UNASSIGNED.

Earlier HBA portability/validation attempts failed and are not rewritten:
protected before/pending configuration copies retained remotely; failed validation
ran restoration/reload before the successful ruleset. No database/backup erased.
Successful configuration operation17cf55ff43974285b0bcf92130d341d1 preserves the
previous HBA backup. External packet enforcement and DB TLS are NOT VERIFIED.
Do not describe the container-local test as encrypted cross-container DB access.

Fresh read-only inventory:
`artifacts/azure/identity-schema-inventory-20261009T002357Z/result.json`;
42 tables and all required Identity RLS/FORCE-RLS remain intact, legacy healthy.
Python credential3 and operator4 tests PASS. Node Security Gate00:25:27.128Z PASS,
exit0: units41.367s, secrets0.974s, dependencies1.428s; pinned pnpm11.7 matches,
global11.22 manifest warning retained; no validation bypass/lockfile change.

Next: role-specific secret mounts and PostgreSQL verify-full TLS boundary;
explicit synthetic principals/operator registry and identifier protection;
mounted-secret scanned startup; phantom mapping/metadata/consent;
real encrypted A -> Azure Key Vault -> B Viewer expiry/revoke/scope negatives.
Current runtime is still legacy, new v3 listener unactivated. Whole distributed
MVP/v3 NOT ACHIEVED; no commit/push/merge or paid-resource expansion.


## Identity least-privilege profile rehearsed — 2026-10-09 KST

`src/v3-capstone-identity-grants.js` supplies a transactional, fixed-target
Identity-only profile for three distinct pristine nonowner logins. It refuses
legacy/arbitrary DB names, missing/unsafe roles, prior memberships, object
ownership or pre-existing table/column/schema grants; rerun does not widen rights.
It creates no login/password, issues no principal and activates no listener.
Only nine named Identity tables, named write/lock columns and two exact RLS
predicate functions are granted to clinical runtime. No ALL TABLES/default
future grants, Exchange/Consent domain access or ledger access.

Full exact-bundle owned PostgreSQL16 rehearsal48/48 PASS,41.140s, sourceUnchanged
true, cleanup PASS; manifest verification PASS:
`evidence/generated/hp-v3-migration-2026-10-09T00-17-30-608Z-8df9a511/rehearsal.json`.
After NOLOGIN ownership transfer, real nonowner principal/directory FOR SHARE,
owned patient-ref registration plus safe audit append PASS. Lock-only directory
UPDATE still DENY. Clinical ledger/Exchange/preauth reads DENY. Publisher INSERT
ALLOW but SELECT/DELETE DENY; separate reader SELECT ALLOW but INSERT/clinical
patient-ref SELECT DENY. Credential-free LOGIN fixtures are network-none and
disposed; this is SET ROLE SQL-policy proof, not actual password/network login.

Initial grant read failure48f23d2c retained; required restrictive predicate
execution and existing directory predicate execution were missing. Only these
two named functions added, no broad EXECUTE or policy relaxation. Intermediate
dce31325 failure preserved. ae728b5f fixture-start SQL failure remains historical
FAIL with cleanup PASS; root cause not proven, not called a policy DENY.
Latest passing run retains all prior negative checks rather than suppressing them.

Targeted JS5/5 PASS and secret scan PASS. New evidence DRAFT / UNASSIGNED.
Current Security Gate00:18:18.644Z PASS, exit0: units44.074s, secrets1.240s,
dependency audit1.638s. `artifacts/security/capstone-identity-grants-security-gate-20261009.json`.
Executed pnpm11.7.0 matches project pin; global11.22 manifest warning preserved.
No signature/TLS bypass or lockfile change. Syntax and diff whitespace checks PASS.
Next real deployment unit: fresh catalog/ledger/profile collision checks, three
generated nonowner credentials in root-protected external mounts, exact profile
transaction and privilege/connection verification, synthetic registry bootstrap,
then scanned mounted-secret runtime startup. Do not copy admin/bootstrap identity
into runtime or enroll patient consent as an operator convenience.
Actual cloud credentials/profile installation and new service activation remain
NOT VERIFIED. Full encrypted phantom A-Azure-B Viewer is still incomplete.


## Latest: actual isolated Azure v3 bootstrap — 2026-10-09 KST

Supersedes historical absent-database/no-cloud-provisioning findings below.
Actual protected legacy backup and same-cluster restore PASS, then isolated
`highpass_v3_capstone` provisioning PASS. Exact frozen25 migrations006..029/031,
immutable checksum ledger and dedicated NOLOGIN ownership installed atomically.
42 tables,9 safe NOLOGIN owner/policy roles; legacy `hipass_app` CONNECT denied.
Legacy `hipass` and running healthy control image preserved. No v3 runtime
credentials/listener or synthetic patient enrollment yet.

Evidence: `artifacts/azure/v3-bootstrap-20261009T000738Z-d1277dcc/result.json`
and verified manifest. Root-only0700 directory/0600 custom dump retained remotely
for recovery; no raw backup/rows/secrets in repository. Operation-owned temporary
restore DB removed and absence verified. This is NOT independent-cluster DR.
Earlier digest failures retained; safe diagnostic proved17 COPY blocks/4540 rows
with no content differences, only physical ordering. `HP_PGDUMP_COPY_MULTISET_V1`
binds columns, all row values, duplicate multiplicity and sequence state while
ignoring physical row/table order only.

Fresh read-only inventory:
`artifacts/azure/identity-schema-inventory-20261009T001445Z/result.json`.
42 tables, all10 required Identity/preauth tables RLS/FORCE-RLS, existing runtime
healthy before/after. Observer's installed-checksum inspection NOT VERIFIED;
checksum proof is from bootstrap verifier, not this separate observer.

Next: exact clinical/publisher/reader nonowner grants and protected credentials,
explicit synthetic registry enrollment, mounted-secret startup, connection
boundary verification and scanned image activation. Then actual phantom
mapping/metadata/consent and encrypted A -> Azure Key Vault -> B Viewer.
No fake human review/consent or old P-1001 merge. New evidence DRAFT / UNASSIGNED.
Whole distributed MVP/v3 NOT ACHIEVED; PIPA/ISMS-P/real hospital approval DEFERRED.


## Latest: full v3 migration / rollback / restore rehearsal — 2026-10-09 KST

Frozen25-file006..029/031 manifest and fail-closed loader added. Full exact bundle
in a network-none owned PostgreSQL16 fixture: rollback, partial failure after
role creation, disconnected uncommitted session, role collision/retry refusal,
atomic immutable checksum ledger and NOLOGIN table/function/schema owner verified.
Actual pg_dump/psql restore preserves synthetic ledger hashes and deletion guard
in a separate fresh owned DB. Original synthetic legacy sentinel unchanged.
Latest27/27 PASS,26.104s, source unchanged, owned cleanup PASS, manifest PASS:
`evidence/generated/hp-v3-migration-2026-10-08T23-58-12-120Z-4667a438/rehearsal.json`.
No raw dump retained. Restore assumes existing policy roles and excludes owner/ACL
restore; not a cloud/independent-cluster DR claim. Initial22-check baseline PASS
is preserved separately. Two subsequent dump-buffer FAILs are preserved, diagnostic
ENOBUFS confirmed, then pg_dump-only finite2MiB output cap fixed; SQL/timeouts and
security checks unchanged. All owned test containers removed, no cloud data erased.

Existing ceremony/consent/withdrawal/expiry272/272 regression PASS,215.965s,
source unchanged/cleanup PASS and manifest PASS:
`evidence/generated/hp-v3-ceremony-schema-2026-10-08T23-55-59-709Z-57b8104b/schema-check.json`.
Separate fixture: not post-ownership-transfer combined-runtime clinical proof.
Security Gate23:56:55 PASS; later dump-cap change syntax, loader2 tests and secret
scan rechecked PASS. Evidence `artifacts/security/capstone-migration-rehearsal-security-gate-20261009.json`.

Expanded actual Azure catalog inventory confirms target DB, all eight v3 policy
roles and proposed owner absent; existing service healthy. No cloud provisioning
yet. Next explicit protected-backup/restore + isolated target bootstrap with fresh
collision/capacity checks; then scoped nonowner enrollment/scanned startup and
actual phantom A-Azure-B consent/encrypted Viewer. [Detailed prerequisites](../implementation/highpass-v3-capstone-deployment-prerequisites-2026-10-09.md).
FR-014~025/037~041. DRAFT/UNASSIGNED; full MVP/v3 NOT ACHIEVED; no commit/push.

## Latest: actual Azure v3 schema inventory — 2026-10-09 KST

Pinned existing Azure PostgreSQL16 catalog inspection PASS, read-only confirmed
by the actual server, no patient/secret/raw-log read, migration or enrollment.
Evidence: `artifacts/azure/identity-schema-inventory-20261008T234713Z/result.json`.
Existing control38d707e7 running/healthy before and after. `highpass_v3` schema is
absent, zero v3 tables, all ten required Identity/preauth tables absent. Only
legacy hipass_app among the fixed role-name list exists, with safe basic role
flags. This is not complete membership/TLS/clinical-grant readiness. Local migration
hashes are not installed checksums. v3 deployment readiness remains NOT VERIFIED.

Catalog-validator4 tests and secret scan PASS. Read-only runtime diagnostic PASS:
`artifacts/workstation/runtime-diagnostic-2026-10-08T23-46-05.402486+00-00/result.json`.
No SQL error codes or listed safe error classes in its bounded log sample; not
proof of historical/all-request absence of failures. Cloud clock approx2.4~2.6s
behind Windows in this sample; no time setting changed.

Recommend separate v3 database within existing PostgreSQL, preserving legacy
hipass/P-1001 and the functioning fallback. PostgreSQL roles are cluster-global,
so role collision/membership/ownership checks still required. Next rehearse exact
006..029/031 dependency bundle, rollback and checksum ledger; provision isolated
storage/nonowner credentials, mounted-secret entrypoint, scan/promote, then actual
phantom consent/encrypted Viewer. [Execution prerequisites](../implementation/highpass-v3-capstone-deployment-prerequisites-2026-10-09.md).
No new paid Azure resource, schema mutation, runtime promotion or commit/push.
New evidence DRAFT/UNASSIGNED; whole distributed MVP/v3 remains NOT ACHIEVED.

## Latest: preflight-gated Identity runtime composition verified — 2026-10-09 KST

FR-014~025/037~041. `createV3IdentityCapstoneRuntime` composes strict mapping
services, bounded actorless observer and loopback-only mTLS listener from existing
operator-owned registry/protection and three distinct nonowner pools. It requires
separate ingress/idempotency keys. An authenticated fresh mapping-read capability
and successful read-only DB/schema/grants preflight are required BEFORE bind.
No migrations, principal issuance, grants, existing cloud listener changes or
health-event fabrication. Concurrent/repeated start is rejected; shutdown during
preflight cannot later activate the server. External pools/registry/protection
remain caller-owned. Startup PASS is not cached clinical authority or deployment
readiness; subsequent access retains normal registered-principal/RLS checks.

Actual owned HTTPS proxy -> composed strict mTLS host -> nonowner PostgreSQL
mapping read PASS. Revoked DB principal prevents bind; restored principal starts
without domain/preauth changes; fresh readiness and finite stop PASS. Current-code
553/553 regression PASS, exit0,94.263s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-44-41-710Z-bd681f90/transaction-check.json`.
Manifest SHA/Git validation PASS. Targeted runtime/readiness4 tests PASS including
forged binding, unavailable DB, concurrent startup and stop during stuck preflight.
Security Gate PASS at23:44:08.315Z: units42.560s, secrets0.985s, dependency audit
1.645s, executed pnpm11.7.0 matches pin; global manifest11.22 warning retained.
`artifacts/security/identity-runtime-composition-security-gate-20261009.json`.

Remaining: mounted-secret operator entrypoint, read-only current-cloud inventory,
non-destructive migration/registration prerequisites and scanned image promotion;
then actual phantom mapping/scoped metadata/consent/encrypted A-Azure-B Viewer.
The composition API has not activated VM/cloud runtime. It is not a complete
deployment or long-outage audit reconciliation. New evidence DRAFT/UNASSIGNED;
whole distributed MVP/v3 NOT ACHIEVED. No commit/push/merge or runtime data mutation.

## Identity read-only readiness verified — 2026-10-09 KST

FR-014~025/037~041. `V3IdentityReadiness` checks an authenticated fresh mapping-read
binding and three distinct nonowner clinical/publisher/reader pools. Every probe
uses bounded BEGIN READ ONLY / ROLLBACK. Checks active exact DB registration,
required identity RLS/FORCE-RLS tables, enabled guards, validated exact six-column
domain/network FK, network INSERT privileges and separated actorless roles/grants.
No health INSERT, migration, grant, credential issuance or identity bootstrap.
These are point-in-time configuration checks, not clinical authorization, complete
policy-definition equivalence, actual write delivery or deployment approval.

Actual owned PostgreSQL regression547/547 PASS,123.817s, sourceUnchanged true,
cleanup PASS: `evidence/generated/hp-v3-identity-tx-2026-10-08T23-36-39-337Z-041278ee/transaction-check.json`.
Manifest verification PASS; revoked principal, missing table, network/publisher
grant outage fail, restoration passes, domain/preauth counts unchanged. Targeted
readiness/transaction13 tests rechecked PASS. Host still advertises NOT VERIFIED
in its transport state and requires an explicit fresh readiness call.

Original Security Gate ENVIRONMENT_BLOCKED (PNPM_EXECUTION_FAILED) is preserved in
`artifacts/security/identity-readiness-security-gate-blocked-20261009.json`.
Root cause remains NOT VERIFIED. Fresh rerun at23:41:31.405Z PASS: units41.605s,
secrets0.996s, dependency audit1.482s, executed pnpm11.7.0 matches project pin;
global manifest11.22.0 warning retained. No signature/TLS bypass or lockfile rewrite.
Result: `artifacts/security/identity-readiness-security-gate-20261009.json`.
This result predates the subsequent runtime-composition increment.

## Latest: owned identity TLS host lifecycle verified — 2026-10-09 KST

FR-014~031/037~041; v3 Identity. `createV3IdentityCapstoneHost` owns an explicit
127.0.0.1-only HTTPS listener with mandatory client certificates, TLS>=1.2,
bounded handshake/request/socket/bind/stop, strict identity edge and same-owner
branded preauth observer. Validates CA/leaf dates, server EKU/localhost and key
match before bind. Bind failures are safe, stop closes owned connections and edge,
repeated start/stop is deterministic; a stopped host cannot reopen. Shutdown not
observed before the final deadline fails rather than claiming CLOSED. No existing
server listener or cloud runtime is changed by this factory.

Its native tlsClientError callback records actual TLSSocket facts via the existing
bounded publisher. New actual HTTPS proxy -> hosted mTLS -> nonowner PG mapping
read succeeds. No/untrusted/expired client fixtures fail handshake and produce
three durable minimal actorless TLS rows, without domain mutations. Certificate
provenance/date checks and original strict negatives remain; missing native facts
are not manufactured. Here missing-client event gives TLS_CERTIFICATE_REQUIRED /
127.0.0.1; untrusted/expired events expose UNKNOWN_TLS / null. Those two rows do
NOT independently assert a specific certificate cause or recovered IP. Host state
reports LISTENING with readiness NOT VERIFIED, never a DB/deployment PASS.

Current-code539/539 PASS, exit0,93.489s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-29-38-065Z-99dd3990/transaction-check.json`.
Manifest SHA/Git verification PASS. Host/observer/TLS targeted4 tests PASS including
fake-socket/config/key/EKU rejection, actual bind collision and deterministic stop.
Security Gate PASS at2026-10-08T23:29:07.758Z: units42.825s, secrets1.098s,
dependency audit1.552s; `artifacts/security/identity-host-lifecycle-security-gate-20261009.json`.
Executed pnpm11.7 matches project pin; global manifest11.22 warning retained.

Initial host run23:25:44-b35fc10f FAIL50.308s and diagnostic23:27:34-8f2e0804 FAIL
are preserved with source unchanged/cleanup PASS. Both failed an overstrong fixture
assertion requiring127.0.0.1 for every TLS rejection; diagnostic actual rows proved
native IP/detail absent for two events. Corrected expectation to the existing
schema's honest null/UNKNOWN_TLS contract, not TLS admission or publisher checks.
Original failure files and older Privacy root-OPEN remain, never overwritten.

Remaining host gate: actual read-only DB/schema/nonowner privilege/registered
binding checks, publisher/reader storage readiness and host drain/outage matrix,
then non-destructive bootstrap/migration/scanned image promotion. No arbitrary
runtime principal, human approval, grant or old P-1001 merge. Continue actual
phantom mapping/scoped metadata/encrypted Viewer afterward. VM/cloud data and
Git remote unchanged; DRAFT/UNASSIGNED; whole MVP/v3 remains NOT ACHIEVED.

## Latest: identity actorless admission audit integrated — 2026-10-09 KST

FR-014~025/037~041; v3 Identity. Optional privately branded preauth observer is now
accepted by the dedicated identity edge/router/read/write factories. Trusted-hop
rejection emits INGRESS; registry rejection at each existing handler's original
authentication point emits HUMAN_AUTH. Existing401/403/404 and request validation
ordering remain; no unverified JWT parsing, mock MFA fabrication, weaker preauth
scope, forwarded source IP or domain DENY duplication. No observer preserves
existing behavior. Disposed edge does not mint events, and a disposed observer
retains denial while reporting NOT_RECORDED. Host owns publisher lifecycle.

Actual HTTPS frontend/dedicated backend mTLS/nonowner PG proves missing signature,
wrong proxy role/spoofed IP, invalid read/write JWT and missing JWT deliver five
minimal actorless rows using immediate socket IP. Authenticated foreign mapping404
stays domain audit only. Real publisher INSERT privilege outage preserves401,
reports NOT_RECORDED, stores no fabricated success and mutates no domain rows;
privilege restoration resumes delivery. Observer disposal likewise stores none
and never opens access. Separate publisher/reader remain nonowner and scoped by
existing022 policies; no new live login/schema is provisioned.

Current-code529/529 PASS, exit0,91.857s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-21-26-970Z-134a8b57/transaction-check.json`.
Manifest SHA/Git validation PASS. Targeted handler/router13 tests and enhanced
identity/observer4 tests PASS. Unit slow-sink test proves response before publisher
completion, fabricated observer enrollment rejection and disposed-edge no mint.
Security Gate PASS at2026-10-08T23:21:14.729Z: units41.967s, secrets1.371s,
dependency audit1.760s; `artifacts/security/identity-preauth-security-gate-20261009.json`.
Executed pnpm11.7 matches project pin; global manifest11.22 warning retained.
Older fixture42501/Privacy root-OPEN failures are not rewritten.

NOT VERIFIED for identity: listener-owned TLS-handshake-to-durable observation,
full flood/unknown-outcome/long-outage HTTP matrix, deployment readiness and live
host activation. This increment is injection-only, not a complete SOC or deployment.
Next build the explicit identity host lifecycle with verified TLS configuration,
separate actorless credentials, listener-owned handshake observations, bounded
readiness/shutdown and non-destructive schema/bootstrap contract. Then scanned
capstone host promotion and actual phantom mapping/scoped imaging/encrypted Viewer.
VM/cloud runtime, real data and Git remotes unchanged. DRAFT / UNASSIGNED; whole
MVP/v3 remains NOT ACHIEVED.

## Latest: strict mapping COMMIT loss / concurrent replay verified — 2026-10-09 KST

FR-014~025/037~041; v3 Identity/PatientMapping. The independent actual HTTPS
frontend/dedicated mTLS backend fixture now uses two-capacity nonowner PG strict
transactions with a fixture-only post-COMMIT acknowledgement-loss adapter.
After real PG COMMIT succeeds the injected loss yields safe no-store503
V3_COMMIT_OUTCOME_UNKNOWN, not a false success or presumed rollback. An independent
administrative observation confirms one committed new mapping, original receipt,
business event and paired network row. Fresh same-key HTTPS retry returns that
exact snapshot while adding a distinct current MAPPING_READ/network pair.

Two simultaneous same-key HTTPS requests exercised two actual backend process IDs:
one mapping/receipt/business mutation, equal original responses, and one CREATED
plus one READ event with distinct paired traces. Subsequent durable principal
revocation denies403 without disclosing receipt or adding a domain pair; stale
signed ingress denies403 and cannot borrow an old successful capability. Original
receipt metadata/digests/recorded time remain unchanged. Revocation preparation
is confined to this owned synthetic fixture and restored in finally. This does
not prove every lock ordering, JWT expiry, preauth audit or real DPoP/MFA gate.

Current-code507/507 PASS, exit0,92.751s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-17-06-225Z-dd24d963/transaction-check.json`.
Manifest SHA/Git validation PASS. Focused transaction/idempotency/proxy18 tests
PASS. Security Gate PASS at2026-10-08T23:16:46.768Z: units41.355s, secrets1.920s,
dependency audit1.822s; summary
`artifacts/security/identity-commit-replay-security-gate-20261009.json`.
Executed pnpm11.7 matches project pin; global manifest11.22 warning retained.
Historical fixture42501 and Privacy root-OPEN failures remain preserved.

No production fault injection, application authentication relaxation, live schema,
VM/cloud image promotion or runtime route activation. New evidence DRAFT/UNASSIGNED;
whole distributed MVP/v3 remains NOT ACHIEVED. Next implement identity preauth
actorless denial observation using the existing bounded same-owner publisher
contract, then the non-destructive host activation/deployment contract. Progress
to actual phantom enrollment/scoped imaging metadata/encrypted Viewer only with
verified runtime authority and transport, never manufactured human approval.

## Latest: unavailable-resource durable replay verified — 2026-10-09 KST

FR-014~025/037~041; v3 Identity/PatientMapping. Actual independent HTTPS frontend,
dedicated backend mTLS and nonowner PostgreSQL now prove replay after soft deletion
of either the mapping or its patient ref. Both return safe no-store404
V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE, not an historical success snapshot. Exactly
one current correlated MAPPING_DENIED / MAPPING_REPLAY_RESOURCE_UNAVAILABLE event
and network row commit; no hidden mapping/ref/version/state is copied into the
DENY event. Original success receipts, keyed digests and recorded times remain
unchanged. Network INSERT outage returns503 with the whole attempted DENY pair
rolled back. Restoring the synthetic fixture admits the original receipt again.

The mapping setup/restore itself uses a separate existing synthetic reviewer,
incremented versions and mandatory audit while preserving DB triggers. This is
administrative preparation of an owned throwaway fixture, not a new deletion API
or proof of production deletion authorization. No trigger disable, backdating,
version reset, live DB migration, VM/cloud image promotion or original-data deletion.

Current run497/497 PASS, exit0,97.769s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-13-36-976Z-b1c3bef8/transaction-check.json`.
Manifest SHA/Git validation PASS. Current full Security Gate PASS at
2026-10-08T23:13:19.176Z (units43.496s, secrets1.251s, dependency audit2.065s),
recorded in `artifacts/security/identity-unavailable-replay-security-gate-20261009.json`.
Focused identity9 tests PASS. Executed pnpm11.7 matches the project pin;
different global manifest11.22 remains a warning, not a gate skip.

Initial new fixture run at23:11:33-6a5e8c22 is preserved as NOT VERIFIED,
POSTGRES_42501/exit1,190 completed checks,72.848s, sourceUnchanged true and cleanup
PASS: direct mapping soft-delete preparation was rejected by the existing guard.
The preparation was corrected to obey review/version/audit rules, not weaken them.
The unsupported `verify-evidence-manifest.js --help` probe exited1/ENOENT because
the CLI accepts a manifest path; the correct explicit manifest command above PASS.
Older Privacy regression remains root-OPEN; this result does not erase it.

Next: strict mapping commit-ACK-loss and concurrent replay/revocation matrix,
preauth denial observation/host activation contracts, then live phantom enrollment,
scoped imaging metadata and encrypted Viewer integration. These remain uncompleted;
whole MVP/v3 is NOT ACHIEVED and all new review is DRAFT / UNASSIGNED.

## Latest: strict mapping service / replay pairing integrated — 2026-10-09 KST

Related FR-014~025/037~041 and v3 Identity/Tenant. Explicit requireNetworkAudit
mode is now in mapping read service and identity idempotency/write service.
Read/write handlers receive the genuine network authority, resolve one verified
binding, bind the same correlation/input before body work, and propagate it into
runWithIdentityNetwork. All strict service domain audit paths use the paired
writer. Secure edge now refuses non-strict services and captures the genuine
network capability before routing; ordinary isolated legacy/router paths remain
unchanged. No running listener/cloud schema is activated by these factories.

Strict durable replay validates current authority/resource visibility, returns
the original stored receipt unchanged, and adds a new current-version MAPPING_READ
event/network pair. Conflicting keys and unavailable replay resources have safe
committed DENY pair paths; original ledger/response is not overwritten. The
unavailable-resource branch is implemented but its deletion scenario remains
NOT VERIFIED in actual PG. Strict PatientRef bootstrap is explicitly unsupported
by this idempotency mode; trusted internal bootstrap retains its separate contract.
No DPoP/MFA or preauth transport-denial audit coverage is implied by this increment.

Current-code independent real HTTPS proxy/mTLS/nonowner PG483/483 PASS/exit0,
72.501s, sourceUnchanged true and owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T23-02-09-900Z-2575ce7a/transaction-check.json`.
Proof includes normal/read/foreign404/self-review403/separate reviewer, replay
after newer review preserving original metadata while recording current version,
network INSERT outage denying read/write/review/replay503 without metadata, actual
new mapping and review mutation rollback, idempotency conflict committing one DENY
pair, genuine advisory lock aging replay context before paired write, and no
unpaired mapping audit events in tested strict path. This is not every Identity
race/outcome-unknown or an exhaustive production/clinical acceptance claim.

Earlier strict run479 checks PASS at22:58:56-74acab1b (94.607s). Added advisory
wait check initially failed at23:00:40-7549269a because fixture selected the legacy
reconcile receipt's lock rather than the strict one. Corrected by selecting exactly
one original receipt version; final source attestation/current scope above. Service
deadline/authorization was not relaxed. Earlier PASS is not substituted for new scope.

First full Node regression656 tests:655 PASS/1 FAIL, Privacy case group failing
model-unavailable/output-overflow. Targeted unchanged Privacy retest subsequently
PASS; cause remains OPEN, not proven parallel-load or timing related. Keep failure
distinct from latest current security-gate PASS at2026-10-08T23:03:39.632Z:
full units41.234s, secret scan1.194s, production critical dependency audit1.671s.
New strict idempotency and secure-edge targeted7 tests PASS. No gate skip, TLS,
signature or role bypass. Observed summary:
`artifacts/security/identity-strict-mapping-security-gate-20261009.json`.

API paths/safe response shapes/statuses preserved. Changes affect factory opt-in,
internal service input and strict audit/replay side effects, not current portal UI.
No A/B/cloud image, live DB, original dataset, commit/push/merge change. Evidence
DRAFT / UNASSIGNED; whole MVP remains NOT ACHIEVED. Next: close actual Identity
replay-unavailable/outcome/race and preauth audit/host activation contracts before
live phantom registration, scoped imaging metadata and encrypted Viewer.

## Latest: persistent paired identity network audit foundation — 2026-10-09 KST

Related FR-014~025/037~041 and v3 Identity/Tenant audit provenance. Additive031
creates `highpass_v3.identity_network_audit` with exact event/tenant/hospital/
actor/audit-session/trace FK, FORCE RLS, host-only inet, fixed identity ingress
mode,32-byte public certificate fingerprint and finite bounded observation time.
Immutable UPDATE/DELETE trigger also denies privileged mutation. Migration grants
no runtime credential or deployment authority and backfills no historical events.
It is applied only to the owned independent fixture, not running cloud DB.

`appendPairedIdentityAudit` validates an opaque network input before appending the
identity event, then inserts its network tuple through the same passed transaction
and rechecks live context. Caller must use runWithIdentityNetwork on that same
transaction. No best-effort fallback, independent connection or raw token/key
column. SQL rights alone still do NOT prove ingress provenance. There is no global
DB requirement that legacy identity events contain network rows; strict service
enrollment and handler propagation remain the next implementation unit.

Actual dedicated mTLS/nonowner PostgreSQL475/475 PASS/exit0/86.405s,
sourceUnchanged true and owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-53-06-857Z-fa57125c/transaction-check.json`.
Normal pair commits exact socket IP/public certificate digest; foreign hospital
sees zero rows. INSERT-column privilege revocation returns safe503 and rolls back
both rows. Context expiry before COMMIT likewise rolls back both. Real privileged
UPDATE/DELETE rejects42501. Independent transactions test subnet/wrong mode/short
digest/infinite or stale time/mismatched correlation/missing audit with exact SQL
constraint classes, not generic errors or duplicate-PK false positives. Every
negative transaction rolls back its own seed; original paired rows unchanged.
Migrations006..022 plus031 also pass rollback leaving no v3 schema;23..30 were
not required/applied by this identity-only fixture (not full migration-chain proof).

Initial unit and full regression FAIL: SQL static test incorrectly matched the
word grant in a comment. Corrected to statement-anchored GRANT; no database policy,
test requirement or gate relaxed. Corrected units PASS and current security gate
PASS/exit0 at2026-10-08T22:54:08.008Z (full units41.070s, secret scan0.896s,
production critical dependency audit1.548s). Keep the initial FAIL distinct from
the current PASS. Unit schema text assertions supplement, not replace real SQL
constraints/RLS/rollback tests. Observed gate summary:
`artifacts/security/identity-network-audit-security-gate-20261009.json`.

New evidence remains DRAFT / UNASSIGNED. Live mapping handlers/read/write/durable
replay are not yet required to use the paired writer; deployment, DPoP/MFA,
new phantom registration/scoped metadata and encrypted Viewer remain separate
uncompleted gates. No A/B/cloud promotion or live DB alteration this increment.

## Latest: identity network capability / transaction guard foundation — 2026-10-09 KST

Related FR-014~025/037~041, v3 Identity/Tenant and authoritative audit provenance.
Added `src/v3-identity-network-context.js`: actual authorized TLS1.2+/dedicated
identity-proxy SAN/clientAuth and signed ingress create an opaque WeakMap-owned
capability, not transferable JSON. Request/socket, protected header digest,
verified binding object, actor/tenant/hospital and audit/trace correlation bind
the input. Binding substitution, request replacement, duplicate sensitive headers,
changed DPoP/authorization/route/correlation, stale ingress, replaced capture and
disposed authority fail closed. Expiry has wall/monotonic limits and certificate
validity bound; no raw token/private key is exposed in network facts.

`V3TenantTransaction.runWithIdentityNetwork` is explicit opt-in and checks genuine
input before pool acquisition, after active principal verification and immediately
before COMMIT. Missing/forged/mixed Pending/Identity inputs deny before pool use.
Existing normal/Pending calls are unchanged; this does NOT silently activate
strict networking on the mapping services or live runtime. Required next work:
persist paired immutable network audit, connect read/reconcile/review and durable
replay to that same transaction and require the strict services in the edge factory.

Actual dedicated mTLS/nonowner PG fixture commits a valid guarded synthetic audit;
a second actual request ages its signed context while executing pg_sleep(1.2).
Before-COMMIT invalidity returns safe503 and rolls back that owned audit insertion.
Full462/462 PASS/exit0/78.818s, sourceUnchanged true, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-48-52-138Z-0655be02/transaction-check.json`.
Previous run22:47:02-64caa10c is NOT VERIFIED/exit1: source was strengthened while
verification ran, and SOURCE_CHANGED_DURING_VALIDATION correctly invalidated its
attestation. It is retained, not represented as current-code proof.

Actual TLS capability units plus transaction units13 PASS. Full Node654 PASS
(43.887s); subsequent current-code security gate PASS at22:48:01.330Z, including
full units42.470s, secrets1.049s and production critical dependency audit1.553s.
No app timeout, role, RLS, TLS or hostname relaxation. No A/B/cloud image or live
database changes. New evidence DRAFT / UNASSIGNED; no independent human approval
for these changes. Persistent network/audit pairing and live phantom Viewer remain
NOT VERIFIED. DPoP/MFA assurance is not claimed by this capability foundation.

## Latest: identity HTTPS proxy to mTLS backend and real PG — 2026-10-09 KST

Related FR-014~025/037~041 and v3 Identity/Tenant mapping. Added
`src/v3-identity-capstone-proxy.js`, opt-in CAPSTONE_SYNTHETIC_ONLY host composition,
fixed127.0.0.1/localhost HTTPS backend, dedicated client SAN/key/issuer validation.
Incoming actual TLS is mandatory. Only exact mapping metadata GET and reconcile/
review POST routes are forwarded; query tokens, aliases and other domains deny.
Headers are allowlisted: externally supplied forwarded identity/signature,
service credential, actor/hospital headers and cookies are discarded. Fresh
ingress HMAC binds actual socket IP, method/path and authorization hash. DPoP is
preserved as a header, NOT verified by this proxy; no new assurance is claimed.
16KiB request/response bounds, total deadline<=10s, curated JSON-only responses,
strict backend CA/hostname TLS1.2+, abort/dispose teardown and no-store remain.

Actual independent PostgreSQL fixture now runs this HTTPS frontend without a
client certificate, dedicated mTLS backend, existing JWT registry/RLS and audited
atomic services.460/460 checks PASS/exit0/78.792s, owned cleanup PASS and source
unchanged, including new proxy/fixture preparation and public negative cert hashes:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-39-51-938Z-b598af59/transaction-check.json`.
Spoofed frontend ingress is replaced; mapping write/retry201 preserves original
metadata, own read200 and foreign hospital404. Rejected aliases never reach backend.
This updates the previous public-negative-certificate hash limitation. No live
listener, cloud migration, current A/B container promotion or registration occurred.

New actual TLS unit proxy checks pass invalid configuration/role/key, curated
headers, route/query/body/response bounds, timeout, plaintext and disposal.
The first full Node run failed the existing Privacy stdin scenario. Its standalone
run then passed. The fixture previously used child early exit to infer stdin error;
historical failure only retained the case label, so exact failure cause is unproven.
Added explicit finite stdin-close negative mode while retaining early-exit mode;
unchanged adapter still must classify MODEL_OUTPUT_INVALID, count a real stdin
failure and reap its owned child. No application timeout or assertion was relaxed.
Relevant4 tests PASS, followed by full651/651 PASS/exit0/42.306s. Initial full FAIL
is not erased or counted PASS. Proxy disposal unit now waits for actual upstream
admission, not an arbitrary sleep. Secret scan and scoped diff check PASS.

New evidence remains DRAFT / UNASSIGNED. This is independent host composition,
not deployed network boundary, DPoP/MFA, DB-commit network-audit coupling or whole
MVP completion. Next unit must align identity authority/network context with
deployment registration and scoped metadata before actual phantom Viewer activation.

Current `node scripts/security-gate.js` PASS/exit0 at2026-10-08T22:42:46.815Z:
unit tests41.232s, secret scan0.911s, production critical dependency audit1.497s.
Executed pnpm11.7.0 matches project pin; global manifest11.22.0 mismatch warning
remains, with no signature/TLS bypass. Observed-output summary, not raw transcript:
`artifacts/security/identity-proxy-security-gate-20261009.json`.

## Latest: isolated identity TLS/mTLS transport admission — 2026-10-09 KST

Related FR-014~025/037~041 and v3 Identity/Tenant mapping. Added opt-in
`src/v3-identity-secure-edge.js`: actual TLS socket, authorized client, TLS1.2+
and dedicated exact SAN/clientAuth role are required before signed-ingress
method/path/JWT-hash/time verification and existing registry/RLS services.
No listener activation, live DB migration, MFA or DPoP assurance is claimed.
Network admission is not yet coupled to a network-audit capability at DB commit.

Commands: `node scripts/prepare-identity-edge-dev-cert.js`,
`node --test --test-concurrency=4`, `node scripts/v3-identity-transaction-check.js`,
`node scripts/security-secret-scan.js`: all exit0. Node649/649 PASS (40.825s).
Actual isolated PG/HTTP/TLS450/450 PASS, owned cleanup PASS, sourceUnchanged true:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-36-25-279Z-27dab1f1/transaction-check.json`.
Dedicated normal mTLS reads/writes, durable retry, foreign hospital404,
maker self-review403 and separate synthetic reviewer succeeded. Missing/forged/
stale ingress, substituted authorization/IP, wrong trusted proxy role and invalid
JWT deny. No-certificate, untrusted and expired clients never reach HTTP callback;
hostname verification remains enabled. Negative channel/auth requests leave
mapping, identity ledger and identity audit counts unchanged. This does not claim
transport-denial audit delivery; existing separate preauth checks remain in suite.

Initial FAIL runs retained at22:29:13/22:32:36 (reconcile actually201/201;
JSON field-order string comparison incorrectly failed),22:33:35/22:34:49
(negative fixture/Node TLS reset classification). Fixed test comparison to deep
field/value equality; no server authorization or DB policy relaxed. The reported
lastDbFault42501 was from the earlier deliberate audit-privilege outage test,
not evidence that the new reconcile failed. Old untrusted fixture was also expired;
preserved it and generated a separate unexpired self-signed negative fixture.
Both certificate signatures/expiry states are now independently asserted.
Node can report ECONNRESET for these local TLS rejection paths; PASS additionally
requires actual server tlsClientError, no HTTP callback, genuine fixture invalidity,
working positive control and unchanged persistence, not a reset alone.

Normal dedicated development certificate expires2026-11-07T22:26:58Z, key match
and project-CA verification PASS. Private keys stay in Git-ignored tmp/certs;
neither passwords nor keys printed. A/B/cloud runtime and original datasets
unchanged. Public negative certificate is not individually included in the
source hash manifest; fixture source and runtime invalidity checks are included.
New evidence remains DRAFT / UNASSIGNED, not covered by earlier human reviews.
Next: align actual host/proxy registration and scoped metadata authorization,
then new phantom encrypted Viewer; no live registration or full v3 completion.

## Latest: transaction deadline/teardown race corrected — 2026-10-09 KST

Related V3 Identity/Tenant/Exchange and FR-014~025/037~041. A fixed-diagnostic
run again stopped at MAINTENANCE_VISIBILITY with CONNECTION_TERMINATED,235 earlier
checks PASS, overall NOT VERIFIED/exit1, owned cleanup PASS:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-18-05-585Z-b1c40f30/transaction-check.json`.
Next diagnostic run completed431 checks PASS/exit0/76.415s before the code fix:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-20-28-090Z-de4773ce/transaction-check.json`.
Therefore the historical intermittent failure's root cause is NOT proven fixed.
Observation overhead may affect timing; no retry, role weakening or deadline increase.

Separately reproduced deterministic transaction error-classification race: own
deadline called release(true) before rejecting, synchronous teardown error won
Promise.race and returned V3_DATABASE_UNAVAILABLE instead of V3_TRANSACTION_DEADLINE.
New unit failed before correction (9PASS/1FAIL). Now initiating timeout/connection
fault rejects before destroying the client. Admission, rollback, scope, RLS and
deadline values are unchanged; only cause ordering changes. Tests also prove JWT
expiry remains JWT_EXPIRED and an in-flight COMMIT remains OUTCOME_UNKNOWN, with
one destroyed release and no raw exception exposure. Transaction10/10 PASS;
full647/647 PASS/exit0/41.242s; syntax/secret scan PASS.

Actual current-code PG/HTTP regression431/431 PASS/exit0/82.780s:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-22-59-864Z-48518ed4/transaction-check.json`.
Maintenance phases ROLE2ms/BEGIN1/CONFIG1/PRINCIPAL2/VISIBILITY224/COMMIT1, no
current-query faults. Diagnostic array uses per-query faults rather than attributing
a stale earlier failure to a successful query. Strict bounded phase/enums only;
no SQL, identifiers, token, protected values or error text. Owned cleanup PASS,
source unchanged during execution. Contains isolated phantom mapping checks,
not running-cloud registration or independent human approval.

Scope: repository transaction code only; no A/B2c/cloud38d image promotion, live
schema/identity changes or new phantom Viewer activation. Original NV evidence
retained and intermittent DB investigation OPEN. Next isolated TLS/mTLS trusted
ingress host gate, then authenticated live registration/metadata/scopes and new
dataset encrypted Viewer. Full v3 Grant/Preflight/Provenance/DOWNLOAD/STOW still
uncompleted. All new evidence DRAFT / UNASSIGNED; whole MVP/v3 NOT ACHIEVED.

## Latest: explicit v3 mapping host composition — 2026-10-09 KST

Related V3-FR-ID-001~006/V3-FR-TEN-001~003 and FR-014~025/037~041. Added explicit
CAPSTONE_SYNTHETIC_ONLY identity runtime router reusing registered-principal,
read/reconcile/review services, not a new authorization algorithm. Exact namespace
dispatch, path alias/duplicate security-header denial, safe no-store errors and
disposed-router503; other domains remain unhandled. No listener, credentials,
legacy server activation, live schema migration or implicit P-1001 association.
Unit router2 PASS/normal exit, full646/646 PASS/exit0/44.895s, syntax/secret scan PASS.
Initial unit client omitted Host for raw duplicate headers and mishandled an empty
parser400, leaving its own test process alive; only that exact process was stopped.
Client now supplies Host and rejects response parse/abort errors; normal exit proven
without force-exit. No production process was stopped.

Independent actual PG/loopback composition regression first run231 scoped checks
PASS then NOT VERIFIED/exit1, V3_DATABASE_UNAVAILABLE after maintenance-principal
admission:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-13-03-778Z-d08f9c2c/transaction-check.json`.
Standalone follow-up235 scoped checks PASS then same failure, NOT VERIFIED/exit1:
`evidence/generated/hp-v3-identity-tx-2026-10-08T22-15-05-452Z-22712082/transaction-check.json`.
Both owned PG cleanups PASS, source unchanged during execution. Concurrent load
is not established as cause; original failure retained, no timeout relaxation.
Follow-up includes4 PASS facts for exact synthetic source identifier: service-created
opaque PatientRef and UNVERIFIED mapping, maker review403, distinct signed synthetic
reviewer VERIFIED/version2, own metadata safe/foreign404, stored protected bytes
without plaintext local ID. This is ephemeral isolated fixture registration, NOT
cloud registration, cross-institution membership or independent human approval.

Added fixed maintenance-stage and driver-error enums for next diagnosis; no raw
SQL/error text, credentials or identifier output. Latest diagnostic increment is
syntax checked but its PG execution is still pending. Next fix the repeatable
maintenance DB failure before TLS/mTLS host gate, then authenticated live registration
and metadata/scopes and new phantom encrypted multi-slice Viewer. Runtime A/B2c,
cloud38d and actual A PACS28 objects remain unchanged. Whole MVP/v3 NOT ACHIEVED.

## Latest: actual A PACS additive phantom staging — 2026-10-09 KST

Related FR-006~FR-009, FR-026~FR-036; operator source preparation only, NOT v3
mapping/consent acceptance. Independently VIX-pinned A SSH role/MAC and exact
current A2c/PACS9f baselines required. All inputs/UID collisions checked before
the first upload; existing same UID reused only when exact DICOM SHA matches.
Only new objects are added, no delete/overwrite API or direct cloud DB insert.
Hospital-local Gateway client certificate/key stay on A and are mounted read-only
into an owned bounded probe. Strict mTLS hostname/CA verification remains enabled.

First source attempt retained NOT VERIFIED/exit1, SOURCE_MTLS_RENDER_INVALID:
`artifacts/workstation/phantom-source-2026-10-08T22-03-36.914795+00-00/result.json`.
First object remained added; no rollback deletion. Probe had omitted explicit
Accept:image/png unlike the running Gateway. Corrected negotiation for PNG,
DICOM JSON and multipart DICOM, then fresh validation PASS/exit0:
`artifacts/workstation/phantom-source-2026-10-08T22-04-35.187112+00-00/result.json`.
One identical existing phantom reused,23 added; source5→28, original4 IDs retained.
All24 mTLS WADO returned exact source SHA and256x256PNG;2 QIDO series each12 exact
SOPs. Subsequent explicit --verify-only PASS/exit0,28→28,added0/deleted0:
`artifacts/workstation/phantom-source-2026-10-08T22-06-03.535389+00-00/result.json`.
Missing/conflicting data fail before payload mutation in verify-only mode. Temporary
owned probe/stage cleanup PASS; source DICOM retained intentionally in A PACS.

Separate fresh legacy browser after staging PASS/exit0, linked single consent/token/
revoke, encrypted2x2 image and401/403/403 boundaries:
`artifacts/workstation/b-browser-2026-10-08T22-05-48.040515+00-00/result.json`.
This is NOT a new-phantom browser result. Read-only ledger5/5 PASS,3897 audits,
179 releases/96 consumed,0modified:
`artifacts/workstation/encryption-ledger-2026-10-08T22-06-48.208699+00-00/result.json`.
Source/gateway focused7 tests PASS, full644/644 PASS/exit0/40.989s (including2
source-safety contract tests), syntax and secret scan PASS. Runtime images,
cloud identity/metadata/database schema and B unchanged. New evidence DRAFT / UNASSIGNED.

Remaining: new phantom patient HP-TEST-PHANTOM-001 must receive a real tenant-owned
mapping and metadata/scopes before grant issuance. Legacy imaging list is read-only;
existing v3 mapping write adapters are not activated in the current server. Do not
silently associate this PACS patient with P-1001, hardcode approval or insert cloud
DB rows behind the service. Next implement the contract-aligned authenticated
registration/runtime path with denial tests, then new multi-slice encrypted Viewer
E2E. Existing normative VIEW/DOWNLOAD/STOW/Grant/Preflight/Provenance gates remain.

## Latest: meaningful synthetic phantom preparation — 2026-10-09 KST

Related FR-006~FR-009, FR-026~FR-036; supports MVP-01/MVP-06 but does not complete
their new-dataset distributed acceptance. Deterministic project-generated geometric
phantom CT/MR-labelled Secondary Capture objects, 256x256,12 slices per modality,
2 studies/2 series/24 instances. New valid UID namespace, HP-TEST patient ID,
SYNTHETIC/NOT DIAGNOSTIC metadata and burned-in TEST pixels; no external source,
patient image, model-generated clinical anatomy or diagnostic CT/MR SOP class.
Existing legacy UID/data and current A/B/cloud runtime untouched.

Dataset with per-object SHA256, generator SHA and provenance:
`artifacts/synthetic-phantom/2026-10-08T21-58-15-418Z-25704/manifest.json`.
Actual isolated pinned Orthanc accepted all24, preserved exact source file hashes,
rendered every instance to256x256PNG and confirmed2 studies/24 instances. Latest
validation PASS/exit0:
`artifacts/synthetic-phantom-validation/facb56cc-b132-4da4-83f8-27216dd07e9b/result.json`.
No ports/network/existing volume: network-none disposable PACS, local-loopback
format/render fixture only, not a TLS/authentication-control claim. Probe shares
only that namespace, immutable image/read-only mounts,25s aggregate deadline;
commands bounded, readiness20s, exact ownership label check before both helper
and PACS cleanup. Cleanup PASS; generated source/evidence retained, no user data
removed. Unit2 PASS, full642/642 PASS/exit0/42.115s, syntax and secret scan PASS.

Next: explicitly register the new test patient mapping and metadata/scopes, stage
the dataset additively in A PACS, then prove consent-bound private-Vault encrypted
multi-slice Viewer flow. NOT DEPLOYED to A/B/cloud; no new-dataset Viewer/Grant,
DOWNLOAD/STOW/Preflight/Provenance acceptance claim. Existing whole v3 completion
criteria remain intact. New evidence DRAFT / UNASSIGNED.

## Latest: exact failed-browser consent cleanup — 2026-10-09 KST

Related FR-004, FR-014~FR-025, FR-032~FR-041. Verifier only; runtime A/B2c and
cloud38d unchanged. The fresh browser's sole successful creation response binds
cleanup to P-1001 / HOSP-A / HOSP-B and one exact consent ID. Authenticated patient
GET confirms ownership and state, POST revokes only that record, GET confirms
REVOKED. No list/search, historical inference, record deletion or exported token/ID.
Missing/duplicate/mismatched receipts or failed confirmation remain NOT VERIFIED.
Already REVOKED/EXPIRED records are read only. Cleanup never changes demo FAIL to PASS.

Actual expected-stop test: original browser FAIL/exit1 retained, test stop observed,
cleanup GET200/POST200/GET200, REVOKED, zero deleted records; cleanup gate PASS/exit0:
`artifacts/workstation/browser-cleanup-2026-10-08T21-54-16.581418+00-00/result.json`.
Separate fresh normal browser without stop flag PASS/exit0, built-in synthetic 2x2
Viewer, exact single create/token/revoke linkage, authenticated encrypted WADO,
401/403/403 negative image boundary, acknowledged revoke and cleared image:
`artifacts/workstation/b-browser-2026-10-08T21-55-25.068724+00-00/result.json`.
Seven cleanup unit cases PASS; full640/640 PASS/exit0/41.559s; JS/Python syntax and
secret scan PASS. Read-only ledger5/5 PASS,3824 audits/176 releases/93 consumed,
zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T21-55-31.552537+00-00/result.json`.

Limitations: cleanup requires a still-live browser/CDP and retained creation/auth
receipts. Fatal process termination/global deadline does not guarantee cleanup.
Historical failed runs without exact owned receipts are NOT VERIFIED; never bulk
revoke existing user consents. Effective expiry remains fail closed. No clinical
quality/OHIF/full v3, cold start, HA or production/legal approval claim. All new
evidence DRAFT / UNASSIGNED; prior human review is not approval of these results.

## Latest: transport-phase diagnostic crypto verification — 2026-10-09 KST

Related FR-021~FR-031, FR-037~FR-041. Runtime A/B2c/cloud38d unchanged. The
disposable probe uses an isolated diagnostic HTTPS Agent with the same Node
global-Agent options; strict boundedHttps CA/hostname/minTLS/timeout checks remain.
It does not patch the running app, default global Agent or identity/configuration.
Fixed operation/phase/error enums, UTC start time, elapsedMs, reuse/TLS booleans
and numeric status only; no URLs/headers/bodies/secret/exception text. Max64 rows;
socket listeners removed and agent destroyed. Separate diagnostic pool may affect
timing, so a PASS does not prove the earlier uninstrumented timeout fixed.
Two diagnostic-safety tests PASS, full633/633 PASS/exit0/41.095s, secret scan PASS.

Actual diagnostic current2c crypto14/14 PASS/exit0:
`artifacts/workstation/encrypted-negatives-2026-10-08T21-42-35.066172+00-00/result.json`.
Fresh package for in-flight revoke: new socket, TLS verified, response200 complete
1427ms. Actual Vault unwrap called once, patient revoke200, BEFORE_UNWRAP200 then
AFTER_UNWRAP403, no plaintext returned. Owned consent REVOKED cleanup PASS.
Other substitution/expiry/replay tests retain their exact component scope (bound
metadata rejects tag substitution before unwrap; invalid provider token helper is
not a global provider outage). Earlier13PASS/1NV remains preserved below; timeout
did not recur, exact historical root cause unproven, no timeout extension/retry.
Probe source SHA `eeac72c264da05f74676af6fcf39df8803d79c3d6cad6edce6dca65efc3072fb9`.

Read-only post-probe ledger5/5 PASS,3615 audits/169 metadata releases/87 consumed,
zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T21-44-37.096117+00-00/result.json`.
Current2c A-only rollback/re-promotion6/6 PASS/exit0/121.586s:
`artifacts/workstation/a-rollback-2026-10-08T21-45-20.028105+00-00/result.json`.
Before mutation, retained9d exact-image fresh scan HIGH0/CRITICAL0 PASS:
`artifacts/security/container-scan/capstone-timeouts-recovery-20261009.json`.
A9d rollback browser PASS at21:46:22.632056; A2c restored browser PASS
at21:47:32.963405 (b-browser directory prefix). Both actual encrypted synthetic
view, DPoP negatives, exact one create/token/revoke linkage and acknowledged
revocation/image clear PASS. A2c restored/required encryption and health verified;
B portal, cloud API/PG and A PACS container IDs/mounts unchanged. Not B/cloud
rollback, VM power-off/reboot/DR or production recovery approval.
Recovery helper defaults now match the actually restored2c image; explicit
arguments in Runbook retained. Local rollback-safety2/2 PASS after that update.
Post-recovery ledger5/5 PASS,3745 audits/174 metadata releases/91 consumed,
zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T21-47-47.814948+00-00/result.json`.
Next exact owned failed-browser consent cleanup and better synthetic demo data,
distributed one-command verification, rehearsal, independent human review and
original v3 acceptance completion. Historical timeout investigation remains open.
Remaining original MVP/v3 requirements below still apply; no whole completion.

## Current: interactive request capacity — 2026-10-09 KST

Related FR-001~FR-005, FR-021~FR-036, FR-037~FR-041. Previously observed
PROOF_POLICY9788ms near10000ms deadline and a background snapshot issuing seven
same-origin requests motivated bounded scheduling. Connection contention is a
plausible contributor, not a conclusively proven cause of every prior failure.
Background metadata reads now cap concurrency at two, yield queued reads to
consent mutation/token issuance, and drain already-started reads before releasing
the refresh guard. Errors/interruption never apply partial snapshots. Foreground
post-mutation authority remains a new independent read; stale guards preserved.
No TLS, DPoP, server policy, request timeout, retry or security-tarpit change.
API contracts/DB unchanged; affected screens dashboard/consent/Doctor Viewer.

Nine polling tests PASS including failure drain/falsy rejection, foreground
freshness and interruption. Full631/631 PASS/exit0/44.027s. Security Gate
PASS/exit0:
`artifacts/security/capstone-interactive-capacity-security-gate-20261009.json`.
Executed pnpm11.7.0 matches pin; global-manifest11.22 warning retained; dependency
audit critical threshold, not a claim of zero vulnerabilities at every severity.
Build exit0; exact-image scan/container gate HIGH0/CRITICAL0 PASS:
`artifacts/security/container-scan/capstone-interactive-capacity-20261009.json`.

Current A/B `highpass-platform-mvp:capstone-interactive-capacity-20261009`,
`sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1`.
Stage `/home/server/.highpass-app-2026-10-08T21-31-00.357148+00-00`.
App-only rollout10/10 PASS/exit0:
`artifacts/workstation/hospital-app-rollout-2026-10-08T21-31-00.357148+00-00/result.json`.
Only scoped public/app.js source hash changed, PACS unchanged/cloud38d untouched.
Current three sequential fresh browsers PASS/exit0/151.322s, debugger disabled,
zero automatic retries; actual encrypted2x2 synthetic image, linked single
create/token/revoke, duplicate suppression, DPoP image negatives and acknowledged
revocation/image hiding/no token exposure each PASS:
`artifacts/workstation/browser-repeat-2026-10-08T21-32-44.796797+00-00/result.json`.
PROOF_POLICY200 latencies39/2098/5110ms; TOKEN_REQUEST200148/2107/5169ms.
Previous9e third proof-policy9788ms. Different time-dependent security delay means
this is not a controlled performance benchmark or proof every old failure fixed.
No browser run is retried away. Long-term stability/global provider outage/HA NV.
Current A-PACS mTLS8/8 PASS/exit0, valid ALLOW/no cert, wrong issuer/SAN/EKU,
expired/bad DENY and owned test key cleanup:
`artifacts/workstation/current-mtls-2026-10-08T21-33-41.424595+00-00/result.json`.
Runtime certificates unchanged, no CA private transfer. Python local inventory,
reboot-preservation and rollback-safety tests2+2+2 PASS, not actual current guest
reboot/rollback proof.

Prior uninstrumented current2c crypto gate NOT VERIFIED/exit1:13 PASS/1 NOT VERIFIED:
`artifacts/workstation/encrypted-negatives-2026-10-08T21-35-24.898299+00-00/result.json`.
Actual wrap/unwrap normal PNG PASS; consumed replay, ciphertext/GCM-tag/wrapped
key/MIME/key-version/recipient/release-ID/Instance-route substitution DENY PASS;
real private Vault invalid helper token401 and elapsed receipt expiry DENY PASS.
Tag/ciphertext substitution is denied by bound metadata BEFORE unwrap, not proof
of a GCM authentication failure during actual decrypt. Provider invalid-token
fault is disposable-helper only, not a global Vault outage.
PREPARE_INFLIGHT_REVOKE timed out fetching a fresh encrypted package before the
actual-unwrap/revoke scenario began. ETIMEDOUT is NOT policy DENY and is NOT PASS.
Owned synthetic consent inactive(REVOKED) cleanup PASS, records deleted0.
Runtime identity/configuration unchanged; no secret/plaintext exported. Earlier
d6 in-flight revoke PASS is retained but cannot establish current2c completion.

Post-probe ledger5/5 PASS,3508 audits/157 metadata releases/86 consumed, zero
modified records/hash chain valid:
`artifacts/workstation/encryption-ledger-2026-10-08T21-38-30.246892+00-00/result.json`.
Read-only fleet diagnostics cloud healthy/no observed SQL or transport errors,
A completed requests200 and no captured failure event; this does not establish
which phase of the timed-out preparation failed:
`artifacts/workstation/runtime-diagnostic-2026-10-08T21-38-58.404287+00-00/result.json`.
No automatic gate retry or timeout extension was performed. Current2c crypto
in-flight revoke remains NOT VERIFIED; next investigate the package request's
DNS/connect/TLS/response phase with bounded secret-free diagnostics, then correct
an evidenced cause and rerun without relabeling this failure. Do not weaken TLS,
DPoP, consent expiry or security tarpit to turn the gate green.

Next: that focused timeout diagnosis, precise owned failed-browser consent
cleanup, current-image recovery, meaningful synthetic demo imagery, unified
distributed verification/runbook rehearsal and independent human review.
Original v3 Grant/Preflight/Provenance/VIEW-DOWNLOAD-STOW acceptance remains
incomplete; this legacy Viewer work does not reduce the normative v3 scope.
Port9231 listener absent after browser cleanup. Older evidence below is tied to its
historical image, not relabeled current-image proof. Whole MVP/v3 NOT ACHIEVED;
all new evidence DRAFT / UNASSIGNED.

## Historical 9e: dashboard polling backpressure — 2026-10-09 KST

Related FR-001~FR-005, FR-021~FR-036, FR-037~FR-041. Historical A/B image:
`highpass-platform-mvp:capstone-poll-backpressure-20261009`,
`sha256:9e2d9ac82492fdd1508d07bf7627215aaaa3cf9d36c2aed0f736499b16e0f52f`.
Stage `/home/server/.highpass-app-2026-10-08T21-15-27.511224+00-00`.
App-only rollout10/10 PASS/exit0; PACS preserved and cloud38d unchanged:
`artifacts/workstation/hospital-app-rollout-2026-10-08T21-15-27.511224+00-00/result.json`.

Uninstrumented e7 repetition retained:21:08:53.946258 failed first run;
21:11:02.688491 passed two then failed third (browser-repeat directory prefix).
The latter captured repeated ~20s ERR_ABORTED dashboard reads. Background ticks
now skip while a dashboard refresh is pending; explicit post-mutation refresh
still performs a new authoritative read, never reuses an older background read.
Existing stale-state guards, fail-closed behavior, TLS, DPoP and application
timeouts unchanged. Three new polling tests PASS; full625/625 PASS/43.101s.
Security Gate PASS/exit0:
`artifacts/security/capstone-poll-backpressure-security-gate-20261009.json`.
Exact image container gate HIGH0/CRITICAL0 PASS:
`artifacts/security/container-scan/capstone-poll-backpressure-20261009.json`.

First9e fresh-browser repetition: two PASS, third FAIL at TOKEN; overall
NOT VERIFIED/exit1/144.464s:
`artifacts/workstation/browser-repeat-2026-10-08T21-16-58.394680+00-00/result.json`.
Failure observed consent201, handoff201 and issued token, no dashboard network
abort, but no successful image within the old15s Series observation budget.
Failure retained, not relabeled. Fixed-enum token/QIDO/WADO response latency
diagnostics added; verifier Series observation now65s for the existing sequential
20s token/Study/Series requests. No application timeout/retry/auth change. New
repetition with corrected observation budget first failed at TOKEN/exit1/113.062s:
`artifacts/workstation/browser-repeat-2026-10-08T21-20-45.928705+00-00/result.json`.
No captured token request in that failure; original proof-policy request was not
yet instrumented, so its precise outcome cannot be inferred. Adding fixed-enum
PROOF_POLICY telemetry and token-control disabled state did not change the app.

Latest three sequential fresh browsers PASS/exit0/170.270s, debugger disabled,
zero automatic retries:
`artifacts/workstation/browser-repeat-2026-10-08T21-23-09.130094+00-00/result.json`.
Each run actual encrypted2x2 image, one create/token/revoke matched, duplicate
events suppressed, DPoP image negative checks, server revocation acknowledgement
and hidden image/no token URL/UI/storage exposure PASS. Not OHIF, clinical image
quality, HA or load proof. Third run PROOF_POLICY200 took9788ms near its10000ms
application deadline; TOKEN_REQUEST2007561ms, Study2005444ms, Series200242ms.
These sequential timings demonstrate why the previous15s observation budget was
insufficient; they do NOT prove every earlier application failure fixed.
Background request scheduling/interactive capacity is the next latency risk to
investigate without disabling the existing security tarpit or extending request
deadlines. Full625/625 again PASS/exit0/40.924s after verifier changes; safe-enum
tests2/2 PASS. Intermittent root cause still not conclusively closed.

Read-only ledger5/5 PASS,3045 audits/134 metadata releases/76 consumed,
zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T21-20-01.621032+00-00/result.json`.
Latest post-repeat ledger5/5 PASS,3234 audits/140 metadata releases/80 consumed,
zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T21-26-08.551213+00-00/result.json`.
Runtime diagnostic healthy cloud/no observed SQL errors:
`artifacts/workstation/runtime-diagnostic-2026-10-08T21-20-04.186798+00-00/result.json`.
Hospital logs include historical fault events; no per-run outage attribution.
Current9e A-PACS mTLS component8/8 PASS/exit0: valid ALLOW, no-certificate,
wrong-issuer/SAN/EKU, expired and bad fixtures DENY; owned test keys cleaned:
`artifacts/workstation/current-mtls-2026-10-08T21-25-49.737239+00-00/result.json`.
No runtime certificate replacement/CA private key transfer/seed. Component proof,
not complete cross-hospital E2E. Port9231 listener absent after final repetition
cleanup. Current9e recovery, crypto negative reruns, failed-flow owned consent cleanup, meaningful
synthetic imagery, rehearsal and independent review remain. Earlier e7/d6/a7
gates below remain historical and MUST NOT be relabeled9e proof. Whole MVP/v3
NOT ACHIEVED; v3 Grant/full API HA incomplete. All new evidence DRAFT / UNASSIGNED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## Latest: consent result classification — 2026-10-09 KST

Related FR-001~FR-005, FR-014~FR-025. Read-only cloud diagnostic healthy, no
observed SQL/audit/transport errors:
`artifacts/workstation/runtime-diagnostic-2026-10-08T20-54-41.212593+00-00/result.json`.
Safe browser diagnostics use fixed operation/type/stage enums only, never
response bodies, credentials, exception text or stacks. A normal diagnostic
browser PASS,201 creation/handoff, no captured exceptions:
`artifacts/workstation/b-browser-2026-10-08T20-55-52.183012+00-00/result.json`.
Repeated old-image fault gate still NOT VERIFIED because fresh browser failed:
`artifacts/workstation/browser-outage-2026-10-08T20-56-21.238276+00-00/result.json`.
Failed browser `b-browser-2026-10-08T20-59-15.454231+00-00` observed201 creation and
handoff, plus fixed Error/OTHER classification. Exact intermittent exception
root cause remains unproven; those201 headers alone do not prove successful UI.

Local reproduction proved a separate result-classification defect: server
acknowledges ACTIVE consent, then secondary dashboard throws; prior catch
incorrectly reported CONSENT_REQUEST_FAILED. New code distinguishes
CONSENT_REFRESH_FAILED, retains only acknowledged consent identity, keeps local
consent readiness false/token absent and requires refreshed authority. It does
not bypass authorization or automatically restore access. Regression failed
before patch, passed afterward. Focused17 PASS; full622/622 PASS/40.708s.
Security Gate PASS/exit0:
`artifacts/security/capstone-consent-result-security-gate-20261009.json`.
Exact candidate scan/container gate HIGH0/CRITICAL0 PASS:
`artifacts/security/container-scan/capstone-consent-result-20261009.json`.

Historical e7 A/B `highpass-platform-mvp:capstone-consent-result-20261009`, exact image
`sha256:e7dc852f99ab2919be30a237e1dcfc91ad520beb7fe3f5553004b8dd41e7202c`.
Stage `/home/server/.highpass-app-2026-10-08T21-01-45.321385+00-00`.
App-only rollout10/10 PASS/exit0:
`artifacts/workstation/hospital-app-rollout-2026-10-08T21-01-45.321385+00-00/result.json`.
PACS preserved, cloud38d unchanged; scoped runtime source hashes differ only
for public/app.js. New-image live browser/fault results are pending below.
Old d6 guest-reboot/crypto evidence remains tied to d6, not relabeled e7 proof.
All new evidence DRAFT / UNASSIGNED, no whole MVP/v3 completion claim.

Latest e7 exact-image live connection-fault/recovery gate6/6 PASS/exit0,89.752s:
`artifacts/workstation/browser-outage-2026-10-08T21-03-36.964928+00-00/result.json`.
Actual fault browser PASS at21:04:37.617088; exact REJECT counters2/14,
503/no image/hidden previous image; Vault restoration actual decrypt/view PASS;
Control restoration preserves cleared local access, refreshes consent metadata
and revocation acknowledged. Rules removed and B runtime unchanged.
Separate fresh-browser normal flow PASS:
`artifacts/workstation/b-browser-2026-10-08T21-05-31.004163+00-00/result.json`.
Normal encrypted view, DPoP negatives, exact one-create/one-token/one-revoke
linkage, revocation/image removal and no token exposure PASS; no captured
exceptions in this diagnostic run. Debugger diagnostics during initial UI flow
may affect timing; uninstrumented repeated stability is still required. A single
successful run does NOT prove the intermittent root cause fixed. Known result
masking correction is locally proven; previous failed runs remain.

Post-gate read-only ledger5/5 PASS:2775 audits,126 metadata releases,69 consumed,
zero records modified:
`artifacts/workstation/encryption-ledger-2026-10-08T21-05-59.362895+00-00/result.json`.
Browser debug listener9231 absent after cleanup. Next P0: uninstrumented repeated
fresh-browser stability and exact owned failed-flow consent cleanup; instrument
creation acknowledgement versus secondary phase if failure recurs. Then current
image recovery/crypto regression, meaningful synthetic demo imagery, final
rehearsal and independent review. v3 Grant/full API HA remain incomplete; VM
power-off/global provider outage/DR unverified. Whole distributed MVP NOT ACHIEVED.

## Latest: real browser egress-fault gate — PARTIAL, 2026-10-09 KST

Related FR-014~FR-041. Added browser outage verifier and exact B-container
egress fault orchestration. Only one container source /32 and one destination
/32 TCP443 is REJECTed at a time. Exact-rule cleanup is registered before
mutation with a150s VM-local watchdog; no global flush, provider configuration,
TLS relaxation, image deployment, cloud shutdown or volume change.

Latest actual run OVERALL NOT VERIFIED/exit1,138.520s:
`artifacts/workstation/browser-outage-2026-10-08T20-48-51.580581+00-00/result.json`.
Subgate actual browser PASS:
`artifacts/workstation/b-browser-2026-10-08T20-50-17.058392+00-00/result.json`.
Private-Vault connection fault produced503/no image/hidden previous image;
removal restored actual encrypted viewing. B→Control connection fault likewise
produced503/no image/hidden previous image. Authoritative polling cleared local
token; restoration did NOT resurrect it. Consent metadata refresh completed,
patient revocation acknowledged. The two exact-rule counters were2 and37
packets; exact removal and unchanged B container/image/mounts/health PASS.

Required separate fresh-browser recovery FAILED at consent creation:
`artifacts/workstation/b-browser-2026-10-08T20-51-25.272965+00-00/result.json`.
UI safe error `CONSENT_REQUEST_FAILED`; root cause NOT YET VERIFIED. Do not
declare the whole connection-failure/recovery gate PASS. Next action is isolate
the consent request versus post-ack refresh failure, then fix/retest with normal
and negative controller tests plus actual browser. Never auto-restore old tokens.

Earlier failed/not-verified attempts retained at20:42:18.338276,
20:45:04.494413 and20:47:06.251847 (same browser-outage directory prefix).
The first expected automatic reuse of locally cleared access; the second raced
consent metadata recovery before revocation; the third failed before fault
injection. Verifier now waits for authoritative ACTIVE metadata, and its consent
completion budget45s includes bounded sequential dashboard/PACS/PHR reads.
No application timeouts or success predicates were weakened. Failed test flows
may have left synthetic ACTIVE consents; their cleanup is NOT VERIFIED. Do not
delete broad consent/audit data to recover; identify only exact owned records.

Post-run read-only ledger5/5 PASS:2437 valid audits,111 release metadata rows,
59 consumed, zero records repaired/normalized:
`artifacts/workstation/encryption-ledger-2026-10-08T20-51-35.839992+00-00/result.json`.
New Node outage-decision + existing replay fixture2 tests PASS; two Python exact
fault-rule tests PASS; syntax/secret scan PASS. Global provider outage, cloud
shutdown/HA/DR, new v3 Grant, final rehearsal and independent human review remain
open. New evidence DRAFT / UNASSIGNED; whole MVP NOT ACHIEVED.

Final full Node regression620/620 PASS/exit0,40.546s. Post-document secret scan
PASS/no findings20:53:15.328Z; verifier port9231 no listener after cleanup.
This does not override the failed live fresh-browser consent recovery.

## Latest: A/B guest reboot auto-recovery — 2026-10-09 KST

Related FR-026~FR-041. Read-only inventory confirmed Docker/overlay enabled and
active, zero unowned containers, all owned containers running with restart
policies. Explicit Docker-after-overlay ordering was initially NOT VERIFIED;
added exact owned `90-highpass-capstone-overlay.conf` on both VMs, preserving
other settings. No daemon/VM restart during installation. Loaded order PASS:
`artifacts/workstation/vm-autostart-2026-10-08T20-32-02.936771+00-00/result.json`.

Actual A→B guest reboot gate5/5 PASS/exit0,191.337s:
`artifacts/workstation/vm-reboot-2026-10-08T20-33-56.888952+00-00/result.json`.
Both boot IDs changed; original SSH keys, container IDs, images and mount
fingerprints retained. A3/B1 containers returned healthy, overlay/Docker active;
no manual Compose start or data reseeding. Current A/B d6 image unchanged.
Cloud/control38d and PostgreSQL container identities/health remained unchanged.
Actual post-reboot browser encrypted-view/DPoP-negative/revocation/duplicate
operation and exact create/token/revoke linkage PASS:
`artifacts/workstation/b-browser-2026-10-08T20-37-22.491972+00-00/result.json`.
Read-only ledger5/5 PASS:2103 valid audits,93 release records,51 consumed,
zero modified/normalized records:
`artifacts/workstation/encryption-ledger-2026-10-08T20-37-48.148667+00-00/result.json`.
Four new Python inventory/preservation unit checks PASS; syntax and secret scan
PASS. Browser debug port9231 has no remaining listener. Runtime apps unchanged,
so full619-test result remains the earlier application test, not a new full run.

Created `scripts/capstone-vm-autostart-check.py`,
`scripts/capstone-vm-reboot-check.py`,
`infra/workstation/docker-capstone-overlay.conf`,
`test/capstone-autostart-inventory.test.py`,
`test/capstone-reboot-preservation.test.py`; updated Runbook/manifest.
Scope: orderly guest reboot ONLY, not VM power-off/cold boot, cloud restart,
general network failure or DR. Browser uses built-in synthetic2x2 Viewer, not
OHIF. Global Key Vault/control outage fail-closed, final rehearsal, new v3 Grant,
full API HA and independent human review remain open. No whole MVP completion.
All new evidence DRAFT / UNASSIGNED.

## Latest: consent mutation and late-response guards — 2026-10-09 KST

Related FR-001~FR-005, FR-014~FR-041. A/B now run
`highpass-platform-mvp:capstone-consent-flow-20261009`, exact image
`sha256:d6c38ee56bb837e8768975c4c52875d7de98d389537eaa84231458a183bd00df`.
Owned stage: `/home/server/.highpass-app-2026-10-08T20-18-57.600800+00-00`.
App-only rollout10/10 PASS; PACS preserved and cloud38d unchanged:
`artifacts/workstation/hospital-app-rollout-2026-10-08T20-18-57.600800+00-00/result.json`.

Frontend mutation/token locks suppress duplicate operations. Revocation immediately
invalidates local access; stale token responses and rendered image completions
cannot restore it. Six new local controller regressions PASS; focused15 PASS;
full Node619/619 PASS/exit0,45.059s. Security Gate PASS/exit0:
`artifacts/security/capstone-consent-flow-security-gate-20261009.json`.
Exact deployed image container scan/gate PASS, HIGH0/CRITICAL0:
`artifacts/security/container-scan/capstone-consent-flow-20261009.json`.

Actual trusted browser gate PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T20-21-15.312026+00-00/result.json`.
Forced duplicate create/token/revoke events each produced exactly one HTTP
operation. Created consent, issued token and revoked consent IDs matched in RAM;
only the issued token was used for DICOMweb. Normal private-Vault encrypted PNG,
no-auth/no-DPoP/replayed-proof denial, acknowledged revocation, image clearing
and no token exposure PASS. Synthetic2x2 built-in Viewer only; OHIF NOT VERIFIED.
This does not prove arbitrary cross-tab concurrency or browser provider-outage
fault injection. Earlier A-only rollback PASS belongs to a7 image, not d6.
VM cold-start, global provider/control outage and independent human review remain
open. Whole distributed MVP/v3 is NOT ACHIEVED; all new evidence DRAFT / UNASSIGNED.

Current exact d6 B runtime crypto module with actual A/cloud/private Vault:
14/14 PASS/exit0, including normal unwrap, substitution/replay/receipt-expiry
denials, disposable invalid provider-token denial and patient revocation after
real unwrap before plaintext. No runtime configuration changed; no plaintext or
secrets exported. This is not browser fault injection/global outage:
`artifacts/workstation/encrypted-negatives-2026-10-08T20-23-26.109408+00-00/result.json`.
Final read-only ledger5/5 PASS/exit0:2041 valid audits,91 metadata releases,
49 consumed, zero modified records:
`artifacts/workstation/encryption-ledger-2026-10-08T20-29-02.619099+00-00/result.json`.
Post-document secret scan PASS/exit0/no findings at20:29:04.208Z. App/verifier
Node syntax and manifest JSON parsing PASS. Owned browser debug port9231 no
longer listening after verifier cleanup; unrelated browser processes untouched.

Read-only ledger snapshot during the crypto gate: five checks PASS,2027 valid
audits,90 release metadata rows,49 consumed; no normalization/repair:
`artifacts/workstation/encryption-ledger-2026-10-08T20-27-48.830737+00-00/result.json`.

## Recovery gate and delayed dashboard correction — 2026-10-09 KST

Related FR-001~FR-005, FR-014~FR-041. Added
`scripts/capstone-a-rollback-check.py` and two Python safety tests in
`test/capstone-rollback-safety.test.py`: exact owned context validation, A-only
Compose recreation, strict pinned images/SSH, required encryption, latest-image
compensation registered before mutation. No volume deletion, cloud rollback,
database normalization or secret output. Scope excludes B/cloud image rollback
and full VM cold-start. These broader gates remain NOT VERIFIED.

First A-only rollback run NOT VERIFIED/exit1:
`artifacts/workstation/a-rollback-2026-10-08T19-48-22.762589+00-00/result.json`.
Previous9d2 Gateway healthy/required encryption PASS and actual browser PASS:
`artifacts/workstation/b-browser-2026-10-08T19-49-33.678850+00-00/result.json`.
Latest d576 image restored, but subsequent browser flow FAILED before any
DICOMweb request: `artifacts/workstation/b-browser-2026-10-08T19-50-28.893536+00-00/result.json`.
Do not convert this overall gate to PASS based on restoration alone.
Read-only runtime diagnostic afterward PASS/healthy, no observed transport/SQL
errors: `artifacts/workstation/runtime-diagnostic-2026-10-08T19-51-03.576514+00-00/result.json`.
Actual ledger5/5 PASS:1520 valid audits/64 releases/35 consumed,
`artifacts/workstation/encryption-ledger-2026-10-08T19-50-32.436588+00-00/result.json`.

Local reproduction demonstrated a delayed dashboard snapshot could replace a
newer consent selection. A minimal frontend correction discards older applied
request sequences, changed selection IDs and pre-mutation revisions. This
also rejects pre-revocation snapshots with the same consent ID; server authority
unchanged. One remaining activity-page success toast now requires confirmed
revocation. Seven local UI regressions PASS; full Node611/611 PASS/exit0,41.353s.
Two rollback safety tests PASS; secret scan PASS/no findings. Browser verifier
now waits for initial Study options and exposes only fixed safe flow stages,
not exception/secret contents. This diagnostic edit is not a runtime API change.

Candidate `highpass-platform-mvp:capstone-dashboard-order-20261009`, exact image
`sha256:df9d52fa9b3691f8bf6ee97d921b72bb3d411692e809def0fb63eaff5a93fca1`.
Exact image scan/container gate PASS, HIGH0/CRITICAL0:
`artifacts/security/container-scan/capstone-dashboard-order-20261009.json`.
Current deployment and repeated recovery-gate results will be recorded below;
local tests alone do not establish deployed correction or whole MVP completion.

Latest df9d-image hospital app-only rollout10/10 PASS/exit0:
`artifacts/workstation/hospital-app-rollout-2026-10-08T19-54-42.203717+00-00/result.json`.
Current A/B context `/home/server/.highpass-app-2026-10-08T19-54-42.203717+00-00`.
PACS container preserved; cloud remains38d707e7a924. Eight runtime source hashes
attest only `public/app.js` changed versus previous hospital image; encryption/
Gateway/portal modules retained. Updated probe baseline pin only after actual
promotion. The earlier14-check negative evidence remains tied to d576 image
until rerun, not automatically relabeled as a new-image gate.

Repeated df9 recovery gate also NOT VERIFIED/exit1:
`artifacts/workstation/a-rollback-2026-10-08T19-56-11.292437+00-00/result.json`.
Rollback browser PASS; restored browser normal flow and revocation UI PASS,
but replay-negative request exceeded its five-second client deadline:
`artifacts/workstation/b-browser-2026-10-08T19-58-33.963603+00-00/result.json`.
Timeout is not policy DENY. Verifier now selects the exact request-ID-correlated
200 image fixture (not merely a pending request),15s request deadline/60s CDP
aggregate with unchanged120s overall browser deadline. A new local regression
verifies pending/denied/non-image/mismatched-ID requests are never selected.
Another subsequent gate NOT VERIFIED, latest image recovered:
`artifacts/workstation/a-rollback-2026-10-08T19-59-32.901481+00-00/result.json`.
Its browser stopped at TOKEN with no DICOMweb request:
`artifacts/workstation/b-browser-2026-10-08T20-00-51.079234+00-00/result.json`.

Source inspection identified a second independent initialization defect:
handlers were bound before top-level `await loadDashboard()`, whereas DPoP
promise/viewer/archive state bindings were declared afterward. Early token
clicks could encounter uninitialized lexical state. Bootstrap was moved after
all module-level state declarations; security/authentication semantics unchanged.
An ordering regression plus prior tests now total nine focused frontend/probe
checks PASS. Candidate `capstone-ui-bootstrap-20261009` exact image
`sha256:a7c753acbdadc06de1ccaa3b49a493302c96d94b005598e7666f406db6114e5c`.
Promotion/recovery evidence will be recorded separately, not inferred from local
tests. Read-only ledger after failed attempts5/5 PASS:1703 valid audit links,
71 releases/41 consumed (`artifacts/workstation/encryption-ledger-2026-10-08T20-03-37.058374+00-00/result.json`).
All prior failed/NOT VERIFIED gates remain retained. No audit repair/deletion.

Latest a7c-image app-only rollout10/10 PASS/exit0:
`artifacts/workstation/hospital-app-rollout-2026-10-08T20-04-05.591573+00-00/result.json`.
Current A/B context `/home/server/.highpass-app-2026-10-08T20-04-05.591573+00-00`.
Cloud remains38d, PACS preserved, strict TLS/mTLS and required encryption retained.
Full Node613/613 PASS/exit0,43.257s; Security Gate PASS/exit0:
`artifacts/security/capstone-ui-bootstrap-security-gate-20261009.json`.
Exact image scan/container gate HIGH0/CRITICAL0 PASS:
`artifacts/security/container-scan/capstone-ui-bootstrap-20261009.json`.
Two Python rollback safety tests PASS; nine focused frontend/probe tests PASS.
New recovery-gate results are separate from preserved prior failed attempts.

Final A-only recovery gate6/6 PASS/exit0,113.961s:
`artifacts/workstation/a-rollback-2026-10-08T20-05-33.100671+00-00/result.json`.
Actual previous9d2 Gateway browser PASS:
`artifacts/workstation/b-browser-2026-10-08T20-07-02.474260+00-00/result.json`.
Latest a7c restored and actual browser PASS:
`artifacts/workstation/b-browser-2026-10-08T20-08-05.365112+00-00/result.json`.
Both include trusted HTTPS, normal QIDO/WADO/real private-Vault synthetic image,
401/403/no image for unauthenticated/missing/replayed proof, server revocation
acknowledgement, refreshed REVOKED label and image-cache clearing. B/cloud/PG
container IDs and A PACS container/mount configuration unchanged. No volume
deletion, fixture replacement or cloud audit rollback. Historical failures remain
retained; successful recovery does not make them PASS retroactively.

Final read-only ledger5/5 PASS/exit0:1872 valid audit records,77 release records,
46 consumed; stored link order/fork/predecessor diagnostics valid with no repair:
`artifacts/workstation/encryption-ledger-2026-10-08T20-09-50.477196+00-00/result.json`.
Recommended commit separation (not executed): dashboard/initialization UI fixes
and regressions; A-only recovery helper/safety test and browser fixture verifier;
reviewed documentation/public evidence pointers. Preserve unrelated499-entry
working-tree baseline and do not commit generated Docker archives/private data.

Remaining work: verify exact per-transfer create-consent/token/revoke ID linkage
and concurrent UI actions (normal-flow tests currently verify acknowledgement
and label but do not explicitly correlate all three IDs); full VM reboot/cold-start
reproduction; real running-portal outage fail-closed behavior; current final demo
rehearsal and independent human review. New v3 Grant/full API HA remain incomplete/
unverified. Software/certificate/identity retention and USD100 budget constraints
remain unchanged. No legal/certification/hospital approval or whole MVP claim.

## Latest hospital consent UI promotion — 2026-10-09 KST

Related FR-001~FR-005, FR-014~FR-041. Existing Control/Data Plane, API,
RBAC/ABAC, DPoP, strict TLS/mTLS and required encryption contracts unchanged.
Both hospital applications now use `capstone-consent-ui-20261009`, exact image
`sha256:d5769004cebf7d47d25e878e8afa7d9eef7d9b0da83f40ab038a1e04a3c86a78`.
Cloud remains `38d707e7a924`; PACS and all existing database data preserved.
App-only rollout10/10 PASS/exit0 with eight scoped source hashes:
`artifacts/workstation/hospital-app-rollout-2026-10-08T19-40-56.049509+00-00/result.json`.
Current A/B stage `/home/server/.highpass-app-2026-10-08T19-40-56.049509+00-00`.
Old images/contexts retained; actual rollback/cold-start still NOT VERIFIED.

The dashboard preserves explicitly selected revoked/expired consent rather than
silently switching to another ACTIVE consent. Revocation success requires the
exact server-confirmed consent/status; failed responses clear cached access but
never send success broadcasts/toasts. New `public/consent-selection.js` and five
regressions in `test/consent-selection.test.js`; `public/app.js` updated minimally.
Pure controller fault injection is a local test, not a deployed browser outage
test. Actual browser normal flow, authentication negatives, refreshed REVOKED
label and image clearing PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T19-42-46.264319+00-00/result.json`.
Built-in Viewer decoded tiny2x2 synthetic PNG; OHIF/clinical quality NOT VERIFIED.

Full Node regression609/609 PASS/exit0 (41.583s). Earlier concurrent build/test
run608/609 failed the Python fixture's two-second readiness deadline; retained,
then isolated24/24 and complete609/609 reruns PASS. No production timeout relaxed.
Secret scan PASS/no findings. Exact image scan/container gate PASS: HIGH0,
CRITICAL0 (`artifacts/security/container-scan/capstone-consent-ui-20261009.json`).
Current A PACS mTLS8/8 PASS, including normal ALLOW, absent/untrusted/expired/
wrong SAN/EKU DENY and owned fixture cleanup:
`artifacts/workstation/current-mtls-2026-10-08T19-43-07.126537+00-00/result.json`.

Actual encrypted-negative verifier added in
`scripts/capstone-encrypted-negatives-ops.py` and
`scripts/capstone-encrypted-negatives-probe.js`. Initial deployed9d2 baseline
14/14 PASS: `artifacts/workstation/encrypted-negatives-2026-10-08T19-30-44.498139+00-00/result.json`.
Normal private-Vault unwrap plus one-time replay, ciphertext/tag/wrapped-key/
manifest/key-version/recipient/release/Instance substitution, elapsed receipt,
and revoke-in-flight deny without plaintext. Provider credential rejection is
injected only into an ephemeral helper that reaches actual private Vault; this
does NOT establish global Vault outage coverage. Current d576-image rerun and
final ledger results are recorded separately below when completed.

Current d576 encrypted-negative rerun14/14 PASS/exit0, same bounded scope:
`artifacts/workstation/encrypted-negatives-2026-10-08T19-42-40.132365+00-00/result.json`.
Probe SHA256 `3255c426249774e0ea0a1a09ec1b8bf3c0964ad231b38f63e96da8362c3ef6d62`.
Fresh Security Gate PASS/exit0 (unit/secret/CRITICAL dependency audit):
`artifacts/security/capstone-consent-ui-security-gate-20261009.json`.
Executed pnpm11.7.0 matches pin; global manifest11.22 warning retained.

Final read-only PostgreSQL ledger5/5 PASS/exit0:1418 valid linked audit records,
61 key releases/32 consumed; no hash repairs, deletions or existing modifications:
`artifacts/workstation/encryption-ledger-2026-10-08T19-45-24.019680+00-00/result.json`.
Final secret scan PASS/no findings at2026-10-08T19:45:33.342Z.
Recommended future commit groups (not executed): hospital UI+five tests;
scoped crypto/mTLS/rollout verification helpers; reviewed docs/evidence pointers.
Keep unrelated existing user changes and generated runtime archives outside
these groups. Next execution gate: owned application rollback/re-promotion,
then reproducible cold-start and final independent human review.

No passwords, tokens, DEKs, identity private keys or plaintext are written to
these public evidence files. All evidence DRAFT / UNASSIGNED. No commit/push.
Remaining P0: controlled rollback/cold-start reproduction, full runtime outage
handling, independent human review and final demo rehearsal. No PIPA/ISMS-P/
hospital approval or whole distributed MVP/v3 completion claim.

## Current deployed save-snapshot correction — 2026-10-09 KST

Purpose: deploy and verify the audit persistence concurrency correction without
rewriting existing evidence or changing authorization contracts. Related
FR-037~FR-041; regression covers FR-001~FR-005 and FR-014~FR-036. Existing
Node/PostgreSQL cloud control, separate hospital Data Planes and private Vault
architecture retained. No public API contract, role permission or TLS relaxation.

New files: `scripts/capstone-cloud-app-rollout.py`,
`scripts/capstone-concurrent-audit-check.py`, `scripts/capstone-mtls-check.py`,
`test/capstone-output-drain.test.py`. Persistence fix and its three regression
tests were introduced in the previous goal turn. Updated current-image pinned
probe/diagnostic wrappers, this checkpoint, API contract, demo runbook, Azure
README and public key-identity evidence pointers. Automatic evidence is under
`artifacts/workstation`/`artifacts/security`; all DRAFT / UNASSIGNED.

Safe partial-upload cleanup handling was subsequently tightened in the mTLS
wrapper (exact owned stage/files only). Python syntax and secret scan PASS
afterward; its exceptional SSH/partial-upload cleanup branch has not been fault
injected. The recorded successful mTLS result proves normal cleanup before
that defensive wrapper-only edit, not exhaustive cleanup fault coverage.

Repository HEAD `089eecb5cd479a12aab28f4c92804e23dd101be0`; dirty working tree
(495 entries at inventory), not a clean-commit attestation. No commit/push/merge.
Security Gate PASS/exit0 at2026-10-08T19:19:56.502Z (unit/secret/dependency audit):
`artifacts/security/capstone-save-snapshot-security-gate-20261009.json`.
Executed local pnpm11.7.0 matches project pin and lockfile9.0; global manifest
11.22.0 mismatch warning remains visible. No signature/TLS bypass or lockfile
regeneration. This gate's npm audit threshold is CRITICAL, not a blanket claim
of zero dependency advisories. Python output-drain regression2/2 PASS/exit0.

Cloud image `highpass-platform-mvp:capstone-save-snapshot-20261009`, digest
`sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807`.
Fresh scan zero HIGH/CRITICAL and vulnerability gate PASS. Full604 tests PASS,
exit0,42.558seconds. Scoped cloud rollout seven checks PASS/exit0:
`artifacts/workstation/cloud-app-rollout-2026-10-08T19-03-15.237525+00-00/result.json`.
Existing859 audit hashes have identical before/after aggregate fingerprint;
PostgreSQL container unchanged. New stage:
`/home/highpassadmin/.highpass-app-2026-10-08T19-03-15.237525+00-00`.
A/B remain9d2a12f600d8, own PACS/secrets unchanged. Rollback not executed.

Bounded actual concurrent browser/write + read-only audit gate PASS/exit0,
31.520seconds,11 overlapping snapshots while audit count964→1053:
`artifacts/workstation/concurrent-audit-2026-10-08T19-14-00.799731+00-00/result.json`.
All sampled chains valid, zero forks/missing predecessors/duplicate hashes,
no record modifications. Actual Viewer, authentication negatives and revoke
PASS in `b-browser-2026-10-08T19-14-28.562572+00-00/result.json` under
`artifacts/workstation`. This bounded single-browser check is not HA/load proof
or proof of the exact cause of the historical intermittent failure.

Initial concurrent collector reached its owned deadline because Windows output
pipes were not drained while the child ran; result stays NOT VERIFIED:
`artifacts/workstation/concurrent-audit-2026-10-08T19-05-06.076161+00-00/result.json`.
It retained24 valid overlapping snapshots but did not prove complete orchestration
or profile cleanup. Collector now drains bounded stdout/stderr concurrently.
No raw stderr, credentials, audit payloads or keys are forwarded/stored.

New full elapsed policy gate12/12 PASS/exit0 against this cloud image:
`artifacts/workstation/b-browser-2026-10-08T19-21-52.013142+00-00/result.json`.
Actual token expiry, consent expiry, same-token/fresh-proof revocation, scope,
download and tampering all deny403/no image. Three owned consents inactive,
no unresolved fixture. Subsequent read-only ledger five checks PASS,1115 valid
audits,34 metadata releases/27 consumed, zero fork/missing predecessor/hash change:
`artifacts/workstation/encryption-ledger-2026-10-08T19-22-12.773009+00-00/result.json`.
Fresh
A PACS mTLS component eight checks PASS/exit0:
`artifacts/workstation/current-mtls-2026-10-08T19-15-38.287358+00-00/result.json`.
Normal ALLOW; missing certificate, wrong issuer/SAN/EKU, current-CA expired
fixture and expired bad-client DENY; exact test key cleanup PASS. Runtime
certificates/PACS data unchanged, CA private key not transferred. Earlier
collector role/UID permission failures remain NOT VERIFIED; they are not
certificate DENY proof. Whole distributed
MVP/v3 NOT ACHIEVED; new evidence DRAFT / UNASSIGNED. Remaining P0 includes
encrypted package/release/outage negatives, UI consent selection consistency,
rollback/cold start reproduction and independent human review.

## Previous completed gates and remaining P0 — 2026-10-09 KST

Actual encrypted browser live-policy gate:12/12 PASS, exit0:
`artifacts/workstation/b-browser-2026-10-08T18-55-42.380231+00-00/result.json`.
Normal encrypted images200; other Study/Series, VIEW_ONLY download, tampered
token, same-token/fresh-proof post-revoke, elapsed consent and actual token
expiry403/no image. All three owned fixtures authoritatively inactive
(two REVOKED, one EXPIRED), no unresolved fixture. Expiry is not revocation.

Actual built-in Viewer and authentication negative gate PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T18-56-48.138546+00-00/result.json`.
QIDO/WADO/image decode2x2, UI flow, revoke acknowledgment and cache clearing;
unauthenticated401, missing/replayed DPoP403. No token in URL/UI/storage/history.
This is a tiny synthetic built-in Viewer, NOT OHIF/clinical-quality evidence.
Intermittent alternative-ACTIVE-consent UI selection remains an unresolved risk.

Supporting ledger probe initially FAIL with AUDIT_CHAIN_LINK_INVALID:
`artifacts/workstation/encryption-ledger-2026-10-08T18-56-32.654094+00-00/result.json`.
No hash repair, deletion, service restart or runtime replacement was performed.
Two subsequent read-only snapshots passed all five checks with859 valid audits,
24 releases/17 consumed, zero forks/missing predecessors/duplicate hashes:
`artifacts/workstation/encryption-ledger-2026-10-08T18-57-13.842833+00-00/result.json`
and `artifacts/workstation/encryption-ledger-2026-10-08T18-57-28.001781+00-00/result.json`.
Do not relabel the initial FAIL or claim its exact runtime cause is proven.

Local deterministic tests separately reproduced a PostgreSQL save race: live
rows added/mutated during awaiting database writes could be incorrectly marked
persisted. `src/postgres-store.js` now commits a detached transaction snapshot
as its baseline for both full and append saves. Both failing reproductions pass
after the fix; audit ordering/integrity and full-save concurrency tests also
pass (seven targeted tests total). Full regression after the source correction
603/603 PASS/exit0 (40.353seconds), before adding the third full-save test;
the seven targeted tests were then rerun PASS. Secret scan PASS/no findings.
At this historical checkpoint the source fix was not deployed. It is now
deployed as recorded above; earlier evidence is retained. Further fresh
mTLS role/expiry negatives, package/release outage negatives, rollback/cold start
and independent review remain required. Whole distributed MVP/v3 NOT ACHIEVED.

## Current timeout correction deployment — 2026-10-09 KST

Fresh read-only VM runtime check: six PASS/exit0 (A/B Docker/WireGuard and
four healthy hospital containers), not an application E2E claim:
`artifacts/workstation/vm-status-2026-10-08T18-53-17.958012+00-00/result.json`.
Fresh private overlay boundary: six PASS/exit0, A/B private Vault TLS returns
401 with certificate validation0, authenticated peer handshakes and exact
B-to-A Orthanc8042 DROP counter3→6:
`artifacts/workstation/overlay-2026-10-08T18-53-51.301220+00-00/result.json`.
No blanket cloud/key-operation/MVP PASS is inferred from those scoped checks.

A/B image `highpass-platform-mvp:capstone-timeouts-20261009`, digest
`sha256:9d2a12f600d8ec7f114620a9f58ccdf18e69a6ca1ef513e8321168a561849b40`,
is deployed. Scoped rollout ten checks PASS/exit0:
`artifacts/workstation/hospital-app-rollout-2026-10-08T18-43-01.693768+00-00/result.json`.
Fresh container scan reports zero HIGH/CRITICAL. Cloud image/DB and A PACS were
not replaced. Current A/B stage is
`/home/server/.highpass-app-2026-10-08T18-43-01.693768+00-00`.

Safe diagnostics showed B live-control requests taking approximately5 seconds,
while its callback budget was5 seconds. B callback is now8 seconds; the A/B
aggregate Vault operation budget is25 seconds and encrypted image/browser
budgets35 seconds. The30-second receipt ceiling and all live authorization,
one-time consumption, TLS and DPoP checks remain unchanged. Evidence:
`artifacts/workstation/runtime-diagnostic-2026-10-08T18-35-33.945884+00-00/result.json`.

Independent clock sampling showed Windows about2.5 seconds ahead of cloud/A/B:
`artifacts/workstation/runtime-diagnostic-2026-10-08T18-40-27.105498+00-00/result.json`.
The verifier now waits conservatively using monotonic elapsed time from token
receipt plus its signed server-issued lifetime, not Windows wall-clock expiry.
Server clocks and token TTL are unchanged. The short synthetic consent fixture
uses60 seconds. Owned cleanup reads authoritative state and requires REVOKED
or EXPIRED; expiry is not represented as revocation or deletion. Audit persists.

Current full regression601/601 PASS/exit0 (40.612seconds), including final
verifier clock/cleanup edits; secret scan PASS/no findings. Safe fleet diagnostic
`artifacts/workstation/runtime-diagnostic-2026-10-08T18-51-02.959278+00-00/result.json`
confirmed pinned healthy containers and decrypted200 responses around12seconds
under the preserved live-policy delay. Its diagnostic PASS concerns collection
and runtime identity/health, not every request: one generic REQUEST503 remains
recorded and must not be relabeled policy denial.
Post-correction actual browser policy gate completed12 PASS as recorded above.
New evidence remains DRAFT / UNASSIGNED. Runtime
promotion alone does not supersede the failed historical gate below.

## Historical elapsed policy gate — 2026-10-09 KST

`artifacts/workstation/b-browser-2026-10-08T18-17-37.501073+00-00/result.json`:
overall FAIL/exit1, eight PASS, three FAIL, one NOT VERIFIED. Current runtime
images were not changed during this verifier step.

PASS: initial live-consent encrypted image200; other Study403; other Series403;
VIEW_ONLY download403; tampered token403; owned consent revoke200; same token
with a newly signed proof after revoke403; elapsed consent expiry with a still
unexpired token403. Denied requests returned no image. These are actual B/A/
cloud checks, not memory policy fixtures or replay standing in for revocation.

FAIL: pre-deadline expiring-consent image503, token-expiry fixture initial
image503, and actual elapsed token expiry with a still-valid consent503 instead
of expected403. No image was returned, but503 is not successful policy denial.
Owned synthetic consent cleanup is NOT VERIFIED; memory/profile cleanup is not
proof that all created server-side consents were revoked. Those consents have
bounded15-minute/15-second lifetimes, but expiry is not claimed as cleanup.

Initial command/request-timeout failures are retained in
`b-browser-2026-10-08T18-05-51.613009+00-00`,
`b-browser-2026-10-08T18-07-53.618713+00-00`, and
`b-browser-2026-10-08T18-09-56.576389+00-00` under `artifacts/workstation`.
The verifier now reports safe failed stages and preserves partial check results.
TLS/mTLS/authority checks were not weakened and server clocks/TTL were unchanged.

Post-run read-only ledger verification: five PASS, all645 audit records valid,
14 metadata-only releases/10 consumed with pinned key/recipient and correlated
audit, no record normalization:
`artifacts/workstation/encryption-ledger-2026-10-08T18-18-12.580382+00-00/result.json`.
A single intermediate read probe was NOT VERIFIED; the failure is retained and
later successful reads do not retroactively mark it PASS.

Next P0: diagnose request/deadline/anti-abuse interactions before promotion.
Current source has5-second hospital control callbacks,10-second B upstream
transport and10-second aggregate Vault adapter budget including both live
checks. Existing anti-abuse delay can reach5seconds; this exposes conflicting
budgets, but code inspection alone does not prove the cause of every503.
Trace safe phases/errors and align finite end-to-end budgets without changing
TLS, denial policy, replay/quarantine rules or the30-second receipt ceiling.
Then rerun the same actual gate and fresh distributed mTLS/network checks.
Full regression598/598 PASS/exit0,40.357seconds before the last verifier-only
diagnostic edits; affected orchestration tests3/3 PASS afterward. Secret scan
PASS/no findings. All new evidence DRAFT / UNASSIGNED; whole MVP/v3 not achieved.

## Latest deployed encrypted browser checkpoint — 2026-10-09 KST

Follow-up browser boundary gate also PASS (exit0):
`artifacts/workstation/b-browser-2026-10-08T17-59-50.107760+00-00/result.json`.
The same previously successful image path denied unauthenticated401, missing
DPoP proof403 and replayed proof403 requests, with no image MIME returned.
Timeout/connection errors are NOT VERIFIED, never accepted as policy denial.
Tokens/proofs stay ephemeral and are not written to evidence. This is three
specific deployed authentication tests, not the full encrypted negative gate.
Revoke label was visible in this rerun, but the earlier different-ACTIVE-consent
selection remains an intermittent unresolved issue; no UI fix is claimed.
Post-negative read-only ledger: all 527 audits valid, eight consumed releases,
five checks PASS/exit0:
`artifacts/workstation/encryption-ledger-2026-10-08T18-00-36.414065+00-00/result.json`.
Targeted audit/key-release/HTTP/crypto regression 15/15 PASS, secret scan PASS
with no findings, and tracked diff whitespace check exit0 (CRLF notices only).

This section supersedes the historical not-deployed statements below; those
earlier checkpoints are retained as execution history, not current status.

Actual cloud metadata migration and A/B/cloud promotion passed eleven checks:
`artifacts/workstation/encryption-rollout-2026-10-08T17-34-24.264772+00-00/result.json`.
A/B require encrypted selected image responses; the Control Plane has no Vault
identity or image/DEK storage. Existing PostgreSQL and A PACS containers were
preserved. B service credentials remain external protected files.

Actual strict-TLS browser flow passed after the final cloud-only audit fix:
`artifacts/workstation/b-browser-2026-10-08T17-51-31.508935+00-00/result.json`.
Synthetic patient consent, doctor DPoP-bound token, selected A image, real
private-endpoint Azure wrap/unwrap, B built-in Viewer decoding and revoke/cache
clear were observed. This is a tiny 2x2 synthetic fixture, not OHIF rendering,
clinical image performance, mobile handoff or full v3 completion. The dashboard
still displays a different ACTIVE consent after revoke; literal revoked status
is NOT VERIFIED and needs a UI selection fix. Browser elapsed token expiry and
deployed encrypted negative/security gates remain NOT VERIFIED.

Audit verification initially failed because timestamp/ID ordering did not
match stored hash links. All stored links and payload hashes were intact.
The reader now follows hash links; startup validates rather than rewrites logs.
The cloud-only promotion preserved all 347 preexisting record hashes exactly:
`artifacts/workstation/audit-order-rollout-2026-10-08T17-49-24.863234+00-00/result.json`.
Final read-only probe after the browser run: five PASS checks, all 435 audit
records valid without normalization, five one-time consumed release records,
and correlated wrap/precheck/postcheck/response audit:
`artifacts/workstation/encryption-ledger-2026-10-08T17-56-05.886607+00-00/result.json`.
The earlier failed probe is retained; no history was repaired or deleted.

Full Node regression: 595/595 PASS, exit0,39.920 seconds. A/B image remains
`sha256:cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9`;
final cloud image is
`sha256:5e728e53be1fc44685279ec8aec9c119ec0fe24a63c635771945df30883611da`.
Both corresponding fresh scan reports show 0 HIGH/0 CRITICAL with separate
vulnerability gate PASS. This is not a claim that every security gate passed.

Next: encrypted runtime denial/replay/expiry gates, renewed mTLS/network
boundaries, revoked-consent UI selection, reproducible runbook/rollback and
independent human review. New evidence remains DRAFT / UNASSIGNED; earlier
review does not approve these changes. Legal/certification/production approvals
remain DEFERRED; whole distributed MVP/v3 completion is not declared.

## Encrypted A/B transport build and recipient credential — 2026-10-09 KST

Implemented hospital-only AES-GCM/Vault transport, A live pre-wrap/post-wrap
approval and B live before/after unwrap approval with durable one-time release.
Mandatory mode has no plaintext fallback. Image bytes/DEK stay outside cloud
Control service. Local actual RSA/AES protocol tests cover scope/tamper/replay,
revocation during unwrap and expiry; these use a test provider and do NOT prove
actual Azure encrypted Viewer. Source/entrypoint and handler tests passed;
current full Node suite 591/591 PASS, exit0,45.557 seconds.

Built/scanned app image `highpass-platform-mvp:capstone-encryption-20261009`, ID
`sha256:cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9`:
0 HIGH/0 CRITICAL and separate vulnerability gate PASS. Seven relevant image
runtime source hashes match local modules/entrypoints. New A/B encryption
Compose overlays passed merged config validation but are not running yet.

Actually generated a distinct B service credential remotely and delivered only
cloud→B through pinned encrypted root SFTP. Root ownership, numeric GID65532,
mode640 and byte equality confirmed, three PASS/exit0:
`artifacts/workstation/b-key-release-credential-2026-10-08T17-27-50.900082+00-00/result.json`.
Initial group-name probe NOT VERIFIED is retained; correct numeric identity
recheck reused the existing new credential. No Windows secret file, key output,
Docker Env secret, cloud Vault identity or existing credential replacement.

Cloud/A/B running images and cloud DB still unchanged. Required next gate:
cloud migration + promotion, B required-decryption then A required-encryption,
actual Azure/consent/browser E2E, negative gates, independent review. All new
evidence DRAFT / UNASSIGNED. Detailed updated contract:
`docs/api/capstone-consent-bound-key-release-contract.md`.


## B recipient principal / internal key-release HTTP — 2026-10-09 KST

Implemented a separate B-only `gateway:package-key-release` service scope,
fixed recipient hospital from server configuration, and exact metadata-only
prepare/authorize endpoints. A and generic credentials cannot authorize B
unwrap; B cannot prepare an A package. Extra recipient input, queries, tampering
and replay deny in actual localhost HTTP tests. Generic 503 suppresses DB/audit
diagnostics. Ingress forwards service tokens only to exact service paths.

Added explicit opt-in Compose overlay and non-superuser additive migration
entrypoint; Control requires the migration at startup, with bounded dedicated
pool and no Vault identity on the cloud service. Existing running cloud/A/B
images, DB and credentials have NOT been changed in this step. TLS callback,
credential provisioning, migration-role execution and encrypted browser runtime
remain NOT VERIFIED. New records are still DRAFT / UNASSIGNED; previous human
review does not apply. Updated internal contract:
`docs/api/capstone-consent-bound-key-release-contract.md`.

New authentication, actual HTTP, ingress and Compose targeted tests: 10/10 PASS;
final policy/authentication targeted tests: 8/8 PASS. Secret scan PASS/no findings.
Full Node regression including the startup guard changes: 586/586 PASS, exit0,
40.070 seconds. A subsequent strict JSON string-type hardening (reject numeric
package IDs and array-valued hashes) was followed by the complete affected set:
25/25 PASS, exit0, and secret scan PASS/no findings. The full suite was not
rerun after that last type-only hardening. Live deployed E2E is still NOT VERIFIED
for these new changes.
Initial HTTP fixture assertion expected missing authentication to be403, while
the service correctly returned401; corrected the assertion, not authentication.


## Consent-bound key release component — 2026-10-09 KST

Implemented shared live receipt revalidation, fixed package/recipient/key-version
binding, before/after unwrap policy checks, one-time durable ledger consumption
and safe allow/deny audit. Contract and explicit remaining deployment gate:
`docs/api/capstone-consent-bound-key-release-contract.md`.

Actual isolated PostgreSQL gate: four PASS, exit0,
`artifacts/workstation/key-release-db-1791479004651/result.json`.
Includes 32 concurrent claims with exactly one winner and DB-clock expiry deny.
Targeted policy/receipt tests: 15/15 PASS after denial-audit changes; secret scan
PASS with no findings. The additive migration has NOT been applied to cloud DB;
new key-release HTTP principals and A/B crypto integration remain to implement.
Existing healthy services were not restarted. All new evidence DRAFT / UNASSIGNED.
Current-code full Node suite after denial-audit changes: 583/583 PASS, exit0,
39.724 seconds (`node --test --test-concurrency=4`). Live HTTPS/Staging scripts
explicitly do not run inside this unit/integration suite; no new deployed E2E
claim is inferred from its pass count.
The historical installation todo list below is not the latest runtime state:
current A/B Docker/overlay and all four expected hospital containers passed six
read-only checks in
`artifacts/workstation/vm-status-2026-10-08T16-57-11.953236+00-00/result.json`.


## Actual A/B Key Vault + AES-GCM DICOM crypto gate — 2026-10-09 KST

Authoritative gate13 PASS/exit0:
`artifacts/workstation/key-crypto-2026-10-08T16-44-47.541791+00-00/result.json`.
Scope is an explicitly authorized operator-controlled synthetic PACS/crypto
fixture, NOT patient live-consent key release or encrypted browser rendering.

1. A retrieved one678-byte actual synthetic DICOM from its actual PACS through
   strict client certificate + SNI mTLS; single-instance WADO multipart framing
   validated and removed. DICM at actual file offset128, no arbitrary marker scan.
2. A encrypted the original synthetic instance and manifest using the existing
   AES256-GCM package implementation and a fresh32-byte DEK, and wrapped that DEK
   through the real private Key Vault version using RSA-OAEP-256.
3. A's actual unwrap attempt was denied by Key Vault; B's wrap attempt also
   denied. These are effective403-derived permission negatives, not role JSON
   inference, connection failure or certificate-handshake failure.
4. Only ciphertext/encrypted manifest/wrapped DEK and integrity metadata crossed
   pinned encrypted A/B SSH via transient orchestrator memory. No raw DEK or
   plaintext DICOM was written to Windows/cloud/Control API or B disk. Original
   synthetic DICOM remains in A PACS; encrypted temporary files were deleted.
5. B unwrapped in its own Data Plane process, decrypted and checked all678 bytes
   against source hash and DICM, cleared transient DEK/plaintext buffers, and
   denied a modified GCM tag. No decrypted clinical image was printed or persisted.
6. Both owned ciphertext/source stages cleaned (explicit owned files/directories,
   no broad recursive delete); unrelated containers/volumes/identities unchanged.
7. Executed module digests attested on A/B: credential, multipart extractor,
   package crypto, probe and public registry. New code ran in readonly bounded
   one-off nonroot containers, not through a claimed upgrade of running Gateways.

Source code: `src/dicomweb-single-instance.js`, `src/mobile-package-crypto.js`;
automation: `scripts/capstone-key-crypto-probe.js`, `scripts/capstone-key-crypto-ops.py`.
The probe's package-only authorization callback is deliberately an OPERATOR
fixture; it MUST NOT be reused as production/live-consent authorization.
Temporary operator fixture ID carries no claim of patient consent approval.
Private endpoint mapping is exact container --add-host for the ordinary hostname,
with normal strict TLS. General guest/container private DNS remains a separate
integration item; no public endpoint/bypass/insecure fallback enabled.

The first run at16:35:54 failed with actual HTTP400 because of non-multipart
Accept. Original FAIL retained. Added strict one-part WADO parser; extra parts,
bad boundaries, header/length injection and arbitrary DICM scanning rejected.
Subsequent operator gates passed. Package hardening authenticates outer expiry,
createdAt, recipient, key refs and byte count against encrypted manifest/chunks;
invalid or extended expiry fails closed. Decryption failure clears earlier
chunks/partial AES buffers. Manifest schema remains unchanged; byte size is bound
to the authenticated ciphertext sizes rather than adding an unapproved field.
An intermediate implementation/test failure was corrected, not concealed.

Current-source full Node regression577/577 PASS,0fail,40.194seconds,exit0.
Focused crypto/parser tests16 PASS. Last secret scan PASS/no findings at16:43:35UTC.
Public registry was subsequently annotated with this scoped PASS/evidence only;
recorded execution-registry hash is the pre-annotation snapshot. Key version,
tenant/client/role scopes and executable module hashes were not changed.
No commit/push/merge. New current crypto modules are NOT integrated into the
running A Gateway/B portal; prior ordinary browser Viewer PASS is not an
encrypted-Viewer claim. Latest evidence DRAFT / UNASSIGNED.

Next: bind key operations to persisted live consent/doctor/hospital/token/scope,
signed package/recipient/manifest integrity and audit before/after unwrap;
enforce expiry/revocation before plaintext/Viewer release; rebuild/scan/deploy
the actual A/B adapters, prove encrypted browser E2E and deterministic cleanup.
Whole MVP/v3 NOT ACHIEVED. Related FR014–031,032–036,037–041.

## Actual Key Vault identities / versioned key — 2026-10-09 KST

Distinct single-tenant synthetic hospital A/B Entra apps and service principals
created, without Graph application/delegated permissions. Each31-day RSA
authentication private key generated only in its own VM at root-protected
`/opt/highpass/capstone-key-identity` (root:65532,dir750/files640). Only public
certificate registered with --append and saved in local public evidence.
No shared client-secret, private-key transfer or user CLI cache transfer.
Actual guest certificate assertion exchanges with Entra returned HTTP200 for both.

Identity gate4 PASS/exit0:
`artifacts/workstation/key-identities-2026-10-08T16-23-14.511046+00-00/result.json`.
A custom role:public key read + wrap. B custom role:public key read + unwrap.
Assignments limited to capstone-b-kek-20261009 key scope, no wildcard, key
management/secrets/delete/purge/access-management rights. No Key Vault identity
or permission given to metadata Control API/cloud VM. OAuth success proves
certificate authentication, NOT actual crypto-operation permissions.
Public IDs and pinned version: `infra/azure/capstone-key-identities.json`.

Private-network key bootstrap2 PASS/exit0:
`artifacts/azure/key-bootstrap-2026-10-08T16-26-25.003977+00-00/result.json`.
Real non-HSM software RSA2048 key created, only wrapKey/unwrapKey, expiry
2026-11-08T16:30:00UTC, version9c03b2560a3240418d33d92a165b6806.
Vault publicNetworkAccess remains Disabled; ordinary hostname resolved privately
to10.89.1.4 in the bootstrap, with strict normal public-CA TLS. Temporary operator
role granted only key read/create, not crypto/secrets/deletion. Exact assignment
removed and absence rechecked in finally cleanup. Operator token was transient
stdin over pinned SSH into a one-off bootstrap process, never Control API,
source/argv/logs/token file. ARM key-list failed ForbiddenByConnection; bypass
and public access were NOT enabled. Two initial UnicodeDecodeError bootstrap
results retained; no role was created during those failures. Strict UTF8/CP949
decoding corrected the Windows CLI encoding without weakening TLS/authentication.

New `src/azure-certificate-credential.js`: hospital-only Vault resource, matching
RSA key/certificate,60-second unique assertions, strict fixed Entra HTTPS,
10-second timeout, bounded response, safe typed errors, cleared transmission
buffers. Not yet integrated into the running Gateway/Viewer. Credential tests3
plus Key Vault adapter tests7:10 PASS. Local RSA fixtures are NOT Azure crypto
evidence. Actual Azure wrap/unwrap and opposite-role denial, AES-GCM DICOM
packages, live consent-bound key release and encrypted Viewer remain NOT VERIFIED.
Next gates are those actual operations/integration, not more OAuth-only tests.
Related FR014–031/037–041 and encryption/minimum-privilege NFR principles.

Final current-source Node regression573/573 PASS,0fail,39.286seconds,exit0.
Secret scan PASS/no findings at2026-10-08T16:30:50UTC; new credential module
syntax check exit0. No commit/push/merge performed. New runtime image containing
the credential module has not been built/scanned/deployed; existing B browser
and metadata API image are retained, not represented as running this new code.

## Actual B HTTPS portal / Azure Mock IdP / browser — 2026-10-09 KST

Latest owned projects: hp-capstone-b-portal on B, existing hp-capstone-control
on Azure upgraded without replacing PostgreSQL volume. A Gateway/PACS untouched.
B portal: https://192.168.111.149:9443/hipass/. Exact B/cloud image:
`highpass-platform-mvp:capstone-b-portal-20261009`,
`sha256:69cd63bc4966c83e46a609e90e44385a63c68b7941b713690135b445833fb693`.
Fresh Trivy scan and vulnerability gate: zero HIGH/CRITICAL, exit0.
Node regression rerun:570/570 PASS,39.197 seconds,exit0.
Secret scan:PASS/no findings at2026-10-08T16:15:10UTC.

Deployment7 PASS:
`artifacts/workstation/b-portal-2026-10-08T16-05-39.005202+00-00/result.json`.
Current actual TLS/login/audit6 PASS:
`artifacts/workstation/b-login-2026-10-08T16-13-29.561059+00-00/result.json`.
Verified strict trusted TLS, cloud API health, unsigned image request401,
internal service route404, missing-origin login403, wrong presenter401,
signed patient JWT200, spoofed role headers401, current PostgreSQL hash chain
273 records intact. Counts are point-in-time, not future guarantees.

Browser authoritative result PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T16-12-58.118046+00-00/result.json`.
Actual headless Chrome154, existing UI, no certificate-error override:
presenter login → patient consent → doctor's bound short token → QIDO Study /
Series / Instance → A PACS rendered image via Gateway → B built-in Viewer.
Decoded2x2 synthetic image from authenticated Gateway blob, not static preview,
not a diagnostic-quality clinical image and not an OHIF rendering claim.
All observed DICOMweb requests use DPoP authorization/proof; none use Bearer
fallback. No observed DICOM token in URL/history/DOM/local/session storage.
This is scoped to observed requests/storage, not a universal browser extension
or host compromise guarantee. Production IdP/MFA is NOT implemented.

Terminal UI action received actual HTTP200/REVOKED response and cleared image
cache; no static fallback remained visible. Dashboard may replace the patient's
status text with another existing active consent, so the literal REVOKED text
was false; that cross-consent UX ambiguity remains. The earlier text-only
negative result at16:11:48 is retained, not overwritten or presented as PASS.
Same-token-after-revoke server DENY was separately proved by the earlier
distributed protocol gate; this browser case alone does not prove it. Actual
elapsed-token-expiry browser denial remains NOT VERIFIED.

The explicitly enabled capstone Mock IdP requires a separate root-protected
cloud presenter key and trusted ingress, bounds failed attempts, signs fixed
synthetic PATIENT/DOCTOR/SECURITY_ADMIN profiles for5 minutes and persists audit
before releasing JWTs. It is disabled by default. Actor tokens stay in browser
memory; the presenter is cleared after login. This authorized presenter receives
three demo roles, not production individual identity separation. B has only its
own31-day TLS key, certificate and public CA. No signer/presenter/DB/raw DEK/CA
private key was transferred to B. Prior cloud image retained as
`highpass-platform-mvp:capstone-before-mock-idp-20261009`; rollback execution is
NOT VERIFIED. Existing unrelated containers and all image/DB volumes preserved.

B development server certificate expires2026-11-08T16:06:42UTC.
SHA256 fingerprint94:3B:64:83:3B:7B:D4:AE:9A:31:90:98:97:DD:59:48:B1:86:9C:3B:1E:6E:EC:A5:5C:CB:01:89:6B:76:91:3F.

Next priority: real Key Vault least-privilege hospital identities and real
wrap/unwrap + AES-GCM synthetic package flow; deterministic actual expiry and
same-token browser DENY; clean repeatable distributed verification/cleanup;
operator-ready demonstration, current-source evidence and independent review.
Full MVP/v3 NOT ACHIEVED; legal/certification/real-hospital approval DEFERRED.
Related FR001–005,014–031,032–036,037–041. All new evidence DRAFT / UNASSIGNED.

## Actual A Gateway + distributed DICOM protocol — 2026-10-09 KST

Deployed `infra/workstation/hospital-a-gateway.compose.yml` as a separate owned
project hp-capstone-a-gateway. It attaches to the existing A-only PACS internal
network without recreating Orthanc, its mTLS proxy or data volume. Only
10.90.88.2:9443 is published; the raw PACS remains unpublished. Actual Gateway
image is the reviewed0c0379a3... image used by Azure. No new cloud resource.

Actual deployment gate6 PASS/exit0:
`artifacts/workstation/a-gateway-2026-10-08T15-26-36.323026+00-00/result.json`.
Gateway-container strict private cloud TLS200; scoped service credential reached
live policy (invalid input400, not an access ALLOW); strict client-cert/SNI PACS
mTLS QIDO found3 actual synthetic Studies; B private Gateway TLS returned401 for
no token; exact reviewed image/archive matched; B temporary public-CA stage removed.
Listener health alone is NOT the patient-policy/PACS gate.

Gateway TLS key was generated on A only. Public CSR was signed with the existing
development CA; private CA never transferred. Server certificate31 days, expires
2026-11-08 15:27:19UTC, serverAuth/CA:false, IP SAN10.90.88.2 plus distinct
development DNS name. SHA256 fingerprint:
33:7C:42:F5:F8:94:66:A4:DB:5F:30:54:0A:C2:39:83:B0:3C:AC:B9:3A:34:2A:61:D0:0F:2D:C3:D4:7B:B0:46.
Only the dedicated gateway:data-plane-authorize credential was shared from cloud
to root-protected A files using pinned encrypted privileged SFTP/transient memory;
no DB password, TEST IdP signer, DICOM token signer or raw DEK was sent to A.
The existing development mTLS client cert/key is mounted read-only, separate from
the Gateway's server key and Orthanc's server key. Existing CA/runtime files remain.

Actual B/A/Azure protocol gate15 PASS/exit0:
`artifacts/workstation/protocol-2026-10-08T15-40-07.278941+00-00/result.json`.
This is an actual distributed transport/policy test, NOT a browser Viewer test:

1. A synthetic PATIENT's signed TEST IdP JWT created a fresh15-minute consent
   via HTTPS; no seeded consent was modified. HOSP-A→HOSP-B/TREATMENT/VIEW_ONLY,
   exactly one Study and Series.
2. Signed DOCTOR JWT plus actual ES256 proof issued a bound token via policy API;
   remaining lifetime299 seconds, finite ISO issuedAt/expiresAt contract checked.
3. B received exactly the granted Study/Series/Instance through the actual A Gateway,
   which consulted Azure and used actual PACS mTLS. WADO retrieved905-byte synthetic
   DICOM containing DICM in memory; no medical image written to cloud or test files.
4. Replayed DPoP proof, other Series and absent proof each denied403.
5. Patient revoked the new consent through HTTPS; the same token then denied403.
6. Actual PostgreSQL audit hash chain checked44 records, no mismatch;19 records
   matched this exact new consent, including response-prepared and revoke actions.
   Response-prepared is NOT a claim of actual browser display/delivery.
7. Protected cloud/B temporary token + proof-key fixtures were removed; no values
   entered argv, URL, console, local evidence or Git. The synthetic TEST IdP signing
   secret stayed on cloud. The ephemeral protocol proof key is a test fixture,
   NOT a claimed non-exportable browser key or real hospital identity.

Strengthened terminal audit verification: after the revoked access attempt, run
the read-only audit stage again so its final denial is included in the hash chain.
Latest authoritative distributed protocol run17 PASS/exit0:
`artifacts/workstation/protocol-2026-10-08T15-44-25.821388+00-00/result.json`.
Finite bound-token lifetime299s; real WADO905 bytes; final chain66 records and
20 records matched the exact new consent, including its last access denial.
All temporary cloud/B token/proof-key fixtures removed. Earlier15-pass evidence
remains historical and is not the final all-events audit proof.

Initial protocol invocation failed because Docker stdin was not attached; its
NOT VERIFIED evidence is preserved (15:35 run), with protected-fixture cleanup PASS.
Added -i and reran the now-terminal job as a fresh test, not an observation retry.
The first successful15:37 run had a null expiry metric due to incorrectly assuming
JWT exp for the project's ISO expiresAt contract. That lifetime metric is invalid
and not reused. Added finite ISO/lifetime checks and reran; the15:40 run above is
the authoritative protocol/lifetime evidence. No expiry-policy code was relaxed.
Real elapsed-token-expiration denial is still NOT VERIFIED in this distributed
profile;299s lifetime evidence does not replace that negative test.

Full Node regression before the final verifier correction:563 PASS/39.2135297s;
focused3 tests after correction PASS, syntax/secret scan PASS. Final full regression
after terminal audit-stage change:563/563 PASS, exit0,39.1545488s. Secret scan
PASS/no findings at15:45:00UTC; diff check passed. Repository base SHA
089eecb5cd479a12aab28f4c92804e23dd101be0 has uncommitted work; runtime identity
is the exact reviewed image0c0379a3..., NOT a claim that HEAD contains these changes.
Existing Highpass/mediq/SOC projects remained running. No commit/push/merge or new human approval.
Related FR-001~005/014~031/037~041. All evidence DRAFT / UNASSIGNED.

Next: authenticated B same-origin portal/Viewer and non-exportable browser DPoP,
real Key Vault identities/envelope encryption, remaining expiration/tampering/
hospital/purpose/mTLS/packet negative matrix on the final topology, repeatability/
rollback and independent review. Whole MVP/v3 remains NOT ACHIEVED.

## Actual Azure deployment checkpoint — 2026-10-09 KST / 15:16 UTC October8

Real cloud deployment and A/B client verification, not a substituted local test:

- Cloud Control API + persistent PostgreSQL + overlay-only metadata TLS ingress are
  running. Actual port bindings: ingress10.90.88.1:443 only; Control API/DB empty.
- Exact final app image: `sha256:0c0379a376fcba9db0c8bdb65876f3854f000afddb1f620bde21a5534b25b399`.
- Exact hardened PostgreSQL16 image:
  `sha256:8d0e686f1620c154c0c35ba8c7173a90f8f1a55ff8062f75677be1f3a4196568`.
- Both final images scanned0 HIGH/CRITICAL and container vulnerability gate PASS.
  Existing postgres:16-alpine failed:1 CRITICAL/30 HIGH. It was NOT deployed.
  Signed Alpine package upgrades fixed SSL/uuid libraries; vulnerable Go gosu was
  removed and the official entrypoint's user transition uses packaged su-exec.
  PostgreSQL remains major16 and keeps the official initialization/data contract.
- Real hardened-PG local TLS gate:8 PASS/exit0,
  `artifacts/azure/hp-control-tls-1791471950154/result.json`.
- Actual Azure initial deployment evidence:
  `artifacts/azure/cloud-control-2026-10-08T15-07-37.902351+00-00/result.json`.
  Cloud strict TLS health200 and image/Viewer403 confirmed. Archive SHA and loaded
  image IDs matched; no registry downloads during deployment.
- Actual A and B VM client gate:12 PASS/exit0,
  `artifacts/workstation/cloud-client-2026-10-08T15-10-38.113813+00-00/result.json`.
  Each confirms private destination10.90.88.1, TLS verification0, API200,
  DICOMweb/Viewer403, required SHARED_POSTGRES DPoP policy, actual Docker Engine,
  cleanup of only its temporary public CA file/stage. No password in files/logs.

Gateway header review found the metadata ingress discarded the dedicated
`x-hipass-service-token`; fixed forwarding ONLY for the two exact Data Plane
service endpoints, never a generic API credential. Added focused forwarded-header
test. Rebuilt/scanned the final image and actually upgraded Azure, preserving the
same database volume, external secrets and certificate/key. Actual service TLS
gate: invalid service401; valid principal with invalid authorization input400;
invalid report receipt403. No access-token/policy bypass or image retrieval was
claimed. Evidence:6 PASS/exit0,
`artifacts/azure/cloud-control-upgrade-2026-10-08T15-14-51.351007+00-00/result.json`.
Prior image preserved as `highpass-platform-mvp:capstone-before-service-header-20261009`;
rollback execution is NOT VERIFIED. New deployment refuses existing state, while
the one-time upgrade refuses any unexpected baseline; neither deletes volumes.
After the actual upgrade, both VM clients were rechecked:12 PASS/exit0,
`artifacts/workstation/cloud-client-2026-10-08T15-18-34.246663+00-00/result.json`.
Latest secret scan PASS/no findings at15:19:30UTC; all temporary local test
projects were absent, while existing Highpass/mediq/SOC stacks remained running.

Development TLS server key generated ONLY on cloud, protected root:65532/640;
CA private key never transferred. Subject highpass-capstone-cloud-development-only;
IP SAN10.90.88.1, DNS highpass-capstone-cloud.invalid, serverAuth only, CA:false.
31-day certificate expires2026-11-08 15:09:35UTC; key/certificate public keys match.
SHA256 fingerprint F0:A7:E9:6D:5C:21:0C:CF:38:60:7C:0F:5D:6D:DE:3B:15:2E:7E:21:E2:AF:F7:FB:68:44:90:BC:88:E8:1C:B5.
Only public CSR/certificate/CA crossed signing/orchestration. Credentials were
generated on cloud and mounted as external files, not values in Compose/Docker env.

Docker DNAT requires narrow peer forwarding to the published overlay-only socket;
added source/conntrack-original-destination10.90.88.1:443/translated8443 rules in
the existing owned chain. Updated persistent firewall script with a protected
prior backup; no global flush, Docker/UFW reset or default-route change.
Reboot persistence is configured, not actually reboot-tested.

Final full Node regression560/560 PASS, exit0,39.7158427s. Secret scan PASS/no
findings at15:16:03UTC. No new Azure paid resource, production claim, commit/push,
or human-review approval. Relevant FR-014~031/037~041.

Next real gates: A authorized Data Plane Gateway deployment (including live
PACS mTLS), B same-origin Viewer/authentication/DPoP flow, real Key Vault least-
privilege identities and envelope encryption, complete distributed normal/negative
E2E and audit chain evidence, then independent review. Actual Viewer E2E and
Key Vault crypto remain NOT VERIFIED; whole MVP/v3 is NOT ACHIEVED. All new
evidence DRAFT / UNASSIGNED. PIPA/ISMS-P/hospital approval remain DEFERRED.

## Metadata-only overlay TLS ingress implementation checkpoint

Latest final regression:557/557 PASS, exit0,38.8995925s. Four ingress tests PASS.
Fresh runtime image built and scanned:
`sha256:78c4e538e04d6044cf945a07757e2a0f3d28c502447af8a11273db585bf82c59`.
Trivy reported0 CRITICAL/0 HIGH; `container-vulnerability-gate.js` exited0/PASS
against this exact image. Scan: `artifacts/security/container-scan/capstone-ingress-20261008.json`.
Secret scan PASS/no findings at14:55:05UTC. No new approval is inferred.

Real isolated TLS/PG Docker gate `node scripts/verify-capstone-control-tls.js`
exited0 with8 PASS: CA/hostname-verified readiness200, persistent strict DPoP,
three metadata boundary403 checks, expected untrusted CA and hostname verification
errors, owned test cleanup. Evidence:
`artifacts/azure/hp-control-tls-1791471284650/result.json`.
The first attempt remains NOT VERIFIED with cleanup FAIL in its original evidence.
An internal-only ingress network did not support the required host-facing path;
the ingress now additionally joins a dedicated edge_transport bridge. Only ingress
joins that bridge; DB/API remain internal and unpublished. The original test
resources were subsequently confirmed absent; no unrelated project was removed.
Cleanup deadline is bounded90s. The retry passed all eight checks.

Fresh non-TLS private profile real PG gate also exited0/5 PASS:
`artifacts/azure/hp-control-test-1791471035721/result.json`.
Cloud read-only strict SSH reconfirmed the overlay active and no cloud containers:
actual Azure Control API/Gateway/Viewer deployment remains NOT VERIFIED.
The TLS test uses a one-day local-only disposable certificate, not the planned
role-separated Azure/A/B development certificates. Its private key and temporary
secrets were removed after test; public certificate/evidence remain ignored artifacts.

Added a separate cloud ingress, not the legacy all-purpose Viewer proxy:
`src/capstone-control-ingress.js`, `scripts/start-capstone-control-ingress.js`,
`infra/azure/capstone-control-ingress.compose.yml`. Its only host publication is
10.90.88.1:443; DB and bare API stay unpublished. TLS minimum1.2, external secret
files, authenticated ingress envelopes, finite request/upstream deadlines and
512KiB request / 2MiB JSON response limits. It denies Viewer/DICOMweb/PACS import,
PACS archive/research/ambiguous paths, forwards only selected headers and never
logs request URLs, authentication values, raw errors or certificate paths.
The private upstream is fixed to control:3000 on the internal Compose network.

The four dedicated tests cover route denial, fixed upstream configuration,
actual HTTP denied-route handling and actual Compose overlay-only publication.
The separate real TLS gate proves successful LOCAL upstream forwarding. None of
these establish actual Azure TLS deployment; that remains NOT VERIFIED until
role-separated certificates and actual deployment.

Before this ingress addition, full Node regression:553/553 PASS, exit0,
38.5828839s. Reviewed build tag before the addition:
`highpass-platform-mvp:capstone-20261008-dataplane`, Docker image ID
`sha256:09850a8b6c7f3af69c5179db7187c5bef9f0393fe2cb9c5b475b711f5a7c7b14`.
The new ingress source requires a fresh image build/container gate before deployment;
do not reuse this pre-ingress image ID as evidence for the new source.

## Real local cloud-profile readiness checkpoint — 14:38 UTC

Prepared `infra/azure/capstone-control.compose.yml`: private PostgreSQL, one-time
role bootstrap, metadata-only Control API, no published ports and no Data Plane
connection. All networks are internal. Cloud PostgreSQL TLS verify-full remains
a pre-commercialization backlog item; this profile uses the isolated Docker DB
network, NOT a claimed encrypted DB transport.

`scripts/bootstrap-capstone-postgres.js` separates the bootstrap owner from
`hipass_app` (no superuser/createdb/createrole/replication), safely binds password
input through PostgreSQL format/quote logic, refuses an existing privileged app
role rather than silently modifying it, and verifies actual app login. No passwords,
SQL statements or raw errors are printed. Credentials are external read-only
files, not Docker environment values or source. `start-capstone-control.js`
requires distinct role secrets, production runtime, PostgreSQL, strict DPoP,
metadata-only guard and TEST authentication. TEST is a synthetic technical IdP,
not a real school/hospital IdP or production-readiness claim.

Actual isolated Docker gate `node scripts/verify-capstone-control.js` exited0:
API with real PostgreSQL health200; cloud image route403; required DPoP with
SHARED_POSTGRES replay backend; actual app role has no elevated role properties;
test-owned Compose services/volumes cleaned up and temporary secret files removed.
Evidence: `artifacts/azure/hp-control-test-1791470140373/result.json`.
This proves the local profile, NOT an Azure-deployed API or external TLS call.
The cloud host still only has the verified overlay/foundation until deployment.

Two new Compose/secret/bootstrap policy tests passed. Syntax and secret scan passed.
Application image `highpass-platform-mvp:capstone-20261008-dataplane` was built
successfully with cached frozen-lockfile dependency installation, without disabling
Corepack signatures. Latest image digest/full regression are recorded in the
subsequent checkpoint once finished. No commit/push/merge.

Remaining for the next real deployment: private TLS ingress on cloud overlay only,
role-separated development TLS certificates (no CA private key transfer), root-owned
permanent external secrets, exact image/hash transfer and latest container gate,
cloud profile deployment/readiness, then A Gateway deployment/private metadata API
calls and complete real Key Vault/B Viewer flow. FR-014~031/037~041, DRAFT / UNASSIGNED.

## Actual private overlay checkpoint — 14:27 UTC

The approved A/B/cloud machines now have a live role-separated WireGuard overlay.
Existing cloud VM is reused; no managed VPN Gateway/new paid resource was created.
The Azure VM NIC already had IP forwarding enabled (read-only inspection); no
Azure NIC/NSG/default-route change was needed. Linux forwarding uses a dedicated
owned chain, narrow private-endpoint443 masquerade and per-peer /32 routes.

| Actual machine | Overlay IP | Verification |
|---|---|---|
| Azure cloud | 10.90.88.1 | Two distinct authenticated peer handshakes |
| A Workstation VM | 10.90.88.2 | Cloud ping and strict private Key Vault TLS succeeded |
| B Workstation VM | 10.90.88.3 | Same, plus raw Orthanc path blocked by actual DROP packets |

A/B Key Vault check: ordinary TLS hostname with explicit private resolution
(`curl --resolve`), HTTP401, remote IP10.89.1.4, TLS verification result0.
This establishes private route + strict TLS + unauthenticated denial ONLY;
ordinary guest/container DNS, real key operations and role authorization are
still NOT VERIFIED. Public access remains disabled; no TLS/hostname bypass.

B raw PACS probe targeted10.90.88.2:8042. Socket timed out AND the cloud rule
matching B source10.90.88.3/A destination10.90.88.2/TCP8042 DROP counter increased
from0 to3. Timeout without this exact firewall proof is not accepted as DENY.
Only B-to-A TCP9443 is allowed for the future authorized Gateway; it is not a
Gateway-readiness result because the actual Gateway is not deployed yet.
All other cross-peer forwarded traffic is dropped. Cloud overlay input permits
only peer443 and diagnostic ICMP; DB/SSH/raw PACS forwarding is not opened.

Configure evidence: `artifacts/workstation/overlay-2026-10-08T14-21-36.089143+00-00/result.json`.
Latest six-check PASS: `artifacts/workstation/overlay-2026-10-08T14-27-39.433909+00-00/result.json`.
Earlier counter-parser run at14:24 remains NOT VERIFIED; iptables numeric protocol6
instead of literal tcp was diagnosed from actual output and fixed without weakening
the tuple match. One Python counter test and two static overlay tests passed.
Full Node regression551/551 PASS, exit0,38.709 seconds; after the parser-only change,
Python test, actual repeated overlay gate and secret scan were run separately.

Private peer keys were generated root-only on their own machines (600, directory700)
and never copied to Windows/other hosts/evidence/argv. Each local VM public SSH
key was independently pinned via VMware, cloud SSH uses the existing known-host
record and dedicated key. Systemd autostart enabled; reboot recovery itself is NOT
VERIFIED. Setup preserves existing configurations; stop/rollback only touches its
own interface/rules and restores prior Linux forwarding value. No global firewall
flush, credential logging, default-route tunnel or unrelated VM modification.

The cloud host relays overlay network packets; this is NOT the Control API
fetching/holding image bytes. Future B-to-A DICOM traffic still requires inner
end-to-end HTTPS and patient authorization. No cloud original-image persistence
or delivered Viewer flow is claimed. Next: private API/PostgreSQL + persistent
DPoP deployment, role TLS/configuration and A Gateway deployment, real Key Vault
crypto identities, B authenticated Viewer and distributed E2E. FR-026~031/037~041;
all new evidence DRAFT / UNASSIGNED.

## Standalone Gateway code checkpoint — 14:13 UTC

Implemented standalone `src/data-plane-gateway.js` / `scripts/data-plane-gateway.js`,
source-only private PACS retrieval with strict HTTPS/mTLS, constrained/filtered
QIDO, selected Instance/frame routes, safe metadata tags and finite byte/time bounds.
Tokens/proofs never go to PACS. Response preparation is acknowledged through a
Control-Plane-signed30-second receipt and live reauthorization before byte release.
New audit actions distinguish preparation/upstream failure from actual Viewer
delivery; READY does not claim delivery. Forged/expired report denials are audited.
Cloud-only code configuration blocks legacy image/import/export operations;
metadata and policy remain available.

Focused tests:13/13 PASS, including actual loopback TLS trust/hostname failure,
rejected insecure option, byte limit and timeout, and actual isolated HTTP report /
cloud-boundary guards. Forwarding tests use explicit PACS/policy doubles: no claim
of a real deployed Gateway/PACS exchange. TLS response-limit testing exposed a
connection-destruction error; rejecting before closing the response/request fixed
it, and the same assertion was rerun successfully.

Full regression:549/549 PASS, exit0,38.423 seconds. Subsequent small hardening
(force built-in hostname validation, normalize origins, audit report denials) was
covered by the focused13-test rerun; a new full run after those edits is pending.
Secret scan PASS/no findings at14:13:33 UTC. Existing VM/cloud images were NOT
replaced this turn. No commit/push/merge. Related FR-014~031/037~041.

Next deployment prerequisites are still real: A/B/cloud private overlay routes,
private Control API/PostgreSQL with metadata-only guard and persistent DPoP storage,
role-separated Gateway server TLS files, A Gateway image deployment and actual
PACS/authorization tests. Then real Key Vault cryptography, B authenticated Viewer
and complete distributed normal/negative flow. These remain NOT VERIFIED, not
substituted by this local code gate. See the additive legacy API contract notes.

## Metadata-only Data Plane authorization checkpoint — 14:00 UTC

Added `src/data-plane-authorization.js`, a dedicated service credential scope in
`src/auth.js`, and the guarded `/gateway/data-plane/authorize` server operation.
Seven focused tests passed, including an actual isolated HTTP server: no principal
401, generic internal service403, platform administrator403, dedicated Gateway200
with no-store and no raw access-token echo. Service tests cover live consent and
scope, hospital suspension, expiry/revocation/tampering, download permission and
hospital-origin DPoP replay denial. An Orthanc access trap confirms this metadata
operation does not retrieve image bytes.

`node --test --test-concurrency=4`:543/543 PASS, exit0,38.617 seconds.
`node scripts/security-secret-scan.js`:PASS/no findings at14:00:32 UTC.
Syntax checks and focused `git diff --check` passed. Previous dirty work remains
preserved; this turn did not commit, push or merge.

This is local legacy internal authorization code, not an implemented/deployed
standalone Gateway. VM/cloud images still contain the earlier reviewed runtime.
No Azure API activation, private TLS end-to-end service call, image forwarding,
Gateway transfer-completion auditing or new v3 Grant completion is claimed here.
Next required implementation: standalone A Gateway policy client, exact scope
filtering and private mTLS PACS retrieval, transfer audit, cloud Data Plane-disable
guard, then actual distributed deployment and B Viewer gates. Details are in
`docs/api/HIGHPASS-V3-API-ALIGNMENT.md`. Related FR-014~031/037~041.

## Actual A-VM imaging and mTLS checkpoint — 13:49 UTC

The automated `verify-a` rerun exited 0. This is an actual A-VM transport and
synthetic PACS gate, not a distributed patient-consent/Viewer or Key Vault gate.

| Check | Result | Actual proof |
|---|---|---|
| Authorized development client | PASS | mTLS `/system`: HTTP 200 |
| No client certificate | PASS | TLS certificate-required alert |
| Untrusted issuer | PASS | Exact client/server TCP tuple matched SELF_SIGNED_CERT rejection |
| Wrong client SAN | PASS | HTTP 403 |
| Wrong EKU | PASS | Exact tuple matched INVALID_PURPOSE |
| Expired current-CA client | PASS | Exact tuple matched CERT_HAS_EXPIRED |
| Expired bad-client fixture | PASS | Exact tuple matched CERT_HAS_EXPIRED |
| Synthetic DICOM seed | PASS | Four instances uploaded; existing UID-based seeding, no data deletion |
| QIDO-RS over verified mTLS | PASS | HTTP 200, exact three expected synthetic Study UIDs |
| Temporary validation credentials cleanup | PASS | Dedicated validation files removed and stage directory removed |
| Latest Node regression | PASS | 536/536, exit 0, 38.518 seconds |
| Python denial classifier | PASS | 4 tests; DNS/refused/timeout/reset alone cannot become DENY |
| Secret scan | PASS | No findings, 2026-10-08T13:47:52Z |

Evidence: `artifacts/workstation/automatic-2026-10-08T13-49-07.267472+00-00/result.json`.
Earlier unsuccessful runs remain unchanged, including first QIDO 404 and missing
TLS evidence. Certificate-required classification originally matched too narrowly;
its typed-code test caught this and the matcher was corrected. Docker log timestamp
precision required a two-second lookback; reset classification still requires the
exact TCP tuple plus a certificate rejection reason, not time or reset alone.

Root cause of QIDO 404: the custom Orthanc JSON omitted `Plugins`, so the installed
DICOMweb plugin was never loaded. `orthanc/hospital-a.json` now explicitly loads
only the retained DICOMweb library. The actual A configuration was backed up before
the same minimal change, and Orthanc was restarted without changing its data volume.
Backup: `/home/server/highpass-capstone-2026-10-08T13-26-49.919383+00-00/orthanc/hospital-a.json.before-dicomweb-2026-10-08T13-47-49.530900+00-00`.
The first backup attempt failed before configuration replacement; its original
NOT VERIFIED record is retained. No successful rollback execution is claimed.

The transient probe runs as root solely to read mode-600 TEST client fixtures.
The long-running proxy retains its existing nonroot identity and strict TLS policy.
No CA private key is uploaded. Remaining: dedicated scope-authorized A Gateway,
VPN/cloud routes, authenticated B Viewer, actual Key Vault operations, and complete
patient-consent-to-Viewer distributed E2E. Related requirements: FR-026~FR-031;
FR-014~FR-025 and FR-032~FR-041 still require distributed integration verification.

## Automatic VM recovery — later checkpoint

The user explicitly authorized noninteractive use of the provided A/B credentials.
The new `scripts/workstation-automatic-ops.py` receives credentials through concealed
stdin, retains them only for the process lifetime, and sends sudo input through the
encrypted SSH channel without PTY echo. No password is stored in argv, source,
parameter files, generated evidence or terminal output. Existing installed Paramiko
5.0.0 and VMware VIX are reused; no authentication or TLS bypass was introduced.

The VMware SDK's 64-bit wrapper is used because Workstation's vix.dll is 32-bit.
Jobs are deadline-bound. Each explicitly selected VMX independently supplies only
its PUBLIC ED25519 host key over the local VMware management channel; SSH uses
RejectPolicy and that exact key, then checks expected guest MAC and user. This
provides an automated trusted-management alternative to manual console verification.

| Later check | Result | Evidence |
|---|---|---|
| A Docker installation | PASS | Engine 29.8.2 / Compose v5.6.0, exit 0, DOCKER_SETUP=PASS |
| B Docker installation | PASS | Same actual versions and completion evidence |
| B independent SSH identity | PASS | Rotated cloned host keys, new public key independently read through VMware, strict reconnect and MAC check succeeded |
| A PACS/mTLS foundation | PASS | Two actual A-VM containers healthy; image archive SHA-256 matched before load |
| Latest full suite | PASS | 535/535, exit 0, 37.9 seconds; later boundary-check branch is validated separately |
| B to raw A Orthanc direct access | PASS | Actual B guest socket probe: RAW_ORTHANC=ECONNREFUSED; no DNS/timeout substitution |

Install evidence: `artifacts/workstation/automatic-2026-10-08T13-18-29.343117+00-00/result.json`.
Rotation evidence: `artifacts/workstation/automatic-2026-10-08T13-22-09.067519+00-00/result.json`.
Foundation evidence: `artifacts/workstation/automatic-2026-10-08T13-26-49.919383+00-00/result.json`.
Boundary rerun evidence: `artifacts/workstation/automatic-2026-10-08T13-32-33.595632+00-00/result.json`.
The first localized boundary result remains NOT VERIFIED in its separate run.
The final operational runner returns nonzero for any failed/unverified operation;
a reachable raw Orthanc endpoint is FAIL, not an expected denial. Its two updated
automation tests and secret scan passed after this classifier/exit-code change.

B's new fingerprint is `SHA256:MawV94dXO13FLd0xDVb62YNptt+2CXP4W49UyGy4sPU`.
Old host keys remain in root-only `/etc/ssh/highpass-capstone-hostkeys.0zICcS` on B.
The rotation script validates sshd config before reload and restores backed-up
keys on failure. It never prints private keys or changes unrelated VM identities.

Both guests had Docker absent and inactive before recovery. The earlier exit-124
installer/empty diagnostic failures remain in their original records. Their exact
prompt/hang cause was not proven; they were resolved operationally by noninteractive
credential delivery with bounded management/SSH operations. No gate failure was
erased or changed to PASS retroactively.

A foundation is at `/home/server/highpass-capstone-2026-10-08T13-26-49.919383+00-00`,
Compose project `hp-capstone-hospital-a`. Raw Orthanc remains on an internal network;
the mTLS listener is configured for loopback only. Dev server key files are mounted
read-only with root ownership/group 65532 and mode 640; no CA private key was sent.
The archive contains reviewed application/Orthanc images, not real patient images.
At that earlier checkpoint, patient/scope Gateway authorization, VM mTLS tests,
seeding, VPN, B authenticated Viewer, actual Key Vault crypto and distributed E2E
were outstanding. The later checkpoint above supersedes VM mTLS and synthetic
seed/QIDO status only. Infrastructure readiness is not imaging exchange completion.

Scope: synthetic hospital A/B on Workstation Pro, Azure for Students, actual Key
Vault encryption, presentation 2026-10-15, authorized budget USD100.

## Confirmed results

| Check | Result | Evidence |
|---|---|---|
| Node unit/integration suite | PASS | `node --test --test-concurrency=4`: 526/526, exit 0, 38.4 seconds |
| Secret scan | PASS | `node scripts/security-secret-scan.js`: zero findings, exit 0 |
| Certificate expiration policy | PASS | `node scripts/operations-expiry-check.js`, runtime certificates expire 2026-12-06 |
| Expired negative certificate fixture | PASS | `node scripts/cert-fixture-check.js`, expected expired fixture confirmed |
| Current app image build | PASS | `highpass-platform-mvp:capstone-20261008`, index digest `sha256:853ed9b5269a6781eff54b29942f6368c9d14f6a36add88ebdb5dcc1b0744802` |
| Existing local runtime matches latest worktree | FAIL | `node scripts/attest-runtime.js`: differing source hashes and absent new ingress/replay files |
| Azure subscription | PASS | Explicit school Azure for Students subscription is Enabled |
| Azure network template validation / what-if | PASS | Both Succeeded; existing vault unchanged, five resources planned |
| Azure network deployment | PASS | `highpass-capstone-network-20261008` Succeeded; all five resource operations Succeeded |
| Vault public access / private endpoint | PASS | Public access Disabled, endpoint Approved/Succeeded |
| Private DNS resource | PASS | Vault A record `10.89.1.4` in linked private zone; local resolution unverified |
| HTTPS strict DPoP | PASS | Independent synthetic run, real API restart/replay-table outage, 21 cases |
| Browser Viewer | PASS | Trusted HTTPS, real UI flow, gateway image decoded, no token in URL/storage/history; built-in Viewer, OHIF rendering NOT VERIFIED |
| Normal/negative mTLS | PASS | Independent synthetic run `mtls.json`, exit 0 |
| Current image scan / container gate | PASS | Independent run `scan.json` and `container-gate.json`, exit 0 |
| Security Gate independent recheck | PASS | `node scripts/security-gate.js`, 2026-10-08T12:25:19.615Z: unit, secret scan, dependency audit all exit 0; executed pnpm 11.7.0 |
| Cloud VM deployment | PASS | `highpass-capstone-cloud-vm-20261008` Succeeded, Standard_B2als_v2, VM running, private IP 10.89.0.4 |
| Cloud SSH trust/login | PASS | Azure management RunShellScript returned public ED25519 fingerprint `SHA256:dPTJcxW/+7r7ZRBQy3/DY71Q/Am7Iw2C6q7+woBK7XE`; strict known-hosts SSH then succeeded |
| Cloud Docker / Compose | PASS | Actual Engine 29.8.2 / Compose v5.6.0, installer exit 0 and DOCKER_SETUP=PASS |
| Cloud private Vault DNS/TLS boundary | PASS | Ordinary Vault hostname resolved 10.89.1.4; TLS verification 0 and unauthenticated HTTP 401, not a wrap/unwrap test |
| Cloud foundation regression | PASS | 18 related tests, exit 0; separate secret scan PASS after replacing an invalid-key test marker that initially triggered the scan |
| Full suite after cloud foundation changes | PASS | `node --test --test-concurrency=4`: 531/531, exit 0, 38.5 seconds; this does not execute live distributed E2E |
| Latest full suite including bounded installer/diagnostics | PASS | `node --test --test-concurrency=4`: 533/533, exit 0, 38.2 seconds |
| Cloud installer repeat / command-string transport | PASS | Strict SSH, existing package set preserved, Engine 29.8.2 / Compose v5.6.0 and final marker; no package replacement |

Live cloud host evidence: `artifacts/azure/cloud-host-2026-10-08T12-51-43-483Z.json`,
generated by `scripts/azure-cloud-host-check.js`; all records remain DRAFT / UNASSIGNED.
The cloud VM has no managed identity and no Key Vault data permissions. Its NSG
allows 22/TCP, 443/TCP and 51820/UDP only from the verified demo public IPv4 /32,
then denies other inbound traffic. No API, DB or imaging stack is running on it yet.
WireGuard tools were installed from the signed Ubuntu repository; no tunnel,
forwarding policy, peer enrollment or VPN handshake has been verified.

The cloud SSH key ACL was independently read back. An explicit Administrators
grant initially remained after ssh-keygen; the identity helper now removes broad
grants and checks protected ACLs with only current-user and SYSTEM SIDs. It was
rerun without replacing the key; readback confirmed those two principals only.
The first ACL check encountered a PowerShell 5/7 module-path mismatch; using native
.NET ACL reads in Windows PowerShell fixed the check without bypassing it.

Hospital A's legacy installer eventually ended with exit 124 at
2026-10-08T13:04:15.5237996Z, without verified completion. Its prior RUNNING record
and the user's reported terminal Result path were not treated as successful installation.
A separate native read-only diagnostic session was started; it collects package
states, command names/ages (no arguments), service state and noninteractive Docker
version checks. It does not install, alter sudoers or overwrite the failed install
record. It has a three-minute whole-SSH deadline and a 45-second remote deadline.
That diagnostic run ended at 2026-10-08T13:10:03.200Z with
OWNED_SSH_SESSION_TIMEOUT, no observations and collected=false. Only its owned
local SSH process tree was terminated. No diagnostic data or guest modification
is claimed; do not repeat installation until native authentication can complete.
Evidence: `artifacts/workstation/hospital-a-diagnostics-2026-10-08T13-07-02-751Z.json`.
The launcher now delegates to
`workstation-docker-session.js`: native/local authentication, a finite 950-second
whole-SSH deadline, timestamp-separated records, and a PASS only when exit 0,
the installer marker and both actual versions are observed. No transcript or
credential is stored during installation. The diagnostic record retains only the
reviewed script's nonsensitive inventory, not SSH stderr or user input.
The remote installer now runs a decoded command string,
not its stdin stream, so package tools cannot consume remaining script lines.
This is a robustness change, not a proven cause of the legacy timeout.
Its two additional tests passed alongside 10 foundation
tests; the separate secret scan passed. These additions postdate the 531-case run.

B2s and B1ms were rejected by actual ARM SKU validation. B2als v2 was validated
and then created successfully. Current retail base estimate is USD49.62 at 730
hours plus variable costs; reserve USD20. Credit balance and a hard spending cap
are not verified. Deallocating the VM does not stop IP/disk/endpoint/DNS billing.

The FHIR/Orthanc seed source checksum was corrected after reviewing a timeout-only
change. Clinical fixture identities and imaging mappings did not change. A default
parallel full-suite run initially had two failures; after the checksum correction,
the Privacy case passed alone and the full suite passed with four concurrent files.
The standard runner now bounds concurrency at four without removing assertions or
relaxing their deadlines.

The first new synthetic DPoP run failed because PostgreSQL became unhealthy during
fresh-volume initialization. Its diagnostics showed initdb still running; the
one-shot Orthanc synthetic seed succeeded. Cleanup succeeded for only that new
project. PostgreSQL startup grace was extended to 90 seconds while preserving the
TCP readiness probe; the overall Compose startup limit is 360 seconds. A second
independent run completed at
`evidence/generated/hp-validation-2026-10-08t12-13-41-431z/`. Compose startup,
runtime source attestation, DPoP unit/protocol, actual PostgreSQL replay protection,
browser strict DPoP/Viewer, HTTPS strict DPoP and mTLS gates passed. Security and
container scans/gates have completed: the image scan and container gate passed.
Security Gate's first pnpm startup failed and the original manifest correctly
retains NOT VERIFIED. A later standalone Security Gate recheck passed, including
dependency audit, with pnpm 11.7.0; its different global manifest 11.22.0 is a
reported warning, not the executed version. The original failed/unverified evidence
was not overwritten. Cleanup of the new synthetic stack passed. Never use
the old running local stack as evidence for latest-source E2E completion.

## Immediate remaining work

The earlier A/B install and B host-key rotation items below are superseded by the
automatic recovery checkpoint at the top. Current next tasks are A synthetic seed
and actual mTLS gates, B authorized Viewer/Gateway foundation, private VPN/DNS,
separate Key Vault identities and actual crypto, then distributed E2E and review.
Docker reported Orthanc bindings={} and mTLS HostConfig loopback 18443, but
NetworkSettings.Ports had null bindings on the internal network. Loopback proxy
reachability has not been inferred from configuration alone. B's first direct
probe returned a localized connection-refused error, correctly recorded NOT
VERIFIED by the English-only classifier; a normalized socket-error probe replaces
locale matching for the separate rerun. No original result was rewritten.

1. Diagnose A's exit-124 incomplete installation before any retry. Complete the
   native read-only diagnostic authentication and inspect package/service/process
   state. The previous
   password prompt outlived its server connection: TCP state was CloseWait. Only
   that owned stale SSH child was stopped after validating its launcher and
   endpoint. No guest install ran; installation is NOT VERIFIED. Start a fresh
   setup session only after diagnostics establish a safe retry/recovery action.
2. Rotate B's cloned host keys at its verified console, compare fingerprints,
   enroll its independent trust and install Docker.
3. Preserve the completed local gate results and the separate Security Gate
   recheck; retain the original failures. Repeat them against the distributed
   deployment once its Gateways and cloud endpoints are available.
4. Preserve the provisioned cloud VM and connect an authenticated VPN/overlay within budget. Deploy
   metadata/policy-only Control Plane and DB; keep raw DICOM/DEKs in Data Plane.
5. Provide separate hospital key identities and verify real RSA-OAEP-256 wrap /
   unwrap with AES-GCM encrypted synthetic packages and denied-access scenarios.
6. Wire A/B Gateways, authenticated B Viewer, consent lifecycle and audit chain;
   prove cross-VM/cloud E2E and repeatable cleanup from the Demo Runbook.
7. Collect current-source/digest evidence and obtain review of this new evidence.

Related groups: FR-014–031 authorization/tokens/Gateway, FR-032–036 Viewer,
FR-037–041 audit. Full v3 Grant/API HA and production integration are not inferred
from these results. Legal/certification/real-hospital approval remains DEFERRED.
