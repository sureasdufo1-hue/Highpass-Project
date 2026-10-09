# Privacy 전체 요청 deadline·abort 실행 결과

작성일: 2026-10-08. 신규 증적 상태: `DRAFT / UNASSIGNED`. 계획 채택 검토자·승인자는 김범희, 승인일 2026-10-08이며 이 정보는 신규 기술 결과의 사람 검토 완료를 뜻하지 않는다.

## 목적·요구사항·기존 구조

[실행 프롬프트](../implementation/highpass-privacy-request-deadline-abort-prompt.md)를 실행했다. PF-R01~PF-R06, PF-R10, FR-042~FR-046에 관련된다. 기존 Privacy HTTP → service의 countTokens/detect → local child bridge 구조와 내부 인증·정책·반출 금지를 유지했다. 이전 실행당 timeout은 queue·body·다단계 합산을 제한하지 못했다.

## 구현과 변경 파일

- `src/privacy-request-budget.js` 신규: monotonic deadline, AbortSignal, safe 504, late completion 차단. Privacy 전용 event-based strict UTF-8 body reader가 취소 시 listener를 제거하고 수신을 중단한다.
- `src/server.js`: Privacy handler 진입부터 기본 30초의 단일 budget 적용, optional `HIPASS_PRIVACY_REQUEST_TIMEOUT_MS` 정수 1~60000ms 검증. readiness와 body·모델 처리에 동일 budget 전달. client abort/response close 취소, typed 오류 후 불완전 요청 connection 종료. 일반 임상 body reader는 변경하지 않았다.
- `src/privacy-service.js`: direct service 호출에도 기본 전체 budget, count/detect가 같은 signal을 사용. deadline 후 성공 preview를 반환하지 않음.
- `src/privacy-adapter.js`: queue 대기 포함 실행 budget과 upstream abort, 취소된 queue 작업 제거. readiness도 concurrency/queue 제한을 공유. stdin/stdout/process error를 typed 오류로 처리하고 raw stderr를 출력하지 않음.
- child 종료 요청 후 1초 강제 종료 시도. caller는 시간 내 실패하되 실제 child `close` 전에는 active 슬롯을 해제하지 않는다. close 미확인 시 슬롯을 격리 상태로 유지하며 무제한 새 child를 만들지 않는다.
- `.env.example`, OpenAPI, [Runbook](PRIVACY-SERVICE-IDENTITY-RUNBOOK.md), fake bridge 및 deadline/HTTP 시험 갱신.

## 검증 결과

| 검증 | 종료 코드 | 결과·근거 |
| --- | --- | --- |
| `node --test test/privacy-request-deadline.test.js test/privacy-filter.test.js test/privacy-service-identity.test.js` | 0 | PASS 33/33, 최신 실행 1,790.8729 ms |
| `node --test` (최종 코드 수정 후 재실행) | 0 | PASS 455/455, 38,116.0954 ms |
| `node scripts/security-secret-scan.js` | 0 | PASS findings 0, 2026-10-08T04:22:35.600Z |
| 변경 tracked 파일 `git diff --check` | 0 | PASS; LF→CRLF 안내만 있음 |
| PyYAML OpenAPI parse/readiness 504 확인 | 0 | PASS; 표준 OpenAPI 전체 validator는 아님 |

추가 시험은 합산 budget 초과와 무시된 signal의 late completion, 이미 취소된 budget의 실행 금지, 멈춘 readiness, 취소 queue 제거, 실제 fake bridge child 종료 후 active=0 및 다음 정상 처리다. HTTP fixture는 실제 `src/server.js`를 자체 temporary store/random port로 실행하여 느린 body의 504 `MODEL_TIMEOUT`, client 연결 종료 후 health 200을 검증했다. fixture child·자체 temporary directory는 cleanup했다.

초기 전체 회귀도 455 PASS였지만 실행 도중 adapter limit/error 처리를 추가했으므로 최종 근거는 그 이후의 재실행만 사용한다. 전용 token fixture와 모델 입력은 합성 데이터이며 실제 credential을 생성·저장·출력하지 않았다. 전체 Node discovery의 live E2E/staging runner는 비실행 분기이므로 이 수치는 실제 전체 HTTPS E2E·Staging PASS가 아니다.

## 보안 한계·미검증

handler budget은 HTTP header 수신 완료 후 시작한다. TLS handshake·header 수신·OS 자원 한도·event-loop stall을 독립적으로 증명하지 않는다. 실제 모델 실행·외부 TLS/Staging·OS가 child 종료를 거부하는 장애·독립 사람 검토는 NOT VERIFIED다. 실제 bridge readiness에는 제한이 있으나 이번 fake service readiness 시험을 실제 모델 준비 완료로 해석하지 않는다.

자동 retry나 durable job/audit receipt는 추가하지 않았다. timeout 또는 preview 성공으로 반출을 허용하지 않는다. 클라이언트 재시도는 정책과 자원 상태를 다시 확인해야 하며 중복 추론 비용이 생길 수 있다.

다음은 [격리 HTTP 통합 증적 프롬프트](../implementation/highpass-privacy-isolated-http-evidence-prompt.md)다. 정상 마스킹 응답까지 shared 실제 handler로 검증하고 manifest를 수집한다. 전체 MVP/v3·Production readiness·법률 적합성·독립 검토 완료를 선언하지 않는다. commit/push/merge는 실행하지 않았다.
