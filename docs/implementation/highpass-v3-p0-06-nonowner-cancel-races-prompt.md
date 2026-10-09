# 다음 실행 — 실제 nonowner 취소 service와 환자 결정 양방향 경쟁

2026-10-08 / DRAFT / UNASSIGNED. 이전 계획 채택 검토자·승인자 김범희.
CON-001~006, EX-003/005/006, AUTH-001/004, TEN-003, FR-001~005/014~020/037~041.

1. 최신 초기 동의 PG 결과·137 assertion source hashes와 실제 V3ExchangeCancelService,
   V3TenantTransaction, registry, 015/017 및 기존 identity PG role/grant fixture를 읽는다.
2. 현재 patient approval role에 cancel/clinical 권한을 추가하지 않는다. 별도의
   nonowner cancellation pool/role와 서버 검증된 source HOSPITAL_ADMIN binding,
   최소 exchange:cancel scope 및 정확한 SELECT/UPDATE/INSERT/function grants를
   owned fixture에만 구성한다. unsafe owner/super/BYPASSRLS/혼합 capability를 구분한다.
3. 각 방향에 충분한 수명을 가진 별도 immutable Session+preparation+challenge를
   전체 생성 audit/context/receipt와 함께 seed한다. 기존 master parent를 변경하지 않는다.
4. 취소-first는 실제 cancel service의 COMMIT barrier에서 patient 결정의
   lock 대기를 관측한다. event/audit/cascade/cancel receipt commit 뒤 결정은
   version/terminal DENY, 신규 동의 기록은 없어야 한다. owner SQL 모사로 대체하지 않는다.
5. 승인-first는 실제 patient 결정의 마지막 INSERT barrier에서 실제 cancel
   service의 Session UPDATE lock 대기를 관측한다. 결정 commit 이후 취소가 확정되고,
   원본 결정 receipt는 과거 증명으로만 남으며 재조회/current authority 정책은
   최신 parent context로 거부된다. 두 service의 실제 PG identity와 반환을 검증한다.
6. 동일/different key ACK loss·취소 rollback·대기 timeout도 위험 비례로 확장한다.
   barrier, query, transaction, polling, cleanup에 모두 finite timeout을 적용한다.
   pending rejection을 관측하고 raw nonce/secret/PG message를 출력하지 않는다.
7. owned PG 완료 후 전체 Node를 순차 검증하고 manifest/current hashes·secret scan·
   exact cleanup을 확인한다. 전체 D6/다중 Session/withdrawal/Grant 완료와 구분한다.
8. 이후 [철회·만료 ADR](../architecture/highpass-v3-consent-lifecycle-adr.md)의 L1~L5
   정책 응답을 확인하고 계약을 동결한다. 사람 답변 없이 미결정 권한 정책을 구현하지 않는다.
   정책 대기 중에도 등록된 다른 환자/tenant RLS 및 안전한 잔여 검증은 진행한다.

live DB/공개 API/임상 Grant 활성화, commit/push/merge/PR, TLS/RLS/재인증 완화 금지.
결과 DRAFT / UNASSIGNED. 실제 외부 인프라·법무·운영 승인은 DEFERRED/BLOCKED 유지.
