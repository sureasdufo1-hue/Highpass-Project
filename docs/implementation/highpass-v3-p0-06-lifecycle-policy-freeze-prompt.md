# 다음 실행 — lifecycle 정책 결정 반영 및 구현 계약 동결

2026-10-08 / DRAFT / UNASSIGNED. 전체 Highpass MVP/v3 목표 유지.
CON-003~006, AUTH-001/004, TEN-003, IAM-003/004, FR-001~005/014~025/037~041.

1. [L1~L5 정책 패킷](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md),
   최신 actual service-built parent/expiry 증적과 lifecycle ADR/API를 읽는다.
2. 사용자의 실제 답변을 확인한다. 기존 계획 채택·기본 선택·무응답을 새 정책 승인으로
   대신하지 않는다. 답변이 없으면 신규 권한 활성화 없이 아래 안전한 분석을 진행한다.
3. 승인된 선택만 결정 기록/ADR/API/ERD/요구사항/traceability/acceptance에 반영한다.
   rejected/TBD 정책은 명시한다. L2 source/ref failure와 환자 철회 성공을 구분한다.
4. event3의 predecessor/content tuple/실제 actor·subject/purpose/finite DB-clock/
   immutable audit/typed HMAC receipt/cascade 요청 및 ACK 경계를 계약 수준에서
   일치시키고 필요한 정확한 command/read DTO와 부정 시험을 작성한다.
5. 미승인 시 구현 전 계약의 충돌·상태 과장·증적 누락을 조사해 갱신한다. 이는
   정책 채택이나 신규 DDL/service/API 활성화가 아니다. 안전한 기존 게이트 회귀와
   다음 승인 후 DDL 실행 프롬프트를 준비한다.
6. 승인 후 순수 입력 검증과 additive DDL부터 실행한다. runtime DB 변경/기존 초기
   내용 변경/Consent 상태와 Session CANCELLED·EXPIRED 치환/임상 Grant 활성화 금지.
   모든 새 시험은 DRAFT / UNASSIGNED이며 전체 MVP/v3 완료는 증명 전 선언하지 않는다.

commit/push/merge/PR·secret 출력·TLS/RLS/재인증 완화 금지. 외부 IdP/KMS/PACS·기관/
법률·인증·운영 승인은 DEFERRED/BLOCKED 유지.
