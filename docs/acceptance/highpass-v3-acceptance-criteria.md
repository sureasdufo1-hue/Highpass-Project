# Highpass v3 Acceptance Criteria

2026-10-08 L1~L5 policy adoption: 김범희, per the
[policy record](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md).
CON-003/004 must test parent-terminal/target-stop own withdrawal, source/ref-failure
safe denial without success, isolated withdrawal/maintenance scopes, worker-independent
expired denial, and audited own-minimum/source-reviewer reads. These cases remain
NOT VERIFIED until executed; adoption is not an independent technical review.

기준일: 2026-10-07 / 버전: v3.0-AC-1
상태: TEST SPECIFICATION COMPLETE / EXECUTION PENDING
상위 계약: [Requirements](../requirements/highpass-v3-requirements-definition.md), [Security](../security/highpass-v3-security-requirements.md), [Traceability](../traceability/highpass-v3-traceability-matrix.md), [Integrated review](../governance/highpass-v3-integrated-review-2026-10-07.md).

## Execution contract

2026-10-08: [lifecycle LD-01..10 specification](../api/highpass-v3-lifecycle-dependency-contract.md#6-required-acceptance-additions--not-verified)
extends ID/EX/CON/AUTH/GRT/PRE/PROV coverage for bootstrap, untrusted digest/state,
INVITED privacy, explicit link clause, distinct reviewer, immutable consent version,
revoke/link races and denial independent of cascade acknowledgement. NOT VERIFIED:
these are planned assertions, not an executed gate. Existing cases remain required.

- CAPSTONE-P0 uses generated synthetic DICOM and fictitious A/B/C hospitals. CD-derived images are excluded pending provenance and complete privacy review.
- Each case records exact source SHA, runtime image digest, fixture digest, command, exit code, duration and evidence location. Assertions never record tokens, private keys or raw clinical payload.
- PASS requires executed assertions. FAIL means an executed assertion contradicted the contract. NOT VERIFIED means not executed or no sufficient evidence. ENVIRONMENT BLOCKED means required infrastructure/tooling failed.
- DENY cases assert response AND zero prohibited side effects: no binary retrieval/import, no unauthorized file, no token/key release, no success audit.
- Each HTTP request has a deadline of 10 seconds by default; probe 5 seconds; readiness 120 seconds; individual scenario 60 seconds; integration command 240 seconds. Retries are at most two for classified transient technical faults. Policy/auth/integrity denial is never retried.
- Tests use fixed/injected time and ephemeral servers and isolated stores. Existing user data and unrelated Compose projects are preserved.
- All cases below are initially NOT VERIFIED for v3, regardless of historical legacy/domain passes. Existing tests can be evidence only after explicit contract correspondence is checked.

## Core functional cases — CAPSTONE-P0

P0-04 실행 상세는 [최신 transaction/metadata 기록](../governance/highpass-v3-p0-04-transactions-metadata-2026-10-07.md)과
[write 계약](../api/highpass-v3-mapping-write-contract.md)을 따른다. 입력 validator PASS는
ID-001~003 종단 완료 판정이 아니다. ID-003은 자기 승인·권한 없는 review·stale version·감사 실패·
동일/상이 payload 동시 idempotency retry의 DB/HTTP 음성 검증을 포함한다.
후속 own-ref 내부 Mapping service에서 전이/동시성/감사/등록자 분리를 실제 PG로 검증했다.
실제 write HTTP·cross-institution PatientRef 연결과 전체 ID/TEN gate는 아직 NOT VERIFIED다.

| ID | Given / action | Expected outcome and required evidence |
|---|---|---|
| V3-AT-ID-001 | Create opaque patientRef and separate A/B local mappings | Different local IDs bind explicitly; API/DB contain protected ref+keyed digest, no raw local IDs in responses |
| V3-AT-ID-002 | Same demographics yield multiple/conflicting candidates | MULTIPLE_MATCH/IDENTITY_CONFLICT; no automatic merge or payload movement |
| V3-AT-ID-003 | Reviewer resolves mapping with evidence | Version increments, actor/hospital/evidence digest and old/new states audited |
| V3-AT-ID-004 | Import with each non-VERIFIED mapping state | DENY before connector invocation; VERIFIED control proceeds |
| V3-AT-EX-001 | Create session with valid source/destination/purpose/resources | 201 with requester, initiation, expiry, correlation and participant ownership; missing/invalid fields 422 |
| V3-AT-EX-002 | Patient and provider independently initiate | PATIENT_INITIATED / PROVIDER_INITIATED; provider awaits explicit patient consent |
| V3-AT-EX-003 | Apply allowed and terminal-state transitions | Versioned canonical transitions only; terminal mutation 409, stale If-Match 412 |
| V3-AT-EX-004 | Cancel/revoke/expire during work | New access, Grant and key release DENY; cleanup separately tracked |
| V3-AT-EX-005 | Concurrent retries with equal/different idempotency payloads | One resource/action; same payload same metadata, different payload 409 |
| V3-AT-EX-006 | Expire/revoke a session or its consent while grants, tickets and key authorization exist | All dependent access paths deny; no new token, payload release or key rewrap; correlated denial audit |
| V3-AT-CON-001 | Attach consent for selected studies/actions/purpose/window | Separate evidence object; bounded scope/actions, version and policy/evidence references |
| V3-AT-CON-002 | Change consent scope/window or state | New immutable version; allowed transitions only, no silent expansion |
| V3-AT-CON-003 | Withdraw or expire consent | New grants/access denied and existing capabilities revoked according to recorded policy |
| V3-AT-CON-004 | Patient/admin/foreign tenant reads consent evidence | Authorized minimum fields only; foreign or unauthorized read 403/404 |

2026-10-08 V3-AT-CON-004 read-matrix evidence: [registered patient isolation](../governance/highpass-v3-registered-patient-isolation-execution-2026-10-08.md)
uses actual registered same-hospital/foreign-tenant patients, own-positive seven-table
reads and cross-read/write DENY. This is internal DB/service evidence, not the public
403/404 read endpoint or authorized admin minimum-field view. The full acceptance
criterion remains PARTIAL / NOT VERIFIED for those missing paths.

027 [terminal DDL/private projection](../governance/highpass-v3-consent-lifecycle-ddl-execution-2026-10-08.md)
proves scoped event3 assembly/rollback and own projection with actual signed synthetic
binding, target-stop/parent-cancel independence, source/ref failure and DB-clock expiry.
This is not an atomic authenticated withdrawal/expiry service or downstream Grant/access
revocation. Full CON-002~004 acceptance and new evidence independent review remain incomplete.

028 [withdrawal service result](../governance/highpass-v3-consent-withdraw-service-execution-2026-10-08.md)
provides scoped PG226: atomic authenticated synthetic withdrawal, idempotency/ACK recovery,
immutable outcome audit and COMMIT/locale boundaries. Full CON-003 still requires actual
expiry service, complete lock/isolation matrix and downstream Grant/access DENY; CON-004
public audited read remains missing. Historical WITHDRAWN receipt is never current ALLOW.

2026-10-08 lifecycle follow-up: [pre-DDL ADR](../architecture/highpass-v3-consent-lifecycle-adr.md)
and [proposed contract](../api/highpass-v3-consent-lifecycle-contract.md) map CON-002~004
to immutable terminal event3, real service actor, effective DB-clock expiry independent
of workers, atomic audit/receipt/cascade REQUESTED, and current versus original evidence.
Withdrawal/expiry/replacement/admin reads and downstream capability revocation are
NOT VERIFIED; an initial APPROVE event or green artifact fixture does not satisfy them.
| V3-AT-AUTH-001 | Evaluate consent then issue Grant | Consent, immutable decision and Grant have distinct IDs and lifecycles |
| V3-AT-AUTH-002 | Break each role/hospital/purpose/window/resource/action condition | Each isolated violation DENY with safe stable reason and audit |
| V3-AT-AUTH-003 | Direct HTTP calls bypass UI controls | Server enforces policy; decision records actor/tenant/context digest/policy version |
| V3-AT-GRT-001 | Request independent action scopes | study:view cannot download/import/export; grant cannot exceed ALLOW decision |
| V3-AT-GRT-002 | Vary issuer/audience/jti/recipient/session/resource | Every mismatch DENY; valid 30–600 second grant accepted |
| V3-AT-GRT-003 | Inspect issued token, metadata GET, logs and errors | No payload, raw keys, password, long-lived credential; metadata GET excludes token |
| V3-AT-GRT-004 | Expired/revoked/consumed/tampered grant or duplicate redemption | DENY with audit; no second execution or secret delivery |
| V3-AT-PKG-001 | Create package containing two authorized studies | Route-neutral package, immutable Study/Series/SOP hierarchy; session separate |
| V3-AT-PKG-002 | Compare manifest with expected object inventory | Exact identities/counts/digests/version/encryption/provenance refs; unexpected object DENY |
| V3-AT-PKG-003 | Encrypt/decrypt synthetic manifest and payload | AEAD roundtrip; unique nonce per key; no plaintext at rest; wrong key/AAD/tag DENY |
| V3-AT-PKG-004 | Omit/tamper/reorder/duplicate chunks and resume | Valid reorder/resume idempotent; missing/tampered/conflicting chunk quarantined |
| V3-AT-PKG-005 | Inspect Control DB and persistent storage | No original Pixel Data or raw DEK in Control DB |
| V3-AT-CLOUD-001 | Temporary exchange object upload and access | Ciphertext-only payload, finite expiry, copy classification and access restrictions |
| V3-AT-CLOUD-002 | Complete/expire/revoke exchange | Key disable/destruction+object delete receipts and audit; old decrypt denied |
| V3-AT-ROUTE-001 | Capability and grant decision table across P0 routes | PACS_DIRECT/CLOUD_VIEW/CLOUD_DOWNLOAD/CLOUD_RELAY selected deterministically; unsupported route denied |
| V3-AT-ROUTE-002 | Repeat equal routing input | Equal policy/version/context yields same decision; no AI routing dependency |
| V3-AT-PRE-001 | Inject DNS/refused/TLS mismatch/timeout/unavailable destination | Distinct technical error codes; finite end; no transfer |
| V3-AT-PRE-002 | Destination mapping ambiguous/unverified | FAIL and connector payload spy count zero |
| V3-AT-PRE-003 | Bad UID, unsupported SOP Class or Transfer Syntax | FAIL with safe code; supported control PASS |
| V3-AT-PRE-004 | Stale consent/decision/grant, scope change, quota exhausted | FAIL before payload; revalidate execution-time freshness |
| V3-AT-PRE-005 | PASS/FAIL/WARNING required/optional checks | Immutable checks/time/capability version; import requires PASS, required checks never warning-eligible |
| V3-AT-ACC-001 | QIDO approved and foreign Study/Series/Instance | Only authorized scope; foreign scope DENY without enumeration |
| V3-AT-ACC-002 | WADO Instance/Frame under scoped grant | Exact requested authorized frame/object, lazy retrieval; foreign hierarchy DENY |
| V3-AT-ACC-003 | Open real Viewer, expire/revoke while open, inspect URLs/cache | Approved DICOM renders; future retrieval denied; no token URL/localStorage/PHI cache |
| V3-AT-ACC-004 | VIEW_ONLY user calls download directly | 403, zero download bytes; explicit study:download control succeeds |
| V3-AT-ACC-005 | Import to B test Orthanc through STOW | All gates validated; actual multipart DICOM STOW and B readback; no local-file substitute |
| V3-AT-ACC-006 | Duplicate import and partial object failures | Idempotent result, per-object receipts/counts; partial is not COMPLETED or integrity PASS |
| V3-AT-ACC-007 | B browser bypass, no/untrusted/expired client cert | Direct Orthanc DENY and negative TLS DENY; trusted Gateway ALLOW with ready infrastructure |
| V3-AT-ACC-008 | Auth, DICOM protocol and dependency fault injection | 401/403 separated from safe 4xx/5xx technical errors; no credential/path/stack leakage |
| V3-AT-PROV-001 | Trace source→ingest→transfer→destination | Per-package provenance, ordered evidence hashes, source and destination actor/time/route refs |
| V3-AT-PROV-002 | Bit-preserving transfer and single-bit corruption | Source/destination object set, hashes and identities match for PASS; corruption FAIL |
| V3-AT-PROV-003 | Authorized transcode or 2xx/UID-only response | Transcode requires semantic validation+transform history; 2xx/UID alone NOT VERIFIED |
| V3-AT-AUD-001 | Run full workflow with isolated denials | Required event/field coverage complete including trace/session/consent/grant/package refs |
| V3-AT-AUD-002 | Tamper chain; inspect audit API and secret patterns | Tamper detected, modification/deletion disallowed, PHI/token/key minimized |
| V3-AT-AUD-003 | Burst denials, expired tokens, downloads, foreign hospitals, crypto failure | Configured alerts and scoped quarantine; legitimate same-NAT peer unaffected |
| V3-AT-TEN-001 | A/B/C roles attempt cross-tenant CRUD | Authorized participant control succeeds; all foreign CRUD denied |
| V3-AT-TEN-002 | Lists/joins/pool reuse under app ACL+DB RLS | No tenant leakage or stale context; query binding maintained |
| V3-AT-CONN-001 | Adapter capability/queue/retry/audit contract | Provider-neutral strict contract and workload identity; unsupported operation typed failure |
| V3-AT-CONN-002 | Connector mTLS faults/outbound topology | No public PACS; finite timeout and bounded retries; failures never synthetic success |

## Nonfunctional and operational cases — CAPSTONE-P0

| ID | Scenario | Expected evidence |
|---|---|---|
| V3-AT-NFR-001 | Stall request/health/probe/retry loop | Deadline respected, nonzero failure; no endless polling |
| V3-AT-NFR-002 | Partial import with failed object | Accurate partial counts and receipt; retry only safe failed work |
| V3-AT-NFR-003 | Inspect standards statements | PS3.18/PS3.15/IHE claims limited to exercised contract/implementation |
| V3-AT-NFR-004 | Browser network trace | Study→Series→Instance→Frame lazy flow, no default whole-Study download |
| V3-AT-NFR-005 | Correlate source, app, Gateway and B events | Trace/session/package/provenance correlation complete |
| V3-AT-NFR-006 | Keyboard/error/loading/empty/synthetic badge checks | Understandable accessible state, no internal details or unsourced clinical advice |
| V3-AT-NFR-007 | Reconcile every requirement and evidence | All exact IDs mapped; no missing execution hidden as PASS |
| V3-AT-NFR-008 | Review certification/approval wording | Legal PIPA/ISMS-P/hospital approval DEFERRED, no production claim |
| V3-AT-OPS-001 | Secrets/config/SBOM/dependency/image/startup checks | Strict key config, no tracked secrets, fresh scan or explicit ENVIRONMENT BLOCKED |
| V3-AT-OPS-002 | Production independent DR restore | PRODUCTIONIZATION / NOT VERIFIED until external resources provided |

## Current-gap regression cases — CAPSTONE-P0

| ID | Scenario | Expected result |
|---|---|---|
| V3-AT-FIX-001 | Unauthenticated/wrong-patient mobile calls; simulated login/erase | 401/403 for invalid principal; no fabricated hardware attestation or deletion; simulation metadata |
| V3-AT-FIX-002 | Patient without patientId filter; A doctor/patient reads B archive | Own imaging only; B archive forbidden for wrong hospital/role; no keys/paths in list |
| V3-AT-FIX-003 | Self-view API denies/fails | Modal stays closed; clear error; synthetic visual and sample finding labels |
| V3-AT-FIX-004 | Source retrieval fails; local archive succeeds | No synthetic substitution; local simulator explicitly identified; destinationVerification false |
| V3-AT-FIX-005 | Missing/invalid KEK, configured key and explicit test adapter | Missing/invalid config fails; configured random key roundtrip; no deterministic default |
| V3-AT-FIX-006 | Proof-bound token with missing/replay/wrong DPoP; spoofed JA3 | Legacy routes enforce proof/ingress + shared PostgreSQL replay; require actual browser, separate-process race, actual API restart, storage failure/recovery and audit tests; latest execution record controls verdicts; full API HA/new v3 grants NOT VERIFIED |
| V3-AT-FIX-007 | Trusted/untrusted/hostname-mismatched health, stalled upstream, mobile assets | Trusted only ALLOW; deadline; all shell assets route correctly, no sensitive cache |
| V3-AT-FIX-008 | Compare source hashes with running image | Matched server/services/static files before latest E2E PASS |
| V3-AT-FIX-009 | Configure unverified CD-origin dataset | Excluded from synthetic acceptance; source approval and pixel/nested-tag review required |
| V3-AT-FIX-010 | Run tests without preexisting localhost:3000 service | Ephemeral isolated harness and cleanup; no reliance on user server |
| V3-AT-FIX-011 | Docker/network/image unavailable during negative probe | ENVIRONMENT BLOCKED or NOT VERIFIED, never policy DENY PASS |

## CAPSTONE-P1 / POST-MVP

| ID | Classification | Acceptance |
|---|---|---|
| V3-AT-MOB-001 | CAPSTONE-P1 | Ciphertext capsule/Vault isolation, no plaintext general storage |
| V3-AT-MOB-002 | CAPSTONE-P1 | Registered device decrypts; foreign device cannot; real hardware evidence separately verified |
| V3-AT-MOB-003 | CAPSTONE-P1 | QR opaque bootstrap only; expiry/tamper/replay DENY |
| V3-AT-MOB-004 | CAPSTONE-P1 | Lost/revoked device backup restore DENY; verified key/object deletion receipts |
| V3-AT-MOB-005 | CAPSTONE-P1 | MOBILE_VAULT requires explicit study:mobile-export Grant |
| V3-AT-POST-001 | POST-MVP | Approved legacy C-STORE adapter isolated inside connector |
| V3-AT-POST-002 | POST-MVP | Offline expiry/clock tamper/reconnect reconciliation |

Real IdP/MFA, KMS/HSM, hospital PACS, clinical identity and legal approval remain PRODUCTIONIZATION. Local technical substitutes do not upgrade their status.

## Release gates

G0 review+acceptance+plan recorded → G1 current-gap regression PASS → G2 runtime hashes+legacy regression PASS → G3 v3 isolated contracts and migrations PASS → G4 A→B VIEW/DOWNLOAD/STOW synthetic E2E PASS → G5 evidence and independent review.

v3 CAPSTONE MVP ACHIEVED requires all CAPSTONE-P0 cases applicable to local synthetic infrastructure PASS. Unavailable dependency gates stay visible; no local simulator substitutes for B STOW or clinical provenance. Current status: NOT VERIFIED.
