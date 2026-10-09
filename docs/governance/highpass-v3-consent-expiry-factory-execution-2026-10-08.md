# CONSENT_EXPIRY 전용 DB factory 실행 보고

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001;
legacy FR-001~005/014~025/037~041. L1~L5 정책 검토자·승인자 김범희,
승인일 2026-10-08. 신규 기술 증적 독립 검토와 정책 승인은 별도다.

## 목적·기존 구조·구현

[factory 실행 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-factory-prompt.md)를
실행했다. 기존 registry/private batch command, generic V3TenantTransaction의 exact
persisted principal/source SHARE 검증 및 withdrawal minimum-capability guard를 유지했다.
Node ESM/pg 및 additive027/028 DDL을 사용하며 기존 사용자 변경을 덮어쓰지 않았다.

신규 `src/v3-consent-expiry-transactions.js`: private factory와 callback transaction,
전용 hp_v3_consent_expiry_policy nonowner pool guard를 구현했다. 복사/위조 binding·command는
connection 이전에 거부한다. sole capability 외 membership, super/BYPASS/위험 role 및
schema/table owner를 거부하고 해당 connection을 폐기한다. raw PG/socket 오류는 safe enum이다.
UTC/ISO DateStyle, finite query/total deadline, callback 전후 DB clock/credential expiry,
callback 종료 후 private brand 차단을 적용한다. unknown COMMIT은 성공으로 반환하지 않는다.

신규 `test/v3-consent-expiry-transactions.test.js`: private configuration/admission,
unsafe/ambiguous role, query/socket faults, exact/copy/closed lifetime, registry inactive,
rollback, credential expiry 및 COMMIT unknown의 9개 단위 시나리오다.
`scripts/test-support/consent-expiry-principal-fixture.js`는 기존 signed principal 검사에
실제 factory 5개 assertion을 추가했다. source/actor mismatch, actual 혼합 membership,
rollback advisory release, UTC/ISO/no patient_refs grant, actual pg_sleep deadline을 검증했다.
`scripts/v3-patient-ceremony-schema-check.js` source hash closure에 두 신규 파일을 추가했다.

## 실제 실행 결과

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| 신규 factory + command + withdrawal projection `node --test` | 0 | PASS24/24, 199.3084 ms |
| `node --test --test-concurrency=1` | 0 | PASS502/502, 80,849.0843 ms; fail/cancel/skip0 |
| `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS261/261, 186,716 ms |
| exact manifest `node scripts/verify-evidence-manifest.js .../manifest.json` | 0 | 무결성 PASS; DRAFT1/UNASSIGNED1 |
| `node scripts/security-secret-scan.js` | 0 | PASS findings0, 2026-10-08T07:52:31.371Z |
| 신규 module/fixture `node --check` | 0 | PASS |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

[PG 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-53-53-876Z-f2a0b0bc/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-53-53-876Z-f2a0b0bc/manifest.json).
sourceUnchanged=true, owned fixture cleanup PASS. Actual service role remains without
patient_refs SELECT; 혼합 membership은 owned fixture에서만 임시 GRANT 후 REVOKE했다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 source hashes, Node v24.18.0.

## 미완료·다음 작업

이는 expiry 전용 transaction 경계이지 EXPIRED event 작성 서비스나 worker 완료가 아니다.
공개 API/운영 DB migration/runtime principal·credential·scheduler 및 Git publication 없음.
callback result는 clinical authority나 실제 consumer ACK가 아니다. 전체 D6/CON/MVP/v3 미완료다.

[다음 service 실행 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-service-prompt.md)를
작성·읽고 027/028, withdrawal service 및 SQL contention fixture 분석을 시작했다.
다음은 same consent advisory domain에서 bounded candidate 재검증과 atomic event3/audit/result/
REQUESTED cascade, original maintenance receipt retry 계약, 실제 service races/ACK/drain이다.
최소 audited read와 Decision/Grant/HTTPS/Viewer는 이후 게이트로 유지한다.
권장 커밋 분리: factory/unit → actual PG fixture/hash closure → 계약·보고서·증적.
실 IdP/MFA/KMS/PACS/Staging/법률·PIPA·ISMS-P/기관 운영 승인은 DEFERRED/BLOCKED.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
