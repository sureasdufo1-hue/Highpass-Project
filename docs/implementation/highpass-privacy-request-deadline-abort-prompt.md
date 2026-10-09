# Privacy 전체 요청 deadline·abort 실행 프롬프트

작성일: 2026-10-08. 선행: [최소권한 identity 실행 결과](../privacy/SERVICE-IDENTITY-EXECUTION-2026-10-08.md).

## 목표와 범위

현재 child 실행당 15초 timeout만으로는 queue 대기·countTokens·detect·HTTP body 수신 전체의 유한 종료를 보장하지 못한다. PF-R01~PF-R06, PF-R10에 대해 전체 요청 deadline과 abort를 end-to-end로 구현·증명한다. 실제 model 자원 없이 fake bridge/격리 HTTP 시험으로 구현 가능하다.

## 실행

1. `src/privacy-adapter.js` enqueue/start/run, service의 두 단계 모델 호출, `readJson` body 수신, Privacy HTTP 응답·socket close 처리를 분석한다. 임상 경로와 공통 handler 변경 영향을 확인한다.
2. 요청 시작부터 전체 budget을 소모하는 단일 deadline과 AbortSignal 계약을 정한다. 인증·입력·정책 검증은 유지하며 queue 대기와 각 child 실행이 잔여 budget을 초과하지 못하도록 한다. readiness에도 유한한 budget을 적용한다.
3. queue에서 abort된 작업은 실행하지 않고 제거한다. 실행 중 abort/timeout은 child 종료와 typed failure로 연결한다. 늦은 완료가 성공 응답 또는 새로운 child 실행을 만들지 못하도록 한다. stdin 오류·process error·close 중복 정리를 검증한다.
4. timeout 응답만 빨리 보내고 underlying operation/queue capacity를 방치하지 않는다. 고정된 자원 한도, cleanup 완료 또는 안전한 격리, 민감 stdin/stdout/오류 비노출을 확인한다.
5. 개인정보 원문 fallback/자동 release를 금지하고 무조건 재시도하지 않는다. read-only preview라도 중복 inference·리소스 비용·감사 정책을 명시한다. 반출 작업 retry를 이 계약으로 허용하지 않는다.
6. queue timeout·다단계 합산 timeout·client abort·느린 body·late completion·child 장애·정상 요청·건강 응답을 합성 bridge 및 실제 격리 HTTP에서 시험한다. 모든 polling/teardown에도 timeout을 둔다.
7. OpenAPI·Runbook·시험·증적을 갱신하고 전체 회귀 및 secrets 검사 실행. 다음 gate prompt를 작성한다.

## 금지

TLS/mTLS 완화, 공개 Privacy 경로 추가, 실제 모델 다운로드, 외부 환자정보·시스템 사용, 테스트 skip/결과 하드코딩, 무관한 재설계, commit/push/merge 금지. 기존 사용자 변경 보존. 결과는 DRAFT / UNASSIGNED, 실제 모델·외부 Staging은 별도 미검증이다.
