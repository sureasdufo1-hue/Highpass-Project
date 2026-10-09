# 환자 시안 재구성 1차

2026-10-09 · DRAFT / UNASSIGNED

## 범위

색상 변경 중심의 이전 결과에서 벗어나 첨부 환자 웹 시안의 레이아웃을 기준으로 재구성했다. 기존 HTML/JS와 동의·QR·철회 계약은 유지했다. FR-001~009, FR-032~041의 UI 표현·진입 동선에 영향이 있으며 전체 기능 완료 판정은 아니다.

- 상단 검색, 좌측 빠른 작업, 요약 카드 4개.
- 첫 줄: 동의 안내 / 보호 안내.
- 둘째 줄: 영상 목록 / 미리보기 진입 / 공유 상태 안내.
- 셋째 줄: 이용 도움말 / FAQ.
- 홈은 실제 목록 중 2개를 보여주며 검색 범위도 이 2개로 명시했다. 전체 보기는 기존 영상 목록으로 연결한다.

## 변경 파일

- 생성: `public/ui/patient-reference.css`, 이 기록.
- 수정: `public/index.html`, `public/ui/patient.js`.
- 스타일 구성에는 frontend-design 지침을 적용했고 기존 기능의 event ID와 경로를 유지했다. 임의로 승인·전송 성공·AI 응답을 만들지 않았다.

## 검증

`node --check public/ui/patient.js` 종료 코드 0.

`node --test test/patient-ui-qr.test.js test/consent-selection.test.js test/consent-operations.test.js`: 22 PASS, 0 FAIL, 종료 코드 0.

브라우저에서 1672px 시안 폭과 390px 폭의 페이지 수평 넘침 없음. CT 검색 시 Chest CT만 노출되고 검색 해제 시 카드 복귀 확인.

[재구성 화면](../../artifacts/ui-review-2026-10-09/patient-reference-desktop.jpg)

## 남은 차이

인물 일러스트·실제 영상 썸네일/인라인 미리보기는 미적용이다. 미리보기 패널은 열람 진입 안내이며 실제 영상이 표시된 것으로 주장하지 않는다. 전송 타임라인은 절차 안내, 도움말은 정적 이용 안내이며 AI 챗봇이 아니다. 브랜드 HiPass, 실제 서버 목록·상태 및 비운영 안내를 유지하므로 시안의 고정 예시 숫자/브랜드와는 다르다.

환자 홈 재구성 1차이며 픽셀 단위 동일 재현 완료가 아니다. 의료진·모바일의 시안 기준 재구성은 후속이다. VM 배포·커밋·푸시는 하지 않았다.
