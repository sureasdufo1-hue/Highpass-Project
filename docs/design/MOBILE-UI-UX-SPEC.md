# MediQ Mobile Secure Vault UI/UX Specification

**Project:** MediQ  
**Product:** Patient-Controlled Medical Imaging Mobility SaaS  
**Document:** `MOBILE-UI-UX-SPEC.md`  
**Version:** v1.5 Synthetic Patient Explanation RAG Amendment  
**Baseline Date:** 2026-09-20  
**Scope:** CAPSTONE-P1 / Android-first / Synthetic·Test·De-identified DICOM  
**Status:** APPROVED P1 UI/UX BASELINE — DOCUMENTED, NOT IMPLEMENTED / NOT TESTED  
**Implementation Dependency:** P0 Golden Path와 P0 Security Validation PASS 후 착수  
**Native Mobile Stack:** OPEN DECISION

---

# 1. 목적과 문서 상태

본 문서는 환자가 승인된 의료영상을 Android 기기의 암호화 Mobile Vault에 저장하고, 허용된 Offline Lease 안에서 로컬 DICOM Viewer로 열람하는 P1 사용자 경험을 정의한다.

합성 Web Prototype에서 검증할 보조 UX로 통합 Timeline, 쉬운 모드, 데이터 최신성, 진료 질문과 `AI 질문용 자료 만들기`를 추가한다. 해당 AI 흐름은 합성 Record 선택 → 포함항목 확인 → 식별정보 제외 Preview → 위험 고지 → Local Copy에서 종료하며 외부 Provider를 자동으로 열거나 호출하지 않는다.

합성 RAG UX는 별도로 `설명 대상 선택 → 질문 목적 선택 → 근거 검색 → 설명·출처·질문 표시`를 따른다. 근거 부족·충돌·금지 Intent·검증 실패 시 빈 답변이나 추정 대신 명시적인 답변 보류 화면을 표시한다.

이 문서는 다음을 정식 기준으로 만든다.

- 화면 15종과 화면 간 이동
- 기기 등록, 보안등급 판정, Mobile Export, 암호화 저장, 오프라인 열람, 철회, 분실 및 재등록 흐름
- 화면별 서버 검증, API 의존성, Audit Event 및 Acceptance Criteria
- Device, Capsule, Offline Lease, Local Viewer Session 상태 표현
- Android 우선 정책과 iOS 후속 경계
- 접근성, 오류·빈 상태, 민감정보 최소 표시 원칙

이 문서는 모바일 앱 구현, API 구현, 데이터베이스 Migration, PACS 연동 또는 보안시험 완료를 의미하지 않는다. 현재 저장소에는 실행 가능한 Native Mobile Application과 P1 Mobile API가 없으며 모든 Mobile Acceptance Test는 `NOT RUN`이다.

---

# 2. 승인 기준과 충돌 처리

본 명세는 다음 문서를 따른다.

1. `PROJECT-CHARTER.md`
2. `CAPSTONE-MVP-BOUNDARY.md`
3. `PRODUCT-BASELINE.md`
4. `REQUIREMENTS.md`
5. `SECURITY-REQUIREMENTS.md`
6. `DOMAIN-MODEL.md`
7. `DATA-MODEL.md`
8. `ERD.md`
9. `SYSTEM-ARCHITECTURE.md`
10. `DATA-FLOW.md`
11. `OPENAPI.yaml`
12. `THREAT-MODEL.md`
13. `ACCEPTANCE-TESTS.md`
14. `IMPLEMENTATION-PLAN.md`
15. `TECH-STACK-DECISION.md`
16. `P0-WEB-UI-UX-SPEC.md`
17. `DICOM-INTEROPERABILITY-PROFILE.md`

충돌 시 상위 제품 기준, `DENY BY DEFAULT`, `FAIL CLOSED` 및 Mobile Domain Invariant를 우선한다. 첨부된 Highpass 작성 프롬프트는 문서 구성 참고자료이며 MediQ의 명칭, 범위 또는 승인 정책을 대체하지 않는다.

---

# 3. 현재 기준선 조사

| 영역 | 상태 | 근거와 UI 영향 |
|---|---|---|
| Android Native App | `NOT IMPLEMENTED` | 앱 디렉터리와 실행 코드가 없음 |
| iOS Native App | `OUT OF P1 / FUTURE` | P1은 Android 우선, iOS는 가능한 범위에서 Responsive Cloud Viewer 사용 |
| Mobile 개발 Framework | `OPEN DECISION` | Kotlin/Compose 등 구체 Stack은 별도 ADR 필요 |
| Patient Identity | `DOCUMENTED / API GAP` | PatientReference 결합 원칙은 있으나 Mobile 전용 Context API 없음 |
| Device Registration | `DOCUMENTED / API GAP` | Domain Object와 정책만 존재 |
| Device Admission | `DOCUMENTED / NOT TESTED` | 검증된 `STRONGBOX` 또는 `TRUSTED_ENVIRONMENT`만 Persistent Vault 허용 |
| Mobile Export | `DOCUMENTED / API GAP` | `study:mobile-export` Scope는 있으나 OpenAPI Endpoint 없음 |
| Local Encryption | `DOCUMENTED / NOT IMPLEMENTED` | AES-256-GCM, Capsule별 DEK, Versioned Wrap Slot |
| Offline Lease | `DOCUMENTED / NOT IMPLEMENTED` | 마지막 발급 또는 온라인 검증 후 최대 30일 |
| Local DICOM Viewer | `DOCUMENTED / NOT IMPLEMENTED` | 실제 Codec 지원 조합 검증 필요 |
| Consent / Grant | `PARTIAL CONTRACT` | P0 Withdraw/Revoke API는 존재하나 Mobile Export 계약은 없음 |
| Device Revocation | `DOCUMENTED / API GAP` | LOST/REVOKED/RETIRED 상태만 정의 |
| Cloud Viewer Fallback | `DOCUMENTED / P0 API CONTRACT` | Backend Viewer Session과 WADO-RS Gateway 경로 사용 |
| Acceptance | `PLANNED / NOT RUN` | `TC-MOB-007`~`TC-MOB-017` |

지원 또는 보안 완료 표시는 실행 증거가 있을 때만 갱신한다.

---

# 4. 제품 경계

## 4.1 P1 포함

- Android Native Mobile Vault
- Patient 로그인과 PatientReference Context 확인
- Device Key 생성, Attestation/Integrity 제출 및 Device Admission
- 검증된 StrongBox 또는 TEE 기기에 대한 Persistent Vault 허용
- `study:mobile-export`의 명시적 승인
- AES-256-GCM Capsule 다운로드와 App-private 저장
- 30일 Offline Lease
- 로컬 사용자 인증 후 DICOM 열람
- Background 즉시 Privacy Screen과 60초 재인증 유예
- 플랫폼 범위 내 Screenshot·Recording·비보안 Display 제한
- Consent/Grant/Device 상태 갱신과 향후 접근 차단
- 분실 기기 Revoke 및 Source PACS 기반 새 Capsule 재발급

## 4.2 P0와의 관계

P0 Cloud Viewer는 Source PACS 데이터를 Backend Authorization Gateway를 통해 WADO-RS로 온디맨드 조회한다. Persistent Vault를 허용할 수 없는 Android와 P1 Native iOS 미지원 환경에는 이 경로를 안전한 대안으로 제공할 수 있다. Cloud Viewer도 매 요청에서 Identity, Tenant, Consent, Authorization, Grant 및 Session을 검증하며 PACS Endpoint나 Credential을 Client에 전달하지 않는다.

## 4.3 비목표

- Mobile Vault를 Hospital PACS 또는 Cloud Archive의 대체본으로 사용하는 것
- Device Key Cloud Escrow 또는 기기 간 Vault 복구
- Gallery, Shared Storage, 일반 File Manager로 DICOM Export
- Mobile Capsule이나 복호화 DICOM을 Hospital B에 직접 업로드하는 기능
- Mobile Export 승인을 병원 간 제공 동의로 간주하는 것
- 외부 카메라 촬영까지 완전히 차단한다고 보장하는 것
- 실제 환자·운영 PACS·운영 Credential 사용
- 보호자·법정대리인 기능의 자동 P1 포함

병원 간 전달은 별도 `study:pacs-transfer` Consent/Grant와 Backend Preflight를 거쳐 Source PACS에서 Destination PACS로 STOW-RS 전송한다. 모바일의 “공유 요청”은 P2 후보이며 승인되더라도 로컬 Capsule 업로드가 아니라 서버 측 새 Exchange 요청이어야 한다.

---

# 5. 사용자와 접근 범위

| Actor | P1 상태 | 접근 |
|---|---|---|
| `PATIENT` | 정식 사용자 | 본인 PatientReference에 결합된 Study와 Vault만 접근 |
| `AUTHORIZED_GUARDIAN` | P2 후보 | 별도 Identity, 법적 권한, Consent 모델 승인 전 사용 금지 |
| `AUTHORIZED_REPRESENTATIVE` | P2 후보 | 별도 위임·만료·철회 모델 승인 전 사용 금지 |
| Hospital User | Mobile Vault 사용자 아님 | P0 Web과 PACS Transfer 흐름 사용 |

로그인 성공만으로 Patient Mapping이 완료되었다고 보지 않는다. Client가 임의의 Hospital Patient ID나 PatientReference를 입력하여 Context를 바꿀 수 없으며 Backend가 인증 Subject와 승인된 PatientReference를 결합한다.

---

# 6. 핵심 UX·보안 원칙

1. **Patient-Controlled:** 저장 대상, Source Hospital, 대상 Device, Offline 기간 및 철회 한계를 승인 전에 보여준다.
2. **Secure by Default:** 확인 불가능하거나 약한 기기는 로컬 저장을 허용하지 않는다.
3. **No Silent Downgrade:** StrongBox 실패를 Software Key로 낮추지 않는다. 검증된 TEE 전환만 서버 정책이 허용한다.
4. **Fast Viewing:** 암호화 상태를 유지한 채 필요한 Instance/Chunk만 메모리에서 점진 복호화하며 전체 평문 파일을 만들지 않는다.
5. **Separate Authorities:** Server 로그인, Patient Identity, Mobile Export Grant, Local Vault Unlock을 서로 대체하지 않는다.
6. **Honest Security:** 원격 삭제 요청과 실제 삭제 확인, 서버 철회와 Offline Device 반영을 구분한다.
7. **Minimum Disclosure:** 목록과 알림에 최소한의 검사 정보만 표시하고 PACS 내부 ID, Token, Key, 원문 DICOM Metadata를 노출하지 않는다.
8. **Fail Closed:** Lease, Device Binding, Integrity, Codec 또는 Authorization을 확인할 수 없으면 복호화·Viewer를 열지 않는다.
9. **Recoverable UX:** 거부 시 안전한 대안, 재시도 조건 및 Correlation ID를 제공한다.
10. **Evidence before PASS:** UI가 보이는 것과 보안 통제가 실제로 검증된 것을 구분한다.

---

# 7. 정보구조와 전체 흐름

## 7.1 기본 Navigation

```text
MediQ Mobile
├── 내 영상
│   ├── Study 상세
│   ├── Cloud Viewer
│   └── Mobile Export 승인
├── Vault
│   ├── 저장 Study
│   ├── Offline Lease
│   └── Local DICOM Viewer
├── 기기
│   ├── 현재 기기
│   ├── 등록 기기
│   └── 분실·폐기·재등록
└── 설정
    ├── 보안
    ├── 저장공간
    ├── 세션
    └── 정책·지원정보
```

로그인 전에는 보호 Navigation을 표시하지 않는다. Persistent Vault 미지원 기기에는 Vault Tab 대신 “이 기기 저장 불가” 상태와 Cloud Viewer 경로를 표시한다.

## 7.2 Flow A — 최초 등록 및 저장

```text
MOB-01 앱 시작·로그인
  → MOB-02 Patient Identity 확인
  → MOB-03 기기 등록·보안등급 검사
  → MOB-05 내 의료영상 목록
  → MOB-06 Study 상세
  → MOB-07 Mobile Export 승인
  → MOB-08 보호 패키지 준비·다운로드·검증
  → MOB-09 Mobile Vault
  → MOB-10 Local DICOM Viewer
```

## 7.3 Flow B — 지원 불가 기기

```text
MOB-03 Device Admission 실패
  → MOB-04 사유와 로컬 저장 제한 안내
  → P0 Cloud Viewer 재인가
  → 성공 시 Viewer / 실패 시 안전한 거부 화면
```

## 7.4 Flow C — Offline Lease 만료

```text
MOB-09 또는 MOB-10에서 만료 감지
  → MOB-11 Offline Lease 만료
  → 온라인 연결
  → Consent + Grant + Account + Device 상태 재검증
  ├── 허용: 새 Lease/Wrap 적용 → MOB-09 또는 MOB-10
  └── 거부: Viewer 차단 → 삭제 또는 새 승인 안내
```

## 7.5 Flow D — 분실 및 재등록

```text
MOB-13 기존 기기 분실 신고
  → 서버 Device 상태 LOST/REVOKED
  → 향후 Session·Lease 갱신 차단
  → MOB-14 새 기기 로그인·Identity 재확인
  → 새 Device Key + Admission
  → 현재 Consent/Authorization/study:mobile-export 재검증
  → Source PACS 재조회
  → 새 Device-bound Capsule 발급
```

## 7.6 Flow E — 로컬 열람 Session

```text
Capsule 선택
  → Device Binding + Lease + Integrity 확인
  → Local Authentication
  → 필요한 Chunk만 메모리 복호화
  → Viewer ACTIVE
  → Background 즉시 PRIVACY_LOCKED + Pixel Buffer 제거
  ├── 60초 이내·동일 Unlocked Device: 재개 가능
  └── 그 외: AUTH_REQUIRED
```

---

# 8. 상태 모델

## 8.1 Device

```text
UNREGISTERED --등록 요청--> PENDING --검증 성공--> ACTIVE
                              └--검증 실패--> UI: UNSUPPORTED
ACTIVE --분실 신고--> LOST
ACTIVE --정책 철회--> REVOKED
ACTIVE --사용 종료--> RETIRED
LOST/REVOKED/RETIRED --복원 금지--> 새 Device를 별도 등록
```

`UNSUPPORTED`는 Domain의 `MobileDevice.status`가 아니라 UI 판정이다. 실제 저장 허용은 `platform=ANDROID`, `attestation_status=VERIFIED`, `key_security_level=STRONGBOX|TRUSTED_ENVIRONMENT`, 정책 적합 상태가 모두 참일 때만 가능하다.

## 8.2 Capsule/Vault

```text
NOT_PRESENT
  → REQUESTED
  → AUTHORIZED
  → PREPARING_PROTECTED_PACKAGE
  → DOWNLOADING_CIPHERTEXT
  → VERIFYING
  → ACTIVE
  ├── EXPIRED
  ├── REVOKED
  └── CRYPTO_SHREDDED
```

`REQUESTED`~`VERIFYING`은 UI Operation 상태 제안이며 OpenAPI/Domain에 아직 승인되지 않았다. Domain 정식 Capsule 상태는 `ACTIVE | EXPIRED | REVOKED | CRYPTO_SHREDDED`다.

## 8.3 Offline Lease

```text
ACTIVE --만료 임박--> EXPIRING --기한 경과--> EXPIRED
EXPIRED --온라인 재검증 허용--> ACTIVE
EXPIRED --온라인 재검증 거부--> UI: RENEWAL_DENIED
```

`EXPIRING`과 `RENEWAL_DENIED`는 UI 파생 상태다. 기본 Offline Lease는 마지막 성공한 발급 또는 온라인 정책 검증 시점부터 최대 30일이다.

## 8.4 Local Viewer Session

```text
CLOSED → AUTH_REQUIRED → ACTIVE
ACTIVE --Background/Inactive--> PRIVACY_LOCKED
PRIVACY_LOCKED --60초 이내·기기 잠금 없음--> ACTIVE
PRIVACY_LOCKED --60초 초과/잠금/상태변경--> AUTH_REQUIRED
ACTIVE/PRIVACY_LOCKED/AUTH_REQUIRED --종료--> CLOSED
```

60초는 화면 노출 유예가 아니라 재인증 편의 유예다. Background 진입 즉시 화면을 가리고 렌더링을 중단하며 복호화 Pixel Buffer를 제거한다.

---

# 9. Screen Inventory

| ID | 화면 | 주 사용자 | 우선순위 | 구현 상태 |
|---|---|---|---|---|
| MOB-01 | 앱 시작·로그인 | Patient | P1-Critical | Not implemented |
| MOB-02 | 환자 Identity 확인 | Patient | P1-Critical | Not implemented |
| MOB-03 | 기기 등록과 보안등급 확인 | Patient | P1-Critical | Not implemented |
| MOB-04 | 지원 불가 기기·Cloud Viewer 전환 | Patient | P1-Critical | Not implemented |
| MOB-05 | 내 의료영상 목록 | Patient | P1-High | Not implemented |
| MOB-06 | 의료영상 상세 | Patient | P1-High | Not implemented |
| MOB-07 | Mobile Export 승인 | Patient | P1-Critical | Not implemented |
| MOB-08 | 보호 패키지 다운로드·검증 | Patient | P1-Critical | Not implemented |
| MOB-09 | Mobile Vault | Patient | P1-Critical | Not implemented |
| MOB-10 | Local DICOM Viewer | Patient | P1-Critical | Not implemented |
| MOB-11 | Offline Lease 만료 | Patient | P1-Critical | Not implemented |
| MOB-12 | Consent·Grant 철회 | Patient | P1-High | Not implemented |
| MOB-13 | 분실·폐기 기기 | Patient | P1-Critical | Not implemented |
| MOB-14 | 새 기기 재등록 | Patient | P1-Critical | Not implemented |
| MOB-15 | 보안·저장공간 설정 | Patient | P1-High | Not implemented |

---

# 10. 공통 화면 상태와 메시지 규칙

| 상태 | UI 규칙 | 보안 규칙 |
|---|---|---|
| Loading | Skeleton 또는 단계명 표시, 중복 제출 차단 | 실제 서버 상태 없는 가짜 진척률 금지 |
| Empty | 왜 비었는지와 가능한 다음 행동 표시 | 다른 Patient/Tenant 데이터로 채우지 않음 |
| Denied | 사용자 언어의 사유 분류와 Correlation ID | 내부 정책식, Token, PACS 주소 노출 금지 |
| Expired | 만료 대상과 갱신 조건 표시 | Offline 상태에서 우회 버튼 금지 |
| Offline | 로컬에서 가능한 기능만 활성화 | 서버 재검증이 필요한 행위는 차단 |
| Error | 재시도 가능 여부와 안전한 복귀점 표시 | 불확실하면 실패 폐쇄, 민감 Stack Trace 금지 |
| Success | 서버가 확인한 결과만 표시 | 저장·삭제·철회 완료를 추정하지 않음 |

공통 오류 분류는 `AUTH_REQUIRED`, `IDENTITY_UNVERIFIED`, `DEVICE_UNSUPPORTED`, `CONSENT_INVALID`, `GRANT_INVALID`, `LEASE_EXPIRED`, `INTEGRITY_FAILED`, `STORAGE_FULL`, `NETWORK_UNAVAILABLE`, `CODEC_UNSUPPORTED`, `SERVER_UNAVAILABLE`을 사용한다. 이 값은 UI Error Taxonomy이며 API Error Code로 확정하려면 OpenAPI 개정이 필요하다.

---

# 11. 화면별 상세 명세

## MOB-01 — 앱 시작·로그인

| 항목 | 명세 |
|---|---|
| Purpose | 서버 사용자를 인증하고 보호 영역 진입 전 Session과 App 무결성을 확인한다. |
| User Role | `PATIENT` |
| Entry Conditions | 앱 실행, Session 만료, Logout, 보안 이벤트 후 재진입 |
| UI Layout | Logo/서비스 설명, 테스트 환경 Banner, 로그인 CTA, 상태·오류 영역, 개인정보·지원 링크 |
| UI Components | `로그인`, `다시 시도`, `도움말`; Password를 앱이 직접 수집하는 UI는 승인된 OIDC 방식에 따라 결정 |
| Displayed Data | 환경명, 앱 버전, 최소 Session 상태; 환자정보와 Token은 표시하지 않음 |
| User Actions | 로그인 시작, 취소, 재시도 |
| Security Requirements | System Browser/OIDC 후보, PKCE·State·Nonce 검증, Token 원문 로그 금지, Vault Unlock과 서버 로그인을 구분 |
| API Dependencies | 인증 Provider와 Mobile Session 계약 `PROPOSED`; 현재 OpenAPI에 없음 |
| Loading State | “안전하게 로그인하는 중”; 중복 시작 차단 |
| Empty State | 해당 없음 |
| Denied State | 계정 비활성·역할 부적합 시 Vault와 목록 진입 금지 |
| Expired State | Session 만료 안내 후 재로그인 |
| Offline State | 유효한 Local Vault Session이 없으면 로그인 불가; 기존 Vault는 MOB-09 정책으로 분리 |
| Error State | 안전한 요약과 Correlation ID, 재시도 |
| Success State | Patient Context 확인을 위해 MOB-02로 이동 |
| Navigation | 시작 → MOB-02 또는 공개 도움말 |
| Audit Events | `MOBILE_LOGIN_SUCCEEDED`, `MOBILE_LOGIN_FAILED`, `MOBILE_SESSION_EXPIRED`; 민감 인증정보 제외 |
| Acceptance Criteria | 실패 인증은 보호 데이터에 접근하지 못하고, 자동 로그인은 Server Session과 Vault Unlock을 자동 결합하지 않는다. |

## MOB-02 — 환자 Identity 확인

| 항목 | 명세 |
|---|---|
| Purpose | 로그인 Subject와 승인된 MediQ PatientReference 결합 상태를 확인한다. |
| User Role | `PATIENT` |
| Entry Conditions | MOB-01 인증 성공, 재등록 또는 Identity 재검증 요구 |
| UI Layout | 확인 상태, 최소 마스킹 정보, Source별 Mapping 상태, 계속/지원 요청 |
| UI Components | `본인 확인 계속`, `정보가 다름`, `다시 확인`; 임의 Patient ID 입력란 없음 |
| Displayed Data | 마스킹된 이름 또는 별칭, 마스킹된 생년정보, Identity 상태; Hospital-local Patient ID 원문 미표시 |
| User Actions | 확인, 불일치 신고, 재검증 |
| Security Requirements | 서버가 Subject→PatientReference를 결정; 중복·불일치 시 Fail Closed |
| API Dependencies | `GET /mobile/patient-context` 및 재검증 Action `PROPOSED` |
| Loading State | Mapping 확인 중 |
| Empty State | 결합된 PatientReference 없음 → 지원 안내 |
| Denied State | 불일치·중복 후보·검증 실패 시 Study/Vault 접근 금지 |
| Expired State | Identity Proof 재확인 요구 |
| Offline State | 최초 등록·재등록 불가; 기존 Device-bound Vault는 유효 Lease에 한해 별도 허용 |
| Error State | 내부 Hospital Identifier 없이 Correlation ID 제공 |
| Success State | 현재 Device 상태에 따라 MOB-03 또는 MOB-05 |
| Navigation | MOB-01 → MOB-02 → MOB-03/MOB-05 |
| Audit Events | `PATIENT_CONTEXT_VERIFIED`, `PATIENT_CONTEXT_DENIED` |
| Acceptance Criteria | 다른 PatientReference를 Client Parameter로 선택할 수 없고 불확실 상태에서 목록을 반환하지 않는다. |

## MOB-03 — 기기 등록과 보안등급 확인

| 항목 | 명세 |
|---|---|
| Purpose | Persistent Vault를 허용할 Android Device와 Hardware-backed Key를 등록한다. |
| User Role | `PATIENT` |
| Entry Conditions | Identity 확인, 미등록/교체 Device, 정책 재검사 |
| UI Layout | 검사 단계, 결과, 실제 Key Security Level, 충족/미충족 항목, 다음 행동 |
| UI Components | `기기 검사 시작`, `등록`, `다시 검사`, `Cloud Viewer 사용` |
| Displayed Data | OS/보안 Patch 적합 여부, Screen Lock, App/Device Integrity, Attestation, `STRONGBOX`/`TRUSTED_ENVIRONMENT`; 정확한 공격탐지 점수는 표시하지 않음 |
| User Actions | Device Key 생성, Attestation 제출, 등록 완료 |
| Security Requirements | 서버 Challenge, Key Attestation/Integrity 서버 검증, Public Key binding, Nonce·Replay 방어, Software/Unknown 차단 |
| API Dependencies | Device registration challenge/complete API `PROPOSED` |
| Loading State | 검사 단계명만 표시; 실제 Backend Signal 없이 “안전” 판정 금지 |
| Empty State | Hardware-backed Key 미지원 |
| Denied State | `SOFTWARE`, `UNKNOWN`, Attestation 실패/불일치, Screen Lock 부재 등 정책 실패 |
| Expired State | Attestation/Integrity Evidence 만료 시 재검사 |
| Offline State | 최초 등록 불가 |
| Error State | 불확실 결과는 허용하지 않고 MOB-04 경로 제공 |
| Success State | `MobileDevice=ACTIVE`, 실제 Security Level 표시 후 MOB-05 |
| Navigation | MOB-02 → MOB-03 → MOB-05 또는 MOB-04 |
| Audit Events | `DEVICE_REGISTRATION_REQUESTED`, `DEVICE_ADMISSION_ALLOWED`, `DEVICE_ADMISSION_DENIED` |
| Acceptance Criteria | `TC-MOB-011-A/B/C`; StrongBox 불가 시 검증된 TEE만 허용하며 Silent Downgrade가 없다. |

## MOB-04 — 지원 불가 기기 및 Cloud Viewer 전환

| 항목 | 명세 |
|---|---|
| Purpose | 로컬 저장이 불가능한 이유를 설명하고 허용되는 경우 Cloud Viewer 대안을 제공한다. |
| User Role | `PATIENT` |
| Entry Conditions | MOB-03 Admission 실패 또는 정책상 Persistent Vault 불가 |
| UI Layout | 제한 제목, 실패 원인 범주, 가능한 해결책, Cloud Viewer CTA |
| UI Components | `Cloud Viewer로 보기`, `보안 요구사항`, `다시 검사`, `지원 문의` |
| Displayed Data | “로컬 저장 불가”와 “서비스 전체 접근 불가”를 분리; 내부 Signal 원문은 숨김 |
| User Actions | 설정 수정 후 재검사, 서버 재인가를 거쳐 Cloud Viewer 시작 |
| Security Requirements | Cloud Viewer가 Mobile Admission 실패를 권한 우회로 사용하지 않음; Viewer Session은 Short-lived |
| API Dependencies | Existing `POST /exchange-sessions/{sessionId}/actions/view`, Viewer Session API; Patient용 Exchange discovery는 `PROPOSED` |
| Loading State | Cloud Viewer 접근 재검증 중 |
| Empty State | 접근 가능한 Study 없음 |
| Denied State | Consent/Grant/Identity 실패 시 Viewer 차단 |
| Expired State | Viewer Session 만료 후 재인가 |
| Offline State | Cloud Viewer 불가; 로컬 저장도 허용되지 않음을 명확히 표시 |
| Error State | PACS/Network 오류와 Authorization 거부 구분 |
| Success State | P0 Cloud Viewer로 이동 |
| Navigation | MOB-03 → MOB-04 → Cloud Viewer/MOB-03 |
| Audit Events | `MOBILE_VAULT_UNSUPPORTED_SHOWN`, 기존 Viewer Audit |
| Acceptance Criteria | `TC-MOB-011-C`; 안전한 대안은 제공하지만 어떤 정책 검증도 생략하지 않는다. |

## MOB-05 — 내 의료영상 목록

| 항목 | 명세 |
|---|---|
| Purpose | 현재 PatientReference에서 접근 가능한 Study와 로컬 저장 상태를 보여준다. |
| User Role | `PATIENT` |
| Entry Conditions | Identity 확인; 서버 목록은 Online, Vault 목록은 승인된 Local Index 사용 |
| UI Layout | Search/Filter, Study Card, Source Hospital, 저장·Lease Badge, Refresh |
| UI Components | 날짜·Modality 필터, `상세 보기`, 상태 Badge; Hospital Patient ID 검색 금지 |
| Displayed Data | Study Date, Modality, 최소 Description, Source Hospital 표시명, `CLOUD_ONLY|AVAILABLE_FOR_EXPORT|DOWNLOADING|STORED_LOCALLY|LEASE_EXPIRED` |
| User Actions | Study 선택, 새로고침, Vault 필터 |
| Security Requirements | 서버가 접근 가능한 Study만 반환; Thumbnail도 보호 데이터로 처리 |
| API Dependencies | Patient Study list `PROPOSED`; P0 exchange-scoped Study API는 그대로 재사용 불가 |
| Loading State | Card Skeleton, 이전 환자 데이터 잔상 금지 |
| Empty State | “접근 가능한 영상 없음”; 다른 Patient 데이터 제안 금지 |
| Denied State | Identity/Consent/Grant 없음 |
| Expired State | 로컬 Lease 만료 Badge와 MOB-11 연결 |
| Offline State | Local Vault Index만 표시하고 Cloud 상태는 “확인 필요” |
| Error State | 서버 목록 실패와 Local Index 손상 구분 |
| Success State | MOB-06 또는 MOB-09 |
| Navigation | Home Tab → MOB-06; Vault Tab → MOB-09 |
| Audit Events | 목록 조회는 최소 Metadata Access로 감사; Payload 미기록 |
| Acceptance Criteria | Cloud-only와 Local 상태가 명확하며 권한 없는 Study와 PHI 알림 Preview가 노출되지 않는다. |

## MOB-06 — 의료영상 상세

| 항목 | 명세 |
|---|---|
| Purpose | 검사 정보, Source, 권한 및 가능한 View/Export 행위를 설명한다. |
| User Role | `PATIENT` |
| Entry Conditions | MOB-05의 허용 Study 선택 |
| UI Layout | Study 요약, Source Hospital, 저장/Lease/Consent/Grant 상태, Action 영역 |
| UI Components | `Cloud Viewer`, `기기에 안전하게 저장`, `Vault에서 보기`, `권한 상세`; `다른 병원에 보내기`는 P2/비활성 |
| Displayed Data | Modality, Study Date, 최소 Description, Series/Instance Count 후보, Source Hospital, Local 상태 |
| User Actions | 허용 Action 선택 |
| Security Requirements | 버튼 활성화는 편의 표시이며 서버 재검증을 대체하지 않음; DICOM UID 단독 권한 금지 |
| API Dependencies | Study detail `PROPOSED`; Cloud Viewer는 Existing P0 action; Mobile Export는 `PROPOSED` |
| Loading State | 상태 조회 중 |
| Empty State | Study가 Source에서 사라졌거나 현재 Scope에 없음 |
| Denied State | Action별 Consent/Grant 거부를 독립 표시 |
| Expired State | Lease 만료는 Cloud Viewer 가능 여부와 분리 |
| Offline State | Active Local Capsule이면 Vault View만 허용 |
| Error State | Source PACS unavailable, unsupported codec, policy error 구분 |
| Success State | MOB-07, MOB-09/10 또는 Cloud Viewer |
| Navigation | MOB-05 ↔ MOB-06 |
| Audit Events | `MOBILE_STUDY_DETAIL_VIEWED`; Action 시작은 별도 Event |
| Acceptance Criteria | `VIEW`, `MOBILE_EXPORT`, `PACS_IMPORT`를 혼동하거나 자동 승격하지 않는다. |

## MOB-07 — Mobile Export 승인

| 항목 | 명세 |
|---|---|
| Purpose | 환자가 특정 Study를 특정 Active Device에 저장하는 행위를 명시적으로 승인한다. |
| User Role | `PATIENT` |
| Entry Conditions | Active Device, verified Patient, export 가능한 Study, Online |
| UI Layout | Study/Source/Device/보안등급/저장용량/Offline 기간/철회 한계 요약, Confirm CTA |
| UI Components | 확인 Checkbox 후보, `안전하게 저장`, `취소`; CTA는 모든 필수 조건 충족 시만 활성화 |
| Displayed Data | Study 요약, Source Hospital, Device 표시명, 실제 Security Level, AES-256-GCM 보호, 최대 30일 Lease, 분실 시 Offline 즉시 차단 불가 안내 |
| User Actions | 승인, 취소 |
| Security Requirements | 최신 Consent, Authorization, `study:mobile-export` Grant, Device Binding, Storage Preflight 서버 검증 |
| API Dependencies | `POST /exchange-sessions/{sessionId}/actions/mobile-export` 등 업무 Action `PROPOSED` |
| Loading State | Preflight 중 중복 승인 차단 |
| Empty State | 유효 Export Grant 없음 → 승인 요청 안내 |
| Denied State | Consent/Grant/Device/Study Scope 실패를 구분하되 내부 정보 최소화 |
| Expired State | Grant 만료 시 새 승인 필요 |
| Offline State | 승인과 발급 시작 불가 |
| Error State | 실패 시 Capsule/평문 Partial File을 남기지 않음 |
| Success State | Operation ID를 받아 MOB-08로 이동 |
| Navigation | MOB-06 → MOB-07 → MOB-08/MOB-06 |
| Audit Events | `MOBILE_EXPORT_APPROVAL_PRESENTED`, `MOBILE_EXPORT_REQUESTED`, `MOBILE_EXPORT_DENIED` |
| Acceptance Criteria | Mobile Export와 병원 간 전송 동의를 분리하고 대상 Device/Study/Lease가 승인 화면과 서버 Scope에서 일치한다. |

## MOB-08 — 다운로드·암호화 진행

| 항목 | 명세 |
|---|---|
| Purpose | Device-bound 보호 패키지 생성, Ciphertext 다운로드, 무결성 확인 및 Vault 활성화를 정직하게 표시한다. |
| User Role | `PATIENT` |
| Entry Conditions | MOB-07 승인 성공과 Operation ID |
| UI Layout | 단계 Timeline, 실제 Byte Progress, 저장공간, 취소/재시도, 오류 영역 |
| UI Components | `백그라운드에서 계속`, `취소`, `재시도`, `Vault 열기` |
| Displayed Data | `REQUESTED→AUTHORIZED→PREPARING_PROTECTED_PACKAGE→DOWNLOADING_CIPHERTEXT→VERIFYING→STORED`; 서버가 주지 않은 퍼센트 금지 |
| User Actions | 취소, 안전한 재시도, 완료 후 Vault 진입 |
| Security Requirements | 선호안은 서버/보호 Worker가 Device Public Key용 Capsule을 생성하고 앱은 Ciphertext만 저장; Device 처리 시에도 평문은 bounded memory에만 존재; 로그·Temp·Thumbnail·Backup에 평문 금지 |
| API Dependencies | Export operation status, resumable ciphertext download, acknowledge-stored API 모두 `PROPOSED` |
| Loading State | 실제 현재 단계 표시 |
| Empty State | 해당 없음 |
| Denied State | Authorization 만료 시 즉시 중단하고 Partial Ciphertext 정리 |
| Expired State | Operation/URL 만료 시 서버 재검증 후 새 Operation 필요 |
| Offline State | Resume 가능한 Ciphertext Chunk 외 새 복호화·승인 금지; 재개 정책은 API 결정 필요 |
| Error State | Network, storage, encryption, integrity, authorization 실패를 구분; Integrity 실패는 절대 활성화하지 않음 |
| Success State | Manifest/Tag/Scope 검증 후 Capsule `ACTIVE`, MOB-09 이동 |
| Navigation | MOB-07 → MOB-08 → MOB-09 |
| Audit Events | `MOBILE_EXPORT_AUTHORIZED`, `CAPSULE_DOWNLOAD_STARTED`, `CAPSULE_INTEGRITY_FAILED`, `CAPSULE_STORED` |
| Acceptance Criteria | `TC-MOB-012-A/B`; 평문 파일 없이 저장하고 변조 시 Viewer를 거부한다. |

## MOB-09 — Mobile Vault

| 항목 | 명세 |
|---|---|
| Purpose | 암호화 저장된 Study를 파일이 아닌 권한·Lease·보안상태와 함께 관리한다. |
| User Role | `PATIENT` |
| Entry Conditions | 등록 Device; 최소한 Local Index 열람 가능 |
| UI Layout | Storage Summary, Device Status, Capsule Card, Lease Badge, 관리 Action |
| UI Components | `열기`, `온라인 갱신`, `삭제`, `상세`, 저장공간 관리 |
| Displayed Data | Study 최소정보, Encrypted 상태, Source, 저장 크기, `offline_expires_at`, Capsule 상태 |
| User Actions | Local Viewer 열기, 갱신, 삭제, 상세 확인 |
| Security Requirements | App-private storage, Backup/D2D 제외, Gallery/Share Sheet 미노출, Local Index 최소화·암호화 |
| API Dependencies | Local DB/Capsule store; Lease renewal와 server status API `PROPOSED` |
| Loading State | Local Index 검증 중; 이전 화면 Screenshot 금지 |
| Empty State | 저장된 영상 없음 → MOB-05 안내 |
| Denied State | Device binding/Local Auth 실패 시 Metadata 최소화 및 Viewer 차단 |
| Expired State | Capsule Card 잠금 + MOB-11 |
| Offline State | Active Lease Capsule만 열기; 갱신·서버 상태는 비활성 |
| Error State | Local Index 손상/Key invalidation/Storage I/O 오류 시 복호화 시도 중지 |
| Success State | Unlock 후 MOB-10 |
| Navigation | Vault Tab ↔ MOB-10/11/15 |
| Audit Events | Online 시 접근 Event 전송; Offline 최소 Audit Queue의 형식·서명·업로드는 `OPEN DECISION` |
| Acceptance Criteria | 일반 파일 탐색기처럼 경로를 노출하지 않고, 만료·철회·암호 상태를 오해 없이 표시한다. |

## MOB-10 — Local DICOM Viewer

| 항목 | 명세 |
|---|---|
| Purpose | 유효한 Device-bound Capsule을 승인 Lease 내에서 빠르게 로컬 열람한다. |
| User Role | `PATIENT` |
| Entry Conditions | Device Active, Capsule Active, Lease 유효, Binding·Integrity·Local Auth 통과, Codec 지원 |
| UI Layout | Viewport, Series Selector, Frame/Slice 제어, Zoom/Pan/Window-Level, 최소 Metadata, 닫기 |
| UI Components | Gesture와 동등한 Button, Reset, Series 전환, 정보 Panel; Export/Share 버튼 없음 |
| Displayed Data | 픽셀과 최소 Study/Series 정보; Diagnostic 사용 보장 문구 금지 |
| User Actions | Pan/Zoom/WL, Frame 이동, Series 선택, 닫기 |
| Security Requirements | 필요한 Instance/Chunk만 메모리 복호화, 인증 Tag 먼저 검증, 평문 Disk Cache 금지, Background 즉시 가림·Buffer 제거, Secure Window |
| API Dependencies | Offline은 서버 API 없음; Online 갱신/감사는 `PROPOSED`; Codec는 검증된 SOP×Transfer Syntax만 |
| Loading State | Decrypt/Decode 단계 구분, 가짜 Progress 금지 |
| Empty State | 지원 Series 없음 또는 모든 Instance 검증 실패 |
| Denied State | Binding/Auth/Integrity/Lease 실패 시 픽셀을 한 Frame도 표시하지 않음 |
| Expired State | 즉시 닫고 MOB-11 |
| Offline State | Lease와 로컬 검증이 유효하면 허용 |
| Error State | `INTEGRITY_FAILED`와 `CODEC_UNSUPPORTED` 구분; 오류 Frame 건너뛰기 정책은 검증 전 금지 |
| Success State | Viewer Session `ACTIVE`; 종료 시 Buffer clear |
| Navigation | MOB-09 ↔ MOB-10; Background는 Privacy Screen |
| Audit Events | `LOCAL_VIEW_STARTED`, `LOCAL_VIEW_DENIED`, `LOCAL_VIEW_CLOSED`; Offline Queue 정책 필요 |
| Acceptance Criteria | `TC-MOB-007/008/012/013/014/015`; 저장 평문·App Switcher Preview가 남지 않는다. |

## MOB-11 — Offline Lease 만료

| 항목 | 명세 |
|---|---|
| Purpose | 만료된 로컬 접근을 차단하고 온라인 재검증 또는 안전한 삭제로 안내한다. |
| User Role | `PATIENT` |
| Entry Conditions | `offline_expires_at` 경과, Clock/Restore 불확실성, 서버 갱신 요구 |
| UI Layout | 만료 이유, Network 상태, 갱신 검증 항목, `온라인으로 갱신`, `삭제`, `Vault로` |
| UI Components | 갱신 CTA, Network 설정, 삭제 Confirmation |
| Displayed Data | 마지막 성공 검증 시점과 만료일; 내부 Key 상태는 노출하지 않음 |
| User Actions | 온라인 갱신, 삭제, 복귀 |
| Security Requirements | OS Wall Clock 단독 신뢰 금지; rollback/restore 불확실 시 Fail Closed; 갱신은 Consent/Grant/Account/Device 재검증 |
| API Dependencies | `POST /mobile-leases/{leaseId}/renewals` — P1 Contract, OpenAPI/구현 없음 |
| Loading State | 정책 재검증 중, Viewer 진입 차단 |
| Empty State | Capsule 없음 |
| Denied State | 서버 철회/만료 결과와 새 승인 필요 조건 표시 |
| Expired State | 기본 화면 상태 |
| Offline State | 갱신 불가·복호화 불가; 물리 파일 삭제와 동일하다고 표현하지 않음 |
| Error State | 서버 장애는 허용으로 처리하지 않음; 재시도 안내 |
| Success State | 새 Signed Lease/Wrap 상태 검증 후 MOB-09/10 |
| Navigation | MOB-09/10 → MOB-11 → MOB-09/10 |
| Audit Events | `LEASE_RENEWAL_REQUESTED`, `LEASE_RENEWED`, `LEASE_RENEWAL_DENIED` |
| Acceptance Criteria | `TC-MOB-013-A/B/C`; 30일 경계와 시각 조작·복원 시나리오를 시험한다. |

## MOB-12 — Consent / Grant 철회

| 항목 | 명세 |
|---|---|
| Purpose | Consent, Access Grant, Mobile Export Authorization, Offline Lease의 차이를 보여주고 정확한 대상을 철회한다. |
| User Role | `PATIENT` |
| Entry Conditions | 관련 권한 상세 진입, Online |
| UI Layout | 대상·Action·Study·기관·기기·만료·영향 요약, Confirmation |
| UI Components | `동의 철회`, `Grant 철회`, `기기 접근 차단`, `취소`; 하나의 포괄 철회 버튼 금지 |
| Displayed Data | 철회 대상과 향후 영향, 완료된 전송 비가역성, Offline Device 반영 지연 |
| User Actions | 대상 선택, 확인, 철회 제출 |
| Security Requirements | 최신 상태와 대상 Scope 서버 검증, CSRF/Replay 방어, 재인증 후보 |
| API Dependencies | Existing Consent withdraw/Grant revoke; Mobile Authorization/Lease 반영 API는 `PROPOSED` |
| Loading State | 중복 철회 방지 |
| Empty State | 활성 권한 없음 |
| Denied State | 본인 권한 아님/이미 만료/상태 충돌 |
| Expired State | 이미 만료된 권한은 상태만 표시 |
| Offline State | 서버 철회 제출 불가; 연결 필요 |
| Error State | 실패를 성공처럼 표시하지 않음 |
| Success State | “서버 철회 완료”와 “오프라인 기기 반영 대기 가능”을 분리 |
| Navigation | MOB-06/15 ↔ MOB-12 |
| Audit Events | 기존 `CONSENT_WITHDRAWN`, `GRANT_REVOKED` 및 Mobile propagation Event 후보 |
| Acceptance Criteria | 이미 완료된 PACS 전송을 되돌렸다고 주장하지 않고 Offline Device 즉시 차단도 보장하지 않는다. |

## MOB-13 — 분실·폐기된 기기

| 항목 | 명세 |
|---|---|
| Purpose | 등록 Device의 향후 서버 접근과 Lease 갱신을 차단한다. |
| User Role | `PATIENT` |
| Entry Conditions | 기기 관리, 새 기기/웹에서 로그인 |
| UI Layout | 등록 Device List, 현재 상태, 마지막 서버 접속, 분실·폐기 Action, 위험 안내 |
| UI Components | `분실 신고`, `사용 종료`, `새 기기 등록`; 위험 Action 재확인 |
| Displayed Data | 사용자가 구분 가능한 Device 별칭, 등록일, 마지막 접속, Security Level, 상태 |
| User Actions | LOST 또는 RETIRED 요청 |
| Security Requirements | 민감 Action 재인증, 현재/대상 Device 혼동 방지, Server Session·Lease Renewal 차단 |
| API Dependencies | Device list/lost/retire Action `PROPOSED` |
| Loading State | 대상 Device Lock, 중복 제출 차단 |
| Empty State | 등록 기기 없음 |
| Denied State | 대상 소유권 불일치 |
| Expired State | 해당 없음 |
| Offline State | 분실 신고 불가; 안전한 웹/다른 기기 접근 안내 |
| Error State | 원격 삭제를 성공으로 추정하지 않음 |
| Success State | 서버 Device 상태 갱신 완료와 Offline 잔여 위험을 함께 표시 |
| Navigation | Device Tab → MOB-13 → MOB-14 |
| Audit Events | `DEVICE_REPORTED_LOST`, `DEVICE_RETIRED`, `DEVICE_REVOCATION_FAILED` |
| Acceptance Criteria | `TC-MOB-016-A`; Offline 분실 기기의 Lease 만료 전 즉시 차단 불가를 명시한다. |

## MOB-14 — 새 기기 재등록

| 항목 | 명세 |
|---|---|
| Purpose | 새 Hardware-backed Device Key로 등록하고 유효한 권한에 한해 Source PACS에서 Capsule을 재발급한다. |
| User Role | `PATIENT` |
| Entry Conditions | 새 Device 로그인, 이전 Device LOST/RETIRED 또는 기기 교체 |
| UI Layout | Identity 재확인, Device 검사, 기존 Vault 복원 불가 안내, 재발급 가능 Study 목록 |
| UI Components | `기기 등록`, `재발급 확인`, `영상 다시 받기`, `Cloud Viewer` |
| Displayed Data | 새 Device Security Level, 재발급 가능/새 승인 필요 상태; 이전 Device Key는 표시·전송하지 않음 |
| User Actions | 등록, Study별 재발급 요청 |
| Security Requirements | Key Escrow/Cross-device 복구 금지; Consent/Auth/Grant 재검증; 새 Device Public Key로 새 Capsule 생성 |
| API Dependencies | MOB-02/03 API + Reissue Action `PROPOSED` |
| Loading State | 단계별 검증, 자동 전체 재다운로드 금지 |
| Empty State | 재발급 가능한 Study 없음 |
| Denied State | 만료/철회 Consent·Grant, Source PACS 부재, Device Admission 실패 |
| Expired State | 이전 Lease를 복사하지 않고 새 Lease 발급 |
| Offline State | 등록·재발급 불가 |
| Error State | 이전 Capsule/Key를 복원하는 우회 제공 금지 |
| Success State | 새 Device-bound Capsule별 MOB-08 진행 |
| Navigation | MOB-13/01 → MOB-14 → MOB-08/09 |
| Audit Events | `DEVICE_REPLACEMENT_STARTED`, `CAPSULE_REISSUE_ALLOWED`, `CAPSULE_REISSUE_DENIED` |
| Acceptance Criteria | `TC-MOB-016-B/C`; 유효 권한에서만 Source PACS 재조회하며 기존 암호화 파일 복사로 복구하지 않는다. |

## MOB-15 — 보안·저장공간 설정

| 항목 | 명세 |
|---|---|
| Purpose | 현재 Device/Vault 정책과 저장공간을 투명하게 보여주고 안전한 관리 Action을 제공한다. |
| User Role | `PATIENT` |
| Entry Conditions | 로그인 또는 유효 Local Vault Context |
| UI Layout | Security, Storage, Session, Privacy, Help Section |
| UI Components | Device 상태, Local Auth 설정, 자동 잠금 설명, Lease 갱신, Study 삭제, 전체 Vault 삭제, Logout |
| Displayed Data | Security Level, Attestation 마지막 확인, Capsule 수/크기, 만료 임박 수, 앱 버전·정책 버전 |
| User Actions | Local Auth 설정, 갱신, 개별/전체 삭제, Logout, Device 등록 해제 |
| Security Requirements | 편의 설정이 30일 Lease·즉시 Privacy Screen·Hardware Admission을 약화하지 못함; 삭제는 Key 파기 우선 |
| API Dependencies | Device/Capsule summary API `PROPOSED`; Local Storage 관리 |
| Loading State | Local Summary 우선, Server 상태 별도 표시 |
| Empty State | 저장 Capsule 없음 |
| Denied State | 민감 설정 변경 전 Local/Server 재인증 |
| Expired State | 만료 Capsule 수와 정리 Action 표시 |
| Offline State | Local 삭제 가능, 서버 갱신/등록 해제는 연결 필요 |
| Error State | 삭제 실패/Key invalidation을 완료로 표시하지 않음 |
| Success State | Crypto-shred 완료 후 해당 Capsule 열람 불가 확인 |
| Navigation | Settings Tab → MOB-12/13 |
| Audit Events | `LOCAL_AUTH_SETTING_CHANGED`, `CAPSULE_CRYPTO_SHREDDED`, `MOBILE_LOGOUT` |
| Acceptance Criteria | `TC-MOB-017`; Logout/Revoke/Secure Delete 이후 제거된 Key에 의존한 Capsule 복호화가 실패한다. |

---

# 12. Mobile Security UX 상세

## 12.1 암호화와 키 수명주기

- Payload는 Capsule별 무작위 DEK로 AES-256-GCM 암호화한다.
- DEK는 등록 Device의 Hardware-backed Key에 결합된 Versioned Wrap Slot으로 보호한다.
- Device Private Key/KEK는 OS Hardware-backed Keystore 밖으로 Export하지 않는다.
- Crypto Suite Version과 복수 Wrap Slot으로 Payload 전체 재암호화 없이 승인된 새 Wrap 방식으로 전환할 수 있게 한다.
- PQC는 Payload Cipher를 바꾸는 기능이 아니라 DEK Wrap/Key Establishment 계층의 Hybrid 또는 Post-Quantum Suite로 전환한다.
- 생성, 등록, 활성화, 사용, 회전, 폐기, 만료, 파기, 감사 상태를 NIST SP 800-57 계열 원칙에 맞춰 추적한다.
- UI는 “군사급”, “완전 안전” 같은 과장 표현을 사용하지 않는다.

## 12.2 성능과 평문 경계

- 서버가 Device Public Key에 맞춘 암호화 Capsule을 생성하고 앱은 Ciphertext를 받는 방식을 우선 검증한다.
- Local Viewer는 전체 Study를 복호화 파일로 풀지 않고 검증된 Instance/Chunk를 필요할 때 메모리에서 점진 복호화한다.
- 평문 Frame/Pixel Buffer 수명을 최소화하고 Viewer 종료·Background·오류에서 즉시 제거한다.
- Temp File, Thumbnail, Crash Dump, Analytics, Clipboard, Gallery, OS Backup에 평문을 남기지 않는다.
- Flash 저장장치 특성상 물리 비트 완전 삭제를 보장하지 않고 Key 파기에 의한 Crypto-shredding을 핵심 삭제 통제로 사용한다.

## 12.3 Local Authentication

- 서버 로그인은 Account와 Patient Context를 인증하고, Local Authentication은 Device에 있는 Vault Key 사용을 승인한다.
- Android BiometricPrompt의 강한 생체인증 또는 승인된 Device Credential을 사용하되 정확한 Authenticator 조합은 Native Stack ADR에서 결정한다.
- 생체정보 변경, OS Lock 변경, Key invalidation, Device Integrity 변화 시 기존 Local Viewer Session을 폐기하고 정책 재검증을 요구한다.
- 생체인증 자체를 Patient Identity Proof 또는 Consent로 취급하지 않는다.

## 12.4 Offline Lease와 시각 조작

- 서버가 서명한 발급·만료·Capsule·Device·Patient·Policy Version Binding을 사용한다.
- 단말 Wall Clock만으로 유효성을 판단하지 않는다.
- 마지막 검증 시간, 단조 시간, Boot/Restore 상태 및 rollback 징후를 조합하는 방식을 구현 전 Threat Test로 확정한다.
- 안전하게 시간을 판단할 수 없으면 Online Revalidation을 요구한다.
- Offline Audit Queue, Secure Time 구현, Reboot 후 판단 방식은 `OPEN DECISION`이며 미결정 상태에서 보안 PASS를 주장하지 않는다.

## 12.5 Background와 Capture

- `onPause`/Inactive에 해당하는 즉시 Privacy Screen을 적용한다.
- 60초 이내 복귀라도 Background 동안 민감 이미지는 계속 가린다.
- Android Viewer Window는 `FLAG_SECURE` 등 플랫폼 통제를 사용한다.
- Screen Recording, Mirroring, 비보안 Display는 플랫폼이 제공하는 범위에서 차단 또는 Viewer 중단한다.
- Screenshot 통제는 OS·OEM·외부 카메라까지 포괄하지 않으며 한계를 사용자와 위험 문서에 표시한다.

## 12.6 Backup, Restore, Uninstall

- Capsule, Local Index, Wrap Metadata, Offline Lease, Audit Queue를 Android Auto Backup과 Device-to-Device Transfer에서 명시적으로 제외한다.
- 앱 재설치나 Backup Restore로 이전 Device Binding을 복구하지 않는다.
- 앱 삭제 시 OS Keystore Key가 제거되더라도 서버 Device 등록은 별도 Revoke가 필요할 수 있음을 안내한다.
- 복원 흔적 또는 Binding 불일치 발견 시 Capsule을 활성화하지 않고 새 Device 등록으로 보낸다.

---

# 13. 보안 통제 매트릭스

| Threat/조건 | 예방 | 탐지 | 사용자 UX | Acceptance |
|---|---|---|---|---|
| Software/Unknown Key | Persistent Vault 거부 | Key Security Level·Attestation 검증 | MOB-04 Cloud Viewer | TC-MOB-011-C |
| Capsule 변조 | AES-GCM Tag/Manifest 검증 | Integrity failure | 열람 차단·재발급 안내 | TC-MOB-012-B |
| 다른 기기로 복사 | Device-bound Wrap | Device ID/Public Key mismatch | 재등록/재발급 | TC-MOB-008/016 |
| Lease 만료 | Signed bounded Lease | 만료·rollback 불확실성 | MOB-11 | TC-MOB-013 |
| Background 노출 | 즉시 Privacy Screen | Lifecycle event | 재개 또는 재인증 | TC-MOB-014 |
| Screenshot/Recording | Secure Window | 가능한 Platform signal | 제한 안내 | TC-MOB-015 |
| 분실 기기 | Server Revoke·갱신 차단 | Last seen/renewal attempt | MOB-13 | TC-MOB-016-A |
| Backup/Restore | 민감 파일 Backup 제외 | Binding/restore mismatch | 새 Device 등록 | TC-MOB-008/017 |
| 저장공간 부족 | Preflight·bounded temp | I/O error | 정리 후 재시도 | 신규 UI 시험 필요 |
| 지원 안 되는 DICOM | 검증 Profile Allowlist | SOP/Transfer Syntax 검사 | Codec 미지원 안내 | TC-MOB-007 확장 |

---

# 14. 플랫폼 차이

| 영역 | Android P1 | iOS 후속 |
|---|---|---|
| 구현 우선순위 | Native Vault 정식 P1 | Native Vault P2/후속 |
| Hardware Key | Android Keystore, StrongBox 선호, verified TEE 허용 | Secure Enclave/Keychain 적용 가능성 별도 검증 |
| Admission | Key Attestation + App/Device Integrity 서버 검증 | App Attest/DeviceCheck 등 별도 Profile 필요 |
| Local Auth | BiometricPrompt + 승인된 Device Credential | LocalAuthentication 설계 필요 |
| Capture | Secure Window와 비보안 Display 제한 | App Switcher 가림, Recording/Mirroring 감지; 일반 Screenshot 완전 차단 보장 금지 |
| Backup | Auto Backup/D2D 명시 제외 | iCloud/Device migration 제외 정책 별도 검증 |
| 현재 대안 | Persistent Vault 가능 | Responsive Cloud Viewer |

공유 Capsule Protocol은 플랫폼 독립적으로 설계하되 약한 공통분모 암호로 하향하지 않는다.

---

# 15. Design System과 접근성

## 15.1 기본 Token

- 4dp Grid, 주요 간격 8/12/16/24/32dp
- Android Touch Target 최소 48×48dp
- 본문 최소 16sp 권고, System Font Scale 지원
- 중요 상태는 색상만으로 구분하지 않고 Icon·Label·설명을 함께 사용
- Error는 적색, Warning은 황색, Success는 녹색 계열을 사용하되 WCAG AA Contrast를 검증
- 민감정보가 있는 Notification과 Recent App Preview는 일반화된 문구 사용

## 15.2 Component

| Component | 용도 | 금지사항 |
|---|---|---|
| Study Card | 검사와 저장/Lease 상태 | 환자 ID·DICOM UID 과다 노출 |
| Security Badge | 실제 검증 Level 표시 | 근거 없는 점수·“100% 안전” |
| Lease Badge | Active/Expiring/Expired | 색상 단독 표시 |
| Destructive Dialog | 철회·삭제·분실 신고 | 대상과 영향 없는 포괄 확인 |
| Progress Stepper | 서버 단계·Byte 진행 | 추정 Percent |
| Privacy Screen | Background 즉시 가림 | 마지막 Pixel Snapshot 사용 |

## 15.3 접근성

- TalkBack Label, Focus Order, Dynamic Font, High Contrast를 지원한다.
- 의료영상 Gesture에는 Zoom+/-, Reset, Slice 이전/다음 같은 동등 Button을 제공한다.
- Viewer Controls는 Image 위에 겹쳐도 읽기 가능하고 최소 Touch Target을 지킨다.
- 시간 제한은 Offline Lease 보안정책을 변경하지 않는 범위에서 명확히 사전 안내한다.
- 진행·오류 상태는 Live Region 또는 접근 가능한 상태 텍스트로 전달하되 PHI를 음성으로 과다 노출하지 않는다.

---

# 16. API 의존성과 계약 Gap

현재 `OPENAPI.yaml` v1.1.0에는 Mobile Device, Capsule, Lease, Mobile Export API가 없다. `MOBILE-API-CONTRACT.md`에서 P1 계약 경로를 선택했지만 별도 Mobile OpenAPI와 구현은 아직 없으며, 구현 전 Domain/Data/ERD/OpenAPI/Security/Acceptance를 함께 개정해야 한다.

| UI 행위 | 후보 업무 API | 현재 상태 | 필수 서버 검증 |
|---|---|---|---|
| Patient Context | Existing Exchange/Patient Binding 재사용 범위 | OPEN DECISION | Subject↔PatientReference, Account |
| Registration Challenge | `POST /mobile/attestation-challenges` | P1 CONTRACT | Auth, nonce, purpose, expiry, replay |
| Device 등록 | `POST /mobile/devices` | P1 CONTRACT | Attestation, Integrity, Proof/Wrap Key, Security Level |
| Device 목록 | `GET /mobile/devices` | OPEN DECISION | Patient ownership |
| 분실 신고 | `POST /mobile/devices/{deviceId}/revocations` reason `LOST` | P1 CONTRACT | ownership, recent reauth, idempotency |
| 사용 종료 | `POST /mobile/devices/{deviceId}/revocations` reason `RETIRED` | P1 CONTRACT | ownership, recent reauth |
| Patient Study 목록 | `GET /mobile/studies` | PROPOSED | Patient, Consent/Authorization, Tenant |
| Study 상세 | `GET /mobile/studies/{studyRefId}` | PROPOSED | Study scope, Source |
| Mobile Export | `POST /exchange-sessions/{sessionId}/actions/mobile-export` | P1 CONTRACT | Consent, Auth, Grant `study:mobile-export`, Device, Study |
| Export 상태 | `GET /mobile-export-operations/{operationId}` | P1 CONTRACT | operation ownership/scope |
| Download Session | `POST /mobile-capsules/{capsuleId}/download-sessions` | P1 CONTRACT | short-lived DPoP-bound scope |
| Capsule Envelope | `GET /mobile-capsules/{capsuleId}/manifest` | P1 CONTRACT | signed exact bytes, Device, ETag |
| Capsule Chunk | `GET /mobile-capsules/{capsuleId}/chunks/{globalSequence}` | P1 CONTRACT | scoped token, Range/If-Range, integrity |
| 저장 확인 | `POST /mobile-capsules/{capsuleId}/storage-acknowledgements` | P1 CONTRACT | integrity result, idempotency |
| Lease 발급 | `POST /mobile-capsules/{capsuleId}/lease-issuances` | P1 CONTRACT | Consent, Grant, Account, Device, policy |
| Lease 갱신 | `POST /mobile-leases/{leaseId}/renewals` | P1 CONTRACT | Consent, Grant, Account, Device, policy, version |
| 재발급 | `POST /mobile-capsules/{capsuleId}/reissues` | P1 CONTRACT | 새 Device, Source PACS, current approvals |
| Mobile Audit Sync | `POST /mobile/audit-events` | P1 CONTRACT | Device proof, dedup, server enrichment |
| Cloud Viewer | `POST /exchange-sessions/{sessionId}/actions/view` | EXISTING P0 | `study:view`, consent, auth, tenant |
| Consent 철회 | `POST /exchange-sessions/{sessionId}/consents/{consentId}/withdraw` | EXISTING P0 | patient/consent scope |
| Grant 철회 | `POST /exchange-sessions/{sessionId}/grants/{grantId}/revoke` | EXISTING P0 | issuer/subject/scope |

## 16.1 계약 원칙

- API는 `device`, `capsule`, `lease`의 무제한 CRUD가 아니라 등록·분실·Export·갱신·재발급 업무 행위를 노출한다.
- Client가 Body의 PatientReference, Tenant, Source Hospital을 신뢰 경계로 선택하지 못하게 한다.
- 모든 다운로드 URL/Token은 짧은 수명, 대상 Device, Capsule, Operation 및 범위에 결합한다.
- Progress는 서버가 관찰 가능한 상태와 실제 byte count만 반환한다.
- Range/Resume는 Ciphertext Chunk와 인증 경계를 보존하고 다른 Capsule Chunk 혼합을 거부한다.
- Mobile API 구현 전 별도 `OPENAPI-MOBILE.yaml`에서 정식 오류코드, Idempotency, Polling, 상태 Enum을 검증한다.

---

# 17. 감사·로그·알림

## 17.1 Audit 최소 필드

```text
actor_reference
patient_reference_id
tenant_context
device_id
capsule_id 또는 study_reference_id
action
outcome
timestamp
correlation_id
policy_version
offline_event_sequence (해당 시)
```

## 17.2 금지 로그

- Access/Refresh Token 원문
- Private Key, DEK, KEK, Wrapped Key 원문
- DICOM Payload 또는 Pixel Data
- 전체 환자 이름, Hospital Patient ID, 생년월일
- PACS Credential, 내부 Endpoint
- Biometric Data

## 17.3 알림

- Lock Screen Notification은 “MediQ 확인이 필요합니다” 수준으로 제한한다.
- 검사명, 병원명, Lease 날짜 등 의료정보를 기본 Notification Preview에 노출하지 않는다.
- 분실 신고, 새 Device 등록, 재발급은 보안 알림 후보지만 Notification 자체를 승인 증거로 사용하지 않는다.

---

# 18. Acceptance Traceability

| UI/통제 | Requirement/Security | Test | 현재 상태 |
|---|---|---|---|
| Local Viewer | REQ-MOB-VIEW-001 | TC-MOB-007 | NOT RUN |
| Device Binding/Local Auth | REQ-MOB-008 | TC-MOB-008 | NOT RUN |
| Expiry/Revoke/Offline | REQ-MOB-009 | TC-MOB-009 | NOT RUN |
| Android-first | REQ-MOB-010 / SEC-MOB-010 | TC-MOB-010 | NOT RUN |
| Device Admission | REQ-MOB-011 / SEC-MOB-011 | TC-MOB-011-A/B/C | NOT RUN |
| Capsule Crypto/PQC Agility | REQ-MOB-012 / SEC-MOB-012 | TC-MOB-012-A/B/C | NOT RUN |
| 30-day Lease | REQ-MOB-013 / SEC-MOB-013 | TC-MOB-013-A/B/C | NOT RUN |
| Background/60초 | REQ-MOB-014 / SEC-MOB-014 | TC-MOB-014-A/B/C | NOT RUN |
| Capture Protection | REQ-MOB-015 / SEC-MOB-015 | TC-MOB-015-A/B | NOT RUN |
| Lost/Reissue | REQ-MOB-016 / SEC-MOB-016 | TC-MOB-016-A/B/C | NOT RUN |
| Key Lifecycle | REQ-MOB-017 / SEC-MOB-017 | TC-MOB-017 | NOT RUN |

추가 UI Test가 필요하다.

- 각 화면 Loading/Empty/Denied/Expired/Offline/Error/Success 상태
- TalkBack, Font Scale, Color Contrast, Gesture 대체 Button
- Process death, reboot, low storage, interrupted download, partial ciphertext cleanup
- Backup/restore와 Device-to-Device migration 제외
- Notification·App Switcher·Crash Report PHI 누출 여부
- Screenshot/Recording/OEM별 Secure Window 동작
- 지원 SOP Class × Transfer Syntax × Device Codec 조합
- Offline Audit Queue 변조·순서·재전송

---

# 19. 구현 우선순위

## P0 선행조건

- Hospital A→MediQ→Hospital B Golden Path PASS
- Cloud Viewer Gateway와 Security Negative Test PASS
- DICOM Golden Profile 실제 검증

## P1 Mobile

```text
MEDIQ-MOB-010 Android shell + Device Admission
  → MEDIQ-MOB-011 Capsule Crypto + Key Lifecycle/PQC Agility
  → MEDIQ-MOB-007 Local Viewer
  → MEDIQ-MOB-008 Device Binding + Local Authentication
  → MEDIQ-MOB-012 Offline Lease
  → MEDIQ-MOB-013 Background/Capture Protection
  → MEDIQ-MOB-014 Lost Device/Reissue
  → P1 Mobile Acceptance
```

## P2 후보

- iOS Native Vault
- Guardian/Representative
- Mobile에서 시작하는 병원 간 공유 요청
- 운영용 Push Security Notification
- 고급 Viewer Tooling과 진단적 사용 검토

---

# 20. 구현 전 Open Decisions

| ID | 결정 항목 | 권고 | Owner/Evidence |
|---|---|---|---|
| MOB-OD-001 | Android Native Stack | Kotlin + Jetpack Compose 후보를 별도 ADR로 검증 | Mobile Lead / Prototype |
| MOB-OD-002 | 최소 Android API/OEM 범위 | StrongBox/TEE와 Test Device Matrix 기반 결정 | Security + QA |
| MOB-OD-003 | OIDC Mobile Profile | Authorization Code + PKCE 후보, Redirect/Token storage 확정 | IAM |
| MOB-OD-004 | Attestation 조합 | Android Key Attestation + Play Integrity Standard 서버 검증 | Security |
| MOB-OD-005 | Capsule Format/Chunk | 대형 DICOM 점진 복호화·무결성·Resume를 함께 Benchmark | Crypto + Imaging |
| MOB-OD-006 | Server-side vs Device-side encryption | Ciphertext-only download 선호안 Prototype | Architecture |
| MOB-OD-007 | Secure Time | Signed Lease + rollback/restore detection Threat Test | Security |
| MOB-OD-008 | Offline Audit Queue | 최소 Event, 무결성, 순서, 재전송/중복 처리 확정 | Audit |
| MOB-OD-009 | Local Codec | Golden SOP×Transfer Syntax×Android Device Matrix | Imaging + QA |
| MOB-OD-010 | Mobile API Contract | 상태, Error, Idempotency, Range/Resume 정식 OpenAPI 승인 | API Lead |
| MOB-OD-011 | Remote Delete | 명령/시도/확인 상태와 보장 범위 결정 | Security + Product |
| MOB-OD-012 | Mobile Sharing | P2 Server-side Exchange 요청으로만 검토; Local Capsule Upload 금지 | Product + Security |

미결정 항목은 구현 편의로 임의 확정하지 않는다.

---

# 21. 외부 기술 근거

- Android KeyInfo Security Level: <https://developer.android.com/reference/android/security/keystore/KeyInfo>
- Android Keystore Security Level constants: <https://developer.android.com/reference/android/security/keystore/KeyProperties>
- Android Play Integrity overview: <https://developer.android.com/google/play/integrity/overview>
- Android Play Integrity Standard requests: <https://developer.android.com/google/play/integrity/standard>
- Android BiometricPrompt CryptoObject: <https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt.CryptoObject>
- Android backup security and exclusion: <https://developer.android.com/privacy-and-security/risks/backup-best-practices>
- Android Auto Backup rules: <https://developer.android.com/identity/data/autobackup>
- Android Screenshot detection and secure display references: <https://developer.android.com/about/versions/14/features/screenshot-detection>
- Apple capture-state notification for future iOS profile: <https://developer.apple.com/documentation/uikit/uiscreen/captureddidchangenotification>
- Apple Security overview for future iOS profile: <https://developer.apple.com/security/>
- NIST SP 800-57 Part 1 Rev. 5: <https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final>

외부 자료는 Platform Capability와 Key Management 설계 참고다. MediQ의 법적 적합성, 의료기기 인증 또는 운영 보안을 자동 보증하지 않는다.

---

# 22. 완료 정의

본 문서 작성의 완료 조건은 다음과 같다.

- 15개 필수 화면과 4개 필수 Flow를 모두 정의했다.
- Android-first, StrongBox/TEE, 30일 Lease, Background, Capture, 분실 재발급 정책을 반영했다.
- 현재 API와 Proposed API를 구분했다.
- Mobile Capsule 직접 병원 전송을 현재 Scope에서 제외했다.
- Requirements/Security/Acceptance/Ticket Traceability를 연결했다.
- 구현과 테스트가 없음을 명시했다.

P1 Mobile 기능 자체의 `DONE` 조건은 코드, API, DB Migration, Test Device Matrix 및 `TC-MOB-007`~`TC-MOB-017` 실행 증거가 모두 존재하는 것이다.

---

# 23. 문서 결론

MediQ Mobile Secure Vault는 “영상 파일을 휴대폰에 다운로드하는 기능”이 아니라, 검증된 Android Device에만 발급되는 Device-bound 암호화 Capsule과 시간 제한 Offline Access를 관리하는 독립 보안 경계다.

P1의 정식 사용자 흐름은 다음 한 문장으로 요약한다.

> 확인된 Patient가 검증된 Android Device에서 특정 Study의 Mobile Export를 승인하면, MediQ가 현재 Consent·Authorization·Grant를 확인하여 Source PACS 기반의 Device-bound AES-256-GCM Capsule을 발급하고, 앱은 이를 App-private Vault에 저장하여 최대 30일의 유효 Lease와 Local Authentication 아래 점진적으로 열람한다.

이 기준선은 빠른 조회를 위해 전체 평문 파일을 만들지 않는 점진 복호화를 택하고, PQC 전환은 Versioned DEK Wrap 계층에 격리하며, 약한 Device나 불확실한 상태에는 Cloud Viewer만 제공한다.

---

# 24. Synthetic Health Data Preview UX Amendment — 2026-09-26

## 24.1 Entry

`내 건강정보` 또는 동등한 Navigation Entry는 다음 상태를 첫 화면에서 표시한다.

```text
DEMO MODE
모의 연계 환경
합성 데이터 사용
실제 지정심사 및 운영 API 연계 미완료
```

## 24.2 Flow

```text
MOB-HHP-001 소개·고지
  → MOB-HHP-002 모의 연결/본인확인
  → MOB-HHP-003 항목·기간 선택
  → MOB-HHP-004 모의 활용동의
  → MOB-HHP-005 합성 기록 목록
  → MOB-HHP-006 합성 기록 상세
  → MOB-HHP-007 초기화
```

오류는 `MOB-HHP-008`에서 처리한다.

## 24.3 Visual Rules

- 상단 DEMO Banner는 Scroll과 무관하게 인지 가능해야 한다.
- 결과 Card마다 `SYNTHETIC` Badge를 표시한다.
- 기관 Logo·인증마크를 사용하지 않는다.
- 실제 승인·연동을 의미하는 녹색 `Connected` 표현 대신 중립적인 `모의 연계` 상태를 사용한다.
- 의료적 정상·이상 판정, 권고 또는 진단 CTA를 제공하지 않는다.
- `초기화`는 합성 Session 삭제임을 설명하며 실제 기관 동의 철회처럼 표현하지 않는다.

## 24.4 Accessibility

Screen Reader는 Banner를 화면 제목 직후 읽어야 하며 `DEMO MODE`, 합성 데이터, 실제 연계 미완료를 생략하지 않는다. 색상만으로 Demo 상태를 구분하지 않는다.

상세 Copy와 금지 표현은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.

## 24.5 Synthetic Checkup, Lab and Antibody Presentation

- `MOB-HHP-003`에서 건강검진, 일반 혈액검사, 항체검사를 별도 항목으로 선택한다.
- `MOB-HHP-005` Card에는 합성 검사명, 검사일, TEST 기관, `SYNTHETIC` Badge를 표시한다.
- `MOB-HHP-006`에는 값과 단위, `합성 제공기관 참고범위`, `합성 원문 판정`, Fixture Version을 구분한다.
- 정상/비정상·면역·질환 여부를 MediQ가 계산하거나 강조색으로 재판정하지 않는다.
- 같은 날짜의 합성 영상은 `관련 기록`으로만 연결하며 진단 또는 인과관계 문구를 사용하지 않는다.
- 목록·상세·관련 기록 모두 의료진 공유·PACS Import CTA를 제공하지 않는다.

# 25. Patient Experience Feature Pack UX Amendment

행동센터와 쉬운 영상 카드는 Home·영상 목록의 표현 계층으로, 접근이력·알림·저장공간은 `내 활동`·`설정/Vault`의 하위 흐름으로, 병원 방문 모드는 QR Handoff의 안내 계층으로 구성한다. 오류 복구 Component는 모든 화면에서 공통 사용한다.

공통 UX 규칙:

- 서버 확정 전 성공 표시 금지, `RESULT_UNKNOWN` 별도 표현
- 잠금화면·카드·오류의 민감정보 최소화
- 한 화면의 Primary CTA 하나, 파괴적 행동 별도 확인
- Loading, Empty, Partial, Offline, Denied, Error 상태 필수
- 색상 외 아이콘·텍스트, 200% 글씨, TalkBack Focus 순서 지원
- 진단·정상/이상·긴급도를 UI가 추론하지 않음

논리 화면과 상태는 각 `patient-experience/*-SPEC.md`를 따른다. 기존 Screen ID 재배치와 39개 논리 화면의 전역 등록은 구현 Ticket에서 결정한다.
