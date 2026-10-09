# Privacy API 계약 정렬 실행 결과

작성일: 2026-10-08. 증적 검토 상태: `DRAFT / UNASSIGNED`.  
계획 채택 검토자·승인자: 김범희. 계획 승인일: 2026-10-08. 이 명의는 신규 기술 증적의 검토·승인으로 자동 적용하지 않는다.

## 작업 목적·구조

[실행 프롬프트](../implementation/highpass-privacy-api-contract-alignment-prompt.md)를 작성하고 실행했다. 기존 Node 내부 handler → PrivacyTextInspectionService → local adapter 구조와 내부 서비스 토큰 인증을 보존했다. 관련 요구사항은 FR-042~FR-046, PF-R02~PF-R06, PF-R10이다.

## 변경·보안 영향

- `src/privacy-service.js`: 선언된 요청 allowlist와 context 문자열 배열 검증을 서버에서 강제. 잘못된 입력을 model 호출 전에 422로 차단. 지원되지 않는 목적은 기존 정책 403을 유지.
- `schemas/privacy-text-inspection.schema.json`: 문자열 artifact version의 빈 값 금지 명시.
- `schemas/privacy-responses.schema.json`: inspection/readiness/error 계약 추가. `releaseEligible: false`, review 상태 고정. preview에 개인정보·충돌 span이 남을 수 있으며 반출 승인 대상이 아님을 명시.
- `docs/api/highpass-privacy-internal.openapi.yaml`: 정상 응답 schema 참조, readiness의 503은 readiness 객체임을 구분. 누락된 401/403/502 명시.
- `test/privacy-filter.test.js`: 추가 필드·잘못된 context·빈 version·목적·scope 음성 시험과 serialized response shape 시험 3개 추가.

공개 경로·인증·DB·임상 화면은 변경하지 않았다. 이전에는 Schema가 금지한 추가 필드를 runtime이 무시했지만, 이제 해당 요청은 422가 된다. 연동 클라이언트는 명세 외 필드를 제거해야 한다. 정상 입력·response 형식과 내부 preview 소비 흐름은 유지한다. 새 인증권한이나 반출권한은 발급하지 않았다.

## 테스트 결과

| 검증 명령·방법 | 종료 코드 | 결과·근거 |
| --- | --- | --- |
| `node --test test/privacy-filter.test.js` | 0 | PASS 24/24, 2,075.7057 ms |
| `node --test` | 0 | PASS 446/446, 40,029.9682 ms |
| Python PyYAML + JSON parser로 OpenAPI 및 schema `$ref` 확인 | 0 | PASS OpenAPI 3.1.0, 참조 28개 해석 |
| `git diff --check` (이번 tracked 코드·계약 변경) | 0 | PASS, LF→CRLF 안내만 있음 |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0, 2026-10-08T04:11:53.149Z |
| 표준 JSON Schema 전체 validator | 미실행 | NOT VERIFIED: 현재 Python에 `jsonschema` 없음. 새 시험은 사용 키워드의 제한된 assertions이며 표준 validator 대체가 아님 |
| 실제 model·공개 HTTP/HTTPS·외부 Staging·DB Gate | 미실행 | NOT VERIFIED. 이전 실제 model smoke는 checkpoint 부재로 차단 |

전체 Node discovery에서 live E2E/staging runner는 자체 비실행 분기로 종료한다. 따라서 446 PASS는 live 전체 E2E 또는 외부 연동 PASS가 아니다. secret scanner는 검사 범위 내 결과이며 개인정보 완전 부재 보증이 아니다.

## 남은 위험과 다음 실행

현재 shared 내부 서비스 토큰은 Privacy 외 감사·Gateway 권한도 함께 가진다. 이를 외부 담당자에게 전달하지 않는다. [다음 실행 프롬프트](../implementation/highpass-privacy-least-privilege-service-identity-prompt.md)에 따라 별도 Privacy 전용 credential과 scope를 추가하고 다른 내부 기능에 접근하지 못하는지 음성 시험한다.

그 뒤 전체 HTTP deadline·queue 체류시간·abort·중복 재시도 계약, 응답 schema의 표준 validator, 실제 모델 고정 digest/품질 검증, 허용된 비운영 TLS 네트워크 연동이 남는다. 현재 모델 부재만으로 이들 로컬 구현 작업까지 차단하지 않는다.

전체 MVP/v3 완료, 독립 검토 완료, 운영·법률 적합성은 선언하지 않는다. commit/push/merge를 실행하지 않았다.
