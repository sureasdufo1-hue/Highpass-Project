# P0-04 다음 실행 프롬프트 — PatientMapping metadata GET

2026-10-07 / 직전 단위: 실제 pg Pool/RLS/감사 transaction 검증 25개 PASS,
Node 회귀 294개 PASS. 기존 변경·DB·Docker 스택을 보존한다.

승인된 GET /api/v3/patient-mappings/{mappingId} 계약의 read service와 연결 가능한 handler를 구현한다.
실제 인증 registry → DB transaction → metadata whitelist → 감사 기록 순서를 사용한다.
mapping:read가 JWT/registry/DB에 모두 있고 own hospital의 DOCTOR/HOSPITAL_ADMIN/SECURITY_ADMIN인
경우만 허용한다. Patient/platform admin의 무제한 Mapping 조회를 추가하지 않는다.

unknown/foreign Mapping은 동일 404이며 같은 transaction으로 거부를 기록한다.
보호값/digest/키/원시 local ID/stack/내부 DB 오류는 반환하지 않는다. URL의 query token은 거부한다.
GET의 auditSessionId는 서버 생성이며 Trace-Id는 계약의 bounded format만 받는다.
감사 실패는 503이고 성공 응답을 만들지 않는다. 정상/foreign/missing/scope/JWT 오류를
실제 합성 JWT + pg Pool + 임시 loopback HTTP server로 시험한다.

기존 server.js 자동 활성화·TLS/mTLS 변경·runtime DB migration을 하지 않는다.
이 handler의 host integration과 live HTTPS container gate를 구분한다.
reconcile·reviewer·state machine·idempotency는 후속 P0-04이며 이를 GET 성공으로 대신하지 않는다.
관련: V3-FR-ID-001/005, V3-FR-TEN-002~004, FR-014~020/037~041.
