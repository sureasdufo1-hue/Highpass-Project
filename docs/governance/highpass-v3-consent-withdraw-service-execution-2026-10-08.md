# 환자 동의 원자적 철회·원본 결과 복구 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 새 기술 증적의 독립 검토는 별도다.
V3-FR-CON-003/005, V3-SR-AUTH-004/AUD-001/TEN-001, FR-001~005/014~025/037~041.

## 목적·기존 구조·구현

[실행 프롬프트](../implementation/highpass-v3-p0-06-withdraw-service-prompt.md)를 실행했다.
기존 Node ESM/V3TenantTransaction/027 terminal assembly와 private PATIENT/consent:withdraw
factory를 유지했다. 신규 V3PatientConsentWithdrawalService는 정확한 selector, private binding/
factory 및 copied 32-byte HMAC key를 요구한다. actor/source/ref/operation namespace별 bounded
key/selector HMAC을 사용하고 raw key/nonce/token은 저장하지 않는다.

registry/source SHARE → key advisory → common consent advisory → own live ref SHARE →
owned historical context 순서로 조회한다. exact prior receipt는 새 live admission과 분리해
복구하고, 신규 철회만 live ACTIVE/DB-clock deadline 검증을 통과해야 한다. 성공은 PG의
정확한 content/predecessor와 단일 DB 시각을 복사해 event3/audit/results/REQUESTED cascade를
원자적으로 저장한 뒤 COMMIT 후 반환한다. 초기 event/원본 decision receipt는 변경하지 않는다.
과거 철회 receipt는 현재 ALLOW·Grant·downstream 중단 ACK가 아니다.

028은 retry/denial outcome을 append-only/FORCE RLS로 저장한다. admitted actor/source/ref,
HMAC selector/key digest, fixed safe reason/correlation과 optional exact original event FK만
보존한다. foreign 요청 consentId는 raw audit field로 저장하지 않는다. required outcome 저장
실패는 성공한 복구/정책 거부 응답으로 숨기지 않는다. source inactive/auth 사전 실패는 이
admitted-context 감사 밖이며 future transport preauth audit는 별도 검증해야 한다.

정확한 재시도는 original validUntil 이후에도 현재 인증·재인증·source ACTIVE/live own ref 아래
원본만 복구한다. 새 key terminal은 deny, expired ACTIVE는 worker와 무관하게 deny다.
private historical context는 새 live projection으로 위장할 수 없다.
최신 보강은 private transaction의 UTC/ISO DateStyle을 고정해 pooled locale가 과거 receipt 및
PG JSON evidence 표현을 바꾸지 않게 한다. 실제 바뀐 pooled locale 회귀도 PASS다.

## 실행·증적

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| service/fixture `node --check` | 0 | 문법 PASS |
| withdrawal command/projection/service scoped `node --test` | 0 | PASS 19/19, 412.415 ms |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 225/225, 171,648 ms |
| 최초 manifest verifier | 0 | 무결성 PASS, DRAFT 1 / UNASSIGNED 1 |
| UTC/DateStyle 보강 후 PG gate | 0 | PASS 226/226, 187,025 ms |
| 최신 manifest verifier | 0 | 무결성 PASS, DRAFT 1 / UNASSIGNED 1 |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0; 2026-10-08T06:40:23.894Z |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |
| `node --test --test-concurrency=1` | 0 | PASS 483/483, 101,661.622 ms; fail/cancel/skip 0 |
| 보고서·실행 prompt 로컬 링크 점검 | 0 | PASS, 3개 문서/6개 링크 |

최초 [225 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-34-51-230Z-0c57dd6a/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-34-51-230Z-0c57dd6a/manifest.json).
sourceUnchanged/cleanup와 정확한 owned container 부재 PASS.
최신 [226 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-39-33-075Z-d2eda582/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-39-33-075Z-d2eda582/manifest.json)도
sourceUnchanged/cleanup/정확한 부재 PASS. timezone=Asia/Seoul 및 SQL/DMY pooled 연결에서
UTC/ISO original receipt가 정확히 같음을 검증했다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 hashes, Node v24.18.0.
최초 gate scope label의 NO WITHDRAWAL SERVICE는 이전 단계 문구다. named assertions/source hashes는
actual withdrawal service를 실행했고, 최신 gate에서는 label을 실제 범위로 수정했다.

정상 실제 서명 합성 patient 철회, exact retry/변경 payload/새 key terminal, same/different-key
동시 실행, audit/result/cascade 누락 COMMIT rollback, ACK 유실 후 복구, 만료 전 철회→기한 후
원본 복구와 expired 신규 거부, 실제 COMMIT 중 기한 경과 rollback/OUTCOME_UNKNOWN, maintenance
terminal 거부, unknown selector 안전한 거부 감사, 감사 누락 시 복구 실패, source/ref unavailable,
owner outcome mutation DENY를 scoped actual PG로 검증했다. SQL expiry writer는 실제 private
expiry service 시험이 아니다. 직접 SQL 이전 parent/target 시험은 이번 actual service 검증의 대체가 아니다.

## 변경 파일·보안·잔여

신규: service, 028 outcome DDL, service unit test, actual service PG fixture, 이 보고서/다음 prompt.
수정: withdrawal projection의 historical/live brand 분리·assurance·locale 고정, 기존 lifecycle fixture
연결·gate source hash closure 및 API/ADR 정렬. 기존 사용자 변경 보존. runtime DB/공개 API와
임상 Grant는 활성화하지 않았으며 commit/push/merge/PR 없음.
권장 커밋: private context/service → 028/audits → actual fixture/tests → 문서/증적.

미검증: 전체 registered foreign patient/tenant 및 parent/target actual service matrix, 정확한 PID
기반 withdraw/expiry/source/ref 양방향 lock 경합, expiry registry/private worker, public audited
최소 DTO/preauth audit, 실제 IdP/MFA/KMS/PACS/HTTPS/Viewer 및 downstream authority/ACK.
실제 운영/법률/PIPA/ISMS-P/병원 승인은 DEFERRED/BLOCKED. 전체 MVP/v3와 CON 완료는 선언하지 않는다.
다음은 [actual races prompt](../implementation/highpass-v3-p0-06-withdraw-races-prompt.md)이다.
프롬프트를 작성·읽고 기존 registered-patient isolation bootstrap과 실제 서명 binding/기관
경계를 비교 분석하기 시작했다. 다음 gate 시험은 아직 실행했다고 판정하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
