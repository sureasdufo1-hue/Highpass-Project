# Privacy 격리 HTTP 통합 검증·증적 실행 프롬프트

작성일: 2026-10-08. 선행: [전체 deadline·abort 결과](../privacy/REQUEST-DEADLINE-EXECUTION-2026-10-08.md).

## 목적

인증·body·policy·fake child bridge·transform·response·timeout·cleanup을 같은 HTTP 시나리오에서 검증한다. 기존 시험의 실제 HTTP는 모델 미준비/보안 음성 중심이고 정상 마스킹 응답은 service 단위 시험이므로 이 간극을 해소한다. PF-R01~PF-R06, PF-R10~PF-R11, PF-R14 및 FR-042~FR-046에 관련된다.

## 실행 순서

1. 최신 handler·service·adapter·정책과 시험을 확인한다. 최소 범위로 Privacy handler를 주입 가능한 별도 모듈로 추출하고 실제 server가 동일 모듈을 사용하게 한다. runtime에 fake-model switch를 추가하거나 public 경로를 열지 않는다.
2. loopback/random port의 owned HTTP server에서 실제 shared handler + 명시적 synthetic registry + 기존 fake bridge를 구성한다. 전체 시작/readiness/요청/종료 timeout을 둔다. 실제 secret·model·DB·환자정보를 사용하지 않는다.
3. 정상 inspection 200의 typed response와 마스킹·임상 표현 보존·REVIEW_REQUIRED/releaseEligible=false를 확인한다. 무인증·오류 token·scope 부족·requester/기관/artifact/version/purpose 불일치·잘못된 JSON/UTF-8·크기·model 장애·queue/timeout·client abort를 검증한다. 승인·거부가 어떤 단계에서 발생했는지 counters와 state로 입증한다.
4. stdin/stdout/process failure와 late completion, 취소된 queue가 실제 child를 만들지 않는지 추가 검증한다. private fixture hook이 필요하면 runtime 권한·입력을 확장하지 않는다.
5. Node 20 최소 버전 호환성을 확인한다. AbortSignal API 및 deadline timer listener 누수·종료 후 child/queue 잔존을 점검한다. 보장하지 못한 최소 버전 또는 종료 관찰은 NOT VERIFIED로 명시하고 실제 필요한 조건을 정렬한다.
6. 재현 가능한 local verification 명령과 SHA-256/source closure에 묶인 결과 manifest를 추가한다. 증적에는 raw body/token/path secret/원본 오류를 포함하지 않는다. source 변경·cleanup 실패·미실행 사례는 PASS로 숨기지 않는다.
7. 전체 회귀·secret scan·contract parse를 실행하고 보고서 및 다음 prompt를 등록한다. 실제 모델 없는 테스트라는 한정 문구와 DRAFT / UNASSIGNED를 유지한다.

## 경계

이번 HTTP는 loopback-only 기술 fixture이며 실제 TLS·외부 Staging·기관 모델 승인·반출 검증이 아니다. live DB/Compose 운영 스택 변경, 모델 다운로드, 인증 완화, 임상 경로 재설계, commit/push/merge 금지. 사용자 기존 변경 보존. 정상 HTTP 경로와 명시된 음성·종료 조건을 실제 실행하기 전 통합 완료를 주장하지 않는다.
