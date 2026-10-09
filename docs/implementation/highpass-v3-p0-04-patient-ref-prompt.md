# P0-04 다음 실행 프롬프트 — PatientRef bootstrap

작성일: 2026-10-07 / CAPSTONE-P0. 기존 write 계약의 첫 선행조건을 실행한다.
V3-FR-ID-001/002/005, V3-FR-TEN-002/003 및 FR-037~041 영향.

1. UUID는 서버가 생성한다. 실명/localRef/인구통계로 자동 merge하지 않는다.
2. 신규 ref 등록에 authenticated actor 및 owner tenant/hospital을 기록한다.
3. 과거 ref에 소유자를 임의 backfill하지 않는다. global ref와 기관 mapping은 구분한다.
4. additive DDL, RLS insert/read, restricted app role로 구현한다. SECURITY DEFINER 사용 금지.
5. 등록 및 typed audit는 같은 tx다. 감사 실패 시 ref도 rollback한다.
6. 별도 scope 추가 없이 mapping:write + own hospital HOSPITAL_ADMIN/SECURITY_ADMIN 정책을 재사용한다.
7. 등록은 임상 identity 확인/환자 계정 인증/동의/VERIFIED 매핑을 의미하지 않는다.
8. 단위·독립 합성 PostgreSQL 정상/교차기관/무context/감사실패를 검증한다.
9. bootstrap은 내부 서비스로만 추가한다. durable idempotency 이전 HTTP 활성화·자동 retry 금지.
10. 기존 DB/container/volume 및 사용자 변경 보존. 증적 DRAFT/UNASSIGNED, commit/push 없음.

이후 다음 단계는 등록 ref에 대한 reconcile + 등록 actor + reviewer + idempotency다.
다른 기관으로 동일 PatientRef를 연결하려면 명시적 승인/기관 membership 계약이 필요하며
소유 기관을 임의 재배정하거나 전역 조회 grant로 대체하지 않는다.
