# Highpass v3 Architecture Alignment

문서 버전: `v3.0-DRAFT-ALIGNMENT`
기준일: 2026-09-12
상태: **DOCUMENT COMPLETE / ARCHITECTURE REVIEW REQUIRED**
범위: `CAPSTONE-P0`, 문서·계약 정렬만 수행

입력 기준:

- [Highpass v3 Baseline](../baseline/HIGHPASS-V3-BASELINE.md)
- [Capstone MVP Boundary](../baseline/CAPSTONE-MVP-BOUNDARY.md)
- [Requirements v3](../requirements/highpass-v3-requirements-definition.md)
- [Security Requirements](../security/highpass-v3-security-requirements.md)
- [Traceability Matrix](../traceability/highpass-v3-traceability-matrix.md)

출력 계약:

- [Highpass v3 ERD](../data/highpass-v3-erd.md)
- [Highpass v3 API Alignment](../api/HIGHPASS-V3-API-ALIGNMENT.md)
- [Highpass v3 OpenAPI](../api/highpass-v3.openapi.yaml)

이 작업은 코드, 실행 DB, 기존 migration, Compose와 기존 OpenAPI를 변경하지 않는다.

## 1. Alignment outcome

```text
Identity
  PatientRef + Tenant-owned PatientMapping
      ↓
ExchangeSession + Participant + ResourceScope
      ↓
ConsentArtifact + AuthorizationDecision
      ↓
TransferGrant
      ↓
ImagingPackage + Manifest
      ↓
RouteDecision + PreflightResult
      ↓
VIEW / DOWNLOAD / PACS_IMPORT
      ↓
ProvenanceRecord + IntegrityEvidence + DeliveryReceipt
      ↓
AuditEvent
```

다섯 핵심 객체의 목표 책임은 다음과 같이 고정한다.

| Object | Aggregate responsibility | MUST contain | MUST NOT contain |
|---|---|---|---|
| PatientMapping | 한 Hospital-local patient reference와 platform PatientRef의 검증 연결 | tenant/hospital, protected ref digest, state, evidence, version | raw identifier in response/log, 자동 병합 결과 |
| ExchangeSession | 교류 업무·참여자·목적·상태·scope·expiry의 aggregate root | initiation, source/destination, patientRef, selected scope, correlation | DICOM payload, raw key/token |
| TransferGrant | 실행 가능한 단기 최소권한 | session, recipient, actions, resource snapshot digest, iss/aud/jti, expiry/status | Consent evidence 원문, payload, DEK/KEK, long-lived credential |
| PreflightResult | route 실행 전 capability·mapping·policy 검사 snapshot | route, grant/package refs, check results, overall result, version/time | payload, credential, unsafe internal error |
| ProvenanceRecord | source→ingest→transfer→destination chain of custody와 integrity | DICOM identities/digests, mode, event/evidence chain, final status | 임상 내용 원문, hash만으로 만든 거짓 PASS |

## 2. Current-to-target conflicts

| Current asset | Current semantics | Target alignment | Decision | Runtime migration impact |
|---|---|---|---|---|
| `patient_identity_refs` | patient_ref와 한 institution-local ref가 같은 row | platform `patient_refs` 1 : N tenant-owned `patient_mappings` | MODIFY | 새 테이블 backfill 후 dual-read; 원본 row 즉시 삭제 금지 |
| `transfer_requests` | consent에 종속된 요청 | `exchange_sessions`가 상위 aggregate, request는 initiation record/legacy ref | MODIFY | transfer_id를 `legacy_transfer_id`로 보존 |
| `handoff_sessions` | mobile/B handoff 중심 workflow | P1 Mobile route child | MODIFY | P0 ExchangeSession과 동일시 금지 |
| `remote_access_sessions` | token hash와 scope가 session처럼 표현 | `transfer_grants` metadata/status store | MODIFY | legacy session_id/token hash backfill, 원문 token 금지 |
| `policy_decisions` | institution/action/decision/context | session/consent/grant/tenant-aware authorization decision | MODIFY | nullable compatibility columns 또는 새 v3 table 후보 |
| `imaging_packages.transfer_id` | TransferRequest에 결합 | `exchange_session_id`에 결합한 route-neutral package | MODIFY | dual FK 전환; Mobile device는 optional route binding |
| no route decision table | route가 flow/endpoint에 암묵적 | immutable `route_decisions` | NEW | policy version/capability snapshot 저장 |
| no preflight tables | PHR mapping probe 조각만 존재 | `preflight_results` + `preflight_checks` | NEW | payload-before-PASS 차단용 gate |
| manifest/hash/receipt/audit fragments | provenance가 여러 테이블에 분산 | `provenance_records/events/integrity_evidence`로 연결 | NEW/MODIFY | 기존 digest/receipt를 backfill evidence로 참조 |
| `institution_id` RLS | 기관=tenant 가정 | tenant와 hospital 분리, cross-tenant Session participant ACL | MODIFY | Capstone 1:1 mapping, 목표 participant-based RLS |
| consent enum APPROVED/REVOKED | v3 canonical ACTIVE/WITHDRAWN과 불일치 | compatibility mapper로 읽고 신규 contract는 canonical 사용 | MODIFY | enum 즉시 변경 금지; event/status mapping 필요 |

## 3. Tenant and patient identity alignment

### 3.1 Tenant model

- `Tenant`는 SaaS 격리·계약·정책 경계다.
- `Hospital`은 tenant에 속하는 의료기관 endpoint/업무 주체다.
- Capstone은 `Tenant A ↔ Hospital A`, `Tenant B ↔ Hospital B`의 1:1 fixture를 사용한다.
- `PatientRef`는 platform-scoped opaque reference이며 tenant가 직접 열거할 수 없다.
- `PatientMapping`은 tenant/hospital-owned resource다.
- `ExchangeSession`은 source와 destination을 잇는 cross-tenant aggregate이므로 `exchange_session_participants`에 등록된 tenant만 접근한다.

`tenant_id` 단일 비교만으로 cross-tenant Session을 숨기면 정상 A→B 교류도 차단된다. 반대로 source/destination ID만 알면 접근하게 하면 IDOR가 된다. 따라서 Session 조회는 `principal tenant ∈ active session participants`와 actor role/action을 함께 검증한다.

### 3.2 Mapping flow

```text
Hospital Connector
  protectedLocalRef + localRefDigest + evidenceDigest
      ↓
Patient Mapping Service
  NO_MATCH / MULTIPLE_MATCH / IDENTITY_CONFLICT / UNVERIFIED
      ↓ explicit review/verification
  VERIFIED
      ↓
PACS_IMPORT preflight may continue
```

- local patient ID 원문은 API response, audit, error, URL에 노출하지 않는다.
- `(tenant_id, hospital_id, local_ref_digest)`는 active mapping에서 unique다.
- 하나의 local ref가 복수 PatientRef에 bind되거나 동일 evidence가 충돌하면 `IDENTITY_CONFLICT`다.
- mapping 변경은 optimistic version과 audit event를 요구한다.

관련 요구사항: V3-FR-ID-001~006, V3-SR-IAM-004, V3-SR-PAT-001/002, V3-SR-TEN-001~003.

## 4. Exchange Session alignment

### 4.1 Aggregate boundary

`ExchangeSession`은 다음 child/reference를 소유한다.

```text
ExchangeSession
├─ Participants: SOURCE / DESTINATION
├─ ResourceScopes: Study / optional Series / Instance / Frame
├─ ConsentArtifact versions
├─ AuthorizationDecisions
├─ TransferGrants
├─ ImagingPackages
├─ RouteDecisions
├─ PreflightResults
├─ PacsImports / DeliveryReceipts
├─ ProvenanceRecord
└─ AuditEvents
```

Session 생성 시 payload를 가져오지 않는다. Identity→Consent→Authorization→Preflight gate를 통과한 뒤에만 package ingest/stream/access를 시작한다.

### 4.2 Canonical state ownership

| State group | Owner | Notes |
|---|---|---|
| REQUESTED/IDENTITY_PENDING/CONSENT_PENDING/CONSENTED | ExchangeSession | patient/consent workflow |
| AUTHORIZED/PREFLIGHT/READY | ExchangeSession + latest decision refs | stale decision/grant 사용 금지 |
| ACTIVE/VIEWING/DOWNLOADING/TRANSFERRING | ExchangeSession | action substate; one active transition command at a time |
| COMPLETED/REJECTED/EXPIRED/REVOKED/FAILED/CANCELLED | ExchangeSession | terminal; 새 교류는 새 Session |

상태 변경 command는 `If-Match` version과 `Idempotency-Key`를 사용한다. 정책 DENY는 retry하지 않고 DNS/refused/timeout 같은 retryable technical failure만 bounded retry한다.

관련 요구사항: V3-FR-EX-001~007, V3-NFR-REL-001~003.

## 5. Consent, authorization and grant alignment

```text
ConsentArtifact ACTIVE
  + current actor/tenant/hospital/purpose/resource/action policy
      ↓
AuthorizationDecision ALLOW
      ↓
TransferGrant ISSUED/ACTIVE
      ↓
per-request introspection
```

- Consent는 환자 의사표시 evidence다.
- AuthorizationDecision은 특정 시점의 정책결과다.
- TransferGrant는 short-lived 실행 capability다.
- Grant response는 token을 선택적으로 한 번만 반환할 수 있으나 저장·조회 API는 hash/status metadata만 반환한다.
- resource snapshot은 mutable JSON을 직접 신뢰하지 않고 canonical digest로 고정한다.
- 기존 DICOM access token은 v3 Grant의 `VIEW/DOWNLOAD` bearer representation으로 호환한다.
- 기존 one-time handoff ticket은 P1 bootstrap이며 P0 Grant와 동일 객체가 아니다.

관련 요구사항: V3-FR-CON-001~006, V3-FR-AUTH-001~005, V3-FR-GRT-001~005, V3-SR-AUTH/GRT.

## 6. Imaging Package, route and preflight alignment

### 6.1 Package

- one Session may create multiple package versions, but only an authorized immutable resource snapshot is included.
- one Package may include multiple Study references.
- public metadata stores opaque refs/count/size/status/version/digest only.
- protected manifest and DICOM payload are encrypted outside Control DB.
- `device_id` is not a required package owner; it is P1 Mobile route metadata.

### 6.2 Route

| Route | Classification | P0 behavior |
|---|---|---|
| CLOUD_VIEW | CAPSTONE-P0 | QIDO/WADO lazy access through Gateway |
| CLOUD_DOWNLOAD | CAPSTONE-P0 | explicit download grant and receipt |
| CLOUD_RELAY | CAPSTONE-P0 | ciphertext/stream relay, bounded cache |
| PACS_DIRECT | CAPSTONE-P0 | Connector-mediated STOW to B Test Orthanc; direct browser/PACS 금지 |
| MOBILE_VAULT | CAPSTONE-P1 | Secure Capsule to registered patient edge |

RouteDecision stores rule/policy/capability versions and is immutable. AI routing is out of scope.

### 6.3 Preflight

| Check type | Required for | Failure behavior |
|---|---|---|
| ENDPOINT_IDENTITY / DESTINATION_AVAILABILITY | all remote access | FAIL; no payload movement |
| PATIENT_MAPPING | PACS_IMPORT | VERIFIED only; otherwise FAIL |
| STUDY_UID / SOP_CLASS / TRANSFER_SYNTAX | package/import | unsupported or mismatch FAIL |
| STORAGE_CAPABILITY / DICOMWEB_CAPABILITY | import/view/download | route unsupported FAIL |
| CONSENT / AUTHORIZATION / GRANT_FRESHNESS | all | stale/mismatch FAIL, no retry |
| STORAGE_QUOTA | temp/download/import | insufficient quota FAIL |

Overall `WARNING` may continue only when the check type is explicitly warning-eligible by policy. Identity, consent, grant, tenant, integrity and endpoint identity checks are never warning-eligible.

관련 요구사항: V3-FR-PKG/CLOUD/ROUTE/PRE/ACC, V3-SR-PAT/DICOM/DATA/NET.

## 7. Provenance alignment

```text
SOURCE_RETRIEVED
  → INGEST_VERIFIED
  → TRANSFER_STARTED
  → TRANSFER_VERIFIED
  → DESTINATION_VERIFIED
  → COMPLETED
```

| Mode | Required evidence | PASS rule |
|---|---|---|
| BIT_PRESERVING | source/object/destination digest + DICOM identity + counts | expected object set and digests match |
| TRANSCODED | source/destination DICOM identity + semantic validation + transformation tool/version/policy | all semantic checks pass and transformation is authorized |

HTTP 2xx, STOW success, identical UID, package hash 하나만으로 Provenance final `PASS`를 만들지 않는다. 누락·변조·unexpected transform은 `FAIL`; 실행하지 못한 검증은 `NOT_VERIFIED`다.

관련 요구사항: V3-FR-PROV-001~005, V3-FR-AUD-001~005, V3-SR-DICOM-004, V3-SR-DATA-003.

## 8. Component alignment

| Component | Owns | Calls | Must not do |
|---|---|---|---|
| Identity/Mapping Service | PatientRef/Mapping | Hospital Registry, Audit | raw ID logging, auto merge |
| Exchange Service | Session/participants/scopes | Consent, Policy, Package, Route | payload/key storage |
| Consent Service | ConsentArtifact versions | Identity, Audit | issue executable grant |
| Policy/Grant Service | Decisions/Grants | Consent, Session, Registry | widen requested scope |
| Package Service | Package/manifest metadata | Source Connector, Object Store, Key Adapter | store Pixel Data in Control DB |
| Route/Preflight Service | decisions/results/checks | Registry, Connector, Policy | move payload before gate |
| DICOMweb Gateway | QIDO/WADO enforcement | Source Connector/PACS | accept unknown grant/UID |
| B Connector | STOW import/receipt | B Test Orthanc | import unverified mapping/package |
| Provenance Service | events/evidence/final status | Package, Connectors, Receipt | infer PASS from HTTP result |
| Audit Service | append-only events/hash chain | all services | expose PHI/token/key |

## 9. P0 interaction sequences

### 9.1 Patient initiated VIEW

```text
Patient → Exchange API: create PATIENT_INITIATED session
Exchange → Mapping: source/destination mapping state
Patient → Consent: create ACTIVE artifact
Policy → Authorization: ALLOW study:view
Grant Service → Patient/Viewer: short VIEW grant
Preflight → Source Connector: endpoint/DICOMweb/scope checks
Viewer → Gateway → A Test Orthanc: QIDO/WADO
Gateway/Viewer → Provenance/Audit: access and evidence
```

### 9.2 Provider initiated PACS_IMPORT

```text
B Clinician → Exchange API: create PROVIDER_INITIATED session
Patient → Consent: approve scoped transfer
Policy → Authorization: ALLOW study:pacs-transfer
Package Service → A Connector: build authorized package snapshot
Route → Preflight: B mapping VERIFIED + STOW capability + grant fresh
Highpass/B Connector → B Test Orthanc: STOW selected objects
B Connector → Provenance: object-level destination evidence
Provenance → Exchange: PASS/FAIL/NOT_VERIFIED
Exchange → Audit: terminal result
```

## 10. Error and concurrency alignment

- API errors use `application/problem+json` with safe stable `code`, `traceId`, `retryable`.
- Policy errors are 403/409 depending on authorization vs state conflict; unauthenticated is 401.
- unknown resource and hidden cross-tenant resource both return non-enumerating 404 where applicable.
- optimistic conflict is 412 with stale ETag; duplicate idempotent request returns the stored response.
- external dependency errors distinguish DNS, connection refused, TLS, timeout, unavailable, protocol error.
- logs never include raw token, local patient ID, key material, full DICOM metadata or stack to the client.

## 11. Compatibility and rollout plan

No migration is executed in this phase.

1. Add v3 target tables/endpoints behind a feature flag in a future implementation phase.
2. Backfill PatientRef and Mapping from synthetic current data; validate one-to-many relationships.
3. Create ExchangeSession for new requests; retain `legacyTransferId` references.
4. Represent new tokens as TransferGrants; dual-introspect legacy token during bounded compatibility window.
5. Link existing package hashes/receipts into Provenance without rewriting evidence.
6. Run old v2.1 suite and new v3 acceptance suite together.
7. Deprecate legacy write paths only after parity, rollback rehearsal and approval.
8. Never drop legacy tables in the same migration that introduces v3 tables.

## 12. Impact summary

| Area | Before | After target | Affected UI | Affected tests |
|---|---|---|---|---|
| Patient identity | institution-local ref row | PatientRef + statused Mapping | mapping status/review | V3-AT-ID-* |
| Workflow | transfer/handoff fragmented | ExchangeSession aggregate | session timeline/status | V3-AT-EX-* |
| Authorization | token/ticket-centric | Decision + TransferGrant | action buttons by grant | V3-AT-AUTH/GRT-* |
| Package | mobile transfer coupled | route-neutral multi-Study | package scope/status | V3-AT-PKG-* |
| Preflight | implicit probes | first-class result/checks | PASS/FAIL/WARNING reason | V3-AT-PRE-* |
| PACS import | contract only | verified STOW workflow | import progress/partial receipt | V3-AT-ACC-005/006 |
| Provenance | hashes/receipts dispersed | chain/evidence aggregate | integrity timeline | V3-AT-PROV-* |
| Tenant | institution filter | participant-aware tenant ACL | no cross-tenant enumeration | V3-AT-TEN-* |

## 13. Alignment gate

| Gate | Result | Qualifier |
|---|---|---|
| Domain ownership | PASS — document | five core objects and boundaries defined |
| Architecture flow | PASS — document | P0 VIEW/DOWNLOAD/STOW paths aligned |
| ERD alignment | PASS — proposed | no migration executed |
| API alignment | PASS — proposed | no server routes implemented |
| Legacy compatibility | PASS — plan | dual-read/backfill not tested |
| Security constraints | PASS — document | runtime evidence pending |
| Architecture Review | PENDING | product/medical/security approval required |

최종 판정: **ARCHITECTURE / ERD / API ALIGNMENT DOCUMENT COMPLETE — REVIEW PENDING / IMPLEMENTATION NOT STARTED**
