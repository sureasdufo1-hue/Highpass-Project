# 환자 웹 → 의료진 웹 → 모바일 로컬 적용

2026-10-09 · DRAFT / UNASSIGNED · 배포 및 독립 검토 미실시

## 작업 목적과 현재 범위

환자 웹과 의료진 웹의 기존 공통 UI 적용을 유지하고 모바일 PWA까지 동일 토큰을 연결했다. 첨부 시안의 블루/네이비/화이트, 카드, 명확한 상태, 하단 메뉴를 기존 HTML/JavaScript에 적용했다. `frontend-design` 지침에 따라 기술 스택이나 인증·동의 계약을 재작성하지 않았다.

| 순서 | 로컬 적용 | 후속 검증 |
|---|---|---|
| 환자 웹 | 공통 UI, 영상 목록, 동의·QR·철회 | 최신 통합 이미지 배포 E2E |
| 의료진 웹 | 공통 UI, 승인된 픽셀 Viewer·Series 썸네일 | VM 발표용 CT/MR·Key Vault 종단 연결 |
| 모바일 PWA | 공통 토큰, 홈·목록·공유·보관 화면 스타일, 확대/터치/포커스 | 실제 단말, 전체 접근성, 최신 VM 배포 |

이 표는 시안의 모든 기능이 구현되었다는 뜻이 아니다. 특히 모바일 실제 DICOM Viewer, 보안금고 저장, 네이티브 생체인증을 구현했다고 주장하지 않는다. 관련 영향 범위: FR-001~009, FR-014~025, FR-032~041의 화면 표현·기존 동작 회귀. 서버 계약·DB 스키마 변경 없음.

## 이번 생성·수정 파일

- 생성: `public/ui/mobile.css`, 이 기록.
- 수정: `public/mobile/index.html`(공통 스타일·확대 허용·시연 안내), `public/mobile/app.js`(현재 메뉴 aria-current), `public/mobile/sw.js`(공개 CSS allowlist와 cache v3), `test/mobile-capstone-auth.test.js`(캐시 버전·공개 자원·확대 회귀), `docs/design/README.md`.
- 기존 사용자 변경은 보존했다. 이전 환자·의료진 변경을 이번에 다시 구현하지 않았다.

## 구현 및 보안 검토

- 기존 모바일 CSS 변수에 공통 semantic token을 연결하고 주요 조작 버튼 최소 44px 적용.
- 홈의 영상 공유 행동을 강조하고 공통 색·카드·하단 메뉴·오류/경고 상태를 유지. 중첩 스크롤을 정리하고 확대 금지 viewport 속성을 제거.
- 인증 종료 overlay는 화면과 접근성 트리에서 숨기도록 수정. 전체 인증 modal의 키보드 focus trap까지 검증한 것은 아니다.
- PWA는 `/ui/tokens.css`, `/ui/components.css`, `/ui/mobile.css`만 공개 정적 자원 allowlist에 추가. 임의 `/ui/*`, 인증 헤더, 쿼리 URL, API 및 DICOM 경로는 캐시 제외.
- 기존 동의·QR 서버 확인·철회·만료 로직 변경 없음. 마스킹, 단말 무결성, 생체인증, 오프라인 저장의 미구현/미검증 안내 보존.

## 테스트 결과

```powershell
node --check public/mobile/app.js
node --check public/mobile/sw.js
node --test test/mobile-capstone-auth.test.js test/mobile-ticket-status-client.test.js test/clinician-ui-preview.test.js test/patient-ui-qr.test.js test/consent-operations.test.js test/consent-selection.test.js test/dashboard-polling.test.js test/multislice-viewer.test.js test/synthetic-phantom.test.js
```

| 항목 | 결과 | 근거 |
|---|---|---|
| 문법 | PASS | 종료 코드 0 |
| 세 화면 선택 회귀 | PASS | 58개, 0 실패, 종료 코드 0, 1168.1677ms |
| 모바일 로컬 브라우저 | PASS | 개발용 인증 → 홈 → 공유 기록 선택 → 수신 병원 → 동의 검토 화면 확인 |
| 기존 캐시 버전 정리 | PASS | v1/v2 제거 기대값 갱신; 다른 앱 캐시는 유지 |
| 모바일 실제 기기/전체 접근성 | NOT VERIFIED | 데스크톱 브라우저의 좁은 viewport는 실제 단말 검증이 아님 |
| 최신 모바일 QR 생성·소비·철회 전체 브라우저 E2E | NOT VERIFIED | 이번 브라우저 확인은 동의 검토까지, 상태 회귀는 Node 테스트 범위 |
| VM 배포/Key Vault/전체 게이트 | NOT VERIFIED | 로컬 UI 작업만 수행 |

브라우저는 별도 임시 JSON 저장소의 `http://127.0.0.1:9461/mobile/`를 사용했다. 기존 VM·클라우드·프로젝트 DB를 변경하지 않았다. [모바일 홈 화면](../../artifacts/ui-review-2026-10-09/mobile-home.jpg).

## 다음 단계

1. 세 화면의 시각 검토 후 필요한 세부 조정.
2. 공통 `public/ui/` 및 환자·의료진·모바일·서버 변경이 모두 포함되는 통합 이미지 확인. 기존 모바일 전용 Dockerfile만으로는 누락될 수 있다.
3. VM CT/MR 매핑 및 실제 Key Vault 포함 정상·음성 종단 검증, rollback, 신규 증적 독립 검토.

배포·커밋·푸시하지 않았다. 전체 MVP/v3 완료는 선언하지 않는다.
