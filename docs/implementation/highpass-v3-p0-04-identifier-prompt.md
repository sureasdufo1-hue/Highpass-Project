# P0-04 후속 실행 프롬프트 — 식별자 보호 계약과 검증기

2026-10-07 / 이전 단위: 독립 PostgreSQL Identity DDL 검증 22개 PASS.
목표는 P0-04 서비스/API가 사용할 식별자 보호 경계를 구현하는 것이다. 전체 P0-04 완료는 아니다.

1. 기존 요구사항·OpenAPI·DDL을 보존하며 protectedLocalRef 문자열/bytea encoding을 상세화한다.
2. node:crypto AES-256-GCM(96-bit nonce, 128-bit tag)와 HMAC-SHA-256을 사용한다.
   암호화 키와 검색 키는 각각 명시적으로 공급받으며 하드코딩·공개 seed·자동 fallback은 금지한다.
3. 암호화 AAD는 purpose/version/keyId/tenant/hospital/patientRef를 포함한다.
   lookup digest는 tenant/hospital/localRef에 bind하되 patientRef는 제외해 충돌을 탐지한다.
4. canonical encoding, bounded input, tamper/key/tag/context/digest 음성 시험을 구현한다.
   복호 평문을 외부 반환하지 않고 DB용 보호값과 digest만 반환한다. errors는 고정 code만 사용한다.
5. localRef의 대소문자·공백·유니코드 정규화로 서로 다른 병원 ID를 합치지 않는다.
6. key version 전환과 destroy/fail-closed 정책을 검증하고 신뢰 issuer·MFA/KMS·nonce 사용량 및
   lookup key rotation의 운영 한계를 문서화한다. 암호화 검증은 identity/동의 승인과 별개다.
7. targeted test → 전체 Node 회귀 → secret scan을 실행하고 실제 결과만 기록한다.
8. 이후 principal registry·transactional repository/service/API 프롬프트를 작성하고 실행한다.

관련: V3-FR-ID-001~005, V3-SR-TEN-001~003, FR-014~020/037~041.
기존 runtime과 DB/Compose를 변경하지 않는다. commit/push/merge/PR을 하지 않는다.
generated evidence DRAFT / UNASSIGNED; 외부 KMS 연동 및 전체 MVP/v3는 미완료다.
