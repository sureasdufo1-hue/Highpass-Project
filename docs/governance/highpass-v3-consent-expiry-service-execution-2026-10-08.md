# Authenticated consent expiry finite batch 실행 보고

2026-10-08 / PARTIAL ISOLATED IMPLEMENTATION / DRAFT / UNASSIGNED.
CON-003/005/006, AUTH-004, TEN-001/003, AUD-001; legacy FR-001~005/014~025/037~041.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 신규 기술 독립 검토 별도.

## 목적·기존 구조·계약 정렬

[service 실행 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-service-prompt.md)를
실행했다. 기존 private registry/command/factory와 source SHARE, expiry-only nonowner pool,
027 terminal event assembly, 028 환자 철회 원본 복구 계약을 보존했다.
새 [service 계약](../api/highpass-v3-consent-expiry-service-contract.md)은 구현 전 작성한
pre-DDL 기준 snapshot이다. 그 문서의 IMPLEMENTATION AND EXECUTION PENDING은 작성 당시
상태이며, 해당 snapshot/hash를 변경하지 않고 실제 실행 후 상태를 이 보고서로 기록한다.

단순히 terminal 이벤트를 제외하고 후보를 다시 조회하면 lost ACK 재시도에서 최초 결과가
사라지고 0건 실행이 나중에 다른 대상을 처리할 수 있었다. 따라서 별도 maintenance 실행
ledger를 추가했다. patient idempotency ledger·기존 approval receipt는 변경하지 않았다.

## 생성·수정 파일과 기능

신규 `db/migrations/029_highpass_v3_consent_expiry_batches.sql`: immutable batch ledger,
FORCE RLS, exact source/service actor scope, canonical UTC/ISO receipt snapshot,
deferred count/content assembly 검사다. 운영 DB 적용이나 runtime grant는 없다.

신규 `src/v3-consent-expiry-service.js`: private factory와 복사한 32-byte HMAC key를
요구한다. 별도 execution key/limit를 검증하고 source/actor/operation HMAC digest만 저장한다.
같은 key+limit는 원본 batch/0건 결과를 복구하고, limit 변경은 conflict다. 신규 후보는
source-owned expired ACTIVE content만 bounded 조회하며 common lifecycle advisory lock
후 predecessor/deadline/terminal을 재검증한다. 실제 service actor와 환자 subject를 분리한다.
EXPIRED event3/audit/result/REQUESTED cascade 및 batch를 한 transaction으로 조립하고
COMMIT 후만 결과를 반환한다. effectiveAt는 immutable validUntil, recordedAt는 DB clock이다.
결과는 historic maintenance receipt이지 임상 ALLOW나 consumer ACK가 아니다.

신규 `test/v3-consent-expiry-service.test.js`: private factory/key/configuration,
copy/authority/invalid execution metadata, DB acquisition safe error, dispose boundary를 검증한다.
신규 `scripts/test-support/consent-expiry-service-fixture.js`: actual signed service,
additive migration rollback/apply, empty retry, original approval preservation,
same-key concurrency, missing assembly, actual committed lost ACK 및 양방향 actual service
lock witness를 검증한다. 기존 principal/lifecycle fixture와 source closure를 연결했다.

## 테스트 결과

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| service + factory + command `node --test` | 0 | PASS23/23, 222.8812 ms |
| 신규 service/fixture `node --check` | 0 | PASS |
| `node --test --test-concurrency=1` | 0 | PASS506/506, 84,758.6469 ms; fail/cancel/skip0 |
| `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS272/272, 199,878 ms; 신규 service assertion11 |
| exact manifest verifier | 0 | 무결성 PASS, DRAFT1/UNASSIGNED1 |
| `node scripts/security-secret-scan.js` | 0 | PASS findings0, 2026-10-08T08:01:54.528Z |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

[실제 PG/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T08-04-17-848Z-3cedea3f/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T08-04-17-848Z-3cedea3f/manifest.json).
sourceUnchanged=true, owned DB cleanup PASS. HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`,
미커밋 source hashes, Node v24.18.0. 전체 v3 E2E가 아닌 이 fixture의 실행시간이다.
실제 private withdrawal-first는 만료 시 COMMIT 전 rollback 후 expiry 성공,
expiry-first는 기다리던 private withdrawal의 terminal DENY를 각각 exact backend lock으로 확인했다.

## 보안 검토·위험·미검증

patient_refs SELECT/approval/withdrawal/clinical membership 및 임상 권한을 추가하지 않았다.
등록된 source/service의 현재 ACTIVE 상태는 복구에도 필요하다. raw execution key/token/
patient local ID는 저장·출력하지 않는다. 기존 원본 initial receipt와 사용자 변경 보존.
실 IdP/MFA/KMS/PACS/법률/운영 승인은 DEFERRED/BLOCKED이며 local substitutes로 승격하지 않는다.

새 batch ledger의 2개 maintenance actor/foreign source 전체 격리 및 copied INSERT/
forged snapshot/owner mutation 행렬은 아직 별도 actual gate가 필요하다. 현재 scope1 시험이
최대 multi-object batch 검증을 뜻하지 않는다. recovery/conflict의 별도 invocation 감사도
아직 미구현이며 event 최초 생성 감사와 혼동하지 않는다. Dispose는 신규 호출을 차단하지만
진행 중 작업과 key-zero 순서를 조율하는 close/drain은 아직 미구현이다.

[다음 close/drain·격리·재시도 감사 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-drain-review-prompt.md)를
작성·읽고 기존 Session close/allSettled 및 새 service key 수명 분석을 시작했다.
그 뒤 bounded worker → minimum audited read → Decision/Grant/HTTPS/Viewer를 이어간다.
운영 scheduler/API/DB migration/credential 활성화 및 commit/push/merge/PR 없음.
전체 CON/D6/MVP/v3 미완료. 권장 커밋 분리: pre-DDL contract+029 → service/unit → actual fixture/evidence/docs.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
