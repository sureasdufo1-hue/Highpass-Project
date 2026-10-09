# 공통 UI 및 환자 웹 적용 기록

작성일: 2026-10-09 · 상태: **DRAFT / UNASSIGNED**

기존 사람 승인을 이 변경에 승계하지 않는다. 로컬 소스 검증이며 VM 배포, 전체 MVP/v3 완료 또는 운영 준비 판정이 아니다.

## 범위와 요구사항

- [공통 디자인 명세](HIGHPASS-COMMON-DESIGN-SYSTEM-2026-10-09.md) 및 [세 시안 매핑표](HIGHPASS-THREE-SCREEN-FUNCTION-MAPPING-2026-10-09.md)를 기존 HTML/JavaScript에 적용했다. 프레임워크 교체나 신규 UI 의존성은 없다.
- 관련 요구사항: FR-001~005 동의, FR-006~009 영상 목록, FR-014~020 접근정책 표시, FR-021~025 단기 접근, FR-032~036 Viewer 진입, FR-037~041 이력 노출 경계. 이 목록은 영향 범위이며 각 기능군 전체의 검증 완료를 의미하지 않는다.
- 이번 대상은 환자 웹이다. 의료진 화면과 모바일 PWA의 전면 디자인 적용, 네이티브 앱 및 생체인증은 포함하지 않는다.

## 구현

| 파일 | 변경 내용 |
|---|---|
| `public/ui/tokens.css` | primitive → semantic → component 토큰, 블루/네이비/화이트, 간격·타이포·상태 색 |
| `public/ui/components.css` | 공통 버튼·카드·배지·빈 상태·아이콘·키보드 포커스 |
| `public/ui/patient.css` | 환자 shell, 카드 그리드, 동의 폼, 44px 조작부, 좁은 화면 대응 |
| `public/ui/patient.js` | 실제 영상 메타데이터 카드 및 서버 확인 기반 QR 상태 제어 |
| `public/index.html` | 정적 예시 카드 제거, 동의·QR·철회 화면 연결, 합성 환경 및 실제 기능 범위 표시 |
| `public/app.js` | 환자 전용 데이터 조회, 동의와 전송 완료 상태 분리, 본인 동의 이력 표시 |
| `public/capstone-auth.js` | 시연 인증 안내를 문서 흐름에 배치해 화면 가림 완화; 인증 계약 유지 |
| `test/patient-ui-qr.test.js` | QR 서버 영수증 검증, 종료 상태, 늦은 응답, 장애, 만료 테스트 |
| `test/consent-selection.test.js` | 기존 테스트 fixture 보완 및 환자 조회 경계/조회 오류 회귀 테스트 |

기존 미커밋 변경을 보존했다. 위 기존 파일의 Git diff 전체가 이번 작업으로 생성된 것은 아니다.

## 동작 및 보안 경계

1. 환자 홈은 API의 실제 영상 목록·건수를 사용한다. 조회 실패를 영상 0건으로 표시하지 않는다.
2. 영상 선택 → 동의 조건 검토 → 동의 생성 → QR 발급 → 동의 철회 흐름을 연결한다. 빠른 승인 버튼도 검토 화면을 먼저 연다.
3. QR은 서버 응답의 Ticket/Consent/만료시각이 발급 패킷과 일치하고 `ISSUED`일 때만 표시한다. 상태 조회에는 10초 timeout이 있다.
4. `USED`, `REVOKED`, `EXPIRED`, 로컬 만료 및 조회 오류 시 QR을 제거한다. 오래된 비동기 응답이 철회된 QR을 복구하지 못한다.
5. QR capability는 메모리와 QR canvas에만 사용하며 평문 DOM·URL·로그에 추가하지 않는다. QR 자체는 접근 capability이므로 발표 캡처·공유 시 주의한다.
6. 환자 대시보드는 관리자 감사·탐지·격리 API를 요청하지 않는다. 상세 의료진 열람 이력을 가짜 기록으로 채우지 않고 현재 본인 동의 이력과 구분한다.
7. `ACTIVE` 동의를 ‘영상 전송 완료’로 표현하지 않는다. 프론트엔드 표시 변경은 서버 권한 검증을 대체하지 않는다.

## 검증

실행 명령:

```powershell
node --check public/app.js
node --check public/ui/patient.js
node --test test/patient-ui-qr.test.js test/consent-operations.test.js test/consent-selection.test.js test/dashboard-polling.test.js test/patient-ticket-status-http.test.js test/mobile-capstone-auth.test.js test/multislice-viewer.test.js
git diff --check -- public/app.js public/index.html public/capstone-auth.js test/consent-selection.test.js
```

| 항목 | 결과 | 근거 |
|---|---|---|
| JS 문법 검사 | PASS | 종료 코드 0 |
| 선택 회귀 테스트 | PASS | 48개 통과, 0개 실패, 종료 코드 0; 844.6506ms |
| 추적 파일 diff 공백 검사 | PASS | 종료 코드 0 |
| 환자 동의 → QR → 철회 | PASS | 격리된 로컬 합성 JSON 저장소에서 브라우저 확인; 철회 후 QR canvas 0개 |
| 반응형 페이지 폭 | PASS | 1440/375/320px에서 페이지 수평 넘침 없음; 작은 버튼 높이 44px 확인 |
| 브라우저 오류 로그 | PASS | 점검 시 수집된 error 항목 없음 |
| 전체 키보드·스크린리더·200% 확대 검증 | NOT VERIFIED | 포커스 및 의미 구조 적용과 별개로 종합 접근성 검증 필요 |
| VM 배포·실제 Key Vault·최종 영상 E2E | NOT VERIFIED | 이번 작업에서는 실행하지 않음 |
| 전체 Security/Container Gate | NOT VERIFIED | 선택 테스트를 전체 게이트 결과로 대체하지 않음 |

48개 테스트 실행 후 아이콘 초기화와 HTML/CSS 표시 조정을 추가했으며 최종 브라우저 화면을 재확인했다. 전체 Node 테스트를 재실행한 결과는 아니다.

화면 기록:

- [데스크톱](../../artifacts/ui-review-2026-10-09/patient-desktop.jpg)
- [375px 환자 웹](../../artifacts/ui-review-2026-10-09/patient-narrow.jpg)

로컬 확인 환경은 loopback `http://127.0.0.1:9461/`, 개발용 인증, 별도 임시 JSON 저장소를 사용했다. 기존 VM/DB 데이터와 분리되어 있으며 실제 병원·클라우드 검증 환경이 아니다.

## 남은 작업과 배포 주의

- 영상 카드는 실제 메타데이터와 modality 표시를 사용한다. 시안의 CT/MRI 픽셀 썸네일과 발표용 256×256 다중 슬라이스 연결은 별도 검증이 필요하다.
- 환자 상세 열람 영수증 API가 연결되기 전에는 관리자 원시 감사로그를 환자에게 노출하지 않는다.
- 공통 컴포넌트를 의료진 웹·모바일 PWA에 순차 적용하고 각 역할별 회귀 검증을 수행한다.
- 기존 `Dockerfile.mobile-capstone`의 모바일 전용 복사 구성을 그대로 배포하면 이번 환자 웹 변경이 반영되지 않는다. 통합 이미지에는 `public/index.html`, `public/app.js`, `public/capstone-auth.js`, `public/ui/`와 QR 라이브러리 의존성, 관련 서버 변경을 포함하고 실제 portal 경로·CSP·정적 자원 응답을 확인해야 한다.
- 배포 전 통합 이미지 보안 검사, 소스 해시, rollback, 최종 서버·브라우저 정상/음성 검증이 필요하다. 이번에는 Dockerfile·API 계약·DB 스키마를 변경하지 않았으며 배포·커밋·푸시하지 않았다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
