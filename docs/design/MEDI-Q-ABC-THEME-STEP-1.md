# A/B/C 화면 기준 적용 — 1단계

2026-10-09 · DRAFT / UNASSIGNED

공통 토큰에 clinical-white / diagnostic-dark / quiet-teal 테마를 추가했다. C는 토큰만 준비했으며 환자 레이아웃 적용은 후속 작업이다.

의료진 기본과 Viewer를 별도 화면으로 분리했다. 기존 Viewer를 A 내부로 옮기던 코드를 제거하고, B 진입 시 dark 테마와 집중 모드를 적용한다. 돌아가기 버튼은 기존 검색·필터·선택을 유지하며 토큰 발급을 추가하지 않는다. API·DB·접근정책 변경 없음.

관련 FR: FR-010~013, FR-021~025, FR-032~036.

변경 파일: public/ui/tokens.css, public/ui/clinician.css, public/index.html, public/app.js, test/clinical-theme-navigation.test.js.

검증: node --check public/app.js exit 0. Node 선택 회귀 17/17 PASS (clinical-theme-navigation, clinician-detail, clinician-ui-preview, consent-operations). 독립 A/B 화면, 선택 유지, 단일 Viewer 요소 및 기존 철회·지연응답 차단 회귀 포함.

전체 A 시안의 3열 재배치, B 상세 패널 고도화, C 환자 화면 재구성은 아직 미완료다. 이번 작업을 전체 디자인 구현 완료로 판정하지 않는다. VM 배포·Azure E2E·전체 Node 테스트 재실행: NOT VERIFIED.
