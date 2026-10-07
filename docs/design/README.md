# HiPass Platform UI / UX 화면설계서 및 디자인 자산 일람

본 디렉터리는 **메디큐(MediQ) 프로젝트로부터 성공적으로 이관 및 정렬된 화면설계서, 와이어프레임 팩, UI 디자인 시스템 및 컴포넌트 명세서**를 관리합니다.

---

## 1. 주요 화면설계서 및 UI/UX 명세

| 문서명 | 파일 경로 | 주요 내용 |
|---|---|---|
| **SaaS 웹 애플리케이션 화면설계서** | [`SAAS-SCREEN-DESIGN-SPEC.md`](SAAS-SCREEN-DESIGN-SPEC.md) | Hospital Portal, Synthetic Patient Web, QR Hospital Web, SaaS Administration 79개 화면의 상세 구현 계약 (입력, 상태, 행동, API 연계, Fail Closed) |
| **SaaS UI 디자인 시스템** | [`SAAS-UI-DESIGN-SYSTEM.md`](SAAS-UI-DESIGN-SYSTEM.md) | Clinical Light, Viewer Dark, Operations Light 테마, 디자인 토큰(Color, Typography, Spacing), 공통 컴포넌트 규격, 접근성 가이드 |
| **SaaS UI 와이어프레임 팩** | [`SAAS-UI-WIREFRAME-PACK.md`](SAAS-UI-WIREFRAME-PACK.md) | P0 핵심 흐름 26개 와이어프레임(WF-R-001 ~ WF-R-026), P1 QR Web 8개 와이어프레임, 임상 워크플로우 5개 와이어프레임 |
| **P0 Web UI/UX 명세서** | [`P0-WEB-UI-UX-SPEC.md`](P0-WEB-UI-UX-SPEC.md) | `WEB-01` ~ `WEB-14` 화면 상세 명세, UI 상태 매트릭스, HTTP 오류 매핑 및 Acceptance Test 시나리오 |
| **화면 추적성 매트릭스** | [`SAAS-UI-SCREEN-TRACEABILITY-MATRIX.md`](SAAS-UI-SCREEN-TRACEABILITY-MATRIX.md) | 요구사항(Charter, MVP, Requirements, Security)과 화면 간의 1:1 대응 추적표 |
| **SaaS UI 참조 매트릭스** | [`SAAS-UI-REFERENCE-MATRIX.md`](SAAS-UI-REFERENCE-MATRIX.md) | 공개 의료/SaaS 참조 서비스 분석 및 UI 구조 패턴 매핑 |
| **모바일 화면설계서** | [`MOBILE-SCREEN-DESIGN-SPEC.md`](MOBILE-SCREEN-DESIGN-SPEC.md) | 환자 모바일 앱의 34개 화면 상세 설계 (동의, QR 연계, Secure Vault) |
| **모바일 UI/UX 명세서** | [`MOBILE-UI-UX-SPEC.md`](MOBILE-UI-UX-SPEC.md) | 모바일 화면별 인터랙션, 상태 전이 및 보안 통제 |
| **QR 연계 UI/UX 명세서** | [`QR-UI-UX-SPEC.md`](QR-UI-UX-SPEC.md) | 병원 단말기 QR 스캔, Claim 요청, 환자 승인 대기, 단기 토큰 발급 UI 흐름 |

---

## 2. 특화 워크플로우 명세 (하위 디렉터리)

- **환자 경험 포털 명세서군**: [`docs/patient-experience/`](../patient-experience/)
  - `01-ACTION-CENTER-SPEC.md`: 환자 행동 센터 (원클릭 확인, 빠른 동의 및 알림)
  - `02-PATIENT-ACCESS-RECEIPT-SPEC.md`: 의료영상 접근 영수증 (투명한 열람 감사 이력)
  - `03-PRIVACY-SAFE-NOTIFICATIONS-SPEC.md`: 개인정보 안심 알림 (최소 정보 노출)
  - `04-HOSPITAL-VISIT-MODE-SPEC.md`: 병원 방문 모드 (진료 당일 바코드 및 패킷 제시)
  - `05-PLAIN-LANGUAGE-IMAGING-CARDS-SPEC.md`: 쉬운 우리말 카드 (비전문가 친화적 검사 요약)
  - `06-STORAGE-AND-EXPIRY-MANAGEMENT-SPEC.md`: 보관 및 만료 관리 (자동 삭제 정책 가시화)
  - `07-PATIENT-FRIENDLY-ERROR-RECOVERY-SPEC.md`: 환자 친화적 오류 복구 (Correlation ID 추적)
  - `08-RADIOLOGY-REPORT-REFERRAL-BUNDLE-SPEC.md`: 판독문 및 진료의뢰서 묶음 (POST-MVP)
  - `09-GUARDIAN-FAMILY-DELEGATION-SPEC.md`: 보호자 및 가족 위임 (POST-MVP)

- **병원 임상 워크플로우 명세군**: [`docs/hospital-workflow/`](../hospital-workflow/)
  - `HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`: 과거 영상 비교(Side-by-side), 진료 인계 패킷, 다학제 협진 워크플로우

---

## 3. 웹 콘솔 및 인터랙티브 목업 실행

웹 브라우저를 통해 직접 인터랙티브하게 체험할 수 있는 목업 화면들이 제공됩니다:

- **UI 설계서 및 목업 종합 포털**: [`http://localhost:3000/mockups/`](http://localhost:3000/mockups/)
- **병원 SaaS 콘솔 인터랙티브 목업**: [`http://localhost:3000/mockups/saas-console.html`](http://localhost:3000/mockups/saas-console.html)
- **환자 경험 포털 인터랙티브 목업**: [`http://localhost:3000/mockups/patient-portal.html`](http://localhost:3000/mockups/patient-portal.html)
- **HiPass 플랫폼 통합 데모 콘솔**: [`http://localhost:3000/`](http://localhost:3000/)
