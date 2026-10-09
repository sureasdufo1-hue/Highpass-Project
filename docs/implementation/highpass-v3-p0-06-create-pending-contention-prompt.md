# 다음 실행 — 기존 Session 생성·PENDING과 환자 승인 간 실제 경합

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
D6, EX-003/005/006, CON-001/006, IAM-003/004, TEN-003, AUTH-001/004,
FR-001~005/014~025/037~041. 전체 MVP/v3 목표와 상용화 제외 경계는 유지한다.

1. 최신 다중 Session/반대 기관/expiry SKIP LOCKED 증적의 실제 PASS/FAIL와 source
   hashes를 확인한다. 단계별 waiter/blocker 관측과 JOIN 실행 내부 순서를 구분한다.
2. 실제 `V3ExchangeSessionService`, `V3PendingPreparationService`의 파일/계약 이름을
   먼저 확인하고 최소 nonowner clinical/pending pool을 기존 fixture에만 구성한다.
   approval/maintenance pool에 추가 capability를 섞지 않는다.
3. 같은 source ref의 실제 Session create fresh/replay와 실제 patient decision,
   PENDING create/replay와 Session cancel/expiry 및 institution mutation 경합을
   방향별로 시험한다. 실제 service가 반환한 Session/PENDING 부모를 사용하며
   owner seed로 service success를 대신 주장하지 않는다.
4. `FOR SHARE`와 UPDATE의 호환성, 각 actor/operation key와 preparation advisory
   domain, deferred assembly/FK와 최종 DB-clock 검증을 보존한다. 40P01 deadlock,
   안전한 정책 DENY, timeout, COMMIT outcome unknown을 별도 판정한다.
5. owner 상태 변경은 정확히 라벨이 일치하는 owned DB 안에서만 한다. 모든
   query/네트워크/poll/barrier/cleanup은 finite timeout이며 secret/nonce/query 원문은
   출력하지 않는다. 실패/미검증 원본을 보존한다.
6. PG 후 전체 Node 순차 회귀, exact container absence/sourceUnchanged/manifest,
   secret scan, 요구사항·정적 audit·보고서를 연결한다. 신규 결과 DRAFT / UNASSIGNED.
   전체 D6/withdrawal/Grant/임상 authority 완료를 선언하지 않는다.
7. L1~L5 사람 정책 응답이 오면 별도 lifecycle 계약 동결로 진행한다. 응답 전
   withdrawal/expiry 신규 Consent scope·권한을 활성화하지 않는다. 실제 IdP/KMS/PACS,
   법률·ISMS-P·병원 운영 승인은 DEFERRED/BLOCKED다.

runtime DB 변경·commit/push/merge/PR·TLS/RLS/재인증 완화 금지.
