# Highpass 세 시안 ↔ 기존 기능 매핑표

- 작성일: 2026-10-09 (Asia/Seoul)
- 문서 버전: 0.1 / 상태: DRAFT / UNASSIGNED / 승인·구현 완료 아님
- 조사 기준 HEAD: `089eecb5cd479a12aab28f4c92804e23dd101be0` **+ 현재 미커밋 작업 트리**. HEAD만으로 조사 소스를 재현할 수 없다.
- 범위: 환자 웹, 의료진 웹, 모바일 웹/PWA의 디자인 구현 준비. 이번 문서 작성에서 코드·API·DB·배포를 변경하지 않았다.
- 관련 명세: [공통 디자인 시스템](HIGHPASS-COMMON-DESIGN-SYSTEM-2026-10-09.md)

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. 기준과 판정 규칙

요구사항 권위는 최신 승인 요구사항·아키텍처·보안 설계가 우선한다. PNG는 시각적 참고자료이며 권한이나 서버 기능을 추가 승인하지 않는다. 기존 MediQ 설계 문서는 보존하고 이번 문서는 **Highpass 현행 코드 연결용 보완 명세**로 사용한다.

입력 자료:

| 시안 | 원본 위치 | SHA-256 |
|---|---|---|
| 환자 웹 | `C:/Users/user/Downloads/환자용 웹화면.png` | `250064b00051ab2e3dce79276cfbc27812f4706b952290a84a52f3b4bd0e993a` |
| 의료진 웹 | `C:/Users/user/Downloads/의료진 웹화면.png` | `11d66084a61fc6d7ad069fa7fa868010c091eedb7a229a403f2771dd9ea69e7a` |
| 모바일 | `C:/Users/user/Downloads/모바일 앱화면.png` | `ab4e4241e6e4ff95ff423a4f917f6035a1fa40b09737bd5b91373c83e090575d` |

원본은 Repository로 복사하지 않았다. 원본 파일이 없는 평가자는 동일 해시의 사용자 제공 파일을 별도로 받아야 한다. 픽셀·폰트·아이콘 원본 자산의 사용권은 배포 전 확인한다.

실행 기준은 [REQUIREMENTS](../REQUIREMENTS.md), [v3 요구사항](../requirements/highpass-v3-requirements-definition.md), [Mobile-Core 요구사항](../requirements/highpass-mobile-core-requirements-definition.md), [기존 UI 추적표](SAAS-UI-SCREEN-TRACEABILITY-MATRIX.md)다. 기존 UI 문서의 `EXISTING`은 계약 존재 표기일 수 있으며 실제 배포·테스트 PASS로 해석하지 않는다.

매핑의 구현 상태는 `코드 확인`, `부분 연결`, `시뮬레이션`, `목표/미연결`로 구분한다. 모든 신규 디자인의 브라우저·종단 검증은 현재 **NOT VERIFIED**다. 아래 테스트 파일은 회귀 후보로 확인했으며 이번 작업에서 실행하지 않았다.

`FR-001~046`은 AGENTS.md의 기능군 추적이다. 개별 원문이 없으므로 상세 항목 완료를 추정하지 않는다. v3 ID와 Mobile-Core ID는 별도 체계이며 서로 대체되지 않는다.

## 2. 현행 구조와 공통 연결 규칙

- `public/index.html`, `public/app.js`, `public/styles.css`: 하나의 문서 안에 환자 `#patient-portal-app`과 의료진 `#hospital-saas-app`이 있다. 역할별 shell을 분리해도 기존 이벤트 연결과 URL 계약은 보존한다.
- `public/mobile/index.html`, `app.js`, `style.css`, `sw.js`: 모바일은 웹/PWA다. 네이티브 Android/iOS로의 전환은 이번 디자인 범위가 아니다.
- `src/server.js`: 동의·토큰·DICOMweb·모바일 시뮬레이터·감사 API. `src/capstone-b-portal.js`: B 포털 중계 경로. 공통 인증 진입은 `public/capstone-auth.js`다.
- UI 역할 탭 선택은 권한 부여가 아니다. 실제 principal과 서버의 허용 결과를 사용한다. 관리자용 조회를 환자/의료진 화면에 자동 대리 호출해 데이터 공급하지 않는다.
- View model은 응답에서 최소한 `data`, `loading`, `errorCategory`, `lastCheckedAt`, `capabilityAvailability`를 분리한다. 미지원 버튼은 이유와 함께 사용 불가로 표시하거나 발표 핵심 동선에서 제외한다.
- `0건`은 조회 성공·빈 배열일 때만 표시한다. API 실패·권한 없음·미연결은 `확인 필요` 또는 `조회 불가`다.

## 3. 환자 웹 매핑

| ID / 시안 요소 | 기존 화면·코드 연결점 | API 또는 데이터 | 현행 상태 / 구현 결정 | 요구사항 / 우선순위 |
|---|---|---|---|---|
| UI-P-01 헤더·검색·본인 정보 | `public/index.html` 환자 shell; `switchPersona`, `navigatePatientPage` | 기존 인증 context; 검색 대상은 인가된 목록 | 부분 연결. 별도 전체 병원 환자 검색 금지; 로컬 목록 필터로 시작 | FR-006~009, V3-NFR-UX-001 / P0 |
| UI-P-02 요약 4카드 | `renderMetrics`, `updateConsentState`, `renderActiveTransferCard` | `GET /api/imaging-studies`, `GET /api/patients/{id}/consents` | 코드 확인. 영상·유효 동의·사용 가능한 QR를 별도 집계; 진행/승인 요청 수는 실제 조회 없으면 미연결 | FR-001~009 / P0 |
| UI-P-03 승인 요청 카드 | `data-page="consent"`; 현행 공유 생성은 `createPatientConsent` | `POST /api/transfers/requests`, `GET /api/transfers/requests/{id}`, `POST /api/transfers/requests/{id}/consent` | API 경로 코드 확인, 요청 inbox의 조회·UI 연결은 목표. 환자 선제 동의 생성과 의료진 요청 승인을 혼합하지 않음 | FR-001~005, V3-FR-CON-001~006 / 후속 |
| UI-P-04 의료영상 카드·범위 선택 | `data-page="images"`; `renderStudies`, `renderPatientStudyOptions`, `renderPatientSeriesOptions` | imaging-studies의 Study/Series 메타데이터 | 코드 확인. 썸네일은 합성 데이터 표시; 선택 scope를 임의 확대하지 않음 | FR-006~009, FR-014~020 / P0 |
| UI-P-05 환자 미리보기 | `openPatientStudyViewer`, `drawPatientViewerFrame` | `POST /api/patients/{id}/studies/{uid}/self-view` | self-view 감사 경로 및 합성 Canvas 확인. 실제 DICOM 픽셀 Viewer와 구분; 첨부 CT 사진으로 실제 조회 성공을 대신하지 않음 | FR-032~036, V3-FR-ACC-003 / P0 |
| UI-P-06 동의 생성·철회 | `createPatientConsent`, `revokePatientConsent`, `renderConsentHistory` | `POST /api/consents`, `POST /api/consents/{id}/revoke` | 코드 확인. 범위·목적·기관·기한 확인 후 제출, 서버 응답 후 상태 변경 | FR-001~005, FR-014~025 / P0 |
| UI-P-07 전달 단계·최근 활동 | `renderActiveTransferCard`, `renderPatientReceipts`; `data-page="activity"` | 본인 consent; 안전한 본인 receipt projection은 계약 보완 필요 | 부분 연결. 현행 receipt는 감사 목록을 받아 클라이언트 필터·일부 기본값 사용. 재설계 시 관리자 raw audit를 공급하지 말고 증거 없는 의료진·검사·ABAC 성공 문구 제거 | FR-037~041, V3-FR-AUD-002/003 / P0 검토 |
| UI-P-08 모바일·QR 연결 | 방문 화면; `createPhrConsent`, `safeSameOriginHandoffUrl` | `POST /api/consents/{id}/handoff-ticket` | 코드 확인. QR capability만 취급; 일반 access token·PHI·키 노출 금지 | FR-021~025, FR-POLICY-002 / P0 |
| UI-P-09 도움말·AI 패널 | 시안의 assistant/FAQ | 신규 AI 계약 없음 | 정적 FAQ와 사용 안내로 시작. 실제 AI·진단·의료상담 서비스 완료 주장 금지 | V3-NFR-UX-001 / 후속 |

## 4. 의료진 웹 매핑

| ID / 시안 요소 | 기존 화면·코드 연결점 | API 또는 데이터 | 현행 상태 / 구현 결정 | 요구사항 / 우선순위 |
|---|---|---|---|---|
| UI-H-01 요청 목록·검색·KPI | `data-screen="dashboard"/"exchange"`; `updateHospitalSaaSState` | 단건 transfer request 조회; 별도 inbox/집계 계약 확인 필요 | 부분 연결. 시안의 8·3·12·2는 예시이며 복사 금지. 기관·기간별 집계가 없으면 미연결 표시 | V3-FR-EX-001~007 / 후속 |
| UI-H-02 요청 상세·환자 Mapping | exchange 화면·선택 Study | 기존 선택 동의; v3 Identity/Mapping 자산은 별도 | 부분 연결. 수신기관 Mapping의 VERIFIED를 이름 일치나 화면 선택으로 만들지 않음 | V3-FR-ID-003/006 / 후속 |
| UI-H-03 접근 권한·Grant 패널 | `requestDoctorToken`, `currentTokenRequestContext` | `POST /api/dicom-access/request`, `POST /api/policies/access-check` | 기존 token 코드 확인. 단기 토큰은 신규 v3 TransferGrant 전체 완료가 아님; UI도 별도 명칭 사용 | FR-014~025, V3-FR-GRT-001~005 / P0 |
| UI-H-04 Study·Series·Instance·Viewer | studies/viewer 화면; `loadGatewayStudies`, `loadInstancesForSelectedSeries`, `displaySlice` | `/dicomweb/studies` 및 하위 Series/Instance/Frame 경로 | 코드 확인. 인증 wrapper·DPoP·최소 범위·lazy loading을 유지; 확대/이동/밝기 조작은 임상 정확성 보장 아님 | FR-026~036, V3-FR-ACC-001~003 / P0 |
| UI-H-05 VIEW / DOWNLOAD / PACS_IMPORT | `openViewer`, `downloadSelectedInstance`, `runPacsImport` | DICOMweb 요청, `POST /api/transfers/pacs-import` | 부분 연결. VIEW_ONLY로 다운로드/반입 활성화 금지. 현재 반입은 로컬 암호화 보관이며 실제 수신 PACS 등록 완료 아님 | FR-014~020, V3-FR-ACC-004, FR-POLICY-002 / P0 |
| UI-H-06 단계·수신 검증·무결성 | `updatePipelineSteps`, `runPreflightCheck`, pacs-archive 화면 | 기존 결과; v3 Preflight/목적지/Provenance 계약은 별도 | 부분 연결. runPreflightCheck는 로컬 사전확인; 실제 운영 Preflight PASS로 표시 금지. STOW/HTTP 성공과 검증 완료 분리 | V3-FR-PROV-001~005 / 후속 |
| UI-H-07 감사·보안·이력 탭 | `data-screen="audit"`, `renderAuditTable` | `GET /api/audit-logs`, `/api/audit-integrity`, `/api/anomaly-alerts` | 관리자 API·화면 코드 확인. 의료진은 보안관리자가 아님; role-scoped receipt 없으면 일반 의료진에 raw audit 탭 제공 금지 | FR-037~041, V3-FR-AUD-003/004 / P0 검토 |
| UI-H-08 병원 상태·QR 스캔 | `renderHealth`, `toggleCameraQrScan`, `redeemScannedNonce` | `/api/health`, `/api/transfers/tickets/redeem-viewer` | 코드 확인. 상태 마지막 확인시각 표시; 카메라 거부 시 안전한 대안. QR 소비가 영상 열람/전송 완료를 뜻하지 않음 | FR-021~031, V3-NFR-REL-001 / P0 |

## 5. 모바일 시안 순서별 매핑

| ID / 시안 단계 | 기존 연결점 | API·데이터 / 현행 상태 | 구현 결정 / 요구사항 |
|---|---|---|---|
| UI-M-01 로그인·기기 확인 | `setupAuth`, `handleQuickAuth`, `initializeCapstoneAuth` | `/api/capstone-demo/login`, `/api/v1/mobile/auth/login`, `/device`; 시뮬레이션 | BIO/PIN 화면은 실제 OS 생체인증 아님. NOT_ENROLLED·NOT VERIFIED 유지 / FR-MOBILE-001~003 |
| UI-M-02 홈 Action Center | `renderHomeScreen`, `renderHomeRecentList` | studies/consents 조회; 코드 확인 | 최근 영상·본인 유효 동의·QR 구분. 의료진 요청 inbox는 UI-P-03과 같은 계약 공백 / FR-001~009 |
| UI-M-03 내 의료영상 | `renderStudiesList`, `#tab-studies` | `/api/imaging-studies?patientId=...&includeSeries=true`; 코드 확인 | 합성 표시·실제 metadata 사용. 오프라인 열람 버튼은 활성화하지 않음 / FR-006~009 |
| UI-M-04 검사 상세 | 기존 영상 카드 → `openCineViewer` | 별도 상세 페이지 연결은 목표 | Study/Series/병원/검사일을 실제 메타데이터로 표시; 과도한 UID 노출 금지 / FR-006~009 |
| UI-M-05 동의·승인 | `setupShareWizard`, `handleExecuteShareTicket` | `/api/consents` 및 `/handoff-ticket`; 코드 확인 | 기존 4단계(범위→기관·기간→동의→QR) 보존. QR claim 후 별도 최종 승인 기능이 있다고 주장하지 않음 / FR-001~025 |
| UI-M-06 암호화 저장 | 시안 저장 확인 화면 | 현재 저장 API 연결 없음 | 목표/미연결. 저장 위치·완료·남은 일수를 임의 표시하지 않음 / FR-KEY-001, FR-MOBILE-009/010 |
| UI-M-07 Secure Vault | `#tab-vault`, `renderVaultView` | `GET /api/v1/mobile/vault`는 NOT CONNECTED, packages=[]; 시뮬레이션 | 클라우드 Key Vault 암호화 성공과 모바일 보안금고 구현은 별개. erase는 501; 실제 삭제 성공 표시 금지 / FR-MOBILE-004/012 |
| UI-M-08 Local Viewer | `openCineViewer`, `drawCurrentCineFrame` | self-view 감사 API + 합성 Canvas; 시뮬레이션 | 절차적 합성 프레임을 실제 DICOM 50장·오프라인 복호화로 표시 금지. 실제 픽셀 연결은 별도 게이트 / FR-032~036 |
| UI-M-09 QR·병원 연결 | `renderActiveQrView`, `refreshActiveTicketStatus`, `handleRevokeCurrentQr` | `/handoff-ticket`, `GET /api/consents/{id}/handoff-tickets/{ticketId}`, `/revoke`; 최신 로컬 코드 확인 | 서버 terminal 상태에서 QR 제거·timer 종료·중복 철회 방지. B 최신 배포 검증은 별도 / FR-021~025, V3-NFR-REL-001 |
| UI-M-10 활동 이력 | `renderShareManageScreen`, `#share-timeline-logs` | 동의/QR 데이터, 일부 UI 기록 | 본인 서버 증적과 로컬 조작 기록 구분. 전체 audit 조회를 대리 호출하지 않음 / FR-037~041 |
| UI-M-11 기기·설정 | `renderDeviceView`, `handleLockApp`, `handleCryptoErase` | `/device`, `/auth/lock`, `/vault/erase`; 시뮬레이션 | 실제 원격 기기차단·하드웨어 키·영구 파기 기능 아님. 새 활동/설정 destination 연결 필요 / FR-MOBILE-003/004/012 |

현재 하단 메뉴는 `home/studies/records/share/vault`다. 시안은 `홈/의료영상/보안금고/활동내역/설정`이다. 변경 시 기록·공유 기능을 삭제하지 않고 홈/검사 상세 CTA와 활동 화면으로 옮기며, 기존 진입 경로를 보존한다. 최종 메뉴 확정은 프로토타입 검토에서 수행한다.

## 6. 착수 순서와 검증 게이트

1. **DS-01 공통 shell·토큰·기본 컴포넌트**: 본 문서와 공통 명세를 구현 기준으로 연결한다. 기존 API 계약은 변경하지 않는다.
2. **DS-02 환자 핵심 흐름**: 영상 카드→범위 선택→동의→QR→철회. UI-P-03 inbox는 실제 계약 확정 전 가짜 요청으로 채우지 않는다.
3. **DS-03 의료진 핵심 흐름**: QR→정책 판단→단기 토큰→DICOMweb Viewer. raw audit의 역할 분리와 반입 오인 문구를 우선 해결한다.
4. **DS-04 모바일 핵심 흐름**: 4단계 공유 보존, QR terminal·확대·초점·하단 메뉴 검증. 금고/생체인증/오프라인은 미지원 표시.
5. **DS-05 동일 이미지 종단 검증 후 배포**: 발표용 256×256 CT/MR의 환자·scope 연결, 실제 Key Vault 암호화, 정상·음성 접근 및 감사 검증.

| 수용 ID | 검증할 결과 | 기존 회귀 후보 / 추가 필요 | 현재 결과 |
|---|---|---|---|
| UI-AC-01 | 환자 동의·철회 정상/거부; scope·기간 보존 | `test/consent-operations.test.js`, `test/consent-selection.test.js` + 새 화면 E2E | NOT VERIFIED |
| UI-AC-02 | QR 사용·만료·철회 시 제거; 타인 조회 거부 | `test/mobile-ticket-status-client.test.js`, `test/patient-ticket-status-http.test.js` + 실제 브라우저 | NOT VERIFIED |
| UI-AC-03 | VIEW_ONLY 다운로드·반입 거부; 토큰/DPoP 유지 | `test/dpop-token-binding.test.js`, `test/data-plane-authorization.test.js` + UI/API 음성 검증 | NOT VERIFIED |
| UI-AC-04 | 실제 선택 범위만 Viewer에 표시; frame 수 실제 일치 | `test/multislice-viewer.test.js` + 발표 데이터 E2E | NOT VERIFIED |
| UI-AC-05 | 본인 이력/관리자 audit 분리; 가짜 receipt 없음 | `src/auth.js`의 `applyAuditScope`와 별도 role-negative 테스트 추가 | NOT VERIFIED |
| UI-AC-06 | 확대·키보드·모바일·오류·미지원 상태 정확 | 공통 명세의 viewport/상태 검증, 새 screenshot E2E | NOT VERIFIED |

## 7. 가정·결정·불확실성

- 확인됨: 기존 HTML/CSS/JS, 환자·의료진 shell, PWA와 서버 경로. PNG의 수치·상태는 시안 데이터다.
- 합리적 가정: 발표용 기존 보안 흐름을 유지하면서 외형을 첨부 시안에 맞춘다. 임상 진단용 성능·정확성은 보장하지 않는다.
- 구현 결정: 제품명은 별도 승인 전 Highpass 유지; MediQ는 참고 시안의 표기다. 기존 문서·함수·API를 삭제하거나 임의 개명하지 않는다.
- 불확실성: 최종 브랜드/로고 사용권, 요청 inbox/본인 receipt projection, 모바일 메뉴 전환, v3 수신 Mapping/Grant/Provenance의 런타임 연결.
- 신규 증적은 DRAFT / UNASSIGNED. 기존 김범희 검토·승인을 신규 디자인/코드에 자동 승계하지 않는다.
