# Medi Q 의료진 목록·상세 패널 구현

상태: DRAFT / UNASSIGNED. 로컬 개발용 합성 데이터 검증, 배포 승인 아님.

## 목적과 범위

제공된 의료진 시안의 좌측 탐색 / 중앙 목록 / 우측 상세 배치를 기존 vanilla JS 컨트롤러에 적용했다. frontend-design 스킬에 따라 기존 토큰과 브랜드를 유지하고 화면을 검토했다. 관련 요구사항: FR-006~013, FR-014~025(상태 표시), FR-032~036(기존 Viewer 회귀).

## 변경

- public/index.html: 목록·상세 2열 workspace, 이용 순서 안내.
- public/ui/clinician.css: 상세 카드, 1279px 이하 세로 배치.
- public/ui/clinician.js: 순수 표시 모델, textContent 기반 상세 렌더러.
- public/app.js: 상세 선택, 기존 Viewer/파이프라인 유지, 기간을 반영한 목록 동의 표시.
- test/clinician-detail.test.js: 철회·만료·시작 전·기간 미확인 및 미검증 상태 테스트.

API/DB/서버 접근정책 변경 없음. 동의 유효 여부를 접근 허용 또는 전송 완료로 승격하지 않는다. 환자 매핑·수신 결과는 미연결/미검증. 새 상세 패널은 토큰이나 관리자 감사로그를 표시하지 않는다.

## 검증

- `node --check public/app.js`: PASS, exit 0.
- `node --test test/clinician-detail.test.js test/clinician-ui-preview.test.js test/consent-selection.test.js test/consent-operations.test.js`: PASS, 24/24, exit 0.
- 로컬 9461 브라우저: CT 상세 선택 및 철회 상태 표시 PASS.
- 1672×941 배치 확인. 390×844에서 문서 scrollWidth 375px: 문서 가로 넘침 없음. 표 자체는 가로 스크롤.
- 증적: artifacts/ui-review-2026-10-09/mediq-clinician-detail.jpg.

## 남은 사항

시안 완전 재현, 중앙 선택 요청의 통합 Viewer, 실제 수신 결과 연결은 후속 작업이다. 이번에는 VM 배포, Key Vault/전체 E2E 및 사람 독립 검토를 실행하지 않았다: NOT VERIFIED. 기존 Viewer는 별도 화면이다. 전체 MVP 완료를 선언하지 않는다.
