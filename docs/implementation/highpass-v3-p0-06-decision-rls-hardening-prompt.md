# 최초 환자 동의 결정 — 직접 RLS·불변성 보강 실행 프롬프트

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
새 기술 증적의 독립 사람 검토는 별도다. CON-001~006, TEN-003,
IAM-003/004, FR-001~005/014~020/037~041에 관련된다.

1. 026 DDL, private 결정 service, 현재 owned PG fixture와 계약을 확인한다.
2. 신규 7개 테이블에 대해 제한된 nonowner 계정으로 직접 SELECT를 실행한다.
   본인 patient context에서 정상 조회, context 없음·의료진 actor·알 수 없는
   actor·다른 tenant·다른 hospital에서 0행을 실제 PG로 확인한다.
   이 작은 행렬을 모든 등록된 다른 환자·tenant 조합의 완전 검증으로 과장하지 않는다.
3. owner가 각 테이블을 UPDATE 또는 DELETE해도 불변성 trigger가 거부하고
   모든 행 수가 유지되는지 확인한다. 권한 완화는 테스트용 owned fixture에만 한다.
4. 전체 Node·기존 identity PG·ceremony PG 회귀를 실행하고 manifest/hash,
   exact owned cleanup을 검증한다. CPU 경합으로 deadline 시험이 실패하면
   실패를 보존하고 heavyweight gate와 분리해서 재현한다. runtime timeout은 완화하지 않는다.
5. 남은 실제 lock 대기·COMMIT 시각 만료·취소 경쟁·withdrawal·Grant·HTTP/UI를
   NOT VERIFIED로 유지한다. 원본 nonce/secret/실제 개인정보를 기록하지 않는다.

live DB 변경, commit/push/merge/PR, TLS/RLS/인증 완화 금지.
