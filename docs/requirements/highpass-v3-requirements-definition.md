# Highpass v3 Requirements Definition

2026-10-08: 김범희 adopted Consent lifecycle L1~L5 in the
[policy record](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md).
CON-003~006 retain their requirements; policy approval does not establish implementation,
technical PASS, public API activation or external operational/legal approval.

2026-10-08 policy follow-up: 김범희 adopted D1..D4 proposals, D5 patient-artifact-first
sequencing and D6 testing in the [decision record](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md).
[Patient command contract](../api/highpass-v3-patient-consent-command-contract.md)
starts pure input validation; persisted approval/Decision/Grant, later transitions,
runtime and full Requirements completion remain incomplete. This is not approval
of every baseline requirement or independent new-test evidence.

## Lifecycle dependency refinement — 2026-10-08

ID-001..006/EX-001..007/CON-001..006/AUTH-001..005/GRT-001..005 retain their original
scope. [Dependency contract](../api/highpass-v3-lifecycle-dependency-contract.md)
identifies bootstrap and directed-edge proposals, not newly approved requirements.
Own-ref Mapping, source creation and INVITED participation never imply patient approval.
New v3 consent/decision/grant and full clinical transitions remain NOT IMPLEMENTED or
NOT VERIFIED; legacy component results do not upgrade those requirements to PASS.

문서 버전: `v3.0-DRAFT-BASELINE`
기준일: 2026-09-12
상태: **REQUIREMENTS BASELINE / REVIEW REQUIRED**
상위 기준: [Highpass v3 Architecture & Product Baseline](../baseline/HIGHPASS-V3-BASELINE.md)

Normative 범위: [Capstone MVP Boundary & Productionization Policy](../baseline/CAPSTONE-MVP-BOUNDARY.md)

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. 목적과 범위

이 문서는 Highpass v3의 구현 전에 동결해야 할 제품·기능·비기능 요구사항이다. 현행 v2.1과 Mobile-Core 요구사항은 구현 자산 및 호환성 입력으로 보존하지만, 향후 목표 요구사항의 기준은 본 문서다.

제품 정의:

> Highpass는 환자의 명시적 요청 또는 동의를 기반으로 의료영상을 의료기관 간에 안전하게 조회·전송·다운로드하고, 정책이 허용하는 경우 임시 Cloud Exchange Copy 또는 환자 Mobile Secure Vault를 이용해 이동시키는 Patient-Controlled Medical Imaging Mobility SaaS다.

핵심 흐름:

```text
Identity → Exchange Session → Consent / Authorization → Transfer Grant
→ Imaging Package → Route → Access / Transfer → Provenance → Audit
```

## 2. 규범 용어와 판정

- `MUST`: P0/P1 해당 릴리스 완료에 필수다.
- `MUST NOT`: 예외 없이 금지하며, 변경에는 ADR과 보안검토가 필요하다.
- `SHOULD`: 원칙적으로 적용하고 미적용 사유와 잔여위험을 기록한다.
- 구현 상태는 `IMPLEMENTED-LOCAL`, `PARTIAL`, `NOT IMPLEMENTED`, `BLOCKED-EXTERNAL`, `DEFERRED`로 기록한다.
- 시험은 `PASS`, `FAIL`, `NOT VERIFIED`, `ENVIRONMENT BLOCKED`만 사용한다.
- 설계상 기대 결과를 실행 PASS로 기록하지 않는다.

모든 요구사항은 `CAPSTONE-P0`, `CAPSTONE-P1`, `POST-MVP`, `PRODUCTIONIZATION`, `OUT-OF-SCOPE` 중 하나로 분류한다. 아래 기존 `P` 열의 `P0/P1/P2` 표기는 각각 `CAPSTONE-P0/CAPSTONE-P1/POST-MVP`의 호환 축약이며, 신규 Architecture/ERD/API/Acceptance 산출물에는 정식 분류명만 사용한다. 실제 IdP·KMS·병원 PACS·실환자 identity·법률검토는 관련 기술 extension point와 별개로 `PRODUCTIONIZATION`이다.

## 3. 이해관계자와 행위자

| Actor | Responsibility | Trust level |
|---|---|---|
| Patient | 요청·동의·철회·모바일 export 승인 | authenticated end user |
| Source clinician/hospital | 원본 선택·제공·source receipt | hospital trust zone |
| Destination clinician/hospital | provider request·VIEW/DOWNLOAD/PACS_IMPORT | hospital trust zone |
| Hospital administrator | 사용자·connector·정책·PACS capability 관리 | privileged tenant actor |
| Security administrator | 감사·탐지·incident investigation | privileged scoped actor |
| Highpass platform | Session·Consent·Grant·Route·Audit orchestration | cloud control plane |
| Hospital Connector | PACS/DICOMweb adapter와 local audit | workload identity |
| PACS/Orthanc | source/destination DICOM repository | protected data plane |
| Viewer | 승인된 DICOMweb 표시 | untrusted browser boundary |
| Mobile Secure Vault | 환자 보유 암호화 copy | semi-trusted patient edge |

## 4. Architecture invariants

1. Source Hospital PACS가 기본 Source/System of Record다.
2. Control Plane은 원본 DICOM Pixel Data와 raw DEK를 지속 저장하지 않는다.
3. Hospital-local patient ID를 global patient ID로 사용하지 않는다.
4. Consent, AuthorizationDecision, TransferGrant는 서로 다른 객체다.
5. ExchangeSession과 ImagingPackage의 수명주기를 분리한다.
6. 모든 access mode는 명시적 grant scope가 있어야 한다.
7. Preflight가 요구되는 전송은 PASS 또는 승인된 WARNING 전에는 payload를 이동하지 않는다.
8. 모든 의료영상 이동은 Provenance와 Audit로 추적한다.
9. Cross-tenant 접근은 fail closed 한다.
10. 실제 개인정보·운영 secret·실제 병원 연동을 로컬 MVP 증적으로 대체하지 않는다.

## 5. Business requirements

| ID | Requirement | Priority | Success measure |
|---|---|---|---|
| V3-BR-001 | 환자가 명시적으로 통제하는 병원 간 의료영상 이동을 제공해야 한다. | P0 | 무동의/무권한 이동 0건 |
| V3-BR-002 | CD 수작업을 VIEW, DOWNLOAD, PACS_IMPORT의 승인된 디지털 경로로 대체해야 한다. | P0 | access mode별 수용시험 |
| V3-BR-003 | 의료영상 원본 책임은 Source Hospital에 유지하고 Highpass는 Exchange Broker 역할을 해야 한다. | P0 | copy classification 누락 0건 |
| V3-BR-004 | 요청부터 목적지 도착·삭제까지 출처·무결성·행위를 추적할 수 있어야 한다. | P0 | 필수 provenance/audit event 누락 0건 |
| V3-BR-005 | 표준·법률·인증·병원 승인 상태를 기술시험과 구분해야 한다. | P0 | 허위 PASS/준수 주장 0건 |
| V3-BR-006 | 환자가 선택할 경우 Secure Medical Capsule과 Mobile Secure Vault로 이동할 수 있어야 한다. | P1 | device-bound mobile acceptance |

## 6. Functional requirements

### 6.1 Identity and patient reconciliation

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-ID-001 | 시스템은 불투명한 `PatientRef`를 발급하고 local patient ID를 전역 식별자로 사용하지 않아야 한다. | P0 | schema/API review, cross-hospital fixture | PARTIAL |
| V3-FR-ID-002 | 기관별 local patient reference는 보호된 값과 검색용 digest를 분리해 `PatientMapping`으로 관리해야 한다. | P0 | data model, secret/PII inspection | PARTIAL |
| V3-FR-ID-003 | Mapping 상태는 `NO_MATCH`, `MULTIPLE_MATCH`, `IDENTITY_CONFLICT`, `UNVERIFIED`, `VERIFIED`를 지원해야 한다. | P0 | state transition test | PARTIAL — local own-ref service/PG/HTTP tested; runtime/cross-institution pending |
| V3-FR-ID-004 | 이름·생년월일 등만으로 자동 병합해서는 안 되며 충돌은 사람 검토 대상으로 보내야 한다. | P0 | ambiguous-match negative test | PARTIAL |
| V3-FR-ID-005 | Mapping 생성·변경·충돌해결에는 evidence digest, actor, 기관, 이전/신규 상태를 감사해야 한다. | P0 | audit completeness test | PARTIAL — local transactional outbox/constraints/HTTP tested; runtime/full audit pending |
| V3-FR-ID-006 | Destination Mapping이 `VERIFIED`가 아니면 PACS_IMPORT를 거부해야 한다. | P0 | `TC-IDENTITY-01` | NOT IMPLEMENTED |

### 6.2 Exchange Session

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-EX-001 | 모든 교류는 고유 `ExchangeSession`을 aggregate root로 생성해야 한다. | P0 | API/data contract | PARTIAL — internal create PG tested, runtime/HTTP pending |
| V3-FR-EX-002 | Session은 `PATIENT_INITIATED`와 `PROVIDER_INITIATED`를 구분해야 한다. | P0 | flow tests | PARTIAL — synthetic patient/admin create PG tested, consent workflow pending |
| V3-FR-EX-003 | Session은 Baseline의 canonical state machine과 terminal state 불변조건을 따라야 한다. | P0 | transition/property tests | NOT IMPLEMENTED |
| V3-FR-EX-004 | Session은 source/destination, requester, patientRef, purpose, access modes, expiry, correlation을 가져야 한다. | P0 | required-field contract | PARTIAL via transfer request |
| V3-FR-EX-005 | 하나의 Session은 복수 Study를 선택할 수 있고 각 선택은 immutable snapshot으로 고정해야 한다. | P0 | multi-Study scope test | PARTIAL — internal create/hash/append denial PG tested; downstream action snapshot pending |
| V3-FR-EX-006 | 생성·재시도는 idempotency key를 사용하고 중복 Session·중복 action을 만들지 않아야 한다. | P0 | concurrent/retry test | PARTIAL — internal create concurrent/lost ACK PG tested; later actions pending |
| V3-FR-EX-007 | 만료·철회·취소는 신규 grant·key release·access를 즉시 차단해야 한다. | P0 | expiry/revocation suite | PARTIAL |

### 6.3 Consent Artifact

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-CON-001 | Consent는 Boolean이 아닌 독립된 versioned evidence artifact여야 한다. | P0 | schema/contract review | PARTIAL |
| V3-FR-CON-002 | Consent는 patientRef, source/recipient, purpose, resource scope, allowed actions, validity, policy/evidence reference를 포함해야 한다. | P0 | required-field tests | PARTIAL |
| V3-FR-CON-003 | canonical 상태 `PENDING`, `ACTIVE`, `REJECTED`, `WITHDRAWN`, `EXPIRED`와 허용 전이를 지원해야 한다. | P0 | transition tests | PARTIAL; compatibility needed |
| V3-FR-CON-004 | 동의 내용·scope·기간 변경은 in-place 확대가 아니라 새 version과 새 evidence를 생성해야 한다. | P0 | version/immutability test | NOT IMPLEMENTED |
| V3-FR-CON-005 | WITHDRAWN/EXPIRED consent는 신규 권한을 발급하지 않아야 하며 기존 실행권한의 정책효과를 기록해야 한다. | P0 | withdrawal/expiry negative | PARTIAL |
| V3-FR-CON-006 | Consent evidence 조회는 환자와 승인된 관리자에게 최소 범위로 제한해야 한다. | P0 | role/tenant negative | PARTIAL |

### 6.4 Authorization and Transfer Grant

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-AUTH-001 | Consent 확인과 현재 actor의 Authorization 판단을 분리해야 한다. | P0 | service boundary review | PARTIAL |
| V3-FR-AUTH-002 | 서버는 role, actor hospital, source/destination, consent, purpose, patient, Study/Series/Instance, action, time를 모두 검증해야 한다. | P0 | RBAC+ABAC negative suite | IMPLEMENTED-LOCAL current flow |
| V3-FR-AUTH-003 | 조건 하나라도 불일치하면 reason code와 함께 fail closed 해야 한다. | P0 | one-condition-at-a-time negatives | IMPLEMENTED-LOCAL |
| V3-FR-AUTH-004 | 브라우저 UI 표시 여부를 권한 통제로 간주하지 않아야 한다. | P0 | direct API negative | IMPLEMENTED-LOCAL |
| V3-FR-AUTH-005 | AuthorizationDecision은 decision, reason, policy version, context digest, session/actor/tenant, timestamp를 기록해야 한다. | P0 | audit/data contract | PARTIAL |
| V3-FR-GRT-001 | ALLOW 뒤에만 recipient/resource/action/TTL 제한 `TransferGrant`를 발행해야 한다. | P0 | issuance ordering test | PARTIAL via token |
| V3-FR-GRT-002 | grant scope는 `study:view`, `study:download`, `study:pacs-transfer`, `study:mobile-export`를 독립적으로 표현해야 한다. | P0 | scope matrix | PARTIAL |
| V3-FR-GRT-003 | grant는 issuer, audience, jti/grantId, issued/expiry, session, recipient, immutable resource snapshot을 검증해야 한다. | P0 | token contract/negative | PARTIAL |
| V3-FR-GRT-004 | grant 또는 그 표현에는 DICOM payload, DEK/KEK, password, hardware key, 장기 credential을 포함하지 않아야 한다. | P0 | schema/log/secret scan | IMPLEMENTED-LOCAL token/package boundaries |
| V3-FR-GRT-005 | 철회·만료·재사용·변조·audience/recipient 불일치는 DENY하고 감사해야 한다. | P0 | negative suite | PARTIAL |

### 6.5 Imaging Package and Cloud copy

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-PKG-001 | ImagingPackage는 route-neutral payload abstraction이며 Session과 별도 수명주기를 가져야 한다. | P0 | domain/API review | PARTIAL mobile-coupled |
| V3-FR-PKG-002 | Package는 복수 Study와 그 Series/SOP Instance snapshot을 표현해야 한다. | P0 | multi-Study manifest test | NOT IMPLEMENTED |
| V3-FR-PKG-003 | canonical manifest는 package/version/source/scope/object count/hash/encryption/provenance reference를 포함해야 한다. | P0 | schema/fixture validation | PARTIAL |
| V3-FR-PKG-004 | 임상 식별 metadata와 DICOM payload는 저장 시 승인된 AEAD로 암호화해야 한다. | P0 | crypto roundtrip/tamper | PARTIAL domain |
| V3-FR-PKG-005 | scope 밖 object 추가, 누락, duplicate conflict, manifest 변경을 거부해야 한다. | P0 | tamper/scope tests | PARTIAL domain |
| V3-FR-PKG-006 | 대용량 payload는 hash와 순서를 가진 chunk로 전송하며 idempotent resume를 지원해야 한다. | P0 | reorder/missing/resume | PARTIAL domain |
| V3-FR-PKG-007 | Control Plane DB는 원본 Pixel Data를 지속 저장하지 않아야 한다. | P0 | schema/storage inspection | IMPLEMENTED-LOCAL current architecture |
| V3-FR-CLOUD-001 | Cloud payload 역할은 `TEMPORARY EXCHANGE COPY`로 제한해야 한다. | P0 | architecture/storage contract | NOT IMPLEMENTED |
| V3-FR-CLOUD-002 | Cloud object storage는 ciphertext만 받고 raw DEK와 복호화 capability를 보유하지 않아야 한다. | P0 | data-flow/key-boundary test | NOT IMPLEMENTED |
| V3-FR-CLOUD-003 | retention은 데이터 유형·목적별 configuration/policy version으로 관리해야 한다. | P0 | config/boundary test | PARTIAL |
| V3-FR-CLOUD-004 | 완료·만료·철회 뒤 delete와 key-destruction 결과를 receipt와 audit로 남겨야 한다. | P0 | lifecycle/time-travel test | PARTIAL domain |

### 6.6 Route and Preflight

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-ROUTE-001 | P0 Route는 `PACS_DIRECT`, `CLOUD_VIEW`, `CLOUD_DOWNLOAD`, `CLOUD_RELAY`를 구분해야 한다. | P0 | enum/decision table | NOT IMPLEMENTED |
| V3-FR-ROUTE-002 | route 결정은 destination capability, grant action, data policy, availability를 사용하는 결정적 규칙이어야 한다. | P0 | decision table tests | NOT IMPLEMENTED |
| V3-FR-ROUTE-003 | MVP routing에 AI 또는 불투명한 모델 결정을 사용하지 않아야 한다. | P0 | dependency/code review | NOT IMPLEMENTED |
| V3-FR-ROUTE-004 | P1 Route는 `MOBILE_VAULT`를 별도 access route로 지원해야 한다. | P1 | mobile route decision table | NOT IMPLEMENTED |
| V3-FR-PRE-001 | payload 이동 전에 destination availability와 endpoint identity를 확인해야 한다. | P0 | timeout/TLS failure tests | NOT IMPLEMENTED |
| V3-FR-PRE-002 | PACS_IMPORT 전에 destination PatientMapping `VERIFIED`를 확인해야 한다. | P0 | ambiguous mapping negative | NOT IMPLEMENTED |
| V3-FR-PRE-003 | Study UID, SOP Class, Transfer Syntax, storage/DICOMweb capability를 검사해야 한다. | P0 | capability fixtures | PARTIAL PHR mapping only |
| V3-FR-PRE-004 | consent/authorization/grant validity, expiry, scope와 quota를 다시 검사해야 한다. | P0 | stale grant/quota negatives | PARTIAL |
| V3-FR-PRE-005 | 결과는 PASS/FAIL/WARNING과 안전한 reason code, checkedAt, capability version을 가져야 한다. | P0 | result contract | NOT IMPLEMENTED |
| V3-FR-PRE-006 | FAIL은 payload 이동 전 종료하고 WARNING 진행은 명시 정책과 감사가 있어야 한다. | P0 | spy/assert no transfer | NOT IMPLEMENTED |

### 6.7 Access, DICOMweb, Viewer and PACS import

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-ACC-001 | QIDO-RS는 승인된 Study/Series/Instance 범위만 조회해야 한다. | P0 | QIDO scope tests | IMPLEMENTED-LOCAL |
| V3-FR-ACC-002 | WADO-RS는 승인된 Instance/Frame만 필요한 시점에 반환해야 한다. | P0 | WADO/negative/lazy test | PARTIAL |
| V3-FR-ACC-003 | Viewer는 `study:view` grant에서만 열리고 token을 URL·browser persistent storage에 두지 않아야 한다. | P0 | browser/config test | IMPLEMENTED-LOCAL/partial cache |
| V3-FR-ACC-004 | DOWNLOAD는 `study:download`가 없으면 UI와 API 모두 거부해야 한다. | P0 | direct API/UI negative | IMPLEMENTED-LOCAL current permission |
| V3-FR-ACC-005 | PACS_IMPORT는 `study:pacs-transfer`, VERIFIED mapping/package, PASS preflight를 모두 요구해야 한다. | P0 | STOW negative matrix | NOT IMPLEMENTED |
| V3-FR-ACC-006 | B Connector는 P0 PACS_IMPORT에서 STOW-RS를 우선 사용해야 한다. | P0 | connector integration | NOT IMPLEMENTED |
| V3-FR-ACC-007 | import는 object별 success/failure, duplicate/idempotency, partial result와 destination receipt를 제공해야 한다. | P0 | partial/duplicate tests | PARTIAL contract |
| V3-FR-ACC-008 | Browser·Cloud·사용자는 PACS/Orthanc를 직접 우회 접근하지 못해야 한다. | P0 | network/mTLS negative | IMPLEMENTED-LOCAL |
| V3-FR-ACC-009 | 인증·인가 오류와 DICOM/PACS/네트워크 오류를 안전한 code로 구분해야 한다. | P0 | fault injection/API contract | PARTIAL |
| V3-FR-ACC-010 | DICOMweb을 지원하지 않는 승인된 legacy 환경의 C-STORE adapter는 Connector 내부 POST-MVP 기능으로 격리해야 한다. | P2 | legacy connector integration | NOT IMPLEMENTED |

### 6.8 Provenance, integrity and audit

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-PROV-001 | 각 Package는 source/ingest/transfer/destination evidence를 연결한 Provenance를 가져야 한다. | P0 | data/receipt chain | NOT IMPLEMENTED |
| V3-FR-PROV-002 | Provenance는 source hospital/PACS, retrieval time, DICOM object identities, route, transformation history를 추적해야 한다. | P0 | required-field test | PARTIAL fragments |
| V3-FR-PROV-003 | BIT_PRESERVING 전송은 source와 destination object hash 및 identity를 비교해야 한다. | P0 | end-to-end hash test | NOT IMPLEMENTED |
| V3-FR-PROV-004 | TRANSCODED 전송은 DICOM identity·semantic validation·transformation history로 검증해야 한다. | P0 | controlled transcode fixtures | NOT IMPLEMENTED |
| V3-FR-PROV-005 | HTTP/STOW 성공 또는 동일 UID만으로 integrity PASS를 선언하지 않아야 한다. | P0 | false-positive negative | NOT IMPLEMENTED |
| V3-FR-AUD-001 | identity/session/consent/grant/preflight/access/transfer/integrity/revoke/delete 주요 이벤트를 감사해야 한다. | P0 | event coverage test | PARTIAL |
| V3-FR-AUD-002 | audit는 actor/tenant/hospital/patientRef/session/consent/grant/package/action/result/reason/time/trace를 포함해야 한다. | P0 | schema completeness | PARTIAL |
| V3-FR-AUD-003 | audit에 PHI, raw local ID, token, key, DICOM payload를 불필요하게 기록하지 않아야 한다. | P0 | log/secret/PII scan | PARTIAL |
| V3-FR-AUD-004 | 일반 API는 감사로그 수정·삭제를 제공하지 않고 무결성 chain을 검증해야 한다. | P0 | mutation/hash tests | IMPLEMENTED-LOCAL |
| V3-FR-AUD-005 | 반복 DENY·만료 token·대량 조회/다운로드·타기관·integrity/key 실패를 탐지해야 한다. | P0 | anomaly fixtures | PARTIAL |

### 6.9 Multi-tenant SaaS and Hospital Connector

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-TEN-001 | 모든 tenant-owned aggregate는 immutable `tenantId`/organization ownership을 가져야 한다. | P0 | schema/creation test | PARTIAL |
| V3-FR-TEN-002 | 모든 read/write는 principal tenant, hospital, resource ownership을 서버에서 검사해야 한다. | P0 | cross-tenant matrix | PARTIAL |
| V3-FR-TEN-003 | Tenant A는 Tenant B patient/mapping/session/package 목록을 열람하지 못해야 한다. | P0 | `TC-TENANT-01` | NOT VERIFIED |
| V3-FR-TEN-004 | DB RLS는 defense-in-depth로 사용하되 애플리케이션 인가를 대체하지 않아야 한다. | P0 | DB/app dual negative | PARTIAL |
| V3-FR-CONN-001 | Hospital Connector P0는 DICOM/DICOMweb, capability, queue/retry, local audit, cloud authentication 인터페이스를 정의해야 한다. | P0 | interface review | PARTIAL design |
| V3-FR-CONN-002 | Connector는 병원망에서 outbound secure connection을 기본으로 하고 PACS를 public Internet에 노출하지 않아야 한다. | P0 | network topology test | PARTIAL local |
| V3-FR-CONN-003 | 모든 connector call은 mTLS identity, finite timeout, bounded retry, no fail-open을 적용해야 한다. | P0 | TLS/fault tests | PARTIAL |

### 6.10 Mobile Secure Vault — P1

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-FR-MOB-001 | Mobile Vault는 환자 측 Secure Edge이며 일반 파일 저장소가 아니어야 한다. | P1 | platform storage inspection | PARTIAL domain |
| V3-FR-MOB-002 | payload는 encrypted manifest/DICOM/wrapped DEK/integrity/auth data를 가진 Secure Medical Capsule이어야 한다. | P1 | capsule schema/tamper | PARTIAL domain |
| V3-FR-MOB-003 | device hardware-backed key, device binding, user re-authentication 없이는 decrypt하지 않아야 한다. | P1 | original/foreign device test | BLOCKED-EXTERNAL device |
| V3-FR-MOB-004 | QR은 opaque requestId, hospital, nonce, expiry, signature만 허용하고 PHI/DICOM/key/장기 token을 금지해야 한다. | P1 | QR schema/scan | IMPLEMENTED-LOCAL ticket domain |
| V3-FR-MOB-005 | lost/revoked/expired/copied device 또는 capsule은 key release와 access를 거부해야 한다. | P1 | device lifecycle negatives | PARTIAL domain |
| V3-FR-MOB-006 | 일반 backup/cloud sync/share/gallery/export를 차단하고 삭제·key destruction receipt를 남겨야 한다. | P1 | platform backup/share/delete | PARTIAL domain |

## 7. Non-security quality requirements

보안 요구사항은 [Highpass v3 Security Requirements](../security/highpass-v3-security-requirements.md)에 별도 정의한다.

| ID | Requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-NFR-REL-001 | 모든 network/polling 작업은 finite timeout과 deterministic exit를 가져야 한다. | P0 | fault/timeout tests | PARTIAL |
| V3-NFR-REL-002 | retry는 retryable technical failure와 idempotency가 있는 작업에만 bounded backoff로 적용해야 한다. | P0 | policy-vs-network fault tests | PARTIAL |
| V3-NFR-REL-003 | partial transfer는 성공·실패 object를 보존하고 silent success로 처리하지 않아야 한다. | P0 | partial STOW fixture | NOT IMPLEMENTED |
| V3-NFR-INT-001 | QIDO/WADO/STOW 계약은 선택한 DICOM PS3.18 edition과 media type/error 동작을 문서화해야 한다. | P0 | conformance contract | PARTIAL |
| V3-NFR-INT-002 | PS3.15/IHE는 구현 actor/profile/option 시험 전 conformance를 주장하지 않아야 한다. | P0 | document/release gate | IMPLEMENTED documentation |
| V3-NFR-PERF-001 | Study→Series→Instance→Frame lazy loading을 우선하고 전체 Study 선다운로드를 기본값으로 두지 않아야 한다. | P0 | network trace | PARTIAL |
| V3-NFR-OBS-001 | traceId/auditSessionId/sessionId로 control·connector·imaging·receipt를 상호연결해야 한다. | P0 | distributed trace fixture | PARTIAL |
| V3-NFR-UX-001 | 상태·허용 action·거부·만료·합성데이터·비운영 배지를 색상 외 텍스트/아이콘으로 표시해야 한다. | P0 | accessibility/UI review | PARTIAL |
| V3-NFR-TST-001 | 모든 P0 요구사항은 test ID, SHA, 환경, 명령, 결과, evidence 위치를 가져야 한다. | P0 | traceability audit | PARTIAL |
| V3-NFR-COMP-001 | PIPA/ISMS-P/병원 승인/운영 준비는 외부 검토 전 DEFERRED/BLOCKED로 표시해야 한다. | P0 | release document scan | IMPLEMENTED documentation |

## 8. Legacy compatibility

| Legacy group | v3 destination | Decision |
|---|---|---|
| FR-001~005 Consent | V3-FR-CON-* | MODIFY: evidence/version/state 확장 |
| FR-006~009 Imaging list | V3-FR-ACC-001/002 | KEEP |
| FR-010~020 Policy | V3-FR-AUTH-* | KEEP/MODIFY: Session/Tenant attributes 추가 |
| FR-021~025 Token | V3-FR-GRT-* | MODIFY: TransferGrant representation으로 명확화 |
| FR-026~031 Gateway | V3-FR-ACC/CONN/PRE-* | KEEP/MODIFY |
| FR-032~036 Viewer | V3-FR-ACC-003/004, NFR-UX/PERF | KEEP/MODIFY |
| FR-037~041 Audit | V3-FR-AUD/PROV-* | KEEP/MODIFY: Provenance 분리 |
| FR-042~046 Privacy/research | 별도 Privacy domain | KEEP, 임상 grant의 근거로 사용 금지 |
| Mobile-Core Device/Crypto/Handoff | V3-FR-PKG/MOB/GRT-* | MODIFY: 공통 package P0, mobile edge P1 |

## 9. Requirements completion gate

본 문서의 요구사항 정의는 작성 완료되었으나 승인과 구현은 미완료다. 다음 조건이 충족되면 `Requirements v3 COMPLETE`로 판정한다.

- Product/medical/security/privacy reviewer가 requirement wording과 P0/P1을 승인
- 각 P0 ID가 Security Requirement와 Traceability Matrix에 누락 없이 연결
- 모호한 TTL/보존기간/성능 숫자는 정책 owner와 검증 방법이 지정됨
- GATE-03/11/13/14/15의 open decision이 ADR로 종결됨
- legacy 요구사항의 삭제 없는 migration mapping 승인

현재 판정: **PARTIAL — DOCUMENT COMPLETE, SCOPE CLASSIFIED, REVIEW/APPROVAL PENDING**
