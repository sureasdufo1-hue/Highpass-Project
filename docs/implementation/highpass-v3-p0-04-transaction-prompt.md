# P0-04 다음 실행 프롬프트 — DB 주체·tenant 트랜잭션·감사 기반

2026-10-07 / 이전 단위: 식별자 보호·principal registry·JWT 보완, 회귀 286개 PASS.
현재 dirty worktree를 보존하면서 다음을 구현하고 실제 독립 PostgreSQL로 검증한다.

1. 기존 006 Identity 스키마에 additive principal binding과 append-only identity audit outbox를 추가한다.
   raw token/key/식별자/보호값/digest를 감사 필드에 넣지 않는다. 기존 legacy DB에는 적용하지 않는다.
2. 인증 registry가 발급한 context만 허용하며 JWT 만료시각을 내부에 보존한다.
   context를 body에서 만들거나 token 만료 후 재사용하지 않는다.
3. parameterized transaction-local tenant/hospital/actor 설정, DB principal role/scope/ACTIVE,
   DB tenant/hospital ACTIVE를 확인한다. registry 상태는 DB에서 매번 재검증한다.
4. Pool acquire·SQL·전체 callback에 유한 예산을 적용한다. timeout/DB 오류는 안전한 technical
   failure이며 policy DENY와 구분한다. rollback 실패·timeout 연결을 pool에 되돌리지 않는다.
5. mutation과 감사 INSERT는 동일 transaction이다. 감사 실패 시 mutation도 rollback된다.
6. 비superuser·NOBYPASSRLS runtime test role로 실제 pg Pool max1 재사용, foreign joins,
   commit/rollback 뒤 context 제거, revocation, callback deadline, 감사 실패를 시험한다.
7. 서로 다른 DB role의 admin fixture provisioning과 app 동작을 분리한다.
   자기 label의 임시 컨테이너만 cleanup한다. raw secret/SQL error/credential을 로그에 출력하지 않는다.
8. targeted → live PostgreSQL → 전체 Node 회귀 → secret scan을 실행하고 실제 결과를 기록한다.

이 단위는 서비스/API·reviewer state machine·idempotency·전체 v3 audit hash chain 완료가 아니다.
이들을 다음 프롬프트로 계속 구현하며 SQL/Pool 검증을 HTTP 또는 connector 검증으로 대체하지 않는다.
관련: V3-FR-ID-005, V3-FR-TEN-001~004, V3-SR-TEN-001~003, FR-014~020/037~041.
운영 DB 변경, TLS 우회, commit/push/merge/PR 없음. 새 증적은 DRAFT / UNASSIGNED.
