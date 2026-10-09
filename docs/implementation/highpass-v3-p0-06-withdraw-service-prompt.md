# 다음 실행 — 환자 Consent 철회 원자적 서비스

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 채택: 김범희, 2026-10-08.
V3-FR-CON-003/005, V3-SR-AUTH-004/AUD-001/TEN-001, FR-001~005/014~025/037~041.

1. 027/208 PG 증적과 private withdrawal command/factory/projection, 기존 initial decision
   HMAC/idempotency/lost ACK/COMMIT-unknown 구현을 읽는다. 권한·내용·상태 객체 혼동 금지.
2. private factory 및 32-byte HMAC key를 복사·비공개 보관하는 내부 WithdrawalService를
   구현한다. bounded key는 별도 메타데이터이며 selector 3개 외 body authority 금지.
3. registry/source SHARE → actor/source/op key advisory → 공통 consent advisory → own live ref
   → current immutable content/terminal/DB clock 순서를 유지한다. parent/target 의존 금지.
4. 정상 최초 철회는 event3/audit/typed original result/REQUESTED cascade를 같은 transaction에
   INSERT한다. 모든 시간·증적 digest는 PG typed representation 기준으로 정확하게 생성한다.
   raw key/token/nonce 미보존, 공개 반환은 COMMIT 후 안전한 DTO만.
5. 같은 key/정확한 selector의 원본 receipt를 현재 인증·재인증·source/ref/ownership 하에서
   복구하되 historical receipt를 현재 ALLOW로 반환하지 않는다. 바뀐 payload는 conflict,
   다른 key의 terminal 중복은 deny. 과거 validUntil 이후 재시도 정책을 API와 명시적으로 정렬한다.
   새로운 철회는 DB-clock expiry 전만 허용하며 worker 지연과 무관하게 만료 DENY.
6. actual signed synthetic binding + withdrawal-only pool로 정상/재시도/변경 key/payload,
   foreign actor/source/ref, terminal/deadline, missing audit/result/cascade/COMMIT rollback,
   lost ACK, same/different-key/withdraw-expiry 경쟁·최종 deadline을 검증한다.
7. guard/key zeroization/dispose·finite timeout·source hash·owned cleanup/부재·manifest·전체 Node
   회귀를 기록한다. 신규 증적 DRAFT/UNASSIGNED, 기존 사람 승인으로 기술 PASS 승격 금지.

expiry registry/서비스·audited 최소 read·Grant/다운스트림 ACK는 별도 gate. runtime DB/public API
활성화, commit/push/merge/PR, 보안 완화·초기 event/receipt 변경 금지. 전체 MVP/v3 미완료.
