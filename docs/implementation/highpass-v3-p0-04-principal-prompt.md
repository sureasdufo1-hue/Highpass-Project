# P0-04 다음 실행 프롬프트 — authenticated principal registry

2026-10-07 / 식별자 보호 계약·검증기 targeted 16개와 전체 회귀 271개 PASS 후 작성.

기존 TestProvider/OidcProvider를 사용해 먼저 JWT를 인증하고, 인증 provider의 고정 issuer와
subject를 내부 registry에 대조한다. tenant/hospital/actor UUID는 registry에서만 가져온다.
Development Mock header, body tenantId/hospitalId, 미등록 subject, 비활성 registry 및
token/registry role·scope·hospital 불일치를 신뢰하지 않는다.

1. registry binding 계약과 최소권한을 문서화하고 최소 모듈을 구현한다.
2. 실제 서명 test JWT의 issuer/audience/expiry/signature 오류와 기관/role/scope/registry 음성을 시험한다.
3. binding object는 불변이며 입력 record 변경이 권한을 바꾸지 않아야 한다.
4. 기존 auth API는 변경하지 않는다. 이 모듈을 실제 v3 HTTP route와 연결하기 전에는
   endpoint 접근통제가 구현됐다고 주장하지 않는다.
5. 다음 transactional repository/service 단계에서 매 transaction마다 registry ACTIVE 및
   DB tenant/hospital ACTIVE를 확인하고 SET LOCAL context·audit/state mutation 원자성을 검증한다.

관련: V3-SR-IAM-001/004, V3-SR-TEN-001~003, V3-FR-TEN-001~004, FR-014~020.
runtime 활성화·외부 IdP·commit/push/merge/PR은 하지 않는다.
