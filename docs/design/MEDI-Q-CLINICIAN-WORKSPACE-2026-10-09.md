# Medi Q 의료진 통합 워크스페이스

상태: DRAFT / UNASSIGNED. 2026-10-09 로컬 개발용 합성 환경 검증.

## 구현 범위

관련 요구사항: FR-006~013, FR-014~025(동의·권한 표시), FR-032~036.
기존 vanilla JS, CSS 토큰, 서버 정책과 API 계약을 유지했다. frontend-design 스킬의 시안 우선 원칙에 따라 흰색/파란색, 좌측 탐색·중앙 작업·우측 상세 구조를 적용했다.

- 검사명·modality·검사일·출처 병원 검색, 동의 유효/확인 필요 필터, 빈 결과 안내.
- 실제 조회 목록 기준 검사/동의/확인 필요 수. 수신 완료 수는 추정하지 않고 미연결 표시.
- 선택 검사 상세: 출처, 동의 상태/목적/권한/수신 병원. 매핑·수신 결과 미검증 표시.
- 기존 Viewer DOM을 중앙으로 이동하여 하나만 유지. Series/Instance 로딩, 슬라이스, 기존 조작과 다운로드 버튼 재사용.
- QR 접수·PACS 반입 절차로 이동, 기존 화면 탐색 유지.
- 목록 새로고침 대기/실패/재시도 상태, 정적 업무 도움말.
- 1279px 이하 상세 패널 세로 배치, 767px 이하 메뉴·Viewer 재배치.

## 수정 파일

public/index.html, public/app.js, public/ui/clinician.css, public/ui/clinician.js,
test/clinician-detail.test.js 및 본 문서. 새 라이브러리나 API/DB 계약 변경 없음.

## 검증 결과

| 검증 | 판정 | 근거 |
|---|---|---|
| 전체 Node 테스트 | PASS | node --test --test-concurrency=4, 739/739, exit 0, 44.530초 |
| 변경 관련 회귀 | PASS | 6개 파일, 38/38, exit 0 |
| MRI 검색 | PASS | 실제 브라우저 7건 중 1건 |
| 빈 검색 | PASS | 결과 없음 안내 |
| CT/MRI Viewer | PASS | 로컬 합성 MRI/PHR CT 영상 표시 확인 |
| VIEW_ONLY 다운로드 | PASS | 버튼 비활성 확인; 서버 회귀 포함 |
| 철회 검사로 전환 | PASS | 상세 철회 표시 및 이전 영상 hidden 확인 |
| QR 화면 왕복 | PASS | QR 진입 및 목록/Viewer 복귀 확인 |
| 390px 반응형 | PASS | 문서 폭 375px, 메뉴 display:block, Viewer ID 1개 |
| 브라우저 오류 | PASS | 검증 시 수집된 error 로그 없음 |
| VM 배포·Azure 전체 E2E | NOT VERIFIED | 이번 작업에서 실행하지 않음 |

증적: artifacts/ui-review-2026-10-09/mediq-clinician-integrated.jpg.

## 한계와 완료 판정

기존 기능 범위의 로컬 통합 의료진 UI를 구현했다. 시안의 픽셀 단위 완전 복제, 미구현 v3 Mapping/Grant/수신 확인, AI 도우미를 구현했다고 주장하지 않는다. 기존 관리자/감사/운영 화면은 별도 화면으로 유지했으며 신규 일반 의료진 감사 접근을 추가하지 않았다. 사용자의 실계정·실제 환자정보를 사용하지 않았다.

739개 Node 테스트는 별도 HTTPS/VM/Key Vault E2E 실행을 대체하지 않는다. 브라우저 영상은 로컬 개발 합성 데이터이며 발표용 VM CT/MRI 증적이 아니다. 전체 MVP 완료 또는 독립 검토 PASS를 선언하지 않는다. 배포·커밋·푸시는 수행하지 않았다.
