# 다음 실행 — 잔여 경쟁 증명과 동의 철회·만료 계약 정렬

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
CON-001~006, AUTH-001/004, IAM-003/004, TEN-003, FR-001~005/014~020/037~041.

1. 최신 실제 PG/Node 결과 및 026을 확인한다. mutation-first COMMIT/ROLLBACK,
   취소-first, 연동된 parent/preparation/challenge 만료만으로 전체 D6 완료를 선언하지 않는다.
2. 승인-first 상태에서 기관/참조 변경·취소가 실제로 lock 대기하는 역순을
   deterministic barrier와 실제 PG witness로 증명한다. 변경 후 기존 원본
   receipt는 과거 기록이며 새 authority가 아니다. 가능한 한 실제 nonowner
   lifecycle service를 쓰고 owner fixture 증명과 명확히 구분한다.
3. 요구사항 CON-003~006 및 canonical WITHDRAWN/EXPIRED와 현재 026의
   eventSequence1..2 한정을 비교해 lifecycle ADR·ERD·API를 문서 수준에서 먼저 정렬한다.
4. contentVersion과 eventSequence를 분리한다. 철회/만료는 기존 원문을 수정하지
   않는 새 상태 event다. 내용 확대/기간 변경은 별도 새 version+새 evidence이며
   이전 nonce·동의·Grant를 승계하지 않는다.
5. 환자 철회와 maintenance 만료의 실제 actor를 분리한다. service actor를
   patient_actor_id로 위장하지 않는다. 신규 최소 scope/role/private factory,
   immutable audit/receipt/cascade REQUESTED와 event-sequence 동시성 계약을 정의한다.
6. expiry worker가 미실행이어도 DB 시각의 effective expiration으로 신규 authority는
   거부해야 한다. outbox 존재를 downstream 철회·중단 완료로 표현하지 않는다.
7. Session·동의·authority·Grant를 각각 별도 상태 객체로 유지한다. withdrawal을
   REQUESTED Session 취소나 legacy REVOKED로 자동 치환하지 않는다.
8. 정책상 미결정(terminal parent/기관 중지 중 철회 admission, 별도 withdraw scope,
   실제 사람 재인증과 원본 evidence 열람 role)을 명시한다. 핵심 불확실성을
   임의 구현하지 않고 승인 필요 선택으로 보고한다. 그 전에도 잔여 안전한 경쟁
   검증·문서 정렬은 진행한다.
9. 계약·traceability·acceptance와 다음 additive DDL/service 구현 프롬프트를
   작성한 뒤 승인된 범위에서만 실행한다. live DB·공개 API·Grant 활성화 금지.

owned synthetic 환경·finite timeout·source hash/manifest·secret scan·cleanup·
DRAFT / UNASSIGNED 유지. 미실행은 NOT VERIFIED. commit/push/merge/PR 금지.
