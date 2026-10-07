# Highpass v3 Architecture & Product Baseline

상태: **ESTABLISHED — DESIGN TARGET / ARCHITECTURE REVIEW REQUIRED**
기준일: 2026-09-12
Repository 기준: `87b052331369ec42f2d90277fc2dacc3be326863`
구현 판정: **NOT IMPLEMENTATION READY**

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

이 문서는 Highpass v3의 목표 제품·도메인·아키텍처 기준선이다. 현행 실행 기준인 v2.1과 Mobile-Core 자산을 삭제하거나 구현 완료로 바꾸지 않는다. 설계 기준선은 확정하지만 실제 코드 전환은 ADR 승인, P0 구현계획, 정상·음성 시험 증적을 거쳐야 한다.

하위 규범 문서는 [Capstone MVP Boundary](CAPSTONE-MVP-BOUNDARY.md), [Highpass v3 Requirements](../requirements/highpass-v3-requirements-definition.md), [Security Requirements](../security/highpass-v3-security-requirements.md), [Traceability Matrix](../traceability/highpass-v3-traceability-matrix.md) 순으로 사용한다.

## A. Current State

| 영역 | 확인된 현재 상태 | Repository 증적 | 판정 |
|---|---|---|---|
| 제품 기준선 | v2.1 원격 DICOMweb MVP와 Mobile-Core 목표가 병존 | `docs/REQUIREMENTS.md`, `docs/requirements/*` | PARTIAL |
| 환자 식별 | 내부 환자 참조, 기관별 보호 참조, 합성 FHIR 매핑이 있으나 독립 `PATIENT_MAPPING` 수명주기 없음 | `patient_identity_refs`, PHR mapping 문서·시험 | PARTIAL |
| 동의·인가 | 동의 상태/기간/기관/목적/Study·Series와 RBAC+ABAC를 서버에서 검증 | `src/services.js`, `test/hipass-service.test.js` | PASS — 현행 범위 |
| 단기 접근 | issuer, audience, expiry, jti, scope, 철회 및 해시 기반 기록 | `src/auth.js`, `src/services.js`, token 시험 | PASS — 현행 범위 |
| DICOMweb | QIDO-RS/WADO-RS와 mTLS Orthanc 경계 구현 | `src/orthanc-client.js`, Compose, E2E/음성 시험 | PASS — 로컬 MVP |
| STOW/PACS import | OpenAPI·DDL·정책 계약만 존재하며 실제 B PACS 종단 없음 | Mobile-Core OpenAPI, `pacs_imports` | NOT VERIFIED |
| Imaging Package | AES-256-GCM package, manifest, chunk, receiver, key-release, transient decrypt 도메인 시험 | `src/mobile-*.js`, 관련 단위시험 | PARTIAL — 도메인 단위 |
| Cloud exchange copy | Relay/cache/암호화 객체 수명주기 설계와 테이블만 존재 | LLD, `temporary_cache_objects` | NOT VERIFIED |
| Viewer | OHIF 정적 Viewer와 승인된 원격조회 경로 존재 | `ohif/`, `Dockerfile.ohif`, E2E | PASS — 원격조회 범위 |
| 감사·탐지 | append-only 경로, hash chain, 정책 거부·이상행위 규칙 | 서비스·감사 시험 | PASS — 현행 범위 |
| Provenance | hash/receipt/audit 조각은 있으나 독립 provenance 객체와 종단 검증 없음 | manifest, delivery receipt, audit | PARTIAL |
| Tenant isolation | hospital scope, 역할/ABAC, 일부 RLS 설계가 있으나 전 도메인 `tenant_id` 강제 미완료 | DB migration, auth tests | PARTIAL |
| Mobile Vault | 암호문 전용 인메모리 도메인 구현; 실제 Android/iOS secure storage·attestation 없음 | WBS-05~12 코드·시험 | PARTIAL |
| 외부 연동 | 실제 IdP·KMS/HSM·병원 PACS·병원망·외부 Staging 미제공 | integration 문서 | BLOCKED — EXTERNAL RESOURCE |

현재 검증 기록은 WBS-12 완료 시점의 Node suite 193/193 및 `security:gate` PASS다. 이 문서 작업에서는 코드를 변경하거나 해당 시험을 재실행하지 않았으므로 새로운 실행 증적을 주장하지 않는다.

## B. Baseline Conflicts

| Existing | Target | Conflict | Decision | Migration impact |
|---|---|---|---|---|
| v2.1: 단일 Study/Series 원격조회 중심 | 한 Session에 복수 Study를 포함하는 Imaging Package | payload와 workflow 결합 | v2.1 API 유지, v3 aggregate를 증분 추가 | 기존 token scope를 package snapshot scope로 매핑 |
| Mobile-Core: 모바일 package/handoff를 P0 | v3: Cloud Exchange·STOW·Provenance P0, Mobile Vault P1 | 일정·Critical Path 충돌 | 모바일 도메인 코드는 보존하되 제품 P1로 재분류 | WBS 번호·완료 증적은 유지, 릴리스 우선순위만 변경 |
| PHR 공동권고: P0는 `VIEW_ONLY` 단일 수직경로 | v3: VIEW/DOWNLOAD/PACS_IMPORT를 독립 P0 access mode로 설계 | 최소 시연범위와 제품 P0 정의 충돌 | CAPSTONE demo는 VIEW_ONLY 유지, v3 P0 DoD는 별도 grant 시험을 요구 | PM 일정 승인 전 STOW를 완료로 간주하지 않음 |
| 동의 상태 `ACTIVE/REVOKED/EXPIRED` 및 Mobile-Core의 DRAFT/APPROVED 계열 | v3 `PENDING/ACTIVE/REJECTED/WITHDRAWN/EXPIRED` | 상태 의미와 이벤트 이름 불일치 | v3 canonical 상태 채택, compatibility mapper 설계 | 즉시 DB enum 변경 금지; dual-read/dual-event 필요 |
| TransferRequest/Handoff가 workflow 중심 | `EXCHANGE_SESSION`이 상위 aggregate | 핵심 업무 객체 부재 | NEW Exchange Session이 기존 request/handoff를 소유 | 기존 ID를 correlation/legacyRef로 보존 |
| consent, token, ticket가 일부 문서에서 혼용 | Consent Artifact / Authorization / Transfer Grant 분리 | 법적 증거와 실행권한 결합 위험 | 세 객체를 분리하고 상호 참조만 허용 | token 발급 API를 grant issuance 뒤로 이동 |
| 환자 내부 ID·가명 매핑 존재 | `PATIENT_REF` + 기관별 `PATIENT_MAPPING` 및 reconciliation | 오매칭 상태가 1급 객체가 아님 | NEW mapping aggregate와 VERIFIED gate | PACS_IMPORT 전 VERIFIED 강제; 기존 mapping을 backfill 후보로만 사용 |
| Gateway/Orthanc가 사실상 조회 원천 | Source Hospital PACS가 Source of Record | 책임 경계가 문서별로 흐림 | Gateway는 connector/proxy, 원본기관 PACS만 SoR | 저장·삭제·정정 책임 문서와 receipt 변경 |
| Mobile package가 payload abstraction | route 독립 `IMAGING_PACKAGE` | 모바일 구현에 과결합 | package는 Cloud/PACS/Mobile 공통 snapshot | mobile-specific envelope를 capsule adapter로 분리 |
| hash·receipt·audit 분산 | 독립 `PROVENANCE` + integrity chain | 종단 입증 불가 | NEW provenance aggregate | source/ingest/transfer/destination evidence 연결 필요 |
| 실제 KMS를 P0처럼 표현한 일부 설계 | 로컬 key contract + Future enterprise KMS | 외부 자원과 로컬 검증 혼동 | raw DEK 없는 계약은 KEEP, 실제 KMS는 BLOCKED/Future | 공급자별 adapter·운영 key ceremony 별도 gate |

## C. Final Product Definition

**Highpass는 환자의 명시적 요청 또는 동의를 기반으로 의료영상을 의료기관 간에 안전하게 조회·전송·다운로드하고, 정책이 허용하는 경우 임시 Cloud Exchange Copy 또는 환자 Mobile Secure Vault를 이용해 이동시키는 Patient-Controlled Medical Imaging Mobility SaaS다.**

Highpass는 Cloud PACS, 단일 Viewer, 파일전송 도구 또는 Mobile Vault 단독 제품이 아니다.

## D. Domain Architecture

```text
IDENTITY
  PatientRef ── PatientMapping ── Organization/Hospital/User/Role
      │
      ▼
EXCHANGE SESSION
  initiation + purpose + source + destination + selected studies + lifecycle
      │
      ├── CONSENT ARTIFACT: 환자 의사표시의 버전·증거
      └── AUTHORIZATION: 현재 주체·기관·행위에 대한 정책 결정
                    │
                    ▼
              TRANSFER GRANT
                    │
                    ▼
             IMAGING PACKAGE
                    │
                    ▼
                 ROUTE
       PACS_DIRECT / CLOUD_VIEW / CLOUD_DOWNLOAD /
       CLOUD_RELAY / MOBILE_VAULT
                    │
                    ▼
          ACCESS / TRANSFER / IMPORT
                    │
                    ▼
              PROVENANCE ── AUDIT
```

### 핵심 객체와 불변조건

| 객체 | 책임 | 주요 불변조건 |
|---|---|---|
| PatientRef | Highpass 내부의 불투명 환자 참조 | 어느 병원의 local patient ID도 global ID로 사용하지 않음 |
| PatientMapping | 기관별 local ID와 PatientRef의 검증된 연결 | 자동 이름/생년일 병합 금지; 상태와 증거·검토자 감사 |
| ExchangeSession | 하나의 교류 업무 흐름과 상태·목적·대상 관리 | payload/키를 포함하지 않음; initiation type 명시 |
| ConsentArtifact | 환자 의사표시의 버전된 증거 | scope/action/기간/source/destination/policy/evidence 필수 |
| AuthorizationDecision | 요청 시점의 RBAC+ABAC 결과 | fail closed; 정책 버전과 reason code 기록 |
| TransferGrant | 단기 실행 권한 | resource·recipient·action·TTL 제한; DICOM/키/장기 credential 금지 |
| ImagingPackage | 선택된 복수 Study의 불변 snapshot과 payload 위치 | package version, manifest hash, encryption/provenance 참조 필수 |
| RouteDecision | capability·policy 기반 경로 선택 | AI routing 금지; preflight PASS 없이는 transfer 금지 |
| Provenance | 출처·변환·무결성·도착 증거 연결 | bit-preserving과 transcoded 검증 방식 분리 |
| AuditEvent | 누가 무엇을 왜 어떤 결과로 했는지 기록 | PHI 최소화; append-only; correlation/session/grant 연결 |

### Patient Identity Reconciliation

`NO_MATCH`, `MULTIPLE_MATCH`, `IDENTITY_CONFLICT`, `UNVERIFIED`, `VERIFIED`를 canonical 상태로 사용한다. VIEW는 정책상 제한적으로 허용할 수 있지만, 목적지 PACS_IMPORT는 destination mapping이 `VERIFIED`가 아니면 항상 거부한다. Mapping 생성·수정·충돌해결은 actor, 기관, 사용한 evidence digest, 이전/신규 상태를 감사한다.

### Initiation flow

| 유형 | 요청자 | Consent | Authorization | 감사 차이 |
|---|---|---|---|---|
| PATIENT_INITIATED | 환자 | 요청과 함께 새 Artifact를 만들거나 기존 활성 동의를 참조 | 송신/수신기관·scope·action·기간 정책을 별도 평가 | 환자 요청과 기관 수락을 각각 기록 |
| PROVIDER_INITIATED | 수신기관 의료진 | 환자에게 명시적 승인 요청; 승인 전 payload 접근 금지 | 의료진 재직/소속/목적/담당 범위까지 평가 | 요청 의료진, 환자 승인/거부, 기관 응답을 각각 기록 |

### Exchange Session state machine

| State | Entry / exit condition | Allowed / forbidden | Role & grant | Audit | Timeout / retry |
|---|---|---|---|---|---|
| REQUESTED | 유효 requester·source·destination·purpose / identity 검증 시작 | 조회·취소만; payload 금지 | 환자 또는 의료진, grant 없음 | SESSION_CREATED | 요청 TTL; idempotent create만 재시도 |
| IDENTITY_PENDING | PatientRef 존재, mapping 미확정 / 필요한 mapping 결정 | mapping 검토·취소; transfer 금지 | mapping reviewer | IDENTITY_CHECKED | 만료 시 EXPIRED; 자동 병합 금지 |
| CONSENT_PENDING | identity gate 충족 / ACTIVE 또는 REJECTED | 승인·거부·취소; 접근 금지 | 환자 재인증 | CONSENT_REQUESTED/DECIDED | 승인 TTL; 재알림 횟수 제한 |
| CONSENTED | active artifact 존재 / authorization 평가 | scope 변경 시 새 version; payload 금지 | 환자/정책 서비스, grant 없음 | CONSENT_BOUND | 동의 만료 시 EXPIRED |
| AUTHORIZED | ALLOW decision / preflight 시작 | grant 후보 생성; 직접 PACS 접근 금지 | policy engine | AUTHORIZATION_GRANTED | 결정 freshness 제한; policy DENY 재시도 금지 |
| PREFLIGHT | route 후보와 grant 존재 / PASS·WARNING 승인 또는 FAIL | capability probe; payload ingest 금지 | connector/service grant | PREFLIGHT_STARTED/RESULT | 각 probe 유한 timeout; 기술 오류만 bounded retry |
| READY | preflight 승인 / ACTIVE 시작 | grant 발행·실행 시작 | short-lived grant | GRANT_CREATED | grant 발행 실패 시 FAILED |
| ACTIVE | 유효 grant / access-mode substate | 허용 action만; scope 확대 금지 | authorized actor/service | SESSION_ACTIVE | grant expiry 우선 |
| VIEWING | `study:view` / viewer 종료 | QIDO/WADO only; download/import 금지 | viewer grant | VIEWER_OPENED/CLOSED | token 만료 후 재인가 필요 |
| DOWNLOADING | `study:download` / receipt | 승인 object만; 브라우저 장기 cache 금지 | download grant | DOWNLOAD_STARTED/COMPLETED | resumable은 idempotency 필요 |
| TRANSFERRING | `study:pacs-transfer` / destination receipt | STOW/C-STORE adapter만; mapping 불명확 시 금지 | B connector grant | PACS_TRANSFER_* | object별 bounded retry, partial 결과 보존 |
| MOBILE_EXPORTING | `study:mobile-export` / vault receipt | 등록 device capsule만; 평문 export 금지 | patient+device grant | MOBILE_EXPORT_* | P1; offline lease 별도 정책 |
| COMPLETED | 모든 필수 receipt·integrity 성공 | 읽기 전용; 재실행은 새 Session | 없음 | SESSION_COMPLETED | terminal |
| REJECTED | consent/policy 거부 | 신규 access 금지 | 없음 | SESSION_REJECTED | terminal; 새 요청만 가능 |
| EXPIRED | session/consent/grant TTL 경과 | 모든 신규 access 금지 | 없음 | SESSION_EXPIRED | terminal |
| REVOKED | consent/grant/session 철회 | key release와 신규 access 즉시 금지 | 없음 | ACCESS_REVOKED | terminal; cache/key cleanup 별도 추적 |
| FAILED | 비복구 오류·integrity 실패 | 우회 금지, 격리/정리만 | 운영자 제한 | SESSION_FAILED | 안전한 오류만 새 Session 또는 승인된 retry |
| CANCELLED | 요청자가 실행 전 취소 | access 금지 | requester | SESSION_CANCELLED | terminal |

## E. System Architecture

```text
                         HIGHPASS CONTROL PLANE
  Identity/Mapping ─ Session ─ Consent ─ Policy ─ Grant ─ Route ─ Audit
          │                         │                     │
          │                         │                     └── PostgreSQL
          │                         └── dedicated key interface (no raw DEK)
          │
Hospital A trust zone              Internet / Cloud trust zone       Hospital B trust zone
PACS/Orthanc ─ Hospital Connector ─ mTLS ─ Exchange Broker ─ mTLS ─ Hospital Connector ─ PACS
   SoR          QIDO/WADO ingest            │ encrypted temp copy       STOW/C-STORE
                                             ├── Web Viewer stream
                                             └── Mobile Secure Vault (P1 patient edge)

Every path: Preflight → scoped grant → integrity/provenance → receipt → audit
Blocked paths: Browser→PACS, Cloud→raw DEK, cross-tenant list, QR→payload/key
```

### Plane separation

- Control Plane: Identity, Patient Mapping, Consent, Authorization, Session, Grant, Route, registry, metadata, audit.
- Imaging Plane: DICOM object model, QIDO/WADO/STOW, encrypted package, Viewer, temporary object storage.
- Security/Key Plane: DEK/KEK references, wrap/rewrap, revocation, integrity, crypto-shredding. Control DB는 raw key를 저장하지 않는다.
- Edge Plane: Hospital Connector, Web Viewer, Mobile Secure Vault.

### Trust boundaries

| Boundary | Entering/leaving data | Authentication / authorization / encryption | Primary threat / failure | Required audit |
|---|---|---|---|---|
| A PACS ↔ A Connector | scoped DICOM objects/metadata | workload mTLS, PACS allowlist, grant scope | direct PACS exposure, over-fetch | QIDO/WADO, selected UID digest, result |
| Connector ↔ Cloud | metadata, encrypted payload, receipt | mTLS + service identity + short grant | MITM, replay, timeout | transfer start/result, cert identity |
| Control DB ↔ services | patient refs, session, consent, grants | least-privilege DB role, tenant predicate, TLS target | cross-tenant read, SQLi | policy decisions/admin actions |
| Object store ↔ exchange | ciphertext only | workload identity, object prefix ownership, TTL | plaintext/key leakage, stale copy | ingest/get/delete receipt |
| Key layer ↔ trusted edge | wrapped-key operation | mTLS, authorization artifact, KMS policy | raw DEK return, stale authorization | key release allow/deny/key version |
| Viewer ↔ Edge | DICOMweb stream | authenticated session, scoped token, HTTPS | token URL leak/cache, IDOR | viewer open, UID scope result |
| Mobile ↔ Cloud/B Edge | opaque request, encrypted capsule | user auth, device binding, short grant | lost/rooted device, replay | device/session/ticket/result |
| B Connector ↔ B PACS | validated DICOM objects | mTLS/AE allowlist, VERIFIED mapping, import grant | wrong-patient import, duplicate/partial store | preflight, per-object result, receipt |

## F. Source-of-Record / Copy Policy

| Location | Classification | Allowed purpose | Retention / deletion | Responsibility |
|---|---|---|---|---|
| Source Hospital PACS | **SOURCE / SYSTEM OF RECORD** | 원 진료기록 관리·정정 | 병원 법정·내부 정책 | Source Hospital |
| Highpass Control DB | CONTROL METADATA | identity ref, mapping, session, consent, grant, audit | 데이터 유형별 정책 | Highpass 역할은 계약·법률검토로 확정 |
| Highpass Object Storage | **TEMPORARY EXCHANGE COPY** | 승인된 view/transfer/download | 정책 구성값; 완료 후 retention window→삭제/crypto-shred | Highpass exchange operator |
| Browser cache | TRANSIENT PRESENTATION COPY | 승인 Viewer 표시 | 가능한 최소, no-store/clear | Viewer/사용기관 공동 통제 |
| Mobile Secure Vault | **PATIENT-HELD SECURE COPY** | 환자 보관·이동 | 환자 정책+device/key lifecycle | 환자 edge 및 서비스 통제 경계 명시 |
| Destination Hospital PACS | **DESTINATION IMPORTED COPY** | 수신기관 진료 | 수신기관 기록 정책 | Destination Hospital |

보관시간 숫자는 본 Baseline에 하드코딩하지 않는다. 처리 목적·법적 근거·계약·병원 정책 검토 후 구성하고, 변경은 policy version과 감사대상이다.

## G. P0 / P1 / P2 / Future

상세 완료조건은 [HIGHPASS-V3-SCOPE.md](HIGHPASS-V3-SCOPE.md)를 따른다.

- P0: PatientRef/Mapping, ExchangeSession, 양 initiation flow, Consent Artifact, Authorization, Transfer Grant, multi-Study ImagingPackage, encrypted temporary exchange, VIEW/DOWNLOAD/STOW access modes, Preflight, tenant isolation, Provenance/integrity, audit, security acceptance.
- P1: Mobile Secure Vault/Capsule, hardware-backed key/device binding/biometric, QR bootstrap, Connector PoC, policy route engine, crypto-shredding.
- P2: offline lease, lost-device remote revocation, recoverable/multi-device vault, enterprise connector, advanced routing, extended IHE compatibility.
- Future: long-term Cloud medical vault, report/referral/FHIR expansion, clinical handoff package, enterprise HSM/KMS, multi-region, advanced DR.
- Out: blockchain, DID/ZKP, AI routing, custom cryptography, full PQC migration, Cloud PACS, full EMR/FHIR platform.

## H. Compatibility Matrix

| Asset | Decision | v3 role | Evidence / action |
|---|---|---|---|
| QIDO/WADO Gateway·Orthanc mTLS | KEEP | Source retrieval / Viewer path | 현행 코드·E2E 보존 |
| OHIF Viewer | KEEP | `study:view` consumer | token/cache/URL acceptance 확장 |
| RBAC+ABAC policy | KEEP/MODIFY | AuthorizationDecision engine | Session/Grant/tenant attributes 추가 |
| Short DICOM token | MODIFY | TransferGrant의 bearer representation | consent/token 동일시 금지; multi-Study scope 검토 |
| Consent API/data | MODIFY | Versioned ConsentArtifact | canonical state/evidence/version migration |
| TransferRequest/Handoff | MODIFY | ExchangeSession child/compatibility adapter | legacyRef 보존 |
| Mobile package crypto/receiver/key release | MODIFY | route-neutral ImagingPackage 및 P1 Capsule adapter | runtime DB/API/edge 연결 별도 |
| PHR patient mapping | MODIFY | PatientMapping evidence input | 자동 merge 금지, reconciliation 상태 추가 |
| Audit hash chain/anomaly | KEEP/MODIFY | v3 AuditEvent | session/grant/package/provenance IDs 추가 |
| Privacy Filter | KEEP | 연구/AI 목적 별도 경계 | 임상 교류 허가 근거로 사용 금지 |
| `EXCHANGE_SESSION` | NEW | 업무 aggregate root | 신규 API/data/state machine |
| `TRANSFER_GRANT` | NEW | 실행 가능한 단기 권한 | token/ticket와 타입 분리 |
| `PROVENANCE` | NEW | source-to-destination evidence | transformation/integrity chain |
| `PREFLIGHT_RESULT` | NEW | route 실행 gate | capability/mapping/scope/quota 검사 |
| 모바일 P0 정책 | DEPRECATE as release priority | P1 patient edge | 구현 자산 삭제 없음 |
| Gateway/PACS를 SoR로 보는 표현 | DEPRECATE | Connector/proxy only | 문서 단계적 정정 |

## I. Standards Matrix

| Domain | Standard / Highpass | Baseline decision | Current evidence |
|---|---|---|---|
| DICOM Object | DICOM object hierarchy and UID semantics | IMPLEMENT NOW | Study/Series/Instance 검증 부분 구현 |
| Web Imaging | DICOM PS3.18 QIDO-RS/WADO-RS/STOW-RS | QIDO/WADO IMPLEMENT NOW, STOW P0 target | QIDO/WADO local PASS; STOW NOT VERIFIED |
| Security | DICOM PS3.15 secure transport/audit/confidentiality mechanisms | COMPATIBLE BY DESIGN; conformance claim 금지 | mTLS/audit 구현 일부 |
| Cross-enterprise | IHE XDS-I.b / XCA-I | FUTURE compatibility | registry/community actors 없음 |
| Browser imaging | IHE WIA | COMPATIBLE BY DESIGN / FUTURE validation | OHIF proprietary integration present |
| Consent | Highpass Control Plane | IMPLEMENT NOW | existing consent requires artifact migration |
| Grant/Session/Package | Highpass-specific | IMPLEMENT NOW | partial contracts/domain modules |
| Mobile Vault | Highpass-specific over platform crypto APIs | P1 | local domain simulation only |

공식 출처와 주장 경계는 [DICOM-CONFORMANCE.md](../standards/DICOM-CONFORMANCE.md)와 [IHE-COMPATIBILITY.md](../standards/IHE-COMPATIBILITY.md)를 따른다.

## J. ADR

ADR-001~020의 결정·대안·보안·마이그레이션 영향은 [DECISION-LOG.md](DECISION-LOG.md)에 기록한다. 모두 v3 설계 결정이며 운영·법률 승인을 대신하지 않는다.

## K. Threat Model

| Threat | Boundary / asset | Required control | Current status |
|---|---|---|---|
| 환자 오매칭 | Mapping→B PACS | explicit reconciliation, VERIFIED gate, human conflict review | PARTIAL |
| Consent replay/위조 | Consent/Grant | versioned evidence, signature/digest, freshness, withdrawal check | PARTIAL |
| Cross-tenant IDOR | API/DB | tenant ownership predicate + RBAC/ABAC + RLS defense-in-depth | PARTIAL |
| Scope escalation | Grant/DICOMweb | typed action, immutable resource snapshot, per-request introspection | PARTIAL |
| QR replay | Mobile bootstrap | opaque nonce, TTL, signature, atomic consume, no PHI/key | PASS — domain |
| Payload tamper | Package/transfer | AEAD tag, manifest/chunk hash, quarantine | PASS — domain; E2E missing |
| Wrong-patient PACS import | B Connector | VERIFIED mapping, DICOM identity validation, preflight, receipt | NOT IMPLEMENTED — local P0 work |
| Transcode hidden change | transfer/provenance | transformation history + semantic validation; file hash만으로 PASS 금지 | NEW |
| PACS bypass | network | private network, connector-only ACL, mTLS | PASS — local MVP |
| Raw DEK exposure | key plane | provider-neutral rewrap, non-exportable key, safe logs | PARTIAL; real KMS blocked |
| Stale Cloud copy | object store | TTL lifecycle, deletion receipt, key destruction | NOT VERIFIED |
| Audit deletion/tamper | audit | append-only, hash chain, WORM/SIEM roadmap | PASS local / external blocked |
| Browser token/cache leakage | viewer | header token, no URL credential, no-store, expiry | PARTIAL |
| Device theft/copy | mobile | hardware key, device binding, user auth, revocation | BLOCKED on real device |
| Availability cascade | connectors/KMS/PACS | bounded timeout/retry, circuit breaker, no bypass/fail-open | PARTIAL |

## L. Acceptance Criteria

| Test ID | Scenario | Expected | Current result |
|---|---|---|---|
| TC-IDENTITY-01 | destination mapping 불명확 후 PACS import | DENY | NOT VERIFIED |
| TC-CONSENT-01 | consent 없음으로 VIEW/DOWNLOAD/TRANSFER | DENY | PARTIAL: 현행 view/download 범위 |
| TC-CONSENT-02 | withdrawn consent 후 신규 access | DENY | PASS: 기존 REVOKED 의미; v3 mapping 필요 |
| TC-GRANT-01 | view-only grant로 download | DENY | PASS: 현행 token 범위 |
| TC-GRANT-02 | Hospital B grant를 Hospital C가 사용 | DENY | PASS: 현행 hospital scope |
| TC-TENANT-01 | Tenant A가 Tenant B patient list 조회 | DENY | NOT VERIFIED: 전 도메인 tenant 시험 없음 |
| TC-PREFLIGHT-01 | 지원하지 않는 목적지로 전송 | payload 전송 전 DENY | NOT VERIFIED |
| TC-INTEGRITY-01 | bit-preserving source/destination | 동일 object hash PASS | NOT VERIFIED end-to-end |
| TC-INTEGRITY-02 | ciphertext modification | authentication failure | PASS: domain unit |
| TC-MOBILE-01 | capsule을 다른 device로 복사 | DENY | NOT VERIFIED real device |
| TC-MOBILE-02 | 원 device + valid auth | PASS | NOT VERIFIED real device |
| TC-DELETE-01 | crypto-shred 후 decrypt | DENY | PARTIAL: domain simulation |
| TC-QR-01 | consumed request replay | DENY | PASS: domain unit |

P0 완료 판정에는 모든 필수 시험의 실행 SHA·환경·명령·결과·증적이 필요하다. 설계상 기대결과를 실행 PASS로 바꾸지 않는다.

## M. Traceability

| Goal | Requirement | Legal / standard basis | Threat | Control / object | Component / API-data | Test |
|---|---|---|---|---|---|---|
| 환자 중심 교류 | V3-ID-001 | 의료법 전송 요청·동의 검토 | 오매칭 | PatientRef/Mapping | identity service / mapping | TC-IDENTITY-01 |
| 명시적 의사표시 | V3-CON-001 | PIPA·의료법 적용성 검토 | 위조/철회 무시 | ConsentArtifact | consent API/data | TC-CONSENT-01/02 |
| 최소 권한 | V3-GRT-001 | 안전성 확보조치, PS3.15 | scope escalation | Authorization+Grant | policy/token gateway | TC-GRANT-01/02 |
| 안전한 영상조회 | V3-DCM-001 | DICOM PS3.18 | IDOR/over-fetch | QIDO/WADO scope | Gateway/Viewer | 기존 DICOM 음성 suite |
| 안전한 PACS 편입 | V3-PACS-001 | 의료법·DICOM PS3.18 적용 검토 | wrong-patient/duplicate | Preflight+STOW+receipt | B Connector/pacs_imports | TC-IDENTITY/PREFLIGHT |
| payload 무결성 | V3-INT-001 | PS3.15 mechanism review | tamper/transcode | Provenance/manifest/AEAD | package/provenance | TC-INTEGRITY-01/02 |
| tenant 격리 | V3-TEN-001 | PIPA 안전조치 | cross-tenant disclosure | tenant predicate/RLS | all APIs/tables | TC-TENANT-01 |
| 제한 보관·파기 | V3-LIFE-001 | PIPA 보유·파기 검토 | stale copy | TTL/delete/key destroy | object/key layers | TC-DELETE-01 |
| 책임 추적 | V3-AUD-001 | 접속기록·DICOM audit review | repudiation | AuditEvent/hash chain | audit service | integrity/audit suite |

법적 추적성은 [LEGAL-TRACEABILITY.md](../standards/LEGAL-TRACEABILITY.md)에서 `LEGAL REVIEW REQUIRED` 상태로 관리한다.

## N. Implementation Readiness

아래 PASS는 **설계 정의의 명확성** 판정이며 구현 완료 판정이 아니다.

```text
Product Definition: PASS
Patient Identity: PARTIAL
Exchange Architecture: PARTIAL
Consent: PARTIAL
Authorization: PARTIAL
Imaging Package: PARTIAL
Cloud Exchange: PARTIAL — locally implementable, not yet integrated
Hospital Integration: PARTIAL — Test Orthanc target; production hospital BLOCKED separately
Viewer: PASS — local remote-view scope only
Tenant Isolation: PARTIAL
Provenance: PARTIAL — locally implementable, runtime aggregate missing
Mobile Secure Vault: PARTIAL — local domain only
Standards Mapping: PASS — design mapping only
Security Architecture: PARTIAL
Implementation Ready: NO
```

Implementation Ready가 NO인 직접 원인은 ExchangeSession·PatientMapping·TransferGrant·Provenance의 runtime 계약 부재, Cloud encrypted temporary storage와 STOW 종단 미구현, 전 도메인 tenant isolation 증적 부재다. 실제 IdP/KMS/PACS 검증은 외부 자원 제공 전 BLOCKED다.

## Final Baseline Decision

```text
PREVIOUS BASELINE:
Highpass v2.1 remote DICOMweb MVP + Mobile-Core target assets

TARGET BASELINE:
Highpass v3
Patient-Controlled Medical Imaging Mobility SaaS

CORE BUSINESS OBJECT:
Exchange Session

IDENTITY MODEL:
Highpass Patient Reference + Hospital-local Mapping

CONSENT MODEL:
Versioned Consent Evidence Artifact

PAYLOAD MODEL:
Imaging Package

SOURCE OF RECORD:
Source Hospital PACS

CLOUD ROLE:
Medical Imaging Exchange Broker

ACCESS MODES:
VIEW / DOWNLOAD / PACS_IMPORT / MOBILE_EXPORT

INTEGRITY MODEL:
Provenance + End-to-End Verification

PATIENT EDGE:
Mobile Secure Vault

BASELINE STATUS:
ESTABLISHED — DESIGN TARGET / ARCHITECTURE REVIEW REQUIRED

IMPLEMENTATION READY:
NO
```
