# Next execution — patient challenge issuance, before approval consumption

2026-10-08 / DRAFT / UNASSIGNED. 정책 검토자·승인자 김범희2026-10-08.
관련 CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020/037..041.

1. 최신 [조회 결과](../governance/highpass-v3-patient-guarded-projection-2026-10-08.md),
   [ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md),023/024,
   [환자 command 계약](../api/highpass-v3-patient-consent-command-contract.md), private
   registry/factory/projection을 직접 읽고 계약을 먼저 정렬한다. 전체 v3 목표 유지.
2. challenge 발급은 승인/거절 처리와 별도다. 같은 live branded transaction의
   환자 projection·서명 검증된 합성 재인증만 권위로 사용한다. body의 actor/MFA/
   digest/기관/정책 문구로 대체하지 않는다. source/parent/ref/target 잠금 재사용.
3. 발급 selector·idempotency·raw nonce 응답/재응답·lost ACK 계약을 먼저 명시한다.
   nonce 최소32 random bytes, DB/로그/URL/증적에는 hash만 저장. 원문을 다시 반환해야
   한다면 저장/암호화/secret 수명 계약 없이 임의 지속 저장하지 않는다. 안전한
   재시도 의미가 확정되기 전 HTTP/runtime 발급은 활성화하지 않는다.
4. min(5분, 재인증 유효기간, 준비 요청 만료)의 유한 deadline, DB-clock now,
   exact SQL canonical content/link-clause digest를 결합한다. 별도 identity-link
   선택을 임상 승인으로 합치지 않는다. challenge 자체로 ACTIVE/VERIFIED/ALLOW/
   Grant 또는 수신 participant ACTIVE를 생성하지 않는다.
5. 별도 additive migration/ADR로 issuance에 필요한 최소 INSERT admission·exact
   creation audit를 정의하고 source context·환자·scope·현재 parent/registry·nonce
   hash·content digest·유한 window를 fail closed로 검증한다. owner 우회로 통과시키지
   말고 실제 nonowner PG에서 service를 실행한다. 광범위 runtime grant 금지.
6. 정상 발급, foreign patient/admin/copy/unassured, expired/revoked principal,
   parent cancel/expiry, target stop, 바꾼 content/clause/digest, nonce 재사용,
   audit 누락, timeout rollback/lost ACK, 재시도 및 실제 lock waits를 검증한다.
   D6 전체 clinical races가 아직 아니면 NOT VERIFIED를 유지한다.
7. 현재 full/scoped Node 및 기존 PG 회귀, 신규 actual PG, manifest/source hashes,
   exact owned cleanup을 검증한다. 모든 네트워크·polling·DB에는 유한 timeout.
   실패 증적 보존, 신규 증적 DRAFT/UNASSIGNED. 실제 개인정보/secret 출력 금지.
8. 이후 immutable Consent content/state-event/audit/result→one-time consumption→
   승인/거절/철회 경합→safe public audit/HTTPS/UI→기관수락→Decision/Grant→전체
   MVP/v3로 순차 진행한다. 외부 IdP/KMS/PACS/PIPA/ISMS-P/운영 승인은 별도.
   승인된 정책은 반복 승인 요구 없이 사용하되 미확정 clinical 전이는 비활성 유지.
