# P0-04 다음 실행 프롬프트 — Mapping write 계약 정렬

작성일: 2026-10-07. 범위: CAPSTONE-P0, 실제 개인정보·외부 병원 자원 사용 금지.

앞 단계의 트랜잭션/metadata GET 검증 이후 바로 불명확한 상태 전이를 구현하지 않는다.
기존 Requirements ID-001~005, TEN-002/003, Acceptance ID-001~003을 확인한다.

1. 기존 reconcile 필드를 보존하고 누락된 review 요청·권한·오류 계약을 additive하게 작성한다.
2. reconcile은 UNVERIFIED 생성 요청이며 입력 상태/검토자/기관 위조 필드를 거부한다.
3. review는 서버 인증 binding, own hospital, mapping:review, 명시적 expectedVersion,
   enum state와 canonical 32-byte evidence digest를 필수로 한다.
4. raw localRef/인구통계/evidence 원문을 받거나 로그에 출력하지 않는다.
5. request 검증 모듈과 정상·음성 단위 테스트를 구현한다. 암호화 provider 및 registry를 재사용한다.
6. 이는 DB write/state transition/idempotency의 완료가 아니다. 후속 구현 의존성을 명시한다.
7. 기존 서버·DB·UI·generated 승인 판정을 변경하지 않는다. commit/push 하지 않는다.

구현 결정: 검토 권한은 자체 기관 HOSPITAL_ADMIN/SECURITY_ADMIN + mapping:review로 제한한다.
이는 보수적인 신규 기술 계약이며 실제 기관의 reviewer 위임·법률 적합성을 증명하지 않는다.
DB 전이 구현 전 등록 actor 기록과 자기 승인 금지, 원자적 감사, idempotency 계약을 추가해야 한다.
