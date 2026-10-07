# MediQ P0 Web UI/UX Specification

**Project:** MediQ  
**Product:** Patient-Controlled Medical Imaging Mobility SaaS  
**Document Type:** P0 Web UI/UX Specification  
**Version:** v1.1 PACS Import Replay and Owned Status Amendment
**Baseline Date:** 2026-09-20  
**Scope:** CAPSTONE-P0 / Synthetic·Test DICOM  
**Status:** APPROVED UI/UX BASELINE — DOCUMENTED, NOT IMPLEMENTED / NOT TESTED  
**Target:** React 19.3 + Vite 8 SPA, OHIF Viewer 3.11, MediQ OpenAPI v1.3.0 (contract, not deployed routes)

---

# 1. 문서 목적

본 문서는 MediQ P0 웹 애플리케이션을 구현할 수 있도록 사용자 역할, 정보 구조, 화면 전이, 화면별 입력·상태·행동, API 연결, 보안 통제 및 Acceptance Criteria를 정의한다.

본 문서의 화면은 다음 P0 업무를 지원한다.

```text
Synthetic Patient / Hospital User 인증
  → PatientReference 기반 Exchange 생성 또는 승인된 Exchange 열기
  → Source Test PACS Study 조회
  → Consent 요청 및 Synthetic Patient 승인
  → Action별 Transfer Grant 발급
  → Cloud Viewer / DICOM Download / Hospital B PACS Import
  → Destination Verification / Integrity / Provenance / Audit 확인
```

본 문서는 UI 구현 완료를 주장하지 않는다. 현재 저장소에는 실행 가능한 Web Frontend가 없으며, 모든 UI Acceptance 상태는 `NOT RUN`이다.

---

# 2. 기준 문서와 우선순위

본 명세는 다음 승인 기준을 따른다.

1. `PROJECT-CHARTER.md`
2. `CAPSTONE-MVP-BOUNDARY.md`
3. `PRODUCT-BASELINE.md`
4. `REQUIREMENTS.md`
5. `SECURITY-REQUIREMENTS.md`
6. `DOMAIN-MODEL.md`
7. `SYSTEM-ARCHITECTURE.md`
8. `TECH-STACK-DECISION.md`
9. `DATA-FLOW.md`
10. `OPENAPI.yaml`
11. `THREAT-MODEL.md`
12. `ACCEPTANCE-TESTS.md`
13. `IMPLEMENTATION-PLAN.md`

충돌 시 상위 기준과 보안 불변조건을 우선한다. Highpass 명칭, Azure 전제, Legacy API 예시는 MediQ의 승인 기준을 대체하지 않는다.

---

# 3. 제품·데이터 경계

## 3.1 P0 경계

- 실제 환자나 운영 병원 데이터가 아닌 Synthetic/Test/De-identified DICOM만 사용한다.
- Hospital A/B는 Test Orthanc 또는 승인된 Test PACS다.
- Hospital PACS가 영상의 Source of Record다.
- MediQ Cloud는 Permanent PACS 또는 장기 Archive가 아니다.
- Cloud Viewer는 MediQ Backend Authorization Gateway를 거쳐 WADO-RS 데이터를 온디맨드로 전달한다.
- Browser는 PACS endpoint, PACS credential 또는 raw storage reference를 알 수 없다.
- `VIEW`, `DOWNLOAD`, `PACS_IMPORT`는 각각 독립된 Consent Action과 Grant Scope를 사용한다.
- Mobile Secure Vault 및 저장 영상의 Mobile Viewer는 P1이며 본 Web P0 구현에 포함하지 않는다.

## 3.2 비목표

- 실제 의료기관 운영 인증, 법률상 본인확인 또는 법률상 전자동의 완성
- Production EMR/PACS 연동과 상용 의료기기 인증
- 장기 Cloud 영상 보존, Cloud PACS 또는 환자 원본 복구 보관소
- 대규모 관리자 분석, 과금, 병원 온보딩, 다기관 운영 콘솔
- Doctor/Technician/Hospital Admin/System Admin의 세부 RBAC를 근거 없이 신설하는 것

## 3.3 현재 구현 기준선

| 영역 | 현재 상태 | UI 설계 영향 |
|---|---|---|
| Repository | 문서와 빈 디렉터리 scaffold만 존재 | 구현 완료로 간주하지 않음 |
| Web | 실행 가능한 React application 없음 | 모든 화면 `NOT IMPLEMENTED` |
| Backend/API | OpenAPI 계약만 존재 | API 호출 결과 `NOT TESTED` |
| Test PACS | Orthanc A/B 실행 증거 없음 | Viewer/PACS Import `NOT RUN` |
| Identity | OIDC 방식만 결정, Provider/claim profile 미정 | 로그인/Context 구현 전 결정 필요 |
| Viewer | OHIF 3.11 선택, Gateway 연결 미검증 | metadata/streaming Validation Gate 필요 |

이 기준선은 `REPOSITORY-BASELINE-AUDIT.md`와 `TECH-STACK-DECISION.md`를 따른다.

---

# 4. UI/UX 설계 원칙

1. **업무 중심:** 데이터베이스 CRUD가 아니라 Exchange, Consent, View, Download, PACS Import 행위를 중심으로 구성한다.
2. **서버 권한 우선:** 메뉴 숨김이나 비활성화는 편의 기능일 뿐 접근통제가 아니다. 서버가 매 보호 요청을 재검증한다.
3. **Fail Closed:** 권한·상태·병원 연결을 확인할 수 없으면 진행시키지 않는다.
4. **명시적 상태:** 요청 중, 승인 대기, 만료, 거부, PACS 장애, 무결성 실패를 서로 다른 상태로 표시한다.
5. **권한 비승격:** `study:view` 버튼에서 Download나 PACS Import를 암묵적으로 허용하지 않는다.
6. **안전한 식별:** 화면과 URL에 필요 이상의 환자정보를 표시하지 않는다. DICOM UID나 Session ID를 접근권한처럼 취급하지 않는다.
7. **정직한 진행률:** Backend가 제공하지 않은 전송 단계나 백분율을 추정해 표시하지 않는다.
8. **복구 가능한 오류:** 사용자에게 안전한 다음 행동과 Correlation ID를 제공하되 Secret·Payload·PACS 상세를 노출하지 않는다.
9. **반응형·접근 가능:** Desktop 의료진 흐름을 우선하되 Synthetic Patient 동의와 Cloud Viewer는 Mobile Web에서도 사용할 수 있게 한다.
10. **기준선 우선:** UI 편의를 이유로 OpenAPI와 보안 불변조건을 우회하지 않는다.

---

# 5. 사용자 역할과 권한 모델

## 5.1 P0 정식 Actor

| UI Actor | 설명 | 주요 행위 | 주의사항 |
|---|---|---|---|
| `HOSPITAL_USER` | 인증된 Test Hospital 사용자 | Exchange 생성·조회, Study 조회, Consent 요청, 승인된 View/Download/PACS Import, 이력 확인 | 구체적인 Doctor/Technician 역할은 P0 계약에 없음 |
| `PATIENT` | 대상 PatientReference에 결합된 Synthetic Patient | Consent 확인·승인·철회, 승인된 Cloud Viewer | 실제 환자 본인확인 완료를 의미하지 않음 |

`SYSTEM_ADMIN`, `HOSPITAL_ADMIN`, `DOCTOR`, `TECHNICIAN`은 후보 Persona일 수 있으나 현재 Domain/OpenAPI의 정식 권한 역할이 아니다. 이를 구현하려면 Identity·Role·Permission·Acceptance 문서를 함께 개정해야 한다.

## 5.2 권한 매트릭스

| 화면/행위 | HOSPITAL_USER | PATIENT | 서버 재검증 |
|---|:---:|:---:|---|
| 로그인 | O | O | OIDC/JWT 검증 |
| 승인된 병원 Context 선택 | O | 해당 없음 | Actor-Tenant-Hospital claim binding |
| Exchange 생성 | O | 기본 X | Tenant, Source/Destination 허용 범위 |
| Exchange 조회 | 승인된 Session만 | 자신에게 결합된 Session만 | Resource-level authorization |
| Study 조회 | O | 승인된 대상만 | Session, Tenant, PatientReference, Source binding |
| Consent 요청 | O | X | Session/Actor/Allowed Action 검증 |
| Consent 승인·철회 | X | O | PatientReference와 Consent binding |
| Grant 발급 | 승인 정책에 따른 Hospital User | 기본 X | Active Consent, Recipient, Scope, Expiry |
| Cloud Viewer | O | O | `study:view` + 모든 binding + expiry |
| DICOM Download | O | 기본 X | `study:download` 독립 검증 |
| PACS Import | O | X | `study:pacs-transfer` + Mandatory Preflight |
| Session Audit/Provenance | 승인된 Session만 | 허용된 자기 Session만 | Evidence resource authorization |

역할 선택 화면은 권한을 생성하지 않는다. 인증 서버가 발급한 Context 중 하나를 선택할 뿐이며, 임의 Tenant/Hospital ID 입력으로 전환할 수 없다.

## 5.3 요청 Persona와 현재 P0 Actor의 매핑

| Screen / Action | System Admin | Hospital Admin | Doctor | Technician | Patient | P0 결정 |
|---|---|---|---|---|---|---|
| 운영 전체 Dashboard | 미정의 | 미정의 | 해당 없음 | 해당 없음 | 해당 없음 | POST-MVP |
| Exchange 생성·Study 조회 | 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 기본 불가 | `HOSPITAL_USER`로만 판정 |
| Consent 요청 | 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 불가 | `HOSPITAL_USER`로만 판정 |
| Consent 승인·철회 | 불가 | 불가 | 불가 | 불가 | 허용 | `PATIENT` binding 필요 |
| Viewer | 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 조건부 허용 | `HOSPITAL_USER` 또는 `PATIENT` |
| Download/PACS Import | 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 기본 불가 | Action별 Hospital User Grant 필요 |
| Session Audit | 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 세부 역할 미정의 | 자기 Session 조건부 | Resource-level authorization |

“미정의”는 허용을 뜻하지 않는다. 현재는 Deny by Default이며, Doctor/Technician/Admin 구분을 도입하려면 정식 RBAC 결정이 필요하다.

---

# 6. 전체 사용자 흐름

## 6.1 Flow A — Hospital User의 영상 조회·다운로드·전송

```text
[WEB-01 로그인]
      ↓
[WEB-02 승인된 병원 Context]
      ↓
[WEB-03 대시보드/현재 Exchange]
      ↓
[WEB-04 PatientReference + Source/Destination로 Exchange 생성]
      ↓
[WEB-05 Source Study 조회·선택]
      ↓
[WEB-06 Consent 요청]
      ↓
  Consent PENDING ───────────────┐
      ↓                          │
  Patient 승인                   │
      ↓                          │
  Consent ACTIVE                 │
      ↓                          │
  Action별 Grant 발급             │
      ├────────────┬─────────────┘
      │            │
      ▼            ▼
[WEB-08 Viewer] [WEB-09 Download]
      │
      └───────────────┐
                      ▼
              [WEB-10 PACS Import 요청]
                      ↓
              [WEB-11 전송 진행]
                      ↓
              ┌───────┴────────┐
              ▼                ▼
       [WEB-12 완료]     [WEB-13 실패/거부]
              └───────┬────────┘
                      ▼
               [WEB-14 Audit/이력]
```

## 6.2 Flow B — Synthetic Patient의 동의 승인

```text
[WEB-01 환자 로그인]
      ↓
Consent 초대/승인된 Session Context 확인
      ↓
[WEB-07 동의 상세]
      ↓
Source Hospital / Destination Hospital / Study 범위 /
허용 Action / 만료시간 확인
      ↓
  승인 ──→ Consent ACTIVE ──→ 결과 및 철회 경로
  보류 ──→ Consent PENDING 유지
  거절 ──→ 현재 API 미지원: 구현 전 계약 결정 필요
```

## 6.3 Flow C — Synthetic Patient Cloud Viewer

```text
[WEB-01 환자 로그인]
      ↓
PatientReference 일치 + ACTIVE Consent + ACTIVE study:view Grant
      ↓
POST /actions/view
      ↓
short-lived ViewerSession
      ↓
[WEB-08 MediQ Cloud Viewer]
      ↓
MediQ Viewer Gateway → Source PACS WADO-RS on-demand
      ↓
만료/철회/불일치 시 즉시 DENY
```

---

# 7. 정보 구조와 공통 레이아웃

## 7.1 Desktop 구조

```text
┌─────────────────────────────────────────────────────────────────┐
│ MediQ │ Hospital Context │ Actor │ Session expiry │ Logout      │
├──────────────┬──────────────────────────────────────────────────┤
│ Dashboard    │ Breadcrumb / Page title / Status                 │
│ Exchange     │                                                  │
│ Viewer       │ Main content                                     │
│ Transfer     │                                                  │
│ Audit        │                                                  │
├──────────────┴──────────────────────────────────────────────────┤
│ Test/Synthetic environment banner · Correlation ID when needed │
└─────────────────────────────────────────────────────────────────┘
```

## 7.2 Mobile Web 구조

- 상단에는 제품명, 현재 Context, 세션 만료 경고를 유지한다.
- Side navigation은 Drawer로 전환한다.
- 핵심 Action은 화면 하단의 고정 Action 영역에 배치하되 OS 안전영역을 고려한다.
- 테이블은 카드 또는 핵심 열 우선 표시로 전환한다.
- DICOM Viewer는 Portrait에서 기본 도구를 축소하고 Landscape 전환을 안내할 수 있다.

## 7.3 전역 배너

- 모든 P0 화면에 `Synthetic/Test Data Only` 배너를 표시한다.
- 실데이터로 오인할 수 있는 `운영`, `실환자`, `법적 동의 완료` 문구를 사용하지 않는다.
- Viewer와 Download에는 “진단용 상용 의료기기 아님”을 명시한다.

---

# 8. Screen Inventory

| ID | 화면 | Actor | 우선순위 | 현재 계약 상태 |
|---|---|---|---|---|
| WEB-01 | 로그인 | 공통 | P0-CRITICAL | 외부 OIDC 경계, API 외부 |
| WEB-02 | 역할·병원 Context 선택 | 공통 | P0-CRITICAL | Claim 기반, 전용 API 미정 |
| WEB-03 | 대시보드·현재 Exchange | Hospital User | P0-HIGH | 단건 조회만 가능; 목록 API 없음 |
| WEB-04 | PatientReference 조회·Exchange 생성 | Hospital User | P0-CRITICAL | 생성 API 있음; 일반 환자검색 API 없음 |
| WEB-05 | Study 조회·선택 | Hospital User | P0-CRITICAL | API 있음 |
| WEB-06 | Consent 요청 | Hospital User | P0-CRITICAL | API 있음 |
| WEB-07 | Consent 확인·승인·철회 | Patient | P0-CRITICAL | 승인/철회 API 있음; 상세 조회/거절 API 없음 |
| WEB-08 | Cloud DICOM Viewer | Hospital User, Patient | P0-CRITICAL | ViewerSession API 있음; OHIF metadata 계약 보완 필요 |
| WEB-09 | DICOM Download 확인 | Hospital User | P0-CRITICAL | API 있음 |
| WEB-10 | Hospital B PACS Import 요청 | Hospital User | P0-CRITICAL | Mapping 검증 및 Action API 있음 |
| WEB-11 | 전송 진행 | Hospital User | P0-CRITICAL | 동기 Action + same-key owned status 계약 있음; 실제 HTTP/DB/UI 미구현 |
| WEB-12 | 전송 완료 | Hospital User | P0-CRITICAL | Result/Provenance/Audit API 있음 |
| WEB-13 | 전송 실패·거부 | Hospital User | P0-CRITICAL | ErrorResponse 있음 |
| WEB-14 | Audit·Provenance 이력 | 승인된 Actor | P0-HIGH | Session 단위 API 있음 |

`WEB-09 DICOM Download`는 원 프롬프트의 13개 화면 목록에는 없지만, 승인된 P0 필수 Action이므로 누락 방지를 위해 추가한다.

---

# 9. 화면 공통 명세 규칙

각 화면은 다음 원칙을 공통 적용한다.

- 모든 API 요청에 인증 Context와 신규 또는 연속된 Correlation ID를 보낸다.
- 버튼 활성화는 사용자 실수 예방용이며, 서버 권한검사를 대체하지 않는다.
- Mutation은 중복 클릭을 방지한다. PACS Import는 결과 불명 상태에서 자동 재요청하지 않는다.
- `401`은 재인증, `403`은 Denied, `404`는 존재 여부 비노출형 Not Found, `409`는 Domain Conflict, `410`은 Expired, `502`는 PACS/DICOMweb Upstream Failure로 처리한다.
- 오류에는 안전한 요약, 사용자가 할 수 있는 다음 행동, Correlation ID를 표시한다.
- raw token, PACS URL, PACS credential, DICOM Binary, 내부 stack trace를 화면·로그·analytics에 기록하지 않는다.
- URL query와 browser history에는 PatientReference, Patient ID, Study UID, Grant ID를 넣지 않는다. 필요한 식별자는 path 최소화 및 in-memory state를 우선한다.

---

# 10. WEB-01 — 로그인

**목적:** Hospital User와 Synthetic Patient가 승인된 Identity Provider를 통해 인증한다.

**사전조건:** OIDC/OAuth 2.0 Authorization Code + PKCE 설정이 존재한다.

**주요 UI**

- MediQ 로고와 `Synthetic/Test Environment` 배너
- `병원 사용자 로그인`, `Synthetic Patient 로그인` 진입 버튼
- 세션/개인정보 주의문과 접근성 도움말
- 인증 오류 영역

**동작·검증**

- SPA가 비밀번호를 직접 수집하거나 저장하지 않는다.
- PKCE와 `state`/`nonce`를 사용하고 callback 이후 URL의 인증 code를 제거한다.
- 성공 시 token claim으로 Actor와 허용 Context를 확정한다.
- 실패 시 `AUTHENTICATION_FAILURE`에 대응하는 안전한 메시지를 표시하며 자동 반복 로그인하지 않는다.

**API:** MediQ 업무 API 외부의 승인된 OIDC Provider. Access token은 메모리 우선 저장을 사용하고 `localStorage`에 장기 보관하지 않는다.

**상태:** Loading, Authentication Failed, Session Expired, Provider Unavailable.

**Acceptance**

- AC-UI-AUTH-001: 인증되지 않은 사용자는 보호 Route에 접근할 수 없다.
- AC-UI-AUTH-002: callback 위조 또는 state/nonce 불일치는 거부된다.
- AC-UI-AUTH-003: 세션 만료 후 민감 화면이 남지 않고 재인증 경로가 표시된다.

---

# 11. WEB-02 — 역할 및 병원 Context 선택

**목적:** 인증 결과에 포함된 허용 Actor/Tenant/Hospital Context 중 현재 업무 Context를 선택한다.

**주요 UI**

- Actor 표시: `Hospital User` 또는 `Synthetic Patient`
- Hospital User에게만 승인된 병원 카드 목록
- Tenant/Hospital 표시명, Test 표식, Source/Destination capability 요약
- `이 Context로 계속` 버튼

**규칙**

- 사용자가 Tenant ID나 Hospital ID를 임의 입력할 수 없다.
- 하나의 Context만 있으면 선택을 생략하되 선택 결과를 명확히 표시한다.
- 역할 전환은 새 인증 또는 서버가 허용한 Context 전환으로만 수행한다.
- `PATIENT`에게 Hospital 선택 UI를 노출하지 않는다.

**API:** 현재 전용 Context API가 없다. 초기 P0는 검증된 OIDC claims를 사용하며, Claim 구조가 확정되지 않으면 구현을 시작하지 않는다.

**Acceptance**

- AC-UI-CTX-001: 위조한 Hospital/Tenant 값으로 화면이 바뀌어도 보호 API가 거부한다.
- AC-UI-CTX-002: Context 변경 시 이전 Context의 Query Cache와 화면 상태가 제거된다.

---

# 12. WEB-03 — 메인 대시보드

**목적:** 현재 또는 사용자가 알고 있는 승인된 Exchange로 진입하고 핵심 상태를 이해한다.

**P0 최소 UI**

- `새 Exchange 생성`
- 승인된 Session ID로 `Exchange 열기`
- 현재 브라우저 세션에서 방문한 Exchange 바로가기(메모리 또는 `sessionStorage`, 민감 Metadata 미저장)
- 현재 Exchange 상태, Source/Destination Test Hospital, 만료시간
- 다음 권장 행동: Consent 요청/대기, Grant 발급, View, Download, PACS Import, Evidence 확인

**중요 제한**

- 현재 OpenAPI에는 Exchange 목록·통계 endpoint가 없다.
- 따라서 “대기 5건, 완료 12건” 같은 서버 근거 없는 카드나 전역 업무 목록을 표시하지 않는다.
- 목록형 Dashboard가 P0 필수라면 `GET /exchange-sessions`의 filter·pagination·authorization 계약을 먼저 승인한다.

**API:** `GET /exchange-sessions/{sessionId}`.

**상태:** Loading, Empty(현재 Session 없음), Denied, Expired, Not Found.

**Acceptance**

- AC-UI-DASH-001: 권한 없는 Session ID 입력은 내용 유출 없이 처리된다.
- AC-UI-DASH-002: Session 상태별로 가능한 다음 Action만 제시하되 서버가 다시 검증한다.

---

# 13. WEB-04 — PatientReference 조회 및 Exchange 생성

**목적:** 광범위한 환자 디렉터리 검색 없이 승인된 Synthetic PatientReference로 Exchange 업무를 생성한다.

**입력**

- `patientRefId` — 현재 OpenAPI상 UUID 필수
- `sourceHospitalId` — 현재 Context에서 허용된 Source 후보
- `destinationHospitalId` — 허용된 Destination 후보
- `purpose` — 1~255자, 비민감 업무 목적
- 선택 `requestedStudyInstanceUIDs` — 1~128자, 중복 금지

**주요 UI**

- PatientReference 입력/검증 상태
- Source A / Destination B 선택 카드
- 목적 입력
- `Exchange 생성` 버튼
- 생성 후 Session ID와 `Study 조회로 이동`

**검증·버튼 조건**

- Source와 Destination이 비어 있거나 동일하면 비활성화한다.
- 필수값 형식과 길이를 client에서 확인한다.
- Patient name, 생년월일, 주민번호, Hospital-local Patient ID의 자유검색은 제공하지 않는다.
- `Create` 중 중복 제출을 막고 `409`이면 기존/충돌 상태를 설명한다.

**API:** `POST /exchange-sessions` (`createExchangeSession`).

**보안:** requester와 caller tenant는 body가 아니라 인증 Context에서 서버가 결정한다.

**Acceptance**

- AC-UI-EXC-001: 필수값 누락·잘못된 UUID는 제출되지 않는다.
- AC-UI-EXC-002: Cross-Tenant 또는 허용되지 않은 Hospital 조합은 서버에서 거부되고 안전하게 표시된다.
- AC-UI-EXC-003: 실제 환자정보 입력을 유도하지 않는다.

---

# 14. WEB-05 — Study 조회 및 선택

**목적:** Exchange에 연결된 Source Hospital과 PatientReference 범위에서 Test Study를 조회하고 Action 대상을 선택한다.

**주요 UI**

- Session/Source/PatientReference 최소 식별 정보
- Study 카드 또는 표: Modality, Series Count, Instance Count, masked/truncated Study reference
- 단일 선택, 새로고침, `Consent 요청으로 계속`
- PACS 연결 상태와 마지막 조회 시각

**API:** `GET /exchange-sessions/{sessionId}/studies` (`listExchangeStudies`).

**규칙**

- Study UID 전체값은 기본 UI에서 노출하지 않고 상세 개발 보기에서도 복사 목적을 제한한다.
- Study UID를 아는 것만으로 Viewer를 열 수 없다.
- 검색은 Exchange에 이미 제한된 결과 내에서만 modality 등 비민감 필터를 client-side 적용할 수 있다.
- `502`에서 Cloud 영구 Copy로 우회하지 않는다.

**상태:** Loading skeleton, Empty, Denied, PACS Unavailable, Network Error.

**Acceptance**

- AC-UI-STU-001: 반환된 Exchange 범위 밖 Study를 선택할 수 없다.
- AC-UI-STU-002: PACS 장애를 빈 결과로 오인시키지 않는다.
- AC-UI-STU-003: 선택된 Study는 후속 Consent/Grant/Action에서 동일한 `studyRefId`로 유지된다.

---

# 15. WEB-06 — Consent 요청

**목적:** 선택한 Imaging Package/Study 업무에 대해 환자에게 요청할 Action 범위와 만료시간을 명시한다.

**입력**

- 선택 `imagingPackageId`
- `allowedActions`: `VIEW`, `DOWNLOAD`, `PACS_IMPORT` 중 하나 이상
- 선택 `expiresAt`

**주요 UI**

- Source/Destination Hospital 요약
- 선택 Study 요약
- Action별 독립 checkbox와 평문 설명
- 만료시간
- 환자에게 보일 요약 Preview
- `동의 요청 보내기`

**검증·권한**

- Action을 자동으로 묶어 선택하지 않는다.
- P0에 없는 `MOBILE_EXPORT`를 표시하지 않는다.
- Consent 요청 결과가 `PENDING`임을 표시하고, 승인 자체가 Authorization이 아님을 안내한다.
- Mutation 직전 Session/Actor/Allowed Action을 서버가 검증한다.

**API:** `POST /exchange-sessions/{sessionId}/consents/request` (`requestConsent`).

**Acceptance**

- AC-UI-CON-001: 하나 이상의 Action 없이는 제출할 수 없다.
- AC-UI-CON-002: Consent 대상 병원·Study·Action·만료를 제출 전 확인할 수 있다.
- AC-UI-CON-003: 성공 후 `CONSENT_PENDING` 상태를 표시하고 Grant 발급 버튼을 활성화하지 않는다.

---

# 16. WEB-07 — Synthetic Patient 동의 확인·승인·철회

**목적:** 대상 Synthetic Patient가 요청 범위를 이해하고 승인하거나, 기존 Active Consent를 철회한다.

**필수 표시**

- Source Hospital과 Destination Hospital
- 대상 Study/Imaging Package의 최소 식별 정보
- 각 Action의 의미: View, Download, PACS Import
- 발급·만료시간, 현재 Consent 상태
- “동의는 접근권한 자체가 아니며 서버 Authorization이 별도 수행됨” 안내

**행동**

- `승인`: `POST .../approve`
- `철회`: Active Consent에 대해 `POST .../withdraw`
- `나중에`: Mutation 없이 화면 종료, `PENDING` 유지
- `거절`: 현재 OpenAPI에 endpoint가 없으므로 버튼을 구현하지 않는다. 필요 시 `REJECTED` 전이 계약을 먼저 추가한다.

**보안·검증**

- 환자 Actor의 PatientReference가 Consent 대상과 일치해야 한다.
- 승인 직전에 Consent 상태와 expiry를 서버가 재검증한다.
- 링크의 `sessionId`/`consentId`만으로 내용을 보여주거나 승인하지 않는다.
- 승인 완료 이후 같은 요청을 반복 제출하지 않는다.

**계약 공백:** 현재 Consent 상세 GET endpoint가 없다. 안전한 승인 화면을 위해 구현 전 `GET /exchange-sessions/{sessionId}/consents/{consentId}` 또는 동등한 authorization-protected read contract가 필요하다.

**Acceptance**

- AC-UI-CON-004: 다른 PatientReference로 로그인한 사용자는 Consent 상세와 승인 모두 거부된다.
- AC-UI-CON-005: 만료·철회·이미 승인 상태를 명확히 구분한다.
- AC-UI-CON-006: 승인 후 자동으로 View/Download/PACS Import를 수행하지 않는다.

---

# 17. Grant 발급 패널

Grant는 독립 화면이 아니라 `WEB-03` 또는 Exchange 상세의 보호된 패널로 제공한다.

**입력:** `consentId`, `recipientHospitalId`, 선택 `recipientActorId`, 선택 `imagingPackageId`, `scopes`, `expiresAt`.

**API:** `POST /exchange-sessions/{sessionId}/grants/issue`.

**규칙**

- `ACTIVE` Consent에서만 활성화한다.
- `VIEW → study:view`, `DOWNLOAD → study:download`, `PACS_IMPORT → study:pacs-transfer`를 일대일로 매핑한다.
- Consent가 허용한 Action보다 넓은 Scope를 선택할 수 없다.
- Scope별 별도 설명과 만료시간을 표시한다.
- 서버는 Recipient/Tenant/Resource/Scope/Expiry를 검증하고 실패 시 Fail Closed한다.

---

# 18. WEB-08 — Cloud DICOM Viewer

**목적:** Hospital User 또는 Synthetic Patient가 short-lived ViewerSession을 통해 Source PACS 영상을 온디맨드로 본다.

**진입 절차**

1. 선택 Study와 `study:view` Grant를 확인한다.
2. `POST /exchange-sessions/{sessionId}/actions/view`에 `grantId`, `studyRefId`, `actorType`을 보낸다.
3. 서버가 반환한 MediQ-controlled `viewerUrl`과 `viewerSessionId`로 Viewer를 연다.
4. Viewer는 MediQ Viewer Gateway만 호출한다.

**레이아웃**

```text
┌─────────────────────────────────────────────────────────────┐
│ Study summary │ Viewer expiry │ Close Viewer                │
├───────────────┬─────────────────────────────────────────────┤
│ Series/       │                                             │
│ Instance list │             OHIF viewport                   │
│               │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Window/Level · Zoom · Pan · Scroll · Reset · Test disclaimer│
└─────────────────────────────────────────────────────────────┘
```

**P0 Viewer 기능**

- CT 또는 MRI Test Study 렌더링
- Series/Instance 탐색, Window/Level, Zoom, Pan, Scroll, Reset
- Loading/Progressive retrieval 상태
- Viewer Session 만료 카운다운 및 재승인 안내
- Source PACS unavailable, frame retrieval 실패, session revoked 상태
- `Close Viewer` 시 `DELETE /viewer-sessions/{viewerSessionId}`

**금지사항**

- Browser에서 Orthanc/PACS URL 직접 호출
- PACS basic auth, credential, raw storage reference 노출
- `viewerUrl`, ViewerSession ID, Study UID만으로 접근 허용
- Viewer 권한으로 Download/PACS Import 버튼 자동 활성화
- Service Worker, IndexedDB, browser persistent cache에 DICOM 저장

**API**

- `POST /exchange-sessions/{sessionId}/actions/view`
- `GET /viewer-sessions/{viewerSessionId}`
- `GET /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}`
- `GET /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}/frames/{frameNumber}`
- `DELETE /viewer-sessions/{viewerSessionId}`

**계약 공백:** OHIF의 Study/Series/Instance metadata discovery에 필요한 authorization-protected DICOMweb metadata 계약이 현재 OpenAPI에 완전하지 않다. `TECH-STACK-DECISION.md`의 OHIF/Streaming Validation Gate에서 경로를 검증하고, Browser→PACS 직접 연결 없이 OpenAPI를 보완해야 한다.

**Acceptance**

- AC-UI-VIEW-001: 유효한 Hospital User와 Synthetic Patient 경로가 각각 ViewerSession을 생성한다.
- AC-UI-VIEW-002: 만료·철회·Cross-Tenant·잘못된 PatientReference는 렌더링 전에 또는 다음 retrieval에서 거부된다.
- AC-UI-VIEW-003: 네트워크 추적에 Source PACS endpoint/credential이 나타나지 않는다.
- AC-UI-VIEW-004: CT/MRI Test Study가 점진적으로 렌더링되고 PACS 장애를 영구 Copy로 우회하지 않는다.

---

# 19. WEB-09 — DICOM Download 확인

**목적:** `study:download` 권한을 가진 Hospital User가 승인된 Study package를 명시적으로 다운로드한다.

**주요 UI**

- Study, Source Hospital, 파일 형식(`application/zip`), Test-only 경고
- `VIEW 권한과 DOWNLOAD 권한은 다름` 안내
- `다운로드 시작`과 `취소`
- 시작/완료/실패 상태와 Correlation ID

**API:** `POST /exchange-sessions/{sessionId}/actions/download` with `grantId`, `studyRefId`.

**규칙**

- `study:view` Grant만 있으면 버튼을 비활성화하되 서버에서도 거부한다.
- response filename은 안전하게 정규화하고 경로 문자를 제거한다.
- 브라우저 캐시와 Service Worker 저장을 사용하지 않는다.
- Object URL이나 메모리 buffer를 사용했다면 완료·취소 시 즉시 해제한다.
- P0는 크기가 제한된 Synthetic Dataset을 사용한다. 대용량 streaming 저장 방식은 Validation Gate에서 검증한다.

**계약 공백:** Download response의 `Cache-Control: private, no-store`를 OpenAPI와 구현에 명시하는 변경이 권장된다.

**Acceptance**

- AC-UI-DWN-001: `study:download` 없는 요청은 DENY된다.
- AC-UI-DWN-002: 완료·실패 Audit이 남고 화면에는 민감 Payload가 기록되지 않는다.

---

# 20. WEB-10 — Hospital B PACS Import 요청

**목적:** 승인된 Study를 지정된 Destination Hospital B Test PACS에 STOW-RS로 전달하기 전에 Mandatory Preflight 결과를 확인한다.

**Preflight UI**

| 항목 | 필수 PASS 조건 |
|---|---|
| Authentication/Tenant | 현재 Actor와 Tenant 유효 |
| Session | 접근 가능한 상태, 미만료 |
| Consent | `ACTIVE`, Destination·Action 일치 |
| Grant | `ACTIVE`, `study:pacs-transfer`, Recipient·Resource 일치 |
| Destination | Session/Consent/Grant와 동일, allowlist endpoint |
| Patient Mapping | `VALID` |
| Study/Integrity | 대상과 source/provenance context 확인 가능 |

**주요 UI**

- Source A → Destination B 방향을 큰 화살표로 표시
- Study 요약, Destination Test 표식, Mapping 상태
- Preflight 각 항목 PASS/DENY/UNKNOWN
- `Destination Verification 수행`은 P0에서 항상 true이며 사용자가 끌 수 없게 한다.
- 최종 확인 checkbox와 `Hospital B로 전송`

**API 순서**

1. `POST /exchange-sessions/{sessionId}/patient-mapping/validate`
2. 필요 시 `GET /exchange-sessions/{sessionId}`로 최신 상태 확인
3. `POST /exchange-sessions/{sessionId}/actions/pacs-import`

DEC-021/021-A: one logical request retains one UUID Idempotency-Key in verified Actor/Tenant context. X-Tenant-ID is an untrusted selector. Body only grantId/studyRefId/optional true verification. Same key identifies read-only GET `.../actions/pacs-import/status`; never key/Grant/token in URL/history. A new key is not permission to resend. No client key persistence/refresh recovery or UI implementation is claimed here.

**규칙**

- Preflight 하나라도 PASS가 아니면 전송 버튼을 활성화하지 않는다.
- UI PASS 표시와 무관하게 Backend가 전 검증을 원자적으로 다시 수행한다.
- Wrong Destination 또는 Invalid Mapping이면 STOW-RS를 호출하지 않는다.
- Double-click과 동일 화면 중복 요청을 막는다.

**Acceptance**

- AC-UI-PACS-001: Mapping `VALID` 외 상태에서는 전송할 수 없다.
- AC-UI-PACS-002: Destination 불일치·Scope 부족·Consent 무효는 STOW 전 Deny된다.
- AC-UI-PACS-003: Destination Verification을 생략한 성공 표시가 없다.

---

# 21. WEB-11 — 전송 진행

**목적:** PACS Import 요청 처리 중 사용자가 작업 상태와 안전한 이탈 규칙을 이해한다.

**현재 P0 동기 계약 UI**

- 요청 전송 후 `전송 및 검증 중`의 indeterminate progress를 표시한다.
- 단계 문구는 `서버 검증 중`, `전송·대상 확인 중`처럼 사실 범위로 제한한다.
- Backend가 개별 단계 이벤트를 주지 않으면 임의 백분율이나 완료 단계 체크를 표시하지 않는다.
- 사용자가 창을 닫아도 서버 작업 취소를 보장하지 않는다고 안내한다.

**Network interruption**

- 요청 결과가 불명확하면 자동 retry하지 않는다.
- 같은 Grant로 즉시 재전송하지 않고 보존한 동일 Idempotency-Key로 소유 작업 status를 조회한다. GET은 영상 전송·reconcile·업무 상태 변경이 아니다.
- Correlation ID를 보존해 운영자가 결과를 추적할 수 있게 한다.

**DEC-021/021-A 계약:** OpenAPI1.3.0에 동기 POST와 동일 key의 소유 작업 GET status가 정의되었다. POST200만 검증된 완료이며, 미완료는 state/code가 일치하는409다. status GET200은 조회 성공일 뿐이며 전송 완료가 아니다. completionConfirmed=true/COMPLETED와 정확히 binding된 전체 검증 결과가 있을 때만 완료를 표시한다. 중간 상태와 DENIED/FAILED/PARTIAL/RESULT_UNKNOWN을 분리하며 모든 resendAllowed=false다. 자동 재전송/202 queue 없음.404는 없음·권한 없음의 존재정보를 구분하지 않고503은 의존성/증거 확인 불가로 완료를 추정하지 않는다. Idempotency-Replayed는 실제 exact-semantic replay에서만 true다. 계약/데이터 검증은 작성했지만 실제 소유 HTTP·DB 조회/coordinator/React와 key 복구는 NOT IMPLEMENTED/NOT RUN이다.

**Acceptance**

- AC-UI-PROG-001: 서버 근거 없는 진행률을 표시하지 않는다.
- AC-UI-PROG-002: 결과 불명 상태에서 자동 중복 전송하지 않는다.
- AC-UI-PROG-003: status HTTP200/ledger state만으로 완료를 표시하지 않고 검증된 bound result를 확인한다. GET에서 재전송/reconcile하지 않는다.

---

# 22. WEB-12 — 전송 완료

**목적:** HTTP 성공이 아니라 Destination Verification과 Integrity가 충족된 최종 결과를 표시한다.

**필수 표시**

- `transferStatus = COMPLETED`
- `destinationVerified = true`
- `integrityStatus = VERIFIED`
- Source/Destination Hospital, Study reference, 완료 시각(감사 이벤트 기준)
- `provenanceId`, Session ID의 축약 표시와 복사
- `Provenance 보기`, `Audit 보기`, `Destination에서 확인` 안내

**API**

- PACS Import `PacsImportResult`
- `GET /exchange-sessions/{sessionId}/provenance`
- `GET /exchange-sessions/{sessionId}/audit-events`

**규칙**

- `destinationVerified=false`, `integrityStatus=PENDING/FAILED`, Provenance 미생성 중 하나라도 있으면 완료 화면을 표시하지 않는다.
- `COMPLETED`를 client-side 추론하거나 local state로 위조하지 않는다.

**Acceptance**

- AC-UI-DONE-001: Destination Verification과 Integrity VERIFIED가 모두 확인되어야 완료 Badge가 표시된다.
- AC-UI-DONE-002: Evidence 조회 실패는 전송 자체와 구분해 “증적 확인 필요”로 표시하며 PASS를 과장하지 않는다.

---

# 23. WEB-13 — 전송 실패·거부

**목적:** 실패 원인 범주와 안전한 복구 행동을 제공한다.

**분류**

| 범주 | 예시 Code/상태 | 사용자 행동 |
|---|---|---|
| 권한 거부 | `AUTHORIZATION_DENIED`, `GRANT_SCOPE_DENIED`, `TENANT_MISMATCH` | Context·동의·Grant 재확인 |
| 상태 충돌 | `INVALID_SESSION_STATE`, `CONSENT_REQUIRED`, `GRANT_EXPIRED` | 최신 Session 조회 후 새 승인 |
| Mapping 실패 | `PATIENT_MAPPING_INVALID` | Destination Mapping 수정 후 재검증 |
| PACS 장애 | `DICOMWEB_FAILURE`, HTTP 502 | 연결 복구 후 이력 확인, 안전한 재시도 판단 |
| 무결성 실패 | `INTEGRITY_FAILURE` | 완료 금지, 증적 확인과 관리자 조치 |
| 네트워크 불명 | timeout/offline | 자동 재요청 금지, Audit/Provenance 확인 |

**주요 UI**

- 안전한 제목, 요약, 다음 행동
- Correlation ID 복사
- `Session으로 돌아가기`, `Audit 확인`, 조건 충족 시 `Preflight 다시 실행`
- stack trace, PACS URL, credential, raw DICOM metadata는 표시하지 않는다.

**Acceptance**

- AC-UI-FAIL-001: 모든 실패가 동일한 “오류”로 뭉개지지 않는다.
- AC-UI-FAIL-002: 실패를 완료로 표시하지 않고, 재시도가 중복 전송을 만들지 않는다.

---

# 24. WEB-14 — Audit / Provenance 이력

**목적:** 승인된 Exchange에서 Actor/Action/Outcome과 영상 이동 경로를 구분해 확인한다.

**Audit UI**

- 시간순 이벤트 목록: occurredAt, action, result, reasonCode
- 축약 Actor/Tenant/Resource/Correlation ID
- Action, Result, 시간 필터(client-side 또는 계약 범위 내)
- Deny/Failure를 색상+아이콘+텍스트로 구분

**Provenance UI**

- Source Hospital → Package/Study → Destination Hospital 흐름
- Transfer Type/Status, Integrity reference, 전송 시각
- Audit와 Provenance를 별도 탭으로 구분

**API**

- `GET /exchange-sessions/{sessionId}/audit-events`
- `GET /exchange-sessions/{sessionId}/provenance`

**제한**

- 현재는 Session 단위 조회만 지원한다. 시스템 전체 Audit 검색 화면으로 확장하지 않는다.
- DICOM Binary, Password, raw token, Private Key, PACS credential을 표시·내보내지 않는다.
- CSV/PDF Export는 P0 필수가 아니다.

**Acceptance**

- AC-UI-AUD-001: 승인된 Session의 주요 Allow/Deny/Failure 이벤트를 시간순으로 확인한다.
- AC-UI-AUD-002: Cross-Tenant Session Audit은 Deny된다.
- AC-UI-AUD-003: Audit와 Provenance의 목적을 혼동하지 않는다.

---

# 25. 공통 UI 상태

| 상태 | 표시 | 허용 행동 | 금지 |
|---|---|---|---|
| Loading | Skeleton/Spinner + 작업명 | 취소 가능 작업만 취소 | 빈 화면, 중복 제출 |
| Empty | 데이터 없음과 이유 | 새로고침/이전 단계 | PACS 장애를 Empty로 표시 |
| Denied | 잠금 아이콘, 안전한 이유 | Context/승인 확인 | 숨겨진 데이터 일부 노출 |
| Expired | 만료 대상과 시간 | 재인증/새 Grant 요청 | 만료 Session 재사용 |
| PACS Unavailable | Source/Destination 구분 없는 안전 문구 | 연결 복구 후 재조회 | 내부 URL/credential 노출 |
| Network Error | 전송 여부 확정/불명 구분 | 조회는 retry, mutation은 이력 확인 | PACS Import 자동 retry |
| Server Error | 일반 메시지 + Correlation ID | 돌아가기/문의 | stack trace 표시 |
| Transfer Interrupted | 결과 불명 배너 | Audit/Provenance 확인 | 완료·실패 임의 판정 |

Screen reader가 상태 변경을 알 수 있도록 `aria-live="polite"`를 사용한다. Denied/Integrity Failure처럼 즉시 주의가 필요한 상태는 과도하지 않은 `assertive` 알림을 사용할 수 있다.

## 25.1 화면별 UI State Matrix

| Screen | Loading | Empty | Denied | Expired | PACS Unavailable |
|---|---|---|---|---|---|
| WEB-01 Login | IdP 이동 중 | 해당 없음 | 인증 실패 | Login Session 만료 | IdP unavailable로 구분 |
| WEB-02 Context | Claim 로딩 | 허용 Context 없음 | Context 전환 거부 | 인증 만료 | 해당 없음 |
| WEB-03 Dashboard | Session 로딩 | 현재 Session 없음 | Session 비공개 | Session 만료 | 상태 조회 실패와 구분 |
| WEB-04 Exchange | 생성 중 | 해당 없음 | Hospital/Tenant 거부 | 인증 만료 | 해당 없음 |
| WEB-05 Study | Skeleton | Study 없음 | 조회 권한 없음 | Session 만료 | 명시적 502 상태 |
| WEB-06 Consent Request | 제출 중 | 대상 없음 | 요청 권한 없음 | Session 만료 | 해당 없음 |
| WEB-07 Consent Decision | 상세 로딩 | 요청 없음 | Patient 불일치 | Consent 만료 | 해당 없음 |
| WEB-08 Viewer | Progressive loading | Instance 없음 | Grant/binding 거부 | ViewerSession 만료 | Source PACS failure |
| WEB-09 Download | 준비 중 | 대상 없음 | Scope 거부 | Grant 만료 | Source PACS failure |
| WEB-10 Transfer Request | Preflight 중 | 대상 없음 | Preflight 거부 | Consent/Grant 만료 | Source/Destination 장애 |
| WEB-11 Transfer Progress | Indeterminate | 해당 없음 | 처리 전 거부 | 처리 중 정책 만료 결과 | Upstream failure |
| WEB-12 Completed | Evidence 로딩 | Evidence 미확인 | Evidence 접근 거부 | 해당 없음 | 해당 없음 |
| WEB-13 Failed | 오류 상세 로딩 | 해당 없음 | 권한 실패 자체 표시 | 만료 원인 표시 | Upstream 실패 표시 |
| WEB-14 Audit/History | Timeline skeleton | Event 없음 | Evidence 접근 거부 | Session 정책에 따름 | 해당 없음 |

---

# 26. 오류·HTTP 상태 매핑

| HTTP/Code | UI 상태 | 메시지 원칙 | 다음 행동 |
|---|---|---|---|
| 400 | Validation Error | 잘못된 필드만 지목 | 입력 수정 |
| 401 | Unauthenticated | 세션 만료/인증 필요 | 재로그인 |
| 403 | Denied | 권한 없음, 민감 상세 비노출 | Context/Consent/Grant 확인 |
| 404 | Not Found | 존재 여부 과다 노출 금지 | Session/링크 확인 |
| 409 | Conflict | 현재 Domain 상태와 충돌 | 최신 상태 재조회 |
| 410 | Expired | Viewer Session 만료 | 새 Viewer 승인 요청 |
| 429 | Rate Limited | 잠시 후 재시도 | countdown 후 수동 retry |
| 502 | PACS Unavailable | Upstream 실패 | 연결 복구/이력 확인 |
| `CONSENT_REQUIRED` | Consent Pending/Required | 별도 동의 필요 | WEB-06/07 |
| `GRANT_EXPIRED` | Expired | 새 Grant 필요 | Grant 패널 |
| `PATIENT_MAPPING_INVALID` | Preflight Denied | Destination Mapping 미확인 | Mapping 수정 |
| `INTEGRITY_FAILURE` | Transfer Failed | 완료 불가 | Audit/관리자 확인 |

Error `details`는 서버가 비민감 정보임을 보장한 필드만 표시하며 기본적으로 화면에 dump하지 않는다.

---

# 27. 공통 디자인 시스템

## 27.1 Design Tokens

```text
font.family      Pretendard, Noto Sans KR, system-ui, sans-serif
font.size        12 / 14 / 16 / 20 / 24 / 32
line.height      1.4 body, 1.25 heading
space            4 / 8 / 12 / 16 / 24 / 32 / 48
radius           6 control, 8 card, 12 modal
shadow           최소 사용; 상태 구분은 border와 heading 병행

color.text       #101828
color.muted      #475467
color.surface    #FFFFFF
color.background #F8FAFC
color.border     #D0D5DD
color.primary    #155EEF
color.success    #067647
color.warning    #B54708
color.danger     #B42318
color.info       #175CD3
```

색상은 최소 WCAG 2.2 AA 대비를 실제 구현 시 자동·수동 검사한다. Success/Failure는 색상만으로 구분하지 않고 아이콘과 텍스트를 함께 사용한다.

## 27.2 공통 Components

- App Shell, Context Badge, Test Environment Banner
- Page Header, Breadcrumb, Status Badge
- Data Table/Card List, Search/Filter, Empty State
- Stepper, Preflight Checklist, Evidence Timeline
- Confirm Dialog, Destructive/High-impact Action Dialog
- Toast(보조), Inline Alert(필수 오류), Correlation ID Chip
- Skeleton, Progress Indicator, Session Expiry Warning

## 27.3 언어

- 화면 기본 언어는 한국어이며 표준 식별자와 Scope는 원문을 병기한다.
- “스트리밍”은 video stream으로 설명하지 않고 “WADO-RS 온디맨드·점진적 전달”로 표현한다.
- “전송 완료”는 Destination Verification과 Integrity VERIFIED 후에만 사용한다.

---

# 28. 접근성

- WCAG 2.2 AA를 목표로 한다.
- 모든 Action은 Keyboard로 수행 가능하고 focus order가 시각 순서와 일치해야 한다.
- focus ring을 제거하지 않는다.
- Form label, help text, error는 programmatic association을 제공한다.
- Modal open 시 focus trap, close 시 원래 trigger로 focus 복귀를 보장한다.
- Viewer toolbar는 Accessible Name과 keyboard shortcut 안내를 제공한다.
- 시간 제한은 사전 경고하고, 보안정책상 가능한 범위에서 갱신 방법을 제공한다.
- `prefers-reduced-motion`에서 불필요한 animation을 제거한다.
- 200% 확대에서도 핵심 Action과 오류가 잘리지 않아야 한다.
- Table은 header association을 제공하고 Mobile 카드 전환 시 동일 의미를 유지한다.

---

# 29. 반응형 기준

| 구간 | 기준 | 주요 변화 |
|---|---:|---|
| Mobile | 320–767px | Drawer nav, 카드 목록, 단일열 Form, 하단 Action |
| Tablet | 768–1199px | 축소 Side nav, 2열 요약, Viewer toolbar 압축 |
| Desktop | 1200px+ | 고정 Side nav, Table, 다중 패널 Viewer |

- Hospital User의 복잡한 PACS Import는 Desktop 우선이다.
- Synthetic Patient Consent는 320px 폭에서도 전체 범위와 만료를 읽고 승인할 수 있어야 한다.
- Mobile Cloud Viewer는 허용하지만 P1 Native Mobile Vault로 오인시키지 않는다.

---

# 30. Frontend와 Backend 보안 책임

| 통제 | Frontend 책임 | Backend 책임 |
|---|---|---|
| Authentication | 로그인 흐름, 만료 UI, token 비노출 | 서명·issuer·audience·expiry 검증 |
| Context | 승인된 claim만 선택, cache 격리 | Actor/Tenant/Hospital binding |
| Consent | 범위·상태 명확히 표시 | Patient binding, state transition, expiry |
| Authorization | 불가능 Action 비활성화 | Deny by Default 정책 결정 |
| Grant | Scope별 UI, expiry 경고 | Recipient/Resource/Scope/Expiry 검증 |
| Viewer | MediQ Gateway만 사용, cache 금지 | 매 요청 binding 재검증, PACS credential 보호 |
| Download | 별도 확인, 임시 buffer 정리 | `study:download`, response protection, Audit |
| PACS Import | Preflight 표시, 중복 클릭 방지 | Mandatory Preflight, STOW, Verification, Integrity |
| Audit | 최소 정보 표시 | 변조 방지 가능한 Event 기록과 데이터 최소화 |
| Error | 안전한 문구·Correlation ID | 민감정보 제거, 안정된 error code |

Frontend 검사는 보안 경계가 아니다. DevTools로 버튼을 활성화하거나 request를 변조해도 서버가 거부해야 한다.

## 30.1 Frontend Security Requirements

- Production build에서 source map 공개 여부를 검토하고 Secret을 bundle에 넣지 않는다.
- Access token은 메모리 우선으로 보관하고 `localStorage`, URL, analytics payload에 넣지 않는다.
- Cookie 기반 세션을 선택하면 `Secure`, `HttpOnly`, 적절한 `SameSite`와 CSRF 방어를 적용한다.
- CSP는 최소 `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`에서 시작하고 OHIF가 필요한 source만 좁게 허용한다. PACS origin은 `connect-src`에 넣지 않는다.
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, HTTPS/HSTS를 배포 경계에서 적용한다.
- 사용자 입력이나 서버 오류를 `innerHTML`로 직접 렌더링하지 않는다.
- DICOM response는 Service Worker/Cache API/IndexedDB에 저장하지 않는다.
- 로그·telemetry·session replay 도구는 환자정보, DICOM metadata, token, Session/Grant 식별자를 수집하지 않도록 기본 비활성 또는 allowlist 방식으로 구성한다.
- Browser 화면캡처와 외부 카메라 촬영을 완전히 막을 수 있다고 주장하지 않는다. 민감 데이터 최소표시와 Session lifecycle로 잔여 위험을 낮춘다.
- Logout/Context switch/Viewer close 시 Query Cache, object URL, decrypted/rendered buffer reference와 민감 UI state를 제거한다.

---

# 31. API Integration Matrix

| UI | Method/Path | operationId | Required Scope/Condition | 성공 출력 | Error Handling |
|---|---|---|---|---|---|
| WEB-04 | `POST /exchange-sessions` | `createExchangeSession` | Authenticated Hospital Context | ExchangeSession | 400 validation, 403 Denied, 409 Conflict |
| WEB-03 | `GET /exchange-sessions/{sessionId}` | `getExchangeSession` | Authorized Session | ExchangeSession | 401 Login, 403 Denied, 404 non-disclosing Not Found |
| WEB-10 | `POST .../patient-mapping/validate` | `validateDestinationPatientMapping` | Destination binding | Mapping result | non-VALID은 transfer 차단 |
| WEB-05 | `GET .../studies` | `listExchangeStudies` | Authorized Exchange | StudyReference[] | 403 Denied, 502 PACS Unavailable |
| WEB-06 | `POST .../consents/request` | `requestConsent` | Authorized Session/Actions | Consent | 403 Denied, 409 최신 상태 조회 |
| WEB-07 | `POST .../consents/{consentId}/approve` | `approveConsent` | Matching PatientReference | Consent ACTIVE | 403 Denied, 409 상태 충돌 |
| WEB-07 | `POST .../consents/{consentId}/withdraw` | `withdrawConsent` | Matching PatientReference | Consent WITHDRAWN | 403 Denied, 409 상태 충돌 |
| Grant panel | `POST .../grants/issue` | `issueTransferGrant` | ACTIVE Consent, allowed scope | TransferGrant | 403 scope/recipient Denied, 409 Conflict |
| Grant panel | `POST .../grants/{grantId}/revoke` | `revokeTransferGrant` | Exact verified recipient USER/Tenant/Hospital/Session binding | TransferGrant (`no-store`; idempotent already-revoked replay) | 403 Denied, 409 terminal state, 503 rollback; no offline/in-flight recall claim |
| WEB-08 | `POST .../actions/view` | `authorizeViewerAccess` | `study:view` | ViewerAccess | 403 Denied, 409 Conflict, 502 PACS failure |
| WEB-08 | `GET /viewer-sessions/{viewerSessionId}` | `getViewerSession` | Actor/resource binding | state | 403 Denied, 404 Not Found, 410 Expired |
| WEB-08 | `GET .../instances/{sopInstanceUid}` | `retrieveViewerDicomInstance` | `study:view` + binding | DICOM binary | 403 Denied, 410 Expired, 502 PACS failure |
| WEB-08 | `GET .../frames/{frameNumber}` | `retrieveViewerFrame` | `study:view` + binding | JPEG frame | 403 Denied, 410 Expired, 502 PACS failure |
| WEB-08 | `DELETE /viewer-sessions/{viewerSessionId}` | `closeViewerSession` | Bound ViewerSession | 204 | 403 Denied, 404 Not Found |
| WEB-09 | `POST .../actions/download` | `downloadDicomStudy` | `study:download` | ZIP binary | 403 Denied, 409 Conflict, 502 PACS failure |
| WEB-10~13 | `POST .../actions/pacs-import` | `importStudyToDestinationPacs` | `study:pacs-transfer` + Preflight | PacsImportResult | 403 Denied, 409 Precondition, 502 PACS failure |
| WEB-14 | `GET .../provenance` | `getExchangeProvenance` | Authorized Session Evidence | Provenance[] | 403 Denied |
| WEB-14 | `GET .../audit-events` | `getExchangeAuditEvents` | Authorized Session Evidence | AuditEvent[] | 403 Denied |

## 31.1 구현 전 계약 보완 목록

| ID | 공백 | 영향 | 처리 원칙 |
|---|---|---|---|
| UI-GAP-001 | Consent 상세 조회 API 없음 | 환자가 승인 전 범위를 안전하게 재조회하기 어려움 | OpenAPI/Requirement/Acceptance 동시 개정 |
| UI-GAP-002 | Consent Reject Action 없음 | `REJECTED` 상태를 UI에서 만들 수 없음 | 버튼 미구현 또는 정식 Action 추가 |
| UI-GAP-003 | Exchange 목록 API 없음 | Dashboard 목록/카운터 불가 | 단건 P0 유지 또는 pagination 계약 추가 |
| UI-GAP-004 | OHIF용 Study/Series/Instance metadata 계약 불완전 | Viewer integration 차단 가능 | Viewer Gateway Validation 후 계약 보완 |
| UI-GAP-005 | PACS Import operation/status API 없음 | 장시간 진행·새로고침 복구 어려움 | 동기 P0 한계 수용 또는 202 operation 계약 추가 |
| UI-GAP-006 | Download no-store header 미명시 | 브라우저 캐시 정책 불명확 | OpenAPI response header 보완 권장 |
| UI-GAP-007 | OIDC Context/role claim 계약 미정 | WEB-01/02 구현 기준 부족 | Identity profile 문서화 |
| UI-GAP-008 | Domain 예시 PatientRef와 OpenAPI UUID 형식 불일치 | 입력·표시 혼선 | UUID를 P0 구현 기준으로 하고 alias 여부 결정 |

공백은 Frontend 전용 endpoint나 hard-coded fixture로 조용히 우회하지 않는다.

---

# 32. UI State Matrix

| Domain State | Badge | 주요 Action | 차단 Action |
|---|---|---|---|
| `REQUESTED` | 요청됨 | Study 조회, Consent 요청 | Grant/Imaging Action |
| `CONSENT_PENDING` | 동의 대기 | Consent 상태 확인 | Grant/Imaging Action |
| `CONSENTED` | 동의됨 | Grant 발급 | Scope 없는 Imaging Action |
| `AUTHORIZED` | 승인됨 | 대상 Action 준비 | Scope 외 Action |
| `READY` | 준비됨 | View/Download/PACS Import | Scope 외 Action |
| `ACTIVE` | 처리 중 | 상태 확인 | 중복 Mutation |
| `COMPLETED` | 완료 | Evidence 조회 | 같은 요청 재실행 기본 차단 |
| `REJECTED` | 거절 | 새 요청 정책 확인 | 기존 Consent 사용 |
| `EXPIRED` | 만료 | 새 Session/Consent/Grant | 기존 권한 재사용 |
| `REVOKED` | 취소됨 | 새 승인 흐름 | 기존 권한 재사용 |
| `FAILED` | 실패 | Audit, 안전한 재시도 판단 | 완료 표시 |
| `CANCELLED` | 취소됨 | 새 Exchange | 기존 흐름 계속 |

Consent, Grant, ViewerSession, Transfer/Integrity 상태는 Exchange State와 별도 표시한다. 하나의 종합 Badge로 세부 보안 상태를 숨기지 않는다.

---

# 33. Security Control Matrix

| Screen | Security Risk | UI Control | Backend Enforcement | Evidence |
|---|---|---|---|---|
| WEB-02/03 | Cross-Tenant 접근 | Context 표시·cache 분리 | Tenant isolation | DENY Audit |
| WEB-06/07 | Consent=권한 오인 | 별도 단계·문구 | Authorization/Grant 별도 평가 | Consent + Grant Event |
| Grant/Actions | Scope 상승 | Action별 버튼/Grant | Scope exact match | GRANT_DENIED/ACCESS_DENIED |
| WEB-08 | Viewer URL 유출 | URL 비노출·history 최소화 | short-lived binding, 매 요청 검증 | Viewer Audit |
| WEB-08 | PACS credential 노출 | Gateway만 호출 | backend-only secret | Network/security test |
| WEB-08 | UID 직접 접근 | UI deep link 금지 | UID 단독 권한 불인정 | TC-VIEW-008 |
| WEB-09 | Download 잔존 | no persistent cache | no-store, authorization | Download Audit |
| WEB-10 | Wrong Destination | 방향·Preflight 표시 | destination binding | STOW 미호출 Evidence |
| WEB-10/11 | 중복 전송 | 버튼 lock, 자동 retry 금지 | idempotency/duplicate prevention | Transfer Audit |
| 공통 | 민감 로그 | client logging 최소화 | payload/secret exclusion | Log review |
| WEB-12 | 완료 위조 | verified 결과만 완료 화면 | verification+integrity gate | Provenance/Audit |

---

# 34. Acceptance Test Matrix

| Test ID | Screen | 연계 기준 | Scenario | Expected Result | Status |
|---|---|---|---|---|---|
| AC-UI-AUTH-001~003 | WEB-01 | Security AuthN | 비인증/만료/위조 callback | 보호 Route DENY | NOT RUN |
| AC-UI-CTX-001~002 | WEB-02 | Tenant Isolation | Context 변조·전환 | DENY + 이전 cache 제거 | NOT RUN |
| AC-UI-EXC-001~003 | WEB-03/04 | Exchange/Mapping | 올바른·잘못된 입력 | 생성 또는 안전한 거부 | NOT RUN |
| AC-UI-STU-001~003 | WEB-05 | QIDO/AT-DICOM | Study 조회/PACS 장애 | 범위 내 목록 또는 명시적 장애 | NOT RUN |
| AC-UI-CON-001~006 | WEB-06/07 | Consent tests | 요청·승인·철회·불일치 | 올바른 상태 전이/DENY | NOT RUN |
| AC-UI-VIEW-001~004 | WEB-08 | TC-VIEW-004~009 | Hospital/Patient Viewer, 만료, PACS 장애 | Render 또는 Fail Closed | NOT RUN |
| AC-UI-DWN-001~002 | WEB-09 | REQ-DWN/Download AT | view-only vs download Grant | DENY/PASS + Audit | NOT RUN |
| AC-UI-PACS-001~003 | WEB-10 | PACS/Mapping/Security AT | invalid mapping/wrong destination/golden path | STOW 미호출 또는 verified PASS | NOT RUN |
| AC-UI-PROG-001~002 | WEB-11 | Retry/Idempotency | timeout·중복 클릭 | 상태 과장·중복 전송 없음 | NOT RUN |
| AC-UI-DONE-001~002 | WEB-12 | Integrity/Provenance | verified/unverified result | verified만 완료 | NOT RUN |
| AC-UI-FAIL-001~002 | WEB-13 | Error/Audit | 403/409/502/timeout | 안전한 오류·추적 가능 | NOT RUN |
| AC-UI-AUD-001~003 | WEB-14 | AT-FUNC-016/SEC-AUD | Session Audit/Provenance | 권한 내 최소 정보 | NOT RUN |

## 34.1 Browser E2E 최소 시나리오

1. Hospital User Viewer Golden Path
2. Synthetic Patient Consent 승인 및 Viewer Golden Path
3. View-only Grant로 Download/PACS Import 거부
4. Invalid Mapping에서 STOW-RS 미호출
5. Hospital A → Hospital B 전송, Destination Verification, Integrity VERIFIED, Evidence 확인
6. Cross-Tenant Session/Consent/Viewer/Audit 접근 거부
7. Viewer Session 만료·철회 후 다음 retrieval 거부
8. PACS unavailable에서 Empty/Completed가 아닌 명시적 실패 표시
9. PACS Import timeout에서 자동 재전송 없음
10. Keyboard-only Consent 및 핵심 Action 수행

테스트 도구는 `Vitest + Playwright + Docker Compose + PostgreSQL + Orthanc A/B` 기준을 따른다.

---

# 35. P0/P1/P2 범위

## 35.1 P0 — 필수

- OIDC 로그인과 승인된 Context 선택
- PatientReference 기반 Exchange 생성/단건 조회
- Study 조회와 선택
- Consent 요청·승인·철회
- Scope별 Grant 발급·취소
- Hospital User/Synthetic Patient Cloud Viewer
- DICOM Download
- Mandatory Preflight와 Hospital B PACS Import
- 완료/실패/불명 상태
- Session Audit/Provenance
- 접근성 핵심 기준과 반응형 Patient 흐름

## 35.2 P1 — 별도 승인 Track

- Android Native Mobile Secure Vault와 Mobile Viewer
- `study:mobile-export`
- Device binding, offline lease, hardware-backed key 정책 UI
- Mobile capture/background/device-loss 보안 UX

## 35.3 P2 / POST-MVP

- System-wide 관리자 Dashboard와 분석
- 병원·사용자 Lifecycle 관리 콘솔
- Audit export/report builder
- 대규모 업무 Queue, Saved Search, Notification Center
- 상용 Production PACS/EMR와 실환자 Identity 연동

---

# 36. 구현 우선순위

```text
1. UI 계약 공백 결정(UI-GAP-001/004/005/007)
2. App Shell + OIDC + Context isolation
3. Exchange → Study → Consent 수직 슬라이스
4. Grant + Hospital/Synthetic Patient Viewer
5. Download
6. PACS Import Preflight → Progress → Result
7. Audit/Provenance
8. Cross-Tenant/Denied/Expired/Upstream failure Browser E2E
9. 반응형·접근성·시각 QA
```

UI polish가 Hospital A → MediQ → Hospital B Golden Path 통합보다 앞서지 않는다.

---

# 37. Open Decisions

| ID | 결정 필요사항 | 권고 | 차단 범위 |
|---|---|---|---|
| UI-DEC-001 | OIDC Provider와 claim profile | 로컬 Test IdP + 명시적 Actor/Tenant/Hospital claims | WEB-01/02 |
| UI-DEC-002 | Consent 상세·거절 계약 | 상세 GET은 P0 추가, Reject는 P0 필요성 검토 | WEB-07 |
| UI-DEC-003 | Dashboard 목록 | P0는 단건 우선, 필요 시 pagination API 추가 | WEB-03 |
| UI-DEC-004 | OHIF Gateway metadata route | Backend-only PACS 원칙 내 DICOMweb facade 확정 | WEB-08 |
| UI-DEC-005 | PACS Import sync/async | 작은 Test Dataset 검증 후 timeout이면 operation model 채택 | WEB-11 |
| UI-DEC-006 | PatientReference 표현 | API UUID 유지, 화면용 Test alias는 별도 비권한 표시값 | WEB-04/07 |
| UI-DEC-007 | Download 저장 UX | Synthetic size limit과 streaming feasibility 검증 | WEB-09 |

결정 항목은 승인 없이 구현 사실로 간주하지 않는다.

---

# 38. Definition of Done

P0 Web UI는 다음을 모두 충족해야 `DONE`으로 판단한다.

- 승인된 화면과 상태가 구현되었다.
- OpenAPI와 UI 호출이 일치하고 계약 공백이 승인된 방식으로 해결되었다.
- Hospital User와 Synthetic Patient 흐름이 모두 재현된다.
- VIEW/DOWNLOAD/PACS_IMPORT Scope 격리가 서버와 UI에서 검증된다.
- Browser가 PACS endpoint/credential을 직접 받지 않는다.
- Hospital A → MediQ → Hospital B Golden Path가 Destination Verification, Integrity, Provenance, Audit까지 PASS한다.
- Cross-Tenant, no consent, invalid/expired grant, wrong destination, invalid mapping, PACS unavailable 경로가 Fail Closed한다.
- Playwright E2E, 접근성 검사, 반응형 시각 QA 증거가 있다.
- 실제 환자정보, 운영 Credential, 운영 DICOM이 사용되지 않았다.

현재 상태는 문서화만 완료되었으므로 `IMPLEMENTED != DONE`이며 모든 실행 검증은 `NOT RUN`이다.

---

# 39. References

- `PROJECT-CHARTER.md`
- `CAPSTONE-MVP-BOUNDARY.md`
- `PRODUCT-BASELINE.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `DOMAIN-MODEL.md`
- `SYSTEM-ARCHITECTURE.md`
- `TECH-STACK-DECISION.md`
- `DATA-FLOW.md`
- `OPENAPI.yaml`
- `THREAT-MODEL.md`
- `ACCEPTANCE-TESTS.md`
- `IMPLEMENTATION-PLAN.md`
- `REPOSITORY-BASELINE-AUDIT.md`
