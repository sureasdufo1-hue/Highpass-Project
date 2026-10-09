# CONSENT_EXPIRY 등록 계약·private 명령 실행 보고

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 정책 승인과 신규 기술 독립 검토는 별도다.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001,
legacy FR-001~005/014~025/037~041.

## 작업 목적·분석한 기존 구조

[실행 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-principal-prompt.md)를 실행했다.
DB027은 CONSENT_EXPIRY/sole consent:expire를 허용하지만 기존 V3PrincipalRegistry는
SESSION_EXPIRY/sole exchange:expire만 허용해 Node와 DB 등록 계약이 달랐다.
기존 signed TestProvider/OidcProvider, immutable private binding, V3TenantTransaction의
persisted actor/source/role/ref/servicePurpose 대조와 Node ESM/pg 스택을 유지했다.
SQL maintenance fixture 결과를 실제 authenticated expiry worker로 승격하지 않는다.

## 구현·변경 파일

`src/v3-principal-registry.js`: 명시적 server-owned purpose→sole scope 매핑에
CONSENT_EXPIRY를 추가했다. SESSION_EXPIRY 경계는 유지한다. INTERNAL_SERVICE 등록은
known purpose, no patientRef, 단일 정확한 scope를 요구하며 mixed/duplicate/crossed scope와
unknown purpose를 거부한다. 모든 human role의 exchange:expire 또는 consent:expire 등록도
거부한다. 실제 JWT는 issuer/audience/subject/병원/role/단일 scope/expiry와 요청 operation
scope가 모두 맞아야 한다. JWT/body servicePurpose와 patientRef는 server registry를 바꾸지 않는다.

신규 `src/v3-consent-expiry-command.js`: PRIVATE issued CONSENT_EXPIRY binding에 묶인
immutable batch command를 WeakMap으로 발급한다. limit 기본25/허용 integer1..100,
extra field/symbol/accessor/custom prototype/authority 입력 및 복사/위조 command는 거부한다.
명시적 null/undefined limit도 거부하며 omitted limit은 Object.prototype getter를 읽지 않는다.
command reuse는 credential expiry와 정확한 원 binding을 재검증한다.
kind CONSENT_EXPIRY_COMMAND_ONLY는 DB admission, 처리 결과, access token 또는 clinical authority가 아니다.

신규 `test/v3-consent-expiry-command.test.js`: 정상 purpose/command, 두 purpose의 교차 및 혼합,
모든 human role, signed claim/서명 위조/expiry, command copy, snapshot, limit/getter 경계를 검증한다.

신규 `scripts/test-support/consent-expiry-principal-fixture.js`: 실제 signed registered maintenance
binding과 private command를 기존 generic V3TenantTransaction/expiry-only nonowner pool로 연결한다.
source와 DB actor/role/ref/servicePurpose의 일치를 확인한다. foreign source/tenant/actor 및
실제 source/service 중지는 callback 전에 거부한다. registry/health UPDATE privilege는 FOR SHARE
용 column에 한정하며 기존 WITH CHECK(false)로 실제 변경은 차단한다. patient_refs SELECT와
approval/withdrawal/clinical/SESSION_EXPIRY role 상속이 없는 실제 profile을 확인했다.
이는 expiry 전용 guarded factory/event service/worker 구현이 아니다.

기존 lifecycle fixture와 gate source hash closure를 연결·갱신했다. 공개 API/화면/운영 DB,
runtime enrollment/secret/credential/scheduler는 변경하지 않았다. 사용자 기존 변경은 보존했다.

## 테스트 결과·증적

| 명령 | 종료 | 결과 |
| --- | --- | --- |
| registry/command/helper `node --check` | 0 | PASS |
| 최초 scoped command/SESSION expiry/registry tests | 0 | PASS27/27, 213.4461 ms |
| omitted-limit/accessor 보강 후 scoped tests | 0 | PASS28/28, 419.1328 ms |
| 최초 actual PG gate | 0 | PASS256/256, 203,690 ms; 신규 actual principal assertion4개 |
| 최초 manifest verifier | 0 | 무결성 PASS, DRAFT1/UNASSIGNED1 |
| 최초 전체 serial Node | 0 | PASS492/492, 96,230.7613 ms; fail/cancel/skip0 |
| 후속 secret scan | 0 | PASS findings0, 2026-10-08T07:40:03.677Z |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

최초 [256 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-38-22-289Z-6f1d2f79/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-38-22-289Z-6f1d2f79/manifest.json).
sourceUnchanged=true, cleanup/exact owned absence PASS. limit/accessor 보강 후 현재 코드의
PG 재실행은 exit0, PASS256/256, 219,956 ms다.
[최신 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-43-04-848Z-205113e4/schema-check.json),
[최신 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-43-04-848Z-205113e4/manifest.json).
sourceUnchanged/cleanup/exact owned absence PASS, manifest 무결성 PASS/DRAFT1/UNASSIGNED1.
최신 전체 serial Node는 exit0, PASS493/493, 94,783.8865 ms; fail/cancel/skip0이다.
PG에는 신규 signed principal assertion4개가 포함되며 dedicated expiry factory/worker 시험은 아니다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 source hashes, Node v24.18.0.
기관 중지·등록은 owned fixture-only administrative SQL이며 운영 API 구현이 아니다.

## 남아 있는 위험·다음 실행

전용 expiry pool guard/private transaction factory 및 finite batch expiry event service/worker는
아직 미구현이다. signed principal/generic context 검증만으로 실제 maintenance worker PASS를
선언하지 않는다. 다음 [전용 factory 실행 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-factory-prompt.md)를
작성·읽고 실행 분석을 시작했다. 기존 withdrawal guard의 role profile과 generic transaction의
source registry SHARE/finite deadline을 유지하면서 별도 expiry-only brand를 요구해야 한다.
그 뒤 actual service races/drain/ACK → 최소 audited read → authority/Grant/HTTPS/Viewer를 이어간다.
전체 CON/D6/MVP/v3 미완료. 새 증적 DRAFT/UNASSIGNED이고 human 독립 검토는 별도다.
실 IdP/MFA/KMS/PACS/Staging/법률/PIPA/ISMS-P/기관 운영 승인은 DEFERRED/BLOCKED.
commit/push/merge/PR 없음. 권장 분리: registry+command → 실제 fixture/tests → 문서·증적.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
