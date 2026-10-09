# 다음 실행 — private withdrawal transaction 및 live projection

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 정책 채택: 김범희.
V3-FR-CON-003/005, V3-SR-AUTH-004/TEN-001/AUD-001, FR-001~005/014~025/037~041.

1. 027 실제 PG 조립 증적·승인 정책·순수 command·기존 V3TenantTransaction을 확인한다.
2. 별도 hp_v3_consent_withdraw_policy-only 비소유 pool guard를 작성한다.
   superuser/BYPASS/owner/다른 role 및 위험한 inherited role 거부, finite acquisition/query/deadline 유지.
3. private registry PATIENT/consent:withdraw + signed synthetic reauth를 DB 접속 전/현재 DB clock/
   callback 후 다시 확인한다. raw body로 binding·factory·transaction·projection을 만들 수 없게 한다.
4. 실제 principal/source ACTIVE lock → scoped key/consent advisory → own live ref SHARE →
   immutable content/current terminal 조회. parent/target ACTIVE는 철회 조건으로 재사용하지 않는다.
5. content identity/version/predecessor/유효기간과 ownership을 검증하고 uniform foreign-resource
   denial을 반환한다. EXPIRED는 worker와 무관하게 DB clock으로 deny, REJECTED/terminal은 재활성화 금지.
6. 이 gate는 branded live projection/factory까지. event/audit/HMAC typed receipt/cascade 원자적
   서비스는 다음 gate에서 연결한다. parser/projection 성공을 철회 완료로 표시하지 않는다.
7. private brand/copy/expired binding/role guard/factory deadline 및 실제 최소권한 PG own/foreign/
   stopped source/deleted ref/terminal target/expired content를 검증한다. 신규 증적 DRAFT/UNASSIGNED.

maintenance registry CONSENT_EXPIRY 정렬은 별도 최소 scope gate; 기존 SESSION_EXPIRY와 혼합 금지.
runtime DB/public API/Grant 활성화·commit/push/merge/PR·보안 완화 금지. 전체 MVP/v3 미완료.
