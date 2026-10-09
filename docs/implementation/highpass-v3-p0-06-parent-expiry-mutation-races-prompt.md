# 다음 실행 — 부모 만료·기관/참조 변경·취소와 환자 결정 경쟁

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
CON-001~006, AUTH-001/004, TEN-003, FR-001~005/014~020/037~041.

선행은 challenge/재인증 만료와 실제 Session·target hospital·patient reference
lock 대기를 시험한 127개 owned PG 결과다. 이 결과는 전체 D6 완료가 아니다.

1. 현재 011~026, parent lifecycle service와 실제 취소 event/audit/cascade/receipt
   계약 및 전체 lock DAG를 확인한다. runtime DB·공개 경로는 바꾸지 않는다.
2. 기존 실제 short-parent fixture를 참고해 별도 Session·preparation을 감사 및
   snapshot/receipt와 함께 원자적으로 seed한다. preparation 범위는 parent 이내,
   원본 의료영상·실제 환자·token/nonce 기록은 금지한다.
3. 준비·부모의 실제 유한 deadline이 INSERT 이후/COMMIT 중에 지나도록 시험한다.
   challenge·재인증·preparation·parent의 원인을 분리해 보고하고,
   서로 종속된 deadline 하나를 여러 독립 통제 검증으로 과장하지 않는다.
4. 실제 COMMIT query까지 재인증 시각이 지나 SQL deferred assembly도 거부하는지
   확인한다. client는 COMMIT_OUTCOME_UNKNOWN을 반환할 수 있으며, DB 불저장과
   client의 결과 인식은 구분한다.
5. 별도 transaction의 실제 기관 중지/reference 삭제/감사된 Session 취소를
   먼저 실행하고 lock 대기를 관측한다. commit/rollback 후 결정·receipt가
   올바른 current context를 재검증하는지, 모든 신규 행 수가 원자적인지 확인한다.
   역순 경쟁은 deterministic barrier와 실제 lock witness를 확보한 후 확장한다.
6. PG 완료 후 전체 Node를 순차 실행하고 source hashes·manifest·secret scan·
   정확한 owned cleanup을 확인한다. 예외 원문·식별값·raw nonce는 증적에 넣지 않는다.
7. 결과는 DRAFT / UNASSIGNED. 다음은 patient-only withdrawal/expiry content
   event 모델·API/ERD 계약 정렬을 먼저 수행한다. Grant/임상 접근 활성화 및
   전체 MVP/v3 완료는 모든 후속 acceptance gate 전까지 금지한다.

실제 외부 자원·법무·병원 승인은 DEFERRED/BLOCKED 유지. commit/push/merge/PR 금지.
