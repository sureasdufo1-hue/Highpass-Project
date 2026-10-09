# Privacy API 계약 정렬 실행 프롬프트

작성일: 2026-10-08. 근거: 김범희의 [비운영 연동 준비 계획 채택](../privacy/NONPRODUCTION-INTEGRATION-APPROVAL-2026-10-08.md).

## 목적

현재 작업 트리의 PF-1 요청 JSON Schema, 실제 입력 검증, 정상·readiness·오류 응답을 정렬한다. FR-042~FR-046, PF-R02~PF-R06, PF-R10에 영향을 준다.

## 실행 순서

1. `src/privacy-service.js`, adapter, 내부 HTTP handler, OpenAPI, JSON Schema와 기존 시험을 확인한다.
2. 선언된 `additionalProperties: false`와 context 배열의 문자열 타입을 서버에서도 강제한다. 정책 불일치 목적은 기존 403 정책 거부를 유지한다. 민감 입력을 오류에 포함하지 않는다.
3. 정상 inspection/readiness/error 응답 schema를 추가하고 OpenAPI에서 참조한다. 누락된 401/403/502를 명시하고 실제 API 인증은 내부 서비스 토큰으로 보존한다.
4. 잘못된 입력이 정책·모델 호출 전에 거부되는 음성 시험과 응답 shape 시험을 추가한다. 기존 합성 Privacy 시험을 재실행한다.
5. 계약을 파싱하고 가능한 표준 schema 검증을 실행한다. 실행하지 못한 검증은 NOT VERIFIED로 기록한다.
6. 보고서·등록부를 갱신하고 다음 prompt를 작성한다. 실제 모델, 외부 Staging, 최소권한 자격증명·전체 deadline 완료를 이번 시험으로 주장하지 않는다.

## 금지 및 종료 조건

공개 edge 경로 추가, 내부 HTTP 외부 노출, OAuth2 임의 전환, secret 생성·출력, 모델 자동 다운로드, runtime DB 변경, commit/push/merge는 하지 않는다. 결과는 DRAFT / UNASSIGNED이다. 정상·음성 합성 시험과 계약 검증이 통과해야 이 계약 정렬 작업만 완료로 판단한다. 전체 MVP/v3 완료 또는 독립 검토 완료를 선언하지 않는다.
