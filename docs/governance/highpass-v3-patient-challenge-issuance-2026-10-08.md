# 환자 challenge 발급 — 구현·검증 보고

2026-10-08 / TECHNICAL TEST ENVIRONMENT ONLY / DRAFT / UNASSIGNED.
정책 검토자·승인자 김범희, 승인일2026-10-08. 신규 증적의 사람 검토 PASS와 구분한다.

## 작업 목적·요구사항·기존 구조

[실행 프롬프트](../implementation/highpass-v3-p0-06-patient-challenge-issuance-prompt.md)를
작성된 순서대로 실행했다. 기존023 immutable ceremony/정확한 creation audit,
024 patient-only RLS, private signed synthetic reauth 및 guarded projection을 재사용했다.
관련 CON-001..006/IAM-003/004/AUTH-004/TEN-003, FR-001..005/014..020/037..041.

## 생성·수정 파일 및 구현

생성: `src/v3-patient-challenge-issuance.js`,
`test/v3-patient-challenge-issuance.test.js`,
`db/migrations/025_highpass_v3_patient_challenge_issuance.sql`,
`scripts/test-support/patient-challenge-issuance-fixture.js`,
[hash-only 발급 계약](../api/highpass-v3-patient-challenge-issuance-contract.md), 이 보고서,
[다음 프롬프트](../implementation/highpass-v3-p0-06-patient-consent-decision-persistence-prompt.md),
[다음 저장 계약](../api/highpass-v3-patient-consent-decision-persistence-contract.md).

수정: patient projection의 private factory assurance/deadline helper,
owned PG schema checker/기존 projection fixture, ADR, API Alignment, ERD,
Master Plan, Traceability 및 document checker. 무관한 기존 사용자 변경 보존.

환자/source/patient/operation/key scoped advisory lock 이후 현재 projection과
재인증을 검증한다.32 CSPRNG bytes의 nonce hash만 DB로 보내고, exact SQL snapshot,
서버 linking clause, 유한 TTL을 challenge에 결합한다. 수명은5분·재인증·준비 요청·
Session·binding 만료 중 최소값이다. challenge/생성 감사/typed issuance receipt를
원자적으로 저장한다. COMMIT 확인 후에만 nonce 원문을 memory-only 응답으로 반환한다.

같은 키·같은 selector 재시도는 원래 메타데이터와 `ISSUED_NONCE_UNAVAILABLE`을
반환한다. nonceAvailable=false이며 새 요청 키가 필요하다. 원문을 저장/복원/재전송
하지 않는 계약에 따른 복구 결과이지 새 challenge/승인/HTTP201 성공이 아니다.
다른 selector가 같은 키를 쓰면 conflict. COMMIT ACK 유실은 outcome unknown이며
nonce를 반환하지 않고, 재시도로 실제 receipt 존재 여부를 해결한다. receipt 없는
실패는 같은 키로 안전하게 재발급할 수 있다. 기존 challenge는 승인 없이 만료한다.

025는 최소 patient SELECT/INSERT 정책과 불변 receipt·정확한 FK·deferred receipt
proof를 추가한다.023 assembly의 준비 요청 SELECT-star만 필요한 컬럼으로 바꾸고
나머지 identity/digest/window/live-context 검증은 유지했다. legacy schema 시나리오는
025 이전 제약 검증으로 보존하고,025는 rollback/apply 이후 actual nonowner service로
검증한다. 예전 owner fixture 행을 새 service 발급 증적으로 소급 승격하지 않는다.

## 테스트 결과

| 검증·실행 명령 | 결과 | 종료 코드·증거 |
|---|---|---|
| 신규 service/fixture/checker `node --check` | PASS | 0 |
| scoped patient projection+issuance `node --test` | PASS | 0, 13건, 173.7699ms |
| `node --test` 현재 코드 재실행 | PASS | 0, 443건, 39,260.7543ms |
| `node scripts/v3-patient-ceremony-schema-check.js` | PASS | 0, 98건, 57,192ms |
| `node scripts/v3-identity-transaction-check.js` | PASS | 0, 427건, 86,673ms |
| manifest/current source hash 검증 | PASS | 0, 각각34/70개 일치 |
| `node scripts/security-secret-scan.js` | PASS | 0, findings 없음; scanner 제외 경로·크기 한계 있음 |
| 소유 fixture cleanup 및 최종 inventory | PASS | 0, 해당 fixture 잔존 없음 |
| `git diff --check` | PASS | 0, CRLF 변환 경고만; untracked 전체 내용 검증은 별도 테스트로 수행 |

98건 = 이전 schema/helper75건 +025 rollback/apply2건 +issuance21건.
실제 service/DB 검증: 정상 발급·exact audit/result·hash 일치, 원본 metadata 재시도,
동시 same-key1발급+1복구, 독립 nonce, audit/result 누락 rollback, content/clause/reauth/
age/실제 관리자 actor 변조 DENY, hash 재사용 DENY, 실제 commit 이후 ACK 오류와
receipt 복구, 실패 commit 이후 같은 키 재발급, private binding/reauth 이전 pool
차단, target 정지에서 신규·재시도 DENY, 실제 Session lock timeout, owner receipt
수정 거부, 관리자/actor 없는 receipt enumeration 차단, raw nonce 컬럼 없음,
실제 short parent 만료 후 신규·receipt DENY. 기존 준비 만료·취소 테스트에도
issuance DENY를 추가하고 live 다른 준비 ID로 same-key conflict를 확인했다.

최신 증적:

- [98건 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-52-26-111Z-571c7f17/manifest.json)
- [427건 회귀 manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T03-44-16-303Z-2a7bc3bd/manifest.json)

Repository SHA `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`.
미커밋 검증 코드의 정확한 기준은 source hashes. 신규 증적 DRAFT/UNASSIGNED.
첫 full Node443 PASS39,531.0988ms 뒤 SQL 수정 후 full Node443을 다시 실행했다.
중간 실제 PG96/97 PASS도 보존하되 최신98건의 코드/증적을 기준으로 삼는다.

## 실패 보존·보안 검토

첫 두 실제 PG 실행은 발급 INSERT의 parameter type 추론 충돌42P08로 실패했다.
재인증 max-age가 timestamp 산술과 integer 컬럼 양쪽에서 쓰여 명시적 `::integer`
cast를 추가했다. 보안 조건/role/TLS를 완화하지 않았다.

- [첫 실패](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-42-09-304Z-60c4154c/manifest.json)
- [안전한 SQL enum 진단 실패](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-43-27-528Z-c38699ee/manifest.json)

실패는 FAIL로 남는다. raw PG messages/query parameters/nonce는 evidence에 출력하지
않고 안전한 enum만 기록했다. 실제 개인정보·의료영상·개인키를 추가하지 않았다.
HMAC/서명/password는 합성 fixture에서 random 생성; 하드코딩/vendoring 없음.
DB schema는 signed MFA/CSPRNG를 증명하지 않으므로 service provenance와 분리한다.

## 남은 위험·미검증·다음 단계

내부 발급만 구현했다. public audit/HTTPS/no-store/UI, 지속 HMAC key provisioning/
rotation/HA, 실제 IdP MFA, exactly-once 승인/거절·철회·만료, 불변 Consent content/
state events와 Decision/Grant/수신기관 수락/최종 Viewer 흐름은 아직 미완료다.
현행 full Node는 live E2E/staging을 실행하지 않으므로 full MVP를 대신하지 않는다.
독립 DB는 random loopback port 합성 fixture이며 운영 TLS DB/병원망 검증이 아니다.
same-key 경쟁과 Session timeout은 전체 D6 approval↔withdraw 경합 PASS가 아니다.

다음 프롬프트를 작성·읽고 [저장 계약](../api/highpass-v3-patient-consent-decision-persistence-contract.md)의
contentVersion/eventSequence/unique consumption/typed receipt 경계 정렬을 시작했다.
다음 DDL·서비스는 아직 작성하지 않았다. 전체 목표를 좁히지 않고 순차 진행한다.
실제 KMS/PACS/IdP·PIPA/ISMS-P·법률·병원 운영 승인은 기존 DEFERRED/BLOCKED.
전체 MVP/v3 ACHIEVED 선언, commit/push/merge/PR/runtime DB 변경 없음.

권장 커밋: (1) hash-only 계약·ADR (2) additive025+internal issuance/factory+unit
tests (3) owned PG regression/evidence checker (4) 결과·API/ERD/trace/next plan.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
