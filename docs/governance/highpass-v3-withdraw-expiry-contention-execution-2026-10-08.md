# 철회·만료 공통 잠금 경쟁 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 신규 기술 증적 독립 검토는 별도다.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001,
legacy FR-001~005/014~025/037~041.

## 작업 목적·기존 구조

[실행 프롬프트](../implementation/highpass-v3-p0-06-withdraw-expiry-contention-prompt.md)를 실행했다.
Node ESM/pg, 027/028, 실제 private withdrawal service와 registered nonowner SQL expiry writer를
유지했다. 이번 expiry writer는 전용 authenticated private worker가 아닌 SQL fixture다.
환자의 actual signed binding/재인증과 maintenance의 실제 DB service actor를 구분했다.
Control/Data Plane, 기존 사용자 변경 및 임상 접근 fail-closed 경계를 유지했다.

## 수정·보안 검토

기존 expiry event SELECT는 자신이 작성한 event만 보므로 환자 WITHDRAWN을 보지 못했다.
027에 expiry-only source-bound terminal history SELECT를 추가했다. 이것은 공통 잠금 아래
현재 terminal 유무 확인용 내부 권한이며 일반 관리자/공개 조회 권한이 아니다.
기존 감사 정책은 그대로 유지하고 result/cascade에 restrictive own-maintenance SELECT와
INSERT 조건을 추가해 환자의 receipt·audit·cascade 읽기 및 복사 쓰기가 차단되도록 했다.
기존 UPDATE/DELETE 불변성·정확한 FK·전체 조립 COMMIT guard도 유지한다.

fixture의 serialized expiry branch는 withdrawal과 동일한
`HP-V3-CONSENT-LIFECYCLE/tenant/hospital/consentId/contentVersion` advisory domain을 사용한다.
잠금 획득 후 최신 terminal이 있으면 새 event를 만들지 않는다. 정확한 초기 ACTIVE predecessor/
immutable content를 복사한 EXPIRED event와 audit/results/REQUESTED cascade를 함께 COMMIT한다.
actor는 실제 등록 CONSENT_EXPIRY이고 subject는 원 환자이며 effectiveAt=원 validUntil이다.
key/request digest는 SQL fixture의 maintenance execution 식별 값이지 patient idempotency key가 아니다.

신규 `scripts/test-support/withdrawal-expiry-contention-fixture.js`는 actual withdrawal service와
registered SQL writer를 경쟁시킨다. registry·body 위조를 실제 private worker 검증으로
주장하지 않는다. common lock은 정확한 waiter/blocker PID와 pg_blocking_pids로 관측한다.
3초 합성 동의/4.5초 최대 barrier/1초 lock witness를 쓰며 query·pg_sleep에는 기존 유한 제한이 있다.
모든 promise를 관측하고 barrier를 해제하며 서비스 copied HMAC key를 dispose한다.

## 실제 시험 범위

1. expiry-first: EXPIRED 조립과 COMMIT을 유지한 상태에서 actual withdrawal lock 대기를
   확인 → expiry COMMIT → withdrawal TERMINAL 거부 → terminal EXPIRED 1개.
2. withdrawal-admitted-first: cascade 작성 후 유지 → DB deadline 경과 → SQL expiry가 같은
   잠금에 대기함을 확인 → withdrawal factory의 최종 clock 재검증 EXPIRED/rollback →
   maintenance EXPIRED COMMIT. 먼저 시작했다는 이유로 늦은 철회를 성공 처리하지 않는다.
3. withdrawal-committed-before-deadline: 기한 내 실제 철회 완료 → 기한 후 SQL expiry가
   WITHDRAWN을 읽고 추가 event 없음 → patient 정확한 역사적 receipt는 복구 가능.
4. 초기 decision receipt는 각 경쟁 전후 불변이며 terminal은 실제 maintenance actor와
   원 환자 subject가 다르다. 위조 actor/source의 event 및 child read는 모두 0개다.
5. 후속 보강: 환자의 네 종류 event/audit/result/cascade 복사 INSERT는 실제 42501,
   maintenance audit/result/cascade 하나라도 누락하면 전체 terminal rollback; 완전한
   maintenance 조립은 own event/audit/result/cascade 각각 1개다.

## 실행·증적

| 명령 | 종료 | 결과 |
| --- | --- | --- |
| 신규 helper/호출 helper/gate `node --check` | 0 | PASS |
| withdrawal scoped `node --test` | 0 | PASS 19/19, 252.1192 ms |
| 최초 PG gate | 0 | PASS 250/250, 165,929 ms |
| 최초 manifest verifier | 0 | 무결성 PASS; DRAFT 1 / UNASSIGNED 1 |
| 최초 전체 serial Node | 0 | PASS 483/483, 79,461.4662 ms; fail/cancel/skip 0 |
| 후속 `security-secret-scan.js` | 0 | PASS findings 0; 2026-10-08T07:08:21.376Z |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

최초 [250 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-06-50-475Z-9e00a0fc/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-06-50-475Z-9e00a0fc/manifest.json).
sourceUnchanged=true, cleanup/exact owned absence PASS. 이후 INSERT restriction과 2개 보강
assertion을 추가했다. 보강 PG는 FAIL이며 실제 증적을 보존했다:
[실패 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-09-15-056Z-34edbea9/schema-check.json),
[실패 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-09-15-056Z-34edbea9/manifest.json).
exit1, 108,328 ms, 168개 관측 중 withdrawal-first deadline 경합 assertion 1개 FAIL.
copied-write 42501와 missing expiry assembly rollback은 PASS이며 cleanup/sourceUnchanged와
실패 manifest 무결성도 PASS다. 실패는 숨기거나 미실행으로 바꾸지 않는다.
안전한 단계별 enum 진단을 추가해 동일 owned gate를 재검증했다. 실패 당시 판정은 FAIL이며
수정 후 최신 결과는 아래에 별도로 기록한다.
보강 이후 전체 serial Node는 별도로 exit0, PASS483/483, 85,716.5924 ms; fail/cancel/skip0이다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 source hashes, Node v24.18.0.

## 경합 FAIL 원인 및 최소권한 보완

처음 FAIL은 assertion만 보여 safe enum을 event/audit/result/cascade/COMMIT 단계로 보강했다.
아래 재실행도 FAIL로 보존하고 각 manifest 무결성을 확인했다.

| 실행 | 실패 근거 | 시간 |
| --- | --- | --- |
| [07:12:28](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-12-28-429Z-6b78c457/schema-check.json) | raw safe SQLSTATE42501, withdrawal-first expiry failure | 92,570 ms |
| [07:15:11](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-15-11-889Z-a3c8a6e6/schema-check.json) | expiry COMMIT permission denied | 94,202 ms |
| [07:18:16](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-18-16-365Z-c0e9a65f/schema-check.json) | expiry COMMIT permission category | 97,386 ms |
| [07:21:31](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-21-31-079Z-d8a7ad51/schema-check.json) | force_generic_plan 조건에서 maintenance assembly 실패 | 84,012 ms |
| [07:23:43](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-23-43-320Z-e6df64f6/schema-check.json) | force_generic_plan → V3_FIXTURE_EXPIRY_COMMIT_PERMISSION_PATIENT_REFS | 87,634 ms |

각 exit1, sourceUnchanged 및 cleanup/exact absence PASS, manifest 무결성 PASS다.
마지막 실행은 기한 경합 이전의 maintenance 누락 조립 검사부터 generic plan으로 같은
patient_refs permission 실패를 결정적으로 재현했다. 따라서 단순 경합 timeout이 아니다.
처음 적은 READ/INSERT restriction 자체가 원인이 아니라, 추가 실행으로 드러난 기존 guard
SQL의 cache-dependent privilege 결합이었다. Node483/483만으로 해당 PG 결함을 발견할 수 없었다.

027 COMMIT guard의 한 SQL IF 조건 안에 `operation='CONSENT_WITHDRAW' AND ... patient_refs`
조회가 포함돼 있었다. maintenance 역할은 의도적으로 patient_refs SELECT 권한이 없는데,
generic plan에는 그 조회가 남아 permission 검사 대상이 됐다. SQL boolean을 절차적 실행
분기로 간주하면 안 되며 PL/pgSQL에는 캐시된 generic/custom plan이 존재한다.
[PostgreSQL16 expression evaluation](https://www.postgresql.org/docs/16/sql-expressions.html#SYNTAX-EXPRESS-EVAL),
[PL/pgSQL plan caching](https://www.postgresql.org/docs/16/plpgsql-implementation.html#PLPGSQL-PLAN-CACHING).
이를 근거로 공통 actor/audit/FK/receipt/cascade 검증과 환자 철회 전용 ref/재인증/기한 검증을
별도 PL/pgSQL IF 문으로 분리했다. maintenance에 patient_refs privilege를 추가하지 않았고
환자의 live ref·재인증·기한 검증도 삭제하지 않았다. force_generic_plan 회귀를 유지한다.
수정 후 full PG 재검증은 exit0, PASS252/252, 173,906 ms다.
[최신 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-29-22-200Z-34cd33b8/schema-check.json),
[최신 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-29-22-200Z-34cd33b8/manifest.json).
force_generic_plan 조건에서 6개 새 assertion 모두 PASS이며 patient_refs 권한은 추가하지 않았다.
sourceUnchanged=true, cleanup/exact absence PASS, manifest 무결성 PASS/DRAFT1/UNASSIGNED1.
수정 후 전체 serial Node도 exit0, PASS483/483, 78,446.0627 ms; fail/cancel/skip0이다.
최신 secret scan exit0/PASS/findings0 (2026-10-08T07:27:15.575Z), diff check exit0/PASS.
보존한 FAIL은 원인·수정·source snapshot별 과거 증적이며 최신 PASS로 덮어쓰지 않는다.

## 다음 실행 및 전체 미완료

전체 CON/D6/MVP/v3 미완료다. SQL maintenance writer와 실제 private worker를 혼동하지 않는다.
CONSENT_EXPIRY는 DB 027에는 허용됐으나 Node registry는 아직 SESSION_EXPIRY만 허용한다.
다음 [등록 계약 및 private 명령 프롬프트](../implementation/highpass-v3-p0-06-consent-expiry-principal-prompt.md)를
작성·읽고 실행 분석을 시작했다. Node registry는 sole SESSION_EXPIRY만 지원하는 반면,
DB027은 sole CONSENT_EXPIRY도 지원한다. 기존 V3TenantTransaction은 DB principal의 role/ref/
servicePurpose를 signed private binding과 대조하므로 다음 Node 등록·명령 계약도 해당 검증을
유지해야 한다. 다음 registry 코드 변경/서비스 구현은 아직 실행했다고 판정하지 않는다.
후속 전용 factory/service/worker, audited 최소 DTO, Grant/동기 신규 접근 거부/consumer ACK,
전체 HTTPS/Viewer는 별도 gate다. 실 IdP/MFA/KMS/PACS/Staging와 법률/PIPA/ISMS-P/기관 운영
승인은 DEFERRED/BLOCKED다. 운영 DB/공개 API/runtime enrollment와 Git 외부 쓰기는 하지 않았다.
권장 커밋: 027 minimal maintenance history/RLS → serialized fixture/races → 문서·증적.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
