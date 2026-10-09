# 다음 실행 — 철회 서비스 실제 경합·기관/환자 경계 검증

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 정책: 김범희 승인, 2026-10-08.
V3-FR-CON-003/005/006, V3-SR-AUTH-004/TEN-001/AUD-001, FR-001~005/014~025/037~041.

1. actual withdrawal service/028 결과와 현재 HMAC·역사적 receipt/current admission 분리 계약을 읽는다.
2. 기존 등록된 다른 환자/기관 bootstrap을 재사용하되 실제 signed private binding과
   withdrawal-only nonowner pool로 자신의 정상 철회부터 입증한다. 다른 환자/기관의 ID와
   idempotency key로 foreign resource/원본 receipt를 얻을 수 없고 금지된 쓰기가 0임을 확인한다.
3. 실제 audited parent cancel/target stop 후 아직 유효한 own Consent의 service 철회/원본
   retry를 실행한다. owner seed/직접 SQL 긍정만으로 실제 service 결과를 대신하지 않는다.
4. source/principal stop/ref 삭제와 actual service의 두 방향 경합을 bounded COMMIT barrier 및
   정확한 blocker/waiter PID로 관측한다. 성공·거부·rollback·환경 장애를 구분한다.
5. withdrawal event3와 expiry SQL writer의 두 방향 실제 경쟁을 시험한다. 아직 expiry private
   서비스가 없으면 SQL fixture 범위로 표시하고, 같은 공통 consent advisory domain을 적용한다.
   deadline 경과는 worker와 무관하게 신규 철회 DENY, 기존 원본 receipt는 현재 인증/소유권 아래
   역사적 결과만 복구한다. 같은/다른 key·최종 재인증/토큰/COMMIT deadline도 검증한다.
6. audit FK·outcome RLS·tampered metadata·누락 반환·키 수명/dispose·원본 결과 timezone/DateStyle
   안정성을 회귀하고 모든 증적에 source hash·exit/duration·cleanup/정확한 부재를 기록한다.
7. 이후 CONSENT_EXPIRY registry/전용 worker와 audited 최소 DTO gate로 이어간다.

새 증적 DRAFT/UNASSIGNED. public HTTP/runtime migration·enrollment/Grant 활성화 및
commit/push/merge/PR 금지. 전체 D6/MVP/v3 완료는 아직 선언하지 않는다.
