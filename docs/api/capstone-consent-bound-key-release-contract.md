# Capstone consent-bound key release — implementation checkpoint

Date: 2026-10-09 (KST). Review: DRAFT / UNASSIGNED.

Current A/B exact image is `e7dc852f99ab` (consent-result classification);
cloud38d unchanged. This is a frontend result-classification correction, not a
server/OpenAPI authorization contract change. An acknowledged ACTIVE consent
followed by UI refresh failure yields CONSENT_REFRESH_FAILED and keeps local
access closed pending refreshed authority; unacknowledged request failure stays
CONSENT_REQUEST_FAILED. Regression reproduced before patch and passed after.
622 local tests, Security/Container Gate PASS. Current diagnostic live
connection-fault/recovery6/6 PASS:
`artifacts/workstation/browser-outage-2026-10-08T21-03-36.964928+00-00/result.json`.
Previous intermittent UI exception root cause is still unproven; uninstrumented
repeated stability is the next gate. Older deployment paragraphs are historical.

Latest checkpoint supersedes historical deployment paragraphs below: A/B d6c38ee56bb8
consent-flow guards deployed; cloud38d unchanged. Full619 tests and exact-image
container gate PASS. Actual browser evidence
`artifacts/workstation/b-browser-2026-10-08T20-21-15.312026+00-00/result.json`
proves one create/token/revoke HTTP operation each under forced duplicate clicks,
matching consent IDs and only the issued token used for successful DICOMweb.
Local tests also reject revoked/changed-context late token and image completion.
No API or server authorization contract change. Arbitrary cross-tab races, VM
cold-start, global Vault/control outage, new v3 Grant and full API HA are not
claimed complete. Prior a7 rollback proof remains historical and scoped A-only.

Current d6 deployed-module crypto14 checks PASS:
`artifacts/workstation/encrypted-negatives-2026-10-08T20-23-26.109408+00-00/result.json`.
Final read-only ledger5 checks PASS/2041 valid audits/no repair:
`artifacts/workstation/encryption-ledger-2026-10-08T20-29-02.619099+00-00/result.json`.

Latest deployed hospital a7c753acbdad startup/dashboard-order UI corrections;
cloud38d unchanged. App-only rollout10/10 and full Node613/613 PASS, exact image
HIGH0/CRITICAL0. A-only recovery6/6 PASS:
`artifacts/workstation/a-rollback-2026-10-08T20-05-33.100671+00-00/result.json`.
Latest actual browser normal/authentication negatives/revocation label/cache
clearing PASS: `artifacts/workstation/b-browser-2026-10-08T20-08-05.365112+00-00/result.json`.
No authorization/API change; crypto modules unchanged via scoped source hashes.
Earlier14-negative module gate below remains explicitly tied to d576 image.
Exact create-consent/token/revoke ID correlation/concurrent clicks, VM cold-start,
global Vault outage and independent human review remain open. No whole MVP claim.

Latest hospital d5769004cebf rollout10/10 PASS and real browser normal/auth-boundary/
refreshed revocation label/cache clearing PASS:
`artifacts/workstation/b-browser-2026-10-08T19-42-46.264319+00-00/result.json`.
Current cloud remains38d707e7a924; API/authorization contract unchanged.
Actual encrypted-module negative gate14/14 PASS/exit0 on pinned deployed B/A/
cloud and real private Vault:
`artifacts/workstation/encrypted-negatives-2026-10-08T19-42-40.132365+00-00/result.json`.
Confirms one-time package replay and bound ciphertext/tag/wrapped-key/manifest/
key-version/recipient/release/Instance substitution DENY, elapsed receipt DENY,
actual unwrap followed by patient revocation DENY before plaintext. Tag changes
are rejected by ledger binding before unwrap, not proof of reaching GCM failure.
An ephemeral injected invalid Vault token receives real provider denial without
plaintext; global Vault outage and actual browser fault-injection NOT VERIFIED.
Owned synthetic consent verified REVOKED; existing records not deleted. No raw
DEK/plaintext/credentials in public evidence. New UI uses exact server revocation
acknowledgement and preserves selected consent; backend authority unchanged.
Full Node609/609 and Security Gate PASS; current image HIGH/CRITICAL0.
Cold-start, rollback and independent human review remain open.

Latest actual policy gate12/12 PASS/exit0 on cloud38d707e7a924 / A/B9d2a12f600d8:
`artifacts/workstation/b-browser-2026-10-08T19-21-52.013142+00-00/result.json`.
Actual expiry, revocation, scope, download and token tampering deny403/no image;
three owned consents verified inactive (two REVOKED, one EXPIRED).
Viewer/authentication boundary PASS:
`artifacts/workstation/b-browser-2026-10-08T19-14-28.562572+00-00/result.json`.
Latest read-only ledger five checks PASS,1115 valid audits/34 releases/27 consumed:
`artifacts/workstation/encryption-ledger-2026-10-08T19-22-12.773009+00-00/result.json`.
One subsequent ledger read FAILED link validation before two unchanged read-only
snapshots passed859 records; this intermittent failure remains a P0 investigation.
Detached-save-snapshot correction is now deployed to cloud digest38d707e7a924,
with prior859 audit hash fingerprint/PG container unchanged. Bounded actual
single-browser concurrent-read/write gate PASS (11 overlapping valid snapshots,
audits964→1053):
`artifacts/workstation/concurrent-audit-2026-10-08T19-14-00.799731+00-00/result.json`.
Do not infer general audit reliability, HA, outage coverage or whole MVP completion.

Related FR-037~FR-041: detached-save-snapshot correction prevents uncommitted
concurrent additions/mutations from becoming the persisted baseline. Two local
reproductions failed before the correction and pass after it. Full603 tests
PASS/exit0; a subsequently added full-save concurrency test and six affected
tests PASS (seven total). Probe adds counts-only structural diagnostics and
never exports hashes/clinical records or repairs persisted data. Full604 tests
now PASS (42.558seconds); scanned promotion and bounded live revalidation above
are complete, broader load/HA and new expired-token baseline remain separate gates.

## Current runtime and verifier correction

A/B timeout-correction image `highpass-platform-mvp:capstone-timeouts-20261009`
(`sha256:9d2a12f600d8ec7f114620a9f58ccdf18e69a6ca1ef513e8321168a561849b40`)
was promoted with ten deployment checks PASS:
`artifacts/workstation/hospital-app-rollout-2026-10-08T18-43-01.693768+00-00/result.json`.
B live-authority callback is8seconds; aggregate Vault operation25seconds;
encrypted-image transport/browser35seconds. Receipt expiry remains capped at
30seconds. Both pre/post unwrap policy checks and one-time consumption remain
mandatory; timeout still fails closed without plaintext fallback.

The verifier uses60-second synthetic consent and conservatively waits for
signed server lifetime using browser monotonic elapsed time from issuance
receipt. No server TTL or clock is patched. Cleanup authenticates as the owning
patient, reads state, revokes ACTIVE fixtures, and verifies effective REVOKED
or EXPIRED. An already-expired fixture is not called a successful revocation;
no fixture/audit record is deleted. Current full suite601 PASS/exit0 after final
verifier edits (40.612seconds); secret scan PASS/no findings. Actual
post-correction policy gate is PASS for the12 specific checks recorded above.

## Historical actual elapsed policy verifier

Latest actual execution:
`artifacts/workstation/b-browser-2026-10-08T18-17-37.501073+00-00/result.json`
— overall FAIL/exit1,8 PASS/3 FAIL/1 NOT VERIFIED. Other Study/Series,
VIEW_ONLY download, tampered token, same-token/fresh-proof post-revoke and
elapsed consent expiry denied403. Initial encrypted image and revoke passed.
Two later expected-ALLOW image requests and elapsed token expiry returned503;
they are not policy-DENY PASS. Cleanup remains NOT VERIFIED. Diagnose runtime
phase/deadline interactions and rerun; no security policy/TTL bypass is allowed.
Afterward, actual audit645 records/metadata14 releases/10 consumed passed the
five read-only supporting checks:
`artifacts/workstation/encryption-ledger-2026-10-08T18-18-12.580382+00-00/result.json`.

`scripts/browser-live-policy-gate.js` is a separate browser-memory-only protocol
gate, selected by `run-browser-authorization-trace.ps1 -Capstone -LivePolicy`.
It uses actual Mock IdP roles, nonexportable browser ECDSA private keys, fresh
proofs and current B HTTPS endpoints. It separately checks Study/Series/action
scope, token tampering, same-token/fresh-proof post-revoke, elapsed consent
expiry with a still-valid token, and elapsed normal runtime token expiry with
a still-valid consent. It does not patch clocks, forge signatures or shorten
the server token TTL. Only its own synthetic consents are cleaned up; audit
records are retained. Mock IdP renewal for cleanup is explicit, not an auth bypass.

Initial runs were NOT VERIFIED due to the verifier command deadline and actual
browser request timeout. Their evidence is retained; no policy DENY claim is
made from those timeouts. Three verifier-orchestration tests passed, including
safe failure reporting, finite waits and owned cleanup. Full Node suite after
adding the verifier tests: 598/598 PASS, exit0,40.357 seconds. Later diagnostic
changes were followed by the three affected tests, all PASS; full suite not
rerun after those last verifier-only diagnostic edits. Runtime images unchanged.

## Latest deployed result (supersedes historical implementation notes below)

Follow-up actual B browser image boundary: unauthenticated401, missing proof403
and replayed proof403, all without image response, PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T17-59-50.107760+00-00/result.json`.
Post-negative ledger gate: five PASS checks, 527 valid audit records and eight
one-time consumed releases:
`artifacts/workstation/encryption-ledger-2026-10-08T18-00-36.414065+00-00/result.json`.
These are scoped authentication checks, not tampered encrypted package, expired
release, outage or same-token/fresh-proof post-revoke evidence. Revoke label
passed this rerun but earlier inconsistent consent selection is unresolved.

Cloud migration and mandatory encrypted A/B overlays are now deployed.
Actual strict-TLS synthetic normal browser flow with live consent and real
Azure Key Vault: PASS. Evidence:
`artifacts/workstation/b-browser-2026-10-08T17-51-31.508935+00-00/result.json`.
Read-only supporting database gate: five PASS checks; all 435 stored audit
records validate without rewriting, five key releases consumed once, pinned
recipient/key and wrap/pre/post/response audit correlation confirmed:
`artifacts/workstation/encryption-ledger-2026-10-08T17-56-05.886607+00-00/result.json`.

The initial audit reader failure was diagnosed as timestamp-order disagreement
with valid stored links. `src/audit-chain-order.js` now reconstructs immutable
link order; startup rejects malformed/tampered histories instead of rehashing
them. Actual cloud-only rollout preserved all 347 earlier stored hashes and
the existing PostgreSQL container. Four added regression tests contributed to
595/595 full Node PASS. Unsigned legacy histories now require an explicit
reviewed migration, not automatic repair.

Current A/B image digest: cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9.
Current cloud digest: 5e728e53be1fc44685279ec8aec9c119ec0fe24a63c635771945df30883611da.
Fresh scans report zero HIGH/CRITICAL for both. Promotion evidence:
`artifacts/workstation/encryption-rollout-2026-10-08T17-34-24.264772+00-00/result.json`
and `artifacts/workstation/audit-order-rollout-2026-10-08T17-49-24.863234+00-00/result.json`.

Remaining NOT VERIFIED: deployed encrypted negative/replay/elapsed-expiry and
outage gates, fresh distributed boundary/mTLS gates, cold-start reproduction,
rollback execution and independent review. Built-in Viewer uses tiny synthetic
2x2 images, not clinical/OHIF performance. Revoke acknowledgement/cache clear
passed, but the dashboard still selects a different ACTIVE consent; explicit
revoked-consent display needs correction. Whole MVP/v3 is not declared complete.

Sections below are retained as historical implementation checkpoints. Statements
that deployment has not occurred describe those earlier steps only.

Related requirements: FR-014–025 (policy and tokens), FR-026–031
(Gateway), FR-037–041 (audit). This is a component for the approved distributed
capstone demo, not completion of v3 TransferGrant, patient approval, mobile
handoff, API HA or production KMS/rewrap requirements.

## Confirmed requirements and decisions

Original DICOM remains in hospital A. Control Plane stores policy and package
metadata only. A wraps a fresh AES-GCM DEK with its wrap-only Azure identity;
B unwraps with its separate unwrap-only identity. No raw DEK, original image,
signed receipt, wrapped key bytes or Vault token is stored in this new ledger.

`ConsentBoundKeyRelease` first revalidates an existing signed, short-lived Data
Plane receipt against current consent, doctor, hospital, token and Study/Series
policy. Only one selected Instance/Frame is eligible. It snapshots package ID,
fixed versioned Vault key ID, recipient and SHA-256 hashes of wrapped key bytes,
ciphertext and encrypted manifest. Hashes use lowercase hexadecimal; the Vault
adapter's base64url wrapped-key hash must be normalized from the same digest
bytes by its eventual integration adapter, not accepted interchangeably.

The durable release record is correlated with existing hash-chained audit logs
through `actorId=key-release:<releaseId>` and the original `auditSessionId`.
The existing audit schema/hash format is preserved.

Before unwrap, B must authenticate as the fixed configured recipient, present
the original receipt and match all persisted package bindings. After the Vault
response, the same live checks run again before decoded DEK consumption. An
atomic PostgreSQL update allows one unexpired release to be consumed once.
Success audit persistence must finish before plaintext use. Failure after
consumption does not restore the release: availability is sacrificed to deny
unsafe reuse. Precheck is not a reservation and may be repeated; postcheck is
one-time. This does not claim a single transaction spanning legacy audit and
the release table or exactly-once image delivery.

Malformed clocks, changed token actor/context, changed source/recipient consent
binding, suspended hospitals, revoked/expired authority, substituted package
hashes/key version, replay and audit/storage errors fail closed. Public methods
record safe generic denial audit without logging receipts, tokens or keys.

## Current implementation and verification

- `src/data-plane-authorization.js`: shared live receipt validator now used by
  existing response-ready logic and the new component. Existing HTTP contracts
  and UI have not changed.
- `src/consent-bound-key-release.js`: policy component and parameterized durable
  PostgreSQL ledger repository. Opt-in internal HTTP integration is now in
  `src/key-release-http-handler.js` and `src/server.js`; not deployed yet.
- `db/migrations/030_capstone_key_release_ledger.sql`: additive metadata ledger.
  NOT applied to the running cloud database in this step.
- `test/consent-bound-key-release.test.js`: six component/SQL-contract tests.
  Its memory repository is explicitly a test double, not persistence evidence.
- `scripts/capstone-key-release-db-gate.js`: actual disposable local PostgreSQL
  gate; uses owned fixture protocol and does not modify existing services/data.

Actual database evidence:
`artifacts/workstation/key-release-db-1791479004651/result.json` — four PASS
checks: persistence after connection restart, 32 concurrent claims with exactly
one winner, database-clock expiry denial, exact owned fixture removal. This is
local ledger verification, not cloud rollout or integrated encrypted Viewer.

Initial component run was 14/15: the audit-failure test injected a failure into
the earlier policy save rather than the intended post-consume audit. Its
assertion failed. The fixture now targets `KEY_RELEASE_CONSUMED` specifically;
the targeted 15/15 rerun passed. No production check was disabled.

## Next deployment gate — still required

1. Provision the separate B key-release service credential and deploy the
   implemented exact principal/ingress route checks. Generic/A credentials
   cannot authorize B unwrap in the actual local HTTP test.
2. Apply the additive migration with bounded DB clients and an explicit
   metadata-retention/cleanup policy; do not erase it via legacy bulk saves.
3. Wire preparation and before/after unwrap callbacks to this durable authority;
   make encrypted transport mandatory, with no plaintext fallback on failure.
4. Rebuild, scan, deploy A/B/cloud images with fresh source/digest evidence.
5. Prove actual Key Vault + current patient consent + encrypted B browser Viewer,
   mid-flight revocation, expiry, tampering, concurrent reuse and audit outages.
6. Re-run distributed security/network gates and obtain independent human review.

Encrypted Viewer and deployed consent-bound Key Vault E2E: NOT VERIFIED.
Whole CAPSTONE MVP/v3 completion is not declared.

## Internal HTTP and deployment contract — 2026-10-09 KST

| Endpoint (POST only) | Required service scope | Body |
|---|---|---|
| `/gateway/data-plane/package/prepare` | `gateway:data-plane-authorize` (A) | `receipt`, `packageBinding` |
| `/gateway/data-plane/package/wrap-authorize` | `gateway:data-plane-authorize` (A) | `receipt`, `packageId`, `keyId` |
| `/gateway/data-plane/package/authorize` | `gateway:package-key-release` (B) | above plus `releaseId`, `phase` |

`phase` is `BEFORE_UNWRAP` or `AFTER_UNWRAP`. Recipient hospital comes only
from the authenticated B principal/configuration. A caller-supplied
`authenticatedHospitalId` or extra body fields are rejected, not trusted.
Missing credentials yield 401; incorrect scope yields 403. Policy/binding/replay
denial is generic 403 `KEY_RELEASE_DENIED`; storage/audit outage is generic 503
`KEY_RELEASE_UNAVAILABLE`. Responses are `no-store`. Queries are rejected.
Ingress forwards service credentials only to the exact five metadata service
paths, never generic API routes or query-bearing variants. B's public portal
does not forward `/gateway/` requests; callbacks belong to B's server process.

New required runtime configuration when explicitly enabled:

- `HIPASS_CAPSTONE_KEY_RELEASE=1`
- `HIPASS_KEY_RELEASE_SERVICE_TOKEN_FILE`: distinct external B credential
- `HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID=HOSP-B`
- `HIPASS_KEY_RELEASE_VAULT_KEY_ID`: pinned complete versioned Vault URL

The optional `infra/azure/capstone-control-key-release.compose.yml` overlay adds
an explicit `key-release-migrate` service using the existing non-superuser app
role, bounded SQL/lock/connect timeouts and unchanged private networks. Control
waits for successful migration and validates table presence at startup using a
separate bounded pool. It does not hold a Vault OAuth identity/certificate or
gain Vault permissions. The normal profile remains unchanged/disabled; no
migration or cloud restart was performed in this implementation step.

`test/key-release-http-handler.test.js` verifies real localhost HTTP handling,
authentication scope separation, recipient spoof rejection, hash substitution,
replay and safe DB errors. The repository for that test is a memory fixture;
real durable concurrency evidence remains the separate PostgreSQL gate above.
`test/capstone-control-profile.test.js` verifies merged Compose configuration.
Initial HTTP assertion expected 403 for a missing principal, but observed the
correct 401 authentication response; corrected expectation, no security change.

The current Control service retains its existing single-process legacy policy
store. Multi-replica authoritative consent reads/API HA are not proven by this
ledger. Further migration-role execution, cloud deployment, credential delivery,
TLS callbacks and encrypted browser E2E remain NOT VERIFIED.

## Hospital encrypted image transport — 2026-10-09 KST

`src/capstone-encrypted-transfer.js` now connects the existing AES-GCM package
format with the Vault adapter and live Control Plane callbacks. A revalidates
its receipt before wrap, encrypts one selected response, obtains a fixed-version
wrapped key and persists package hashes through prepare (which rechecks after
the wrap latency). B independently recomputes all hashes, checks the exact
request path and recipient, runs before/after unwrap authorization, consumes
the release once, verifies protected manifest scope and object hash, and returns
only the verified transient response to the browser. The Control Plane never
receives the image, encrypted payload, raw DEK or wrapped-key bytes.

Encrypted response MIME is `application/vnd.highpass.encrypted-dicom+json`.
PNG/JPEG rendered images, selected WADO responses and frames use encrypted
transport; QIDO/metadata remain TLS-protected, scoped/minimized JSON. A zeroes
its directly owned plaintext response buffer after sealing/failure. B zeroes
owned plaintext chunks and output after response completion/disconnect. These
checks do not promise complete zeroization of Node/V8 internal copies or
immutable provider strings. No plaintext or DEK is persisted to disk.

The demo transport has an explicit 8 MiB selected-response plaintext limit,
12 MiB encrypted JSON limit, max128 chunks, original30-second receipt ceiling,
and finite underlying HTTPS/OAuth/Vault deadlines. Larger clinical responses,
full Study downloads and streaming performance are not demonstrated. A
required-encryption error or B plaintext image response causes failure, never
fallback. Normal unmodified deployment remains the earlier TLS-only profile
until the mandatory-encryption overlays are explicitly promoted.

Prepared overlays:
`infra/workstation/hospital-a-encryption.compose.yml` and
`infra/workstation/hospital-b-encryption.compose.yml`. Each mounts only its own
hospital certificate identity; B alone also gets the B service credential.
Exact private Vault host mapping preserves normal TLS hostname/CA validation.
Both merged Compose configurations passed `config --quiet`; not deployed yet.

Verification performed:

- Local protocol tests use actual RSA-OAEP-256/AES-GCM and live synthetic
  consent service callbacks, but a test RSA provider and memory ledger. They
  prove roundtrip/replay denial, MIME/tag/path substitution denial, revocation
  during unwrap and elapsed expiry. NOT an actual Azure browser test.
- A/B handler tests prove no plaintext fallback on provider/approval failure
  and clearing of directly owned transient response buffers.
- Full Node regression: 591/591 PASS, exit0,45.557 seconds.
- Image build: `highpass-platform-mvp:capstone-encryption-20261009`, actual ID
  `sha256:cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9`.
  Trivy reports0 HIGH/0 CRITICAL; separate vulnerability gate PASS/exit0 in
  `artifacts/security/container-scan/capstone-encryption-20261009.json`.
  Seven relevant runtime modules/entrypoints inside the image had SHA-256
  values matching current local files; this is scoped runtime source attestation,
  not a claim that all dirty repository files were included in that image.
- Actual B service credential provisioning: three PASS/exit0 in
  `artifacts/workstation/b-key-release-credential-2026-10-08T17-27-50.900082+00-00/result.json`.
  Generated remotely in root-protected cloud secrets, distinct from all existing
  role credentials, delivered through independently pinned encrypted root SFTP
  to B, UID0/GID65532/mode640 verified. No Windows secret file/Docker Env write.
  Initial run retained NOT VERIFIED because named group inspection returned
  UNKNOWN for numeric65532; corrected to numeric UID/GID validation and reused
  the same generated credential. No regeneration/overwrite of existing keys.

Next runtime promotion: preserve old images/volumes, deploy cloud metadata
service with additive migration, promote B required-decryption before A
required-encryption (image reads fail closed during transition), then repeat
actual private-Vault/consent/browser security gates with fresh evidence.
Credential provisioning alone does not prove B authorization or encrypted
Viewer runtime. New evidence remains DRAFT / UNASSIGNED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
