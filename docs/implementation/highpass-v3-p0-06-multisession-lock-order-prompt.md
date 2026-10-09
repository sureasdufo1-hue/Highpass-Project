# 다음 실행 — 다중 Session의 기존 workflow lock 순서 검증

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
D6, CON-006, EX-003/005/006, TEN-003, IAM-003/004, AUTH-001/004,
FR-001~005/014~025/037~041. 전체 MVP/v3 목표를 축소하지 않는다.

1. 최신 등록 환자 격리 결과를 확인하고 `V3TenantTransaction`의 registry JOIN
   `FOR SHARE OF p,t,h`, Session create/cancel/expiry 및 approval의 실제 행/advisory
   lock 순서를 읽어 표로 기록한다. SQL JOIN 표기만으로 실제 취득 순서를 보장한다고
   주장하지 않는다. 미구현 withdrawal/Grant는 표에서 NOT IMPLEMENTED로 구분한다.
2. owned synthetic DB에 최소 두 Session과 등록된 주체를 준비한다. 같은 source의
   두 Session, 서로 source/target이 반대인 두 기관 및 기관 상태 변경 경쟁을 구분한다.
   실제 nonowner service/pool을 사용하고 owner 모사 성공으로 대체하지 않는다.
3. 동일 key/서로 다른 key, cancel/approval/expiry와 registry 변경의 방향별 실제
   waiter/blocker 및 유한 barrier를 관측한다. 40P01 deadlock과 정책상 DENY,
   query/lock timeout 및 COMMIT outcome unknown을 구분한다.
4. 안정적 순서가 필요하면 최소 코드 변경 전에 모든 기존 create/cancel/expiry/
   pending/approval 소비자의 영향과 권한/감사 계약을 확인한다. RLS/기존 registry
   검증을 없애거나 병원 상태를 COMMIT 이후까지 검증하지 않는 방식은 금지한다.
   기존 사용자 변경을 보존한다. 불명확한 신규 정책은 승인 없이 활성화하지 않는다.
5. 유한 종료, fault rollback/ACK recovery, 소스 해시, 정확한 폐기용 container cleanup,
   PG 후 전체 Node 순차 회귀와 secret scan/manifest를 확인한다. 새 증적은 DRAFT /
   UNASSIGNED. 시험한 기존 workflow만 PASS, 전체 D6/미구현 lifecycle 완료는 선언하지 않는다.
6. L1~L5 사람 정책 응답을 확인하여 다음 lifecycle 계약 동결 프롬프트를 작성한다.
   미응답은 승인 아님. safe implementation/check는 계속하며 실제 외부 계정/병원망/
   법무·인증·운영 승인은 DEFERRED/BLOCKED로 유지한다.

runtime DB 변경·공개 API/Grant 활성화·commit/push/merge/PR·secret 출력 금지.
