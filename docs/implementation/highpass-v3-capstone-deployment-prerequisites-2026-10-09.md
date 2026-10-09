# Capstone v3 deployment prerequisites — 2026-10-09 KST

Status: DRAFT / UNASSIGNED. Whole distributed MVP: NOT ACHIEVED.

## Latest: Azure schema32/INSERT-only profile/ledger applied — 2026-10-09 KST

FR-014~025/037~041. Actual guarded operator rehearsal8 PASS with ROLLBACK baseline
equality; explicit apply8 PASS. Dedicated NOLOGIN owner/FORCE RLS, no backfill,
INSERT columns only (no recorded_at, SELECT or mutation). Original25 ledger rows
unchanged, row26 added with parent-linked extension digest. Frozen baseline
manifest untouched. Existing business counts/legacy image/health preserved.
No Session/Consent created or persistent listener activated.

Operator: scripts/capstone-v3-session-network-cloud.py. Successful apply means
subsequent rehearsal/apply refuses collision; reconcile read-only, never blindly
rerun or overwrite. Apply ambiguity is retained as unknown until reconciled.
Rehearsal/apply manifests PASS:
artifacts/azure/v3-session-network-cloud-20261009T022043660961Z/manifest.json
and artifacts/azure/v3-session-network-cloud-20261009T022125424134Z/manifest.json.
SchemaSHA1b38d397d0db7dc97a279bcc13f9d3e3ab6842a23bd15da921006f4840ace36f;
extensionSHA4b6873f9c979341e5fc95554af26e3d12941ceab9090cab28f75592e45ea0868.
Python3/Node3 and secret scan PASS.

Actual mounted postapply Identity readiness18 PASS (six principals/three roles),
strict TLS/SCRAM/RLS checks and negatives DENY. Owned container removed, legacy
healthy. DRAFT/UNASSIGNED manifest:
artifacts/azure/v3-mounted-readiness-check-20261009T022224Z-2d330169/manifest.json.
This does not prove Session schema/paired-write readiness or Azure Session HTTP.
Next explicit Session readiness/opt-in mounted composition/Azure HTTP, then
patient ownership/Consent/Grant/key release/Viewer. Whole MVP still NOT ACHIEVED.


## Latest: real PostgreSQL + fresh mTLS Session HTTP53 PASS — 2026-10-09 KST

FR-014~025/037~041. Explicit `node scripts/v3-session-network-schema-rehearsal.js --http`
now runs real pg clinical/preauth-writer/preauth-reader pools, actual PatientRef
registration and strict edge/router/create/read services. Local owned tmpfs DB
publishes ephemeral loopback only; DB transport plaintext locally, NOT cloud
verify-full evidence. HTTPS uses existing strict mTLS cert/hostname validation.

Fresh REQUESTED/version1 POST201, identical original receipt retry201, GET200,
conflict409, unknown ref404, forged B scope403, direct B SQL0 and requester audit0.
Five exact domain/network pairs verified by separate operator aggregate. Actual
short-lived Session GET/retry404 after deadline. Owned-fixture network INSERT
revocation produces503/no receipt; Session/audits/network/ledger/resources unchanged.
Missing bearer401 and unsigned ingress403 durably observed through separate
nonowner writer/reader, immediate socket127.0.0.1 and bounded polling.

53checks PASS exit0 in34.395s, cleanup/absence PASS. Current certificate files,
source hashes and actual SQL evidence, not fake service responses. No DICOM bytes,
patient Consent, Grant or Viewer claim. Evidence manifest DRAFT/UNASSIGNED:
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-15-45.526Z/manifest.json`.
Azure remains untouched. Next guarded schema32 ledger/grant apply and mounted
Session readiness/Azure HTTP, then patient ownership/Consent.

Manifest validator PASS exit0. Full security gate2026-10-09T02:16:53.467Z
PASS exit0: unit42.068s, secret1.156s, dependency1.652s. Executed pnpm11.7.0;
global manifest mismatch warning retained. No verification bypass or test skip.


## Latest: live isolated Session network schema/RLS35 PASS — 2026-10-09 KST

FR-014~025/037~041. New script
`node scripts/v3-session-network-schema-rehearsal.js` ran exit0 in28.348s,
35checks PASS. Offline owned PostgreSQL16 tmpfs fixture, frozen25 migration
baseline, exact nonowner source profile and six synthetic principals. Schema32
rollback/apply under NOLOGIN owner verified. No Azure grant/schema/ledger change.

Paired nonowner DENY insertion works without audit:read. Requester/no-context
reads0, exact FK mismatch23503, foreign tenant/actor42501, invalid inet/mode/
fingerprint/time23514, mutation42501 and failed-pair rollback0/0 verified.
SQL policy now requires ACTIVE principal/tenant/hospital; suspended institution
append42501 verified. FORCE RLS/owner intact. Fixture cleanup confirmed PASS.
Initial negative test FAIL23505 (existing event-ID collision) retained; corrected
fresh event per negative case, not relaxed expected codes. Targeted Node3 and
secret scan PASS. Evidence:
`artifacts/azure/v3-session-network-schema-local-2026-10-09T02-10-30.473Z/result.json`.

Next: real PostgreSQL + fresh-create HTTP + durable preauth observation, guarded
schema32 Azure enrollment/readiness, then patient Consent/Grant/key release.
This schema rehearsal is not full HTTP/cloud/TLS transport or MVP completion.


## Latest: audited receipt replay and optional strict Session HTTP composition — 2026-10-09 KST

FR-014~025/037~041. Successful create retry now validates the original ledger/
snapshot, records a fresh SESSION_READ/METADATA_READ and only then returns the
unchanged original receipt. Strict mode pairs that read with network provenance;
it does not recreate, extend validity, grant clinical access or reuse event IDs.
Actual-service QA operator counts explicitly include retry reads (resume3/fresh2
plus existing DENY events), rather than changing expected counts to hide failures.

Router composition accepts only explicit strict Session create/read services.
Mapping-only default remains unchanged. Session HUMAN_AUTH failure observation is
forwarded to validated observer when injected. No mounted Azure listener enabled.
Local actual mTLS HTTP edge/router/service test covers receipt replay201/GET200,
conflict409/expired404, missing bearer401/unsigned ingress403/encoded path422;
network-audit failure503 suppresses receipt and rolls back. DB is explicitly a
transaction adapter fixture, not real PostgreSQL/RLS evidence or fresh creation.
Targeted Node14/Python14 PASS. First test attempt failed on fixture filename;
corrected to existing certificate file without weakening TLS, rerun PASS.

Next: isolated schema32+RLS/grant rehearsal, fresh-create HTTP+durable observation,
guarded Azure ledger enrollment, mounted strict readiness and actual cloud HTTP.
Consent/Grant/key release/Viewer/full distributed MVP remain incomplete.

Full gate2026-10-09T02:05:46.968Z PASS exit0: unit43.150s,
secret1.434s,dependency1.817s. Local-only DRAFT/UNASSIGNED evidence:
`artifacts/azure/v3-session-http-replay-local-20261009T020546Z/result.json`.


## Latest: Session trusted-ingress audit foundation implemented — 2026-10-09 KST

Related FR-014~025/037~041. Create/read services now support explicit strict
network-audit mode. Missing or fabricated capability refuses DB access. Strict
HTTP handler requires both services and the genuine shared Mapping proxy authority;
mixed modes and strict cancellation are rejected. Mounted Session HTTP routing
is not activated. New paired writer binds domain and network event IDs on one
guarded transaction, with post-write freshness and affected-row checks.

Additive schema32 is prepared but NOT applied or enrolled in the Azure ledger.
It uses exchange domain FK, append-only FORCE RLS and audit:read visibility;
no SQL grant, role expansion, historical backfill or production claim.
Targeted Node19 PASS; Python mounted QA/source-closure6 PASS. Actual local mTLS
capability and fixture transaction rollback tested; live schema32/RLS and Session
HTTP remain NOT VERIFIED. Details and gates:
`docs/api/highpass-v3-session-network-audit-contract.md`.
Successful original-receipt retry still needs a fresh HTTP audit event; no claim
that existing retries already provide network provenance.

Full unchanged security gate2026-10-09T02:00:50.605Z PASS exit0:
unit48.415s, secret1.028s and dependency1.461s. Executed pnpm11.7.0,
global manifest version warning retained. Local-only DRAFT/UNASSIGNED evidence:
`artifacts/azure/v3-session-network-foundation-20261009T020050Z/result.json`.


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

Related: FR-014~025/037~041; Identity, PatientMapping and subsequent Consent flow.

## Confirmed current state

Actual pinned Azure host inspection used the existing PostgreSQL16 administrative
local socket for catalog SELECTs inside BEGIN READ ONLY / ROLLBACK. This role is
NOT a clinical credential and must never be used by the Identity runtime.
Inspection read no patient rows, secrets or raw logs and uploaded no remote file.
Existing control image38d707e7 remained running/healthy before and after.

Evidence: `artifacts/azure/identity-schema-inventory-20261008T234713Z/result.json`.
`highpass_v3` schema absent; zero v3 tables; all ten identity/preauth tables absent.
Only existing `hipass_app` was found among the enumerated role names; it has no
superuser/bypass/create-role/create-db/replication flags. No v3 policy/runtime
role from that fixed list was found. This is not exhaustive global privilege,
membership, PostgreSQL TLS or installed migration checksum verification.
Local006..029/031 hashes were recorded, not represented as installed hashes.

Legacy service health PASS does not imply v3 deployment readiness. The prior
553-check composed-host regression runs in an independently owned test database,
not this cloud database. Installed v3 readiness is NOT VERIFIED/incomplete.

## Recommendation and implementation decision

Prepare a separate capstone-v3 database on the existing PostgreSQL service,
keeping `hipass` and its P-1001/legacy encrypted-demo data untouched. This preserves
the functioning presentation fallback while v3 is staged. It creates no extra
Azure paid resource; shared CPU/disk/storage still require capacity monitoring.
This is deployment isolation, not a change to decentralized original-image
storage or Control/Data Plane separation. Cloud still stores metadata only.

PostgreSQL roles are cluster-global: a separate database alone is not role
isolation. Re-inspect target database names, policy/owner/login role collisions,
memberships and PUBLIC privileges immediately before provisioning. Never reuse
or alter an unknown existing role. Reject collisions pending diagnosis.

## Next execution unit: rehearsed non-destructive schema bootstrap

1. Build an explicit immutable migration manifest from006..029/031 and verify
   current hashes.030 belongs to legacy key release, not the v3 foundation.
   Verify full dependency order, including031's011 requirement and022's immutable
   audit function. Do not infer application from table existence alone.
2. Rehearse that exact bundle in an independently owned PostgreSQL16 fixture,
   including rollback, collision rejection and failed-mid-batch rollback. Existing
  553 regression does not cover the combined023..029 bundle at this deployment
   boundary; execute its actual foundation/lifecycle tests as well.
3. Provision only a previously absent named v3 target after capacity and safety
   checks. Record owner/creation provenance; never DROP/overwrite an existing DB.
   Administrative migration credentials are separate from runtime credentials.
4. Apply exact additive DDL in a bounded transaction with a checksum ledger.
   Create NOLOGIN ownership/policy roles with only reviewed privileges. Give
   ownership only to a dedicated migration/schema owner; runtime roles must not
   own tables/schema, bypass RLS, inherit owner/admin rights or create objects.
   Validate catalog ownership, RLS/FORCE-RLS, triggers/FKs and immutable ledger.
5. Separate nonowner clinical, actorless publisher and reconciliation reader
   logins with generated credentials kept in root-protected external files.
   Grant only named table/column/function operations required by their services;
   never copy the fixture's broad ALL TABLES SELECT grant as a deployment recipe.
   Deny legacy application access to the new database and v3 roles.
6. Enroll explicit synthetic A/B principals and registry records without real
   identities, fabricated human approval or merging P-1001. Use distinct requester
   and reviewer identities where the actual mapping policy requires them.
   Preparation/registration is not patient consent or clinical approval.
7. Add mounted-secret operator startup entrypoint for the composed host and
   dedicated strict proxy. Verify PostgreSQL connection boundary/TLS separately;
   do not silently use plaintext cross-host transport or disable hostname checks.
8. Build/scan/attest the image and exact configuration, then activate bounded
   preflight/listener/readiness/stop with previous-image configuration preserved.
   Failed deployment leaves legacy services running, v3 unadvertised, evidence
   FAIL/NOT VERIFIED. Rollback stops the new service; it does not erase immutable
   audit or automatically delete a populated target database.

## Remaining MVP completion path

After the staged runtime is genuinely ready: register HP-TEST-PHANTOM-001;
reconcile/review scoped mapping through real authorized APIs; establish scoped
ImagingStudy metadata and patient consent; prove A -> Azure authorization/Key Vault
-> B encrypted Viewer plus expiry/revocation/scope negatives in a real browser.
An ID in the old UI must not substitute for registered v3 identity/consent/grant.
Keep original images at A Orthanc and lazy-load authorized Series/Instance/Frame.
Re-run network/mTLS/audit/token/browser evidence and independent review before
claiming CAPSTONE MVP ACHIEVED. New evidence DRAFT / UNASSIGNED.

PIPA legal determination, ISMS-P certification and actual hospital approval remain
DEFERRED; the synthetic demo does not prove production readiness.

## Commands actually executed

| Command | Exit | Result / scope |
|---|---:|---|
| Azure CLI Python `scripts/capstone-runtime-diagnostic.py` | 0 | existing control healthy; safe recent log classes clear, not all-time error-free proof |
| Azure CLI Python `scripts/capstone-identity-schema-inventory.py` | 0 | actual read-only catalog inventory PASS; v3 deployment incomplete |
| Azure CLI Python `test/capstone-identity-schema-inventory.test.py` | 0 | 4 validation/readonly-source tests PASS, not a deployment test |
| `node scripts/security-secret-scan.js` | 0 | PASS, no findings |

Python runtime: `C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe`.
No cloud schema/role/data change, image promotion or Git push was performed.

## Full migration rehearsal completed — 2026-10-09 KST

`config/capstone-v3-migrations-20261009.json` fixes the exact ordered006..029/031
file hashes; bundle digest `eed5be053b2866916cf759cb809fdfb0ec4d7e439e2ef79fa7a29f0647cacbef`.
`readCapstoneV3MigrationBundle` accepts only25 fixed names and matching hashes;
altered/missing/reordered/duplicated/path-traversal entries fail rather than
self-approve the current source. Manifest and its selection remain DRAFT, not an
independent human approval or installed cloud ledger.

Actual network-none owned PostgreSQL16 rehearsal22/22 PASS,28.623s, cleanup PASS,
source unchanged. Evidence and verified manifest:
`evidence/generated/hp-v3-migration-2026-10-08T23-52-21-820Z-0cffae45/rehearsal.json`.
Checks exact full-bundle rollback, mid-batch divide-by-zero rollback after role
creation, disconnect without COMMIT, pre-existing global-role collision and
unchanged collision object, successful atomic DDL/checksum-ledger COMMIT,
non-idempotent rerun refusal, immutable ledger UPDATE/DELETE denial, eight
NOLOGIN/non-superuser/no-bypass policy roles and dedicated NOLOGIN v3
table/function/schema ownership. Separate synthetic legacy sentinel unchanged.
Ownership transfer was rehearsed as a separate transaction after the DDL/ledger
COMMIT; a live deployment must account for that intermediate state and may not
advertise runtime readiness until ownership/grants are verified.

The fixture was removed after exact ownership checks and absence verification.
This removes only generated synthetic test data, not any VM/cloud data.
Bundle loader2 tests PASS; catalog validator4 tests PASS. Latest expanded pinned
cloud inventory `artifacts/azure/identity-schema-inventory-20261008T235300Z/result.json`
also confirms proposed `highpass_v3_capstone` database absent and all eight policy
roles plus the proposed schema-owner name absent. Control remains healthy.
Earlier narrower inventory evidence is preserved, not overwritten.

Remaining deployment gate: protected backup/restore rehearsal, actual target
provisioning with fresh collision check, atomic bundle/ledger and ownership,
scoped runtime logins/secret mounts, scanned operator entrypoint/image, then
registered phantom consent/encrypted Viewer. No cloud migration has run yet.

### Actual dump/restore extension verified

Latest extended rehearsal27/27 PASS,26.104s, sourceUnchanged true, owned cleanup
PASS, manifest verification PASS:
`evidence/generated/hp-v3-migration-2026-10-08T23-58-12-120Z-4667a438/rehearsal.json`.
Actual pg_dump exports the owned schema and synthetic25-row checksum ledger in
memory; a separate fresh DB restores it through psql. All file/bundle hashes match
and restored ledger deletion is denied. No raw dump is stored or printed.
Global policy roles already exist in this same owned cluster; --no-owner and
--no-privileges are explicit. This does NOT validate independent-cluster global
role, ownership/ACL restoration, protected cloud backup or existing legacy data
recovery. Those require their own live deployment/backup gate.

The first extended run23:56:15-406b8d92 FAIL and diagnostic23:57:25-e33174ed FAIL
are retained. Diagnostic proved ENOBUFS/SIGTERM with277962 collected bytes against
the262144-byte subprocess buffer. Only pg_dump's output bound was increased to
finite2MiB; other command caps, SQL policies, privileges and timeouts remain.
Successful dump290798 bytes, exit0, stderr0. Earlier failures are not rewritten.

Current existing consent/ceremony/withdrawal/expiry regression272/272 PASS,
215.965s, source unchanged, cleanup PASS; manifest PASS:
`evidence/generated/hp-v3-ceremony-schema-2026-10-08T23-55-59-709Z-57b8104b/schema-check.json`.
This separate established business-flow fixture does not prove those services
after NOLOGIN ownership transfer or through the full combined runtime.

Security Gate at23:56:55.459Z PASS: units44.033s, secrets0.979s, dependencies1.691s;
`artifacts/security/capstone-migration-rehearsal-security-gate-20261009.json`.
It predates final pg_dump buffer adjustment; afterward bundle loader2 tests,
script syntax and secret scan PASS. Package pin11.7 matches executed pnpm;
global manifest11.22 warning retained. No signature/TLS bypass or lock rewrite.

Next build the explicit cloud bootstrap workflow: root-protected existing-state
backup and separate restore verification, fresh absence/collision/capacity checks,
isolated target creation, exact reviewed bundle/ledger/ownership verification,
then scoped runtime enrollment. Do not run a destructive reset or replace legacy
hipass as a shortcut. New evidence DRAFT/UNASSIGNED; whole MVP remains incomplete.
