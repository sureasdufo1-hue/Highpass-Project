# Medi Q 환자 shell 구현 2차

2026-10-09 · DRAFT / UNASSIGNED

## 작업

[웹 화면 설계](MEDI-Q-WEB-SCREEN-DESIGN-2026-10-09.md)의 첫 구현 단위. 기존 HTML/JS·동의 계약을 유지하고 frontend-design 지침에 따라 시안의 배치에 맞췄다.

- 상단 중복 역할 전환 바를 접이식 시연 도구로 이동. 역할 버튼과 기존 ID를 보존했다. 실제 인증 전환이 아닌 개발용 화면 전환이다.
- Medi Q 로고·검색·사용자 정보 중심의 환자 헤더, 패널 비율 조정.
- 홈 검색을 최초 2개 카드에서 서버가 반환한 전체 목록으로 확장. 검사명·modality(MRI/MR)·검사일·출처 검색, 다중 검색어, 결과 건수, 빈 결과 안내. 검색 해제 시 기존 2개 카드로 복귀.
- 서버 API·인가·DB 변경 없음. 기존 사용자 변경 보존.

## 파일 및 요구사항

수정: `public/index.html`, `public/ui/patient.js`, `public/ui/patient-reference.css`.
생성: `test/patient-search.test.js`, 이 문서.
관련: FR-006~013 목록/열람 진입, FR-001~005 동의 화면 유지. 보안: 검색은 이미 권한 범위로 반환된 메타데이터만 사용하며 입력을 DOM HTML로 삽입하지 않는다.

## 검증

`node --test test/patient-search.test.js test/patient-ui-qr.test.js test/consent-selection.test.js test/consent-operations.test.js`: 24 PASS, 0 FAIL, 종료 코드 0.

로컬 브라우저: 초기 카드 밖의 Ultrasound 검색 → 전체 7건 중 1건 및 해당 카드 확인. 1672px 화면 캡처, 390px 페이지 수평 넘침 없음.

[화면 증적](../../artifacts/ui-review-2026-10-09/mediq-patient-shell.jpg)

이번 브라우저 확인은 검색·배치 범위이며 새 전체 동의/Viewer E2E는 NOT VERIFIED. 인물 일러스트·환자 실제 픽셀 미리보기·의료진 3열 상세 재구성은 남아 있다. 완전한 시안 일치 또는 MVP/v3 완료를 선언하지 않는다. 배포·커밋·푸시하지 않았다.
