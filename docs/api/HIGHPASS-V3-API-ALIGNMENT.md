# Highpass v3 API Alignment

## Lifecycle API clarification — 2026-10-08

[PENDING authority/storage contract](highpass-v3-consent-pending-authority-contract.md)
defines internal source staging, separate audit/ledger and same-transaction selection.
It proposes no public API activation; consent-artifacts remains approved-evidence
target contract. If-Match and staging receipt belong to a future separately reviewed
preparation interface, not an implemented replacement of consent-artifacts.

Internal020 preparation writes and same-transaction receipt replay are implemented;
actual PG251 covers scoped actor controls and observed suspension/cancel/expiry
serialization, not full PA-01..09 or public transport. See
[adversarial write report](../governance/highpass-v3-p0-06-pending-adversarial-2026-10-08.md).
No public preparation path or runtime activation is added by this evidence.

[Preparation HTTP contract](highpass-v3-pending-preparation-http-contract.md) now
defines a separate REVIEW REQUIRED injection-only POST, with an implemented but
unregistered handler and mocked-service transport tests. It is not the approved
consent-artifacts API or a deployed endpoint. Actual PG264 remains direct service
evidence; actual HTTP-to-PG/HTTPS/ingress/DPoP must be verified separately.

Actual HTTP-to-PG and TLS-server HTTPS have since been exercised in the owned
fixture ([transport report](../governance/highpass-v3-p0-06-pending-live-transport-2026-10-08.md)).
No deployment/client mTLS/ingress/PoP/MFA/clinical approval is inferred. Target
OpenAPI path remains unchanged; preparation interface is still REVIEW REQUIRED.

The [PENDING pure input foundation](highpass-v3-consent-pending-contract.md) is internal,
not an implementation of POST consent-artifacts. Its submitted evidence remains
UNVERIFIED and selection input cannot establish DB ownership. Public target schema
and runtime activation remain pending the separate approval/persistence gate.

[Dependency contract](highpass-v3-lifecycle-dependency-contract.md) covers proposed
state commands, actor authority and approvals. CreateConsentArtifactRequest state and
evidenceDigest are untrusted fields, not permission to attach ACTIVE consent. Separate
PENDING preparation from verified approval before activation. Claimed actor/tenant/
recipient fields in evaluation/grant requests must match server-authorized context.
Invitation acceptance/link approval paths are still proposals; no new public endpoint
is implemented here. Existing response shapes, enums and target paths are preserved.

문서 버전: `v3.0-DRAFT-ALIGNMENT`  
기준일: 2026-09-12  
상태: **DOCUMENT COMPLETE / API REVIEW REQUIRED / NOT IMPLEMENTED**  
범위: `CAPSTONE-P0` 제어면 계약 정렬

2026-10-07 통합 기술 검토 보완: Consent 응답의 action/scope/evidence 필드와 decision의 consent 참조를 명시하고, Grant idempotent 재시도는 원문 token 없이 `ALREADY_DELIVERED` metadata만 반환한다. Provenance는 session당 하나가 아니라 package version당 하나다. [검토 기록](../governance/highpass-v3-integrated-review-2026-10-07.md)을 따른다.

기준 문서:

- [Requirements v3](../requirements/highpass-v3-requirements-definition.md)
- [Security Requirements v3](../security/highpass-v3-security-requirements.md)
- [Architecture Alignment](../architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md)
- [Logical ERD v3](../data/highpass-v3-erd.md)
- [Target OpenAPI v3](highpass-v3.openapi.yaml)

기존 [Mobile-Core OpenAPI](highpass-mobile-core.openapi.yaml)는 구현 기준 계약으로 보존한다. 이 문서는 기존 계약을 즉시 교체하거나 서버 구현 완료를 주장하지 않는다.

2026-10-07 P0-04 후속: `ReconcilePatientMappingRequest`의 경로·필드 이름은 유지하되
opaque 보호값 형식을 [식별자 보호 계약](../security/highpass-v3-identifier-protection.md)으로 상세화했다.
`protectedLocalRef`는 canonical base64url AEAD envelope이며 `localRefDigest`는 43-char
HMAC-SHA-256으로 좁혔다(이전 43~86 chars). 임의 opaque 문자열을 받는 구현 클라이언트는
아직 없으며 기존 legacy UI/API 계약에는 영향이 없다. v3 crypto/registry 단위 시험을 추가했다.
이 변경은 실제 HTTP reconcile·신뢰 Gateway 완료가 아니다. 후속 metadata GET은 독립 PG/loopback HTTP에서
검증했으나 기존 서버에는 활성화하지 않았다. [실행 결과](../governance/highpass-v3-p0-04-transactions-metadata-2026-10-07.md)를 따른다.
review 신규 목표 경로 및 별도 scope는 [write 계약](highpass-v3-mapping-write-contract.md)에 정의한다.
후속 V3MappingWriteService의 own-ref reconcile/review·DB 전이·원자적 감사·idempotency는
독립 PG에서 검증했다. write handler·서버 활성화·교차기관 ref 연결은 미완료다.

## 1. Alignment decision

v3 제어면 API는 `/api/v3` 아래에 별도 계약으로 정의한다. 기존 `/api`, `/v1/mobile`, `/v1/gateway`, `/dicomweb` 경로는 호환 기간에 유지한다.

```text
PatientMapping reconcile
  → ExchangeSession create
  → ConsentArtifact attach
  → AuthorizationDecision evaluate
  → TransferGrant issue
  → ImagingPackage build
  → RouteDecision choose
  → PreflightResult execute
  → Viewer / Download / PACS import
  → Provenance and Audit query
```

핵심 경계는 다음과 같다.

1. `ExchangeSession`은 교류의 aggregate root이며 `ImagingPackage`나 토큰과 동일 객체가 아니다.
2. `PatientMapping`은 tenant 소유다. 원시 병원 환자번호를 API 응답에 반환하지 않는다.
3. `AuthorizationDecision`은 과거 판단 증적이고 `TransferGrant`는 현재 사용할 수 있는 능력이다.
4. Grant 원문은 발급 응답에서 한 번만 반환할 수 있으며 조회 API에는 포함하지 않는다.
5. `PreflightResult`는 불변 실행 증적이다. `PACS_IMPORT`는 최신 필수 검사 `PASS` 전에는 시작할 수 없다.
6. `Provenance`는 원본·수집·변환·경로·수신 증적의 연결이고 일반 감사 이벤트와 분리한다.

## 2. Current-to-target endpoint mapping

| 현재 계약 | v3 목표 계약 | 결정 | 영향 |
|---|---|---|---|
| `POST /api/consents` | `POST /api/v3/exchange-sessions/{sessionId}/consent-artifacts` | MODIFY | 동의를 ExchangeSession에 귀속하고 증적 버전을 명시 |
| `POST /api/policies/access-check` | `POST /api/v3/exchange-sessions/{sessionId}/authorization-decisions` | MODIFY | 판단 입력·정책 버전·reason code를 불변 기록 |
| `POST /api/dicom-access/request` | `POST /api/v3/exchange-sessions/{sessionId}/transfer-grants` | MODIFY | 토큰과 권한 부여 객체를 분리하고 action/resource/recipient를 제한 |
| `POST /v1/packages` | `POST /api/v3/exchange-sessions/{sessionId}/imaging-packages` | MODIFY | `transfer_id` 대신 session 귀속, route-neutral package |
| `POST /v1/handoffs` | `POST /api/v3/exchange-sessions` 및 route/preflight API | SPLIT | 교류 수명주기와 특정 전송 경로의 수명주기 분리 |
| `POST /v1/pacs-imports` | `POST /api/v3/exchange-sessions/{sessionId}/pacs-imports` | MODIFY | VERIFIED mapping·PASS preflight·scope 검증을 선행조건으로 고정 |
| `POST /v1/audit-events` | v3 write는 내부 event sink, read는 session scoped | KEEP/MODIFY | 외부 사용자의 임의 감사 이벤트 기록 방지 |
| `GET /dicomweb/...` | 기존 DICOMweb data plane | KEEP | QIDO/WADO 경로는 제어면 OpenAPI와 분리, TransferGrant 검증 유지 |

## 3. Target endpoint inventory

| Endpoint | 목적 | 주요 통제 | 성공 |
|---|---|---|---|
| `POST /patient-mappings/reconcile` | tenant 로컬 환자 참조와 플랫폼 환자 참조 조정 | tenant scope, digest/protected value 분리, ambiguous fail-closed | 201 |
| `GET /patient-mappings/{mappingId}` | mapping 상태 조회 | 소유 tenant 또는 승인된 session participant | 200 |
| `POST /exchange-sessions` | 교류 aggregate 생성 | idempotency, source/target 분리, opaque patient ref | 201 |
| `GET /exchange-sessions/{sessionId}` | 교류 상태 조회 | participant ACL, 최소 응답 | 200 |
| `POST /exchange-sessions/{sessionId}/cancel` | 교류 취소 | optimistic concurrency, grant revoke cascade | 200 |
| `POST /exchange-sessions/{sessionId}/consent-artifacts` | 동의 증적 연결 | scope, purpose, validity, issuer | 201 |
| `POST /exchange-sessions/{sessionId}/authorization-decisions` | 정책 판단 실행·기록 | RBAC+ABAC, stable reason code, policy version | 201 |
| `POST /exchange-sessions/{sessionId}/transfer-grants` | 최소권한 단기 Grant 발급 | prior ALLOW, recipient/action/resource/TTL, one-time token return | 201 |
| `GET /transfer-grants/{grantId}` | Grant metadata 조회 | 원문 token 미반환 | 200 |
| `POST /exchange-sessions/{sessionId}/imaging-packages` | package manifest 생성 | allowed DICOM scope, integrity metadata | 201 |
| `GET /imaging-packages/{packageId}` | package 상태·manifest 조회 | participant ACL, no raw DICOM | 200 |
| `POST /exchange-sessions/{sessionId}/route-decisions` | DIRECT/GATEWAY/MOBILE 경로 결정 | capability snapshot, policy result | 201 |
| `POST /exchange-sessions/{sessionId}/preflight-results` | 명시적 preflight 실행 | immutable checks, no payload movement | 201 |
| `GET /preflight-results/{preflightId}` | preflight 증적 조회 | participant ACL | 200 |
| `POST /exchange-sessions/{sessionId}/viewer-sessions` | 승인된 viewer 진입 | `study:view`, Study/Series scope, no URL token | 201 |
| `POST /exchange-sessions/{sessionId}/downloads` | 승인된 다운로드 시작 | `study:download`, audit, response handle only | 202 |
| `POST /exchange-sessions/{sessionId}/pacs-imports` | 목적지 PACS import 시작 | `study:pacs-transfer`, VERIFIED mapping, PASS preflight, mTLS connector | 202 |
| `GET /pacs-imports/{importId}` | import 상태 조회 | participant ACL, safe connector error | 200 |
| `GET /provenance/{provenanceId}` | chain of custody 조회 | 최소 공개, immutable evidence | 200 |
| `GET /exchange-sessions/{sessionId}/audit-events` | session 감사 추적 | 감사 역할, cursor pagination, PHI 최소화 | 200 |

표의 경로는 모두 `/api/v3` 기준이다.

## 4. Shared contract rules

### 4.1 Identity and tenancy

- 모든 리소스 ID는 opaque UUID이며 MRN, 주민번호, DICOM UID를 리소스 ID로 재사용하지 않는다.
- tenant context는 검증된 인증 주체에서 도출한다. 요청 body의 tenant만 신뢰하지 않는다.
- source/target hospital은 tenant와 별도 식별자로 유지한다.
- `PatientMapping` 생성 요청은 `protectedLocalRef`와 `localRefDigest`를 받지만 응답에는 둘 다 반환하지 않는다.
- cross-tenant 조회는 ExchangeSession participant ACL과 목적·scope 검증을 모두 통과해야 한다.

### 4.2 Authentication and authorization

- 사람 사용자는 OAuth2/OIDC bearer token과 scope를 사용한다.
- Gateway/PACS connector의 내부 호출은 mTLS와 service credential을 함께 요구한다.
- 중요 검증은 서버 측 RBAC+ABAC로 수행하고, UI 표시 상태는 권한 근거가 아니다.
- 동의가 `ACTIVE`가 아니거나 mapping이 모호하거나 scope가 어긋나면 fail closed 한다.

### 4.3 Idempotency and concurrency

- 상태를 생성하거나 외부 부작용을 시작하는 POST는 `Idempotency-Key`를 요구한다.
- 동일 key와 동일 요청은 동일 결과를 반환하고, 동일 key와 다른 payload는 `409 IDEMPOTENCY_CONFLICT`다.
- 상태 전이는 `If-Match`와 리소스 `version`으로 낙관적 동시성을 적용한다.
- 이미 취소·철회·완료된 상태에 불가능한 전이를 요청하면 `409 INVALID_STATE_TRANSITION`이다.

### 4.4 Trace and audit

- 요청은 검증된 `X-Audit-Session-Id`와 `X-Trace-Id`를 전달하거나 서버가 새 값을 발급한다.
- 응답은 `X-Trace-Id`를 반환한다.
- state-changing endpoint는 actor, tenant/hospital, session, action, result, reason code와 관련 객체 ID를 감사한다.
- token, key, protected local patient reference, raw PHI, 인증서 경로, stack trace는 감사·오류·UI에 기록하지 않는다.

### 4.5 Input and error safety

- 스키마는 기본적으로 `additionalProperties: false`, enum, 최대 길이, UID pattern, 배열 상한을 사용한다.
- 오류는 `application/problem+json`이며 안정적인 `code`, 일반화된 `detail`, `traceId`, `retryable`만 제공한다.
- 정책 거부(`403`), 인증 실패(`401`), 상태 충돌(`409`), 의미 검증 실패(`422`), 외부 connector 장애(`503`)를 구분한다.
- 네트워크·connector 오류를 정책 거부로 위장하지 않는다.

## 5. Core schema alignment

API enum은 ERD canonical enum을 그대로 사용한다.

| Enum | Values |
|---|---|
| `InitiationType` | `PATIENT_INITIATED`, `PROVIDER_INITIATED` |
| `MappingState` | `NO_MATCH`, `MULTIPLE_MATCH`, `IDENTITY_CONFLICT`, `UNVERIFIED`, `VERIFIED` |
| `ConsentState` | `PENDING`, `ACTIVE`, `REJECTED`, `WITHDRAWN`, `EXPIRED` |
| `GrantStatus` | `ISSUED`, `ACTIVE`, `CONSUMED`, `EXPIRED`, `REVOKED` |
| `AccessAction` | `study:view`, `study:download`, `study:pacs-transfer`, `study:mobile-export` |
| `RouteType` | `PACS_DIRECT`, `CLOUD_VIEW`, `CLOUD_DOWNLOAD`, `CLOUD_RELAY`, `MOBILE_VAULT` |
| `PreflightOverall` | `PASS`, `WARNING`, `FAIL` |
| `IntegrityStatus` | `PENDING`, `PASS`, `FAIL`, `NOT_VERIFIED` |

`MOBILE_VAULT`와 `study:mobile-export`는 계약 확장점은 유지하지만 실행 우선순위는 `CAPSTONE-P1`이다.

| Object | Required API fields | Response exclusion / restriction |
|---|---|---|
| `PatientMapping` | `mappingId`, `patientRefId`, `tenantId`, `hospitalId`, `state`, `verifiedAt`, `version` | local patient reference 원문·digest 제외 |
| `ExchangeSession` | `sessionId`, `patientRefId`, source/target, purpose, initiation type, state, validity, version | raw PHI 제외 |
| `AuthorizationDecision` | `decisionId`, `sessionId`, subject, action, resource scope, outcome, reason codes, policy version, decidedAt | 내부 rule source·stack 제외 |
| `TransferGrant` | `grantId`, `sessionId`, recipient, actions, resources, issuer/audience, issued/expires, status | GET에서 bearer token/secret material 제외 |
| `PreflightResult` | `preflightId`, `sessionId`, package/route, checks, overall result, started/completed | connector credential·filesystem path 제외 |
| `Provenance` | `provenanceId`, session/package, source evidence, transformations, transfers, destination receipt, integrity | 원시 임상 payload 제외 |

`ConsentArtifact`, `AuthorizationDecision`, `TransferGrant`는 서로 대체할 수 없다. `ALLOW` 판단은 Grant 발급의 필요조건이지 Grant 자체가 아니다.

Session 생성 계약은 `requestedActions`를 필수로 받으며 AccessAction의 네 값 중
1~4개를 중복 없이 선택한다. 이 불변 필드는 요청 의도만 기록하고 임상 접근을
허용하지 않는다. 후속 Consent/Grant 구현은 요청 범위와 유효한 동의의 교집합을
상한으로 검증해야 한다(아직 구현 완료 아님). 014 migration 이전 Session은 빈 배열
`NOT CAPTURED`를 유지하며 VIEW 또는 전체 권한을 추정해 채우지 않는다.
기존 idempotency key로 다른 action 선택을 재전송하면 409이며 신규 요청이 필요하다.
현재 변경은 내부 서비스/목표 OpenAPI 정렬로, 공개 HTTP route나 legacy UI 교체가 아니다.

후속 Session HTTP 어댑터는 dependency injection으로 격리 loopback 환경에서 검증한다.
신규 공개 서버에는 아직 등록하지 않는다. POST 본문은 4MiB / 최대 5초이며 canonical
compact JSON의 100 Study × 500 Series를 수용한다. 불필요한 whitespace/Unicode escape로
wire 크기가 제한을 넘는 요청은 413이다. 깊이 32 초과 및 모든 중복 decoded JSON key는
422로 거부한다. GET 본문·query token·percent-encoded/dot-normalized route를 허용하지
않으며, 민감 헤더 중복은 422이다. 응답은 no-store; 인증 실패와 권한이 확인된 DB 거부
감사는 구분한다. Session 생성은 여전히 REQUESTED이며 임상 접근이나 Grant를 발급하지 않는다.

## 6. State and precondition rules

Expiry maintenance identity is a separate internal contract:
[source-scoped enrollment and isolation](highpass-v3-expiry-maintenance-principal-contract.md).
It does not add a public API or clinical role. 016 enrollment and 017 persisted expiry
batch are isolated-tested. Worker scheduling/deployment identity/graceful drain remain
pending. 017 explicitly separates clinical and expiry policy-role membership; use a
dedicated nonowner pool and do not activate against an older runtime schema.

| Action | Required preconditions | Side effect on failure |
|---|---|---|
| Grant issue | session active, consent ACTIVE, authorization ALLOW, mapping/scope valid | none; DENY audit |
| Package create | active session, allowed Study/Series, source participant | no object retrieval outside scope |
| Viewer open | valid VIEW grant, correct audience/recipient/resource, unexpired/unrevoked | viewer URL/session not issued |
| Download | valid DOWNLOAD grant, consent permission permits download | transfer not started |
| PACS import | valid `study:pacs-transfer` grant, destination mapping VERIFIED, route valid, preflight PASS, package integrity PASS | connector and payload movement not invoked |
| Session cancel | cancellable state and matching version | grants revoked; running work cancellation requested and audited |

`WARNING` preflight는 `PACS_IMPORT`의 `PASS`로 취급하지 않는다. Capstone P0에서 import 전 필수 검사 중 하나라도 `FAIL` 또는 `WARNING`이거나 결과 자체가 없으면 import를 차단한다.

## 7. DICOMweb data-plane boundary

기존 QIDO-RS/WADO-RS Gateway는 별도 data plane 계약으로 유지한다.

- Control Plane이 발행한 TransferGrant를 header 또는 안전한 viewer session exchange로 전달한다.
- bearer token을 query string, fragment, browser local storage, Referer에 넣지 않는다.
- Gateway는 audience, issuer, expiry, revocation, hospital, user, Study, Series, action을 다시 검증한다.
- Orthanc 직접 접근은 network policy와 mTLS proxy로 차단한다.
- DICOM UID는 semantic validation을 수행하며 opaque 플랫폼 UUID와 혼용하지 않는다.

## 8. Compatibility and rollout

1. 현재 OpenAPI와 구현 테스트를 legacy baseline으로 동결한다.
2. v3 OpenAPI를 contract test 대상으로 추가하되 endpoint는 구현 전 `NOT IMPLEMENTED`로 유지한다.
3. 새 v3 테이블을 additive migration으로 생성한다.
4. 기존 consent/token/package/handoff 데이터를 v3 객체로 dual-write 또는 adapter mapping한다.
5. 동일 시나리오에 대해 legacy와 v3 판단 결과를 비교한다.
6. v3 read path를 먼저 전환하고 write path를 단계적으로 전환한다.
7. deprecation 기간과 rollback 조건을 승인한 뒤 legacy write를 중단한다.

rollback은 기존 API·테이블을 삭제하지 않은 상태에서 v3 route flag를 끄고 legacy read/write로 복귀한다. v3 감사·provenance 증적은 rollback 후에도 삭제하지 않는다.

## 9. UI and test impact

UI는 endpoint 교체 전에 adapter 계층을 사용해야 한다. 사용자에게는 ExchangeSession 상태, 일반화된 거부 사유, preflight 결과, token 만료 안내를 보여주되 내부 정책·connector 경로는 숨긴다.

필수 계약 테스트:

- schema/example validation과 미정의 필드 거부
- tenant/hospital mismatch 및 cross-tenant object reference 거부
- consent 없음·철회·만료·scope mismatch·action mismatch
- Grant 만료·철회·변조·재사용·audience/issuer mismatch
- idempotent retry와 payload conflict
- concurrent state transition의 `412`
- ambiguous PatientMapping과 preflight non-PASS 시 connector 미호출
- token/PHI/cert path/stack leak pattern scan
- provenance chain과 audit correlation completeness

## 10. Alignment gate

| Gate | Result | Evidence |
|---|---|---|
| Five core objects have explicit endpoint and schema boundaries | PASS-DOCUMENT | this document + target OpenAPI |
| Tenant and hospital semantics are separated | PASS-DOCUMENT | identity rules + ERD |
| Legacy API compatibility path is defined | PASS-DOCUMENT | mapping and rollout sections |
| Target OpenAPI parses and local references resolve | validation required | repository validation output |
| Server implementation and runtime DB alignment | NOT VERIFIED | implementation intentionally not started |
| Architecture/ERD/API approval | REVIEW REQUIRED | owner/security/data/API review pending |

이 문서의 `PASS-DOCUMENT`는 문서 내부 정렬만 의미하며 기능 구현, 런타임 시험 또는 운영 적합성 PASS가 아니다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`
## 2026-10-07 legacy DPoP enforcement implementation addendum

이 추가 계약은 기존 MVP API에만 적용한다. 목표 v3 OpenAPI가 구현됐음을 의미하지 않는다.
`POST /api/dicom-access/request`와 두 Ticket redeem 경로는 `DPoP` proof header를 받아
검증된 공개키를 signed access token의 `cnf.jkt`에 바인딩한다. 응답에
`tokenType: DPoP | Bearer`가 추가된다. 클라이언트 JSON의 thumbprint는 사용하지 않는다.
strict 환경에서는 proof 누락/잘못된 ingress는 403이며 Ticket proof 거부 시 Ticket을 소진하지 않는다.
보호 `GET /dicomweb/*` 경로는 바인딩된 토큰에 `Authorization: DPoP <token>`과
토큰 해시 `ath`를 포함한 매 요청의 새 proof가 필요하다. consent/scope/권한/만료도 계속 검증한다.
`GET /api/security/proof-policy`는 비민감 capability (`supported`, `required`, `replayScope`)만 공개한다.
legacy Bearer는 strict 모드에서 거부된다. 기본 호환 모드는 v3 보장으로 확대하지 않는다.
Gateway introspection도 메타데이터 없는 bound token을 ALLOW하지 않는다.
관련: FR-021~031/037~041, V3-SR-GRT-003, V3-AT-FIX-006.
영향: 내장 Viewer 발급/QR redeem/QIDO/WADO/rendered/download, HTTP 음성·Chrome trace 테스트.
PostgreSQL runtime은 내부 `dpop_replay_entries(proof_hash, expires_at)` ledger를 사용한다.
임상 엔티티 FK와 legacy bulk save 대상에서 제외하며 새로운 공개 임상 API는 추가하지 않는다.
`replayScope`는 `SHARED_POSTGRES` 또는 JSON 호환 `SINGLE_PROCESS`이다.
저장소 오류·clock skew는 정책상 403 DENY와 구분해 503 및 안전한 reasonCode를 반환한다.
토큰 발급/Ticket redeem/보호 DICOMweb/Gateway introspection에 적용하며 fail-open fallback은 없다.
감사 저장까지 실패하면 허용하지 않고 `auditStatus: NOT_RECORDED`를 반환한다.
신규 v3 API의 Proof of Possession 계약과 전체 API HA는 별도 gate이다.
표준 참고: [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html).

## Patient ceremony issuance boundary — 2026-10-08

[Internal challenge contract](highpass-v3-patient-challenge-issuance-contract.md)
is implemented only as a guarded internal service under approval capability.
Exact selector uses preparation/version, private patient/synthetic reauth, server
clause policy. First acknowledged commit returns memory-only nonce; same-key retry
returns original safe metadata with ISSUED_NONCE_UNAVAILABLE, not a usable nonce or
approval. No public route/OpenAPI operation is activated here. Existing UI/tests
and legacy consent APIs are not rewired. No synthetic gate implies real IdP MFA.

The [decision persistence contract](highpass-v3-patient-consent-decision-persistence-contract.md)
defines an outer ceremony/nonce command wrapping the existing exact patient command,
immutable contentVersion versus eventSequence and secret-free original receipt.
The internal service and additive026 now have [initial artifact PG evidence](../governance/highpass-v3-patient-decision-execution-2026-10-08.md).
This is PARTIAL internal Consent artifact implementation, not an implemented public
endpoint, AuthorizationDecision or Grant. Future
transport must use HTTPS/body/no-store/redacted errors and mandatory safe audit.
FR-001..005/014..020/037..041; CON-001..006/IAM-003/004/AUTH-001/004/TEN-003.

## Withdrawal/expiry contract preparation — 2026-10-08

[Proposed lifecycle contract](highpass-v3-consent-lifecycle-contract.md) separates own
patient withdrawal from actual maintenance expiry actor, expected eventSequence from
contentVersion and historical receipt from effective state/cascade delivery. It does
not add or activate OpenAPI/server operations. Legacy revoke/cancel APIs are unchanged.
Core admission/read policy choices L1~L5 require resolution before new DDL/service.

## Capstone Data Plane authorization — additive legacy contract, 2026-10-08

This is an implemented additive legacy internal operation, NOT a new v3 Grant,
not a change to the `/api/v3` target contract, and not distributed deployment proof.

`POST /gateway/data-plane/authorize` accepts JSON with `token`, `method: GET`,
canonical `path`, `clientIp`, `authorizationScheme: Bearer|DPoP`, and optional
`dpopProof`. Only `HIPASS_DATA_PLANE_SERVICE_TOKEN` authenticates its dedicated
`gateway:data-plane-authorize` scope. It must be distinct from internal/privacy
credentials and at least32 bytes. Generic internal services and administrators
cannot invoke this operation. Maximum body32KiB, strict UTF-8, no-store responses.

The configured `HIPASS_DATA_PLANE_PUBLIC_BASE_URL` must be an exact HTTPS origin;
`HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID` binds the Gateway to its source institution.
Internet callers cannot set trusted ingress directly: context is accepted only
from the dedicated authenticated Gateway. Deployment must protect this private
service path with TLS and restrict the service credential to that Gateway.

Only bounded DICOMweb Study/Series/Instance/frame/rendered/metadata routes are
accepted; raw Orthanc REST, POST/STOW, token-in-query, arbitrary query and bulk
Study downloads are denied. For Study listing, the Gateway MUST constrain QIDO
to the returned Study UID; for Series listing it MUST filter to returned allowed
Series UIDs. This contract alone does not provide that data forwarding implementation.

Authorization reuses signature/issuer/audience/log-hash checks, live consent,
expiry/revocation, DPoP proof/ath/replay storage, existing patient/doctor/hospital/
purpose/permission/scope evaluation, and additionally checks source binding plus
both hospitals' ACTIVE state. Returned Series scope intersects current consent
with the token. Successful response contains `active`, `tokenId`, `consentId`,
`doctorId`, source/target hospital, Study UID, allowed Series UIDs, permission,
expiry and auditSessionId; it contains neither raw token nor image/DEK bytes.
Unsuccessful response contains safe typed denial only; policy denials are audited.
Persistence/provider errors still fail closed; no cached ALLOW fallback is added.

Related FR-014~031/037~041. Seven focused tests include actual isolated loopback
HTTP service-principal enforcement and existing service/DPoP tests. This is not
external HTTPS, A-VM Gateway, Azure Control Plane, B Viewer or Key Vault evidence.
Existing Viewer/token URLs and all legacy endpoints remain unchanged. Next gate:
implement the standalone A Gateway client and scoped actual PACS forwarding,
completion audit, cloud metadata-only deployment guard, then distributed E2E.

### Follow-up Gateway implementation — 2026-10-08

`src/data-plane-gateway.js` and `scripts/data-plane-gateway.js` now implement the
standalone HTTPS listener/policy client/private mTLS PACS client. All three origins
must be HTTPS; CA and hostname verification cannot be disabled. The runner reads
service credentials and TLS material from external files, not source/argv.
Control requests contain token/proof/context only; these are never sent to PACS.
There is no synthetic/curated fallback. Study QIDO is constrained to the granted
UID AND response-filtered; Series QIDO is filtered to live consent/token scope.
Patient Name and Birth Date tags are removed from metadata responses. Single
Instance/frame bytes are buffered on A only with a32MiB cap; whole Study retrieval
is not supported. This bounded buffering is a capstone limitation, not a claim of
unlimited streaming or clinical image coverage.

Network bounds:5 seconds/32KiB for policy/report,10 seconds/32MiB for PACS,
Gateway headers/request10 seconds and socket25 seconds. Only selected headers
are sent upstream; tokens/proofs and forwarded client-supplied identity headers
cannot leak to PACS. HTML/unknown payload types are rejected.

Authorization returns an additional opaque `receipt`, HMAC-authenticated with a
Control-Plane-only key, namespace-separated from access tokens, valid for at most
30 seconds and bounded by token expiry. It binds request route, scope, actor,
hospital and audit session. `POST /gateway/data-plane/ready` uses the same dedicated
principal and accepts only receipt, `bytesPrepared` and `READY|UPSTREAM_FAILURE`.
It rejects forged/expired receipts and rechecks token state, hospital state,
current consent/permission/scope before acknowledging prepared bytes. Gateway
releases no bytes if acknowledgement fails or the Control API is unreachable.
Audit action is explicitly `DATA_PLANE_RESPONSE_PREPARED` or
`DATA_PLANE_UPSTREAM_FAILED`, NOT Viewer receipt/download completion. Response says
`delivery: NOT VERIFIED`. Receipt retries may duplicate append-only audit events;
exactly-once/multi-replica reporting is not claimed.

For Azure, `HIPASS_CONTROL_PLANE_ONLY=1` rejects legacy `/dicomweb`, clinical assets,
PACS import and raw research prepare/export paths before image operations. Existing
single-host development defaults remain unchanged. Metadata/auth/consent endpoints
and the internal policy/report remain available. Cloud deployment MUST enable
this guard and independently verify network isolation; a code guard alone is not
cloud deployment proof.

Thirteen focused tests passed, including actual isolated HTTP principal/guard/report
calls and actual loopback TLS trust, wrong hostname, untrusted self-signed cert,
response limit and timeout. PACS/policy forwarding tests use explicit test doubles;
they are NOT real A Gateway or actual hospital exchange evidence. Runtime VM/cloud
deployment and B Viewer completion audit remain required.
