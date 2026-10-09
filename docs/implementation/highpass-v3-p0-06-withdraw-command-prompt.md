# 실행 — 승인된 Consent 철회 순수 입력 검증

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 정책 검토자·승인자 김범희.
관련: V3-FR-CON-003/005, V3-SR-AUTH-004, FR-001~005/014~025/037~041.

1. 채택된 정책 패킷·lifecycle ADR/API와 기존 private registry/재인증/command 구조를 확인한다.
2. 별도 consent:withdraw PATIENT binding으로 정확한 selector
   {consentId,contentVersion,expectedEventSequence}만 검증한다. 초기 v1/sequence2만 허용한다.
3. actor/기관/환자/권한/인증 증거를 body에서 받지 않는다. 복사 binding/command,
   getter/prototype/symbol/추가 필드, 잘못된 타입·버전·UUID를 거부한다.
4. 실제 서명된 합성 TestProvider 재인증만 사용한다. immutable command를 원래
   private binding에 묶고 재사용 시 토큰 유효성·재인증을 다시 확인한다.
5. 이 parser는 DB ownership/기관 ACTIVE/ref 생존/동의 유효 상태를 증명하지 않는다.
   철회 완료·event3·감사·cascade·Grant를 생성하지 않는다. DB·scope enrollment·HTTP 비활성 유지.
6. scoped tests와 전체 Node 회귀, secret scan/diff를 실행해 종료 코드·범위·미검증을 기록한다.
   신규 기술 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 완료 선언 금지.

다음 gate: additive lifecycle DDL의 predecessor/actor/audit/receipt/cascade 및
RLS/조립/rollback fixture 검증. 기존 초기 event1/2·내용을 변경하지 않는다.
commit/push/merge/PR, TLS/RLS/인증 완화, secret 출력 금지.
