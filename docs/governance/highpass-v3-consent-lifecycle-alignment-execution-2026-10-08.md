# 승인-first 역순 경쟁 및 철회·만료 계약 정렬 결과

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED. 기존 계획 채택 검토자·승인자 김범희.
새 기술 증적의 독립 사람 검토 및 신규 L1~L5 정책 승인은 미완료다.
CON-001~006, AUTH-001/004, IAM-003/004, TEN-003, V3-AT-CON-002~004,
FR-001~005/014~025/037~041. 전체 MVP/v3 완료는 선언하지 않는다.

## 실제 코드·경쟁 검증

[실행 프롬프트](../implementation/highpass-v3-p0-06-consent-lifecycle-alignment-prompt.md)를
진행했다. `patient-decision-mutation-fixture.js`에 두 승인-first 경쟁을 추가했다.
실제 환자 결정이 receipt INSERT까지 수행한 뒤 유한 barrier에서 기다리는 동안
별도 owner의 기관 중지/참조 삭제 UPDATE가 lock 대기함을 관측한다. waiter와
blocker의 정확한 PID 관계 및 Lock wait를 확인한 뒤 승인 COMMIT을 허용한다.
그 후 변경 UPDATE가 COMMIT되고, 같은 private provider/HMAC key의 원본 receipt
재조회가 최신 context 검증에서 거부되며 동의 기록은 추가되지 않는다.

이는 승인-first **기관/참조 변경** 증명이다. actual nonowner 취소 service의
양방향 경쟁·다중 Session 전체 D6·철회/만료 service를 검증한 것은 아니다.
변경은 owned disposable fixture에서만 수행하며 실제 runtime은 변경하지 않았다.

## 초기 실패·최종 결과

최초 실행은 reference deletion 후 원본 receipt 재조회 코드의 기대값을
PREPARATION_NOT_FOUND로 작성해 FAIL했다. 024의 preparation RLS는 등록된 patient
context를 검증하지만 ref.deleted_at를 조건으로 삼지 않는다. 준비 레코드는 보이고
뒤의 SELECT ref/deleted_at IS NULL에서 SOURCE_REF_UNAVAILABLE로 거부된다.
실제 코드는 안전하게 거부하는 기존 동작을 유지했고, 테스트만 이 계약의 정확한
거부 코드로 수정했다. 실패 원본·manifest를 삭제하거나 PASS로 바꾸지 않았다.

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 1 | FAIL, reference-deletion reverse assertion ERR_ASSERTION; cleanup PASS |
| 수정 후 같은 PG gate | 0 | PASS 137/137, 99,942 ms, cleanup/sourceUnchanged PASS |
| 두 manifest의 `node scripts/verify-evidence-manifest.js <manifest>` | 0 | 파일 무결성 PASS; 실패 gate를 PASS로 승격하는 의미 아님 |
| PG 종료 후 `node --test --test-concurrency=1` | 0 | PASS 464/464, 74,995.416 ms |
| `node scripts/v3-lifecycle-document-check.js` | 0 | 정적 문서 검사 PASS, semantic OpenAPI/anchor/사람 승인 미검증 |
| `node scripts/security-secret-scan.js` | 0 | findings 0, 2026-10-08T05:07:08.748Z; 최종 보고서 뒤 재실행 |
| tracked 변경 `git diff --check` | 0 | whitespace 오류 없음; 기존 CRLF 경고 |

최종 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-07-09-593Z-5092e545/manifest.json),
[137개 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-07-09-593Z-5092e545/schema-check.json).
실패 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-03-53-488Z-95a9bafa/manifest.json).
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 코드 hashes,
Node v24.18.0 기준. 증적 DRAFT / UNASSIGNED 및 정확한 container 부재 관측 PASS.
identity PG·실제 HTTPS/Viewer/model/IdP/KMS/PACS는 이번 턴에 재실행하지 않았다.

## 새 계약 정렬 — 구현 전

[Lifecycle ADR](../architecture/highpass-v3-consent-lifecycle-adr.md)와
[제안 API 계약](../api/highpass-v3-consent-lifecycle-contract.md)을 작성하고 ERD,
API alignment, traceability 및 acceptance CON-002~004에 연결했다.
초기 event1/2와 contentVersion1은 그대로 보존하며 별도 후속 terminal event3,
정확한 predecessor, 실제 actor/subject 분리, immutable audit/receipt/cascade
REQUESTED 모델을 제안했다. worker 지연과 무관한 DB-clock effective expiration,
기록 상태/현재 유효 상태, 과거 receipt/current authority를 구분했다.

NOT IMPLEMENTED: WITHDRAWN/EXPIRED DDL/service, content replacement,
maintenance identity, evidence read/admin policy 및 downstream capability effects.
초기 approval-only factory는 live parent/target을 요구하므로 환자 철회에 그대로
재사용하지 않는다. maintenance를 환자 명의 audit으로 기록하지 않는다.
Session CANCELLED/legacy REVOKED를 Consent WITHDRAWN으로 자동 치환하지 않는다.

L1~L5 정책 선택은 ADR에 미결정으로 명시했다. L1(parent 종료/target stop 중
인증·소유권이 확인된 환자 본인의 live consent 철회 허용)을 사용자에게
비차단 정책 질문으로 제시했다. 선택지가 표시됐다는 이유로 채택/승인으로 기록하지 않는다.
새 API·scope·runtime 권한을 활성화하지 않았으며 commit/push/merge/PR도 없다.

## 다음 실행

[실제 nonowner 취소 경쟁 프롬프트](../implementation/highpass-v3-p0-06-nonowner-cancel-races-prompt.md)를
작성하고 기존 identity PG의 실제 취소 service/registry/grant 증적 분석을 시작했다.
별도 최소권한 취소 pool과 approval pool을 유지해 두 service의 양방향 경쟁을
검증한다. L1~L5 응답 전에도 이 검증과 등록된 다른 patient/tenant RLS 같은
안전한 잔여 작업은 진행 가능하므로 전체 목표를 blocked/complete로 바꾸지 않는다.
전체 D6/공개 임상 흐름/Grant/독립 사람 검토는 미완료이며 실제 외부 자원과
상용화 법무·인증·운영 승인은 DEFERRED/BLOCKED를 유지한다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
