# 철회 서비스 등록 환자·기관 격리 및 상태 경합 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
정책 검토자·승인자 김범희, 승인일 2026-10-08. L1~L5 직접 채택은 정책 승인이다.
새 코드·증적의 독립 사람 검토 PASS 또는 운영 승인으로 승계하지 않는다.
관련: CON-003/005/006, AUTH-004, TEN-001/003, AUD-001,
legacy FR-001~005/014~025/037~041.

## 목적·기존 구조·최소 변경

[기존 실행 프롬프트](../implementation/highpass-v3-p0-06-withdraw-races-prompt.md)의
등록 환자 격리 단계를 실행했다. Node ESM/pg와 기존 027/028 및 private withdrawal
factory/service를 유지했다. 공개 API, 운영 DB migration, 실기관 enrollment는 하지 않았다.

신규 `scripts/test-support/withdrawal-isolation-fixture.js`는 소유한 임시 PostgreSQL 안에서
기존 실제 등록 환자 3명(원 환자 A, 같은 기관의 다른 환자 A, 다른 tenant의 환자 C)을 사용한다.
각각 실제 서명된 합성 인증 binding과 철회 전용 nonowner pool로 본인의 승인 동의에 철회를
실행하고 최초 receipt와 동일한 재시도를 먼저 증명한다. 철회 scope를 승인 scope로 대체하지
않으며, 초기 challenge는 각자의 기존 approval binding으로 발급한다.

6개 ordered foreign pair 각각에서 타인의 성공 key와 새 key를 이용한 철회/receipt 복구가
동일한 RESOURCE_UNAVAILABLE로 거부되고 terminal 4개 table의 row 수는 불변이다.
거부 outcome의 실제 actor/ref는 호출자 자신의 tuple이다. 각 actor가 own terminal만 읽으며
foreign event/audit/result/cascade 및 outcome row는 0개다. same-source-other-patient와
foreign-tenant가 victim의 5개 table row를 복사 INSERT하면 실제 SQLSTATE 42501이고,
공개 실패는 안전한 V3_DATABASE_UNAVAILABLE이다. 금지된 쓰기는 없다.

수정: 기존 isolation helper의 명시적 approval binding 전달 및 gate source hash closure.
기존 사용자 변경은 보존했으며 신규 dependency나 TLS/auth 완화는 없다.

## 테스트·증적

| 명령 | 종료 | 결과 |
| --- | --- | --- |
| 신규 helper/호출 helper/gate `node --check` | 0 | 문법 PASS |
| withdrawal command/projection/service scoped `node --test` | 0 | PASS 19/19, 431.5114 ms |
| `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 238/238, 192,056 ms; 신규 격리 assertion 12개 |
| 최신 manifest verifier | 0 | 무결성 PASS; DRAFT 1 / UNASSIGNED 1 |
| `node --test --test-concurrency=1` | 0 | PASS 483/483, 95,791.5505 ms; fail/cancel/skip 0 |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0; 2026-10-08T06:51:50.124Z |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

[238개 결과 및 source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-53-55-617Z-38739ad9/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-53-55-617Z-38739ad9/manifest.json).
sourceUnchanged=true, cleanup PASS, independent exact-name absence PASS.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 source hashes, Node v24.18.0.
집계 notVerified의 "registered foreign patient matrix"는 전체 행렬을 뜻하며, 이번에
증명한 3명/6방향 subset을 누락·미검증으로 되돌리거나 전체 행렬 PASS로 확장하지 않는다.

## 남은 작업·판정

전체 CON/D6/MVP/v3는 미완료다. 다음 하위 단계까지 실행한 결과는 아래에 기록한다.
withdraw/expiry 양방향 경합, CONSENT_EXPIRY registry/private worker, audited 최소 DTO,
public transport/preauth audit, downstream authority/Grant/ACK와 통합 HTTPS/Viewer는 별도다.
실제 IdP/MFA/KMS/PACS/Staging 및 법률/PIPA/ISMS-P/기관 운영 승인도 DEFERRED/BLOCKED다.

권장 커밋: 기존 private withdrawal 구현 → 등록 격리 helper와 source closure → 문서·증적.
commit/push/merge/PR은 실행하지 않았다.

## 후속 실행 — L1/L2 실제 서비스와 양방향 경합

신규 `scripts/test-support/withdrawal-institution-races-fixture.js`를 기존 actual cancellation
helper에 연결하고 source hash closure에 등록했다. 기존 actual signed HOSPITAL_ADMIN의
cancel service로 parent를 CANCELLED로 만든 뒤 별도 실제 patient withdrawal service의
WITHDRAWN/정확한 retry와 initial decision receipt 불변을 확인했다. 수신 기관 중지도
후속 철회/재시도를 막지 않는다. 수신 기관 중지는 owned administrative SQL fixture이다.

source hospital suspension, patient principal suspension, own ref soft deletion 각각 두 방향:
mutation-first는 실제 mutation transaction을 유지하고 withdrawal waiter/backend PID와
pg_blocking_pids를 관측한 뒤 mutation COMMIT → 안전한 거부/terminal row 0개를 확인했다.
withdrawal-first는 actual service의 cascade INSERT 뒤 유한 barrier를 유지하고 mutation의
정확한 lock wait를 관측 → withdrawal COMMIT 성공/terminal 1개 → mutation COMMIT 후
다음 철회는 거부됨을 확인했다. SQL fixture는 끝에 ACTIVE/live-ref로 원복하며 pool과
HMAC copied keys를 dispose한다. 임상 접근 허용이나 downstream 중단 ACK의 증거는 아니다.

| 명령 | 종료 | 결과 |
| --- | --- | --- |
| 신규 races/helper/gate `node --check` | 0 | PASS |
| 후속 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 246/246, 162,926 ms; 신규 assertion 8개 |
| 후속 manifest verifier | 0 | 무결성 PASS, DRAFT 1 / UNASSIGNED 1 |
| 후속 secret scan | 0 | PASS, findings 0; 2026-10-08T06:58:53.526Z |
| 후속 diff check / 로컬 링크 확인 | 0 | PASS; 문서 2개/링크 5개 |

[246 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-00-12-741Z-0a44d683/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T07-00-12-741Z-0a44d683/manifest.json).
sourceUnchanged=true, cleanup PASS 및 정확한 owned container 부재 PASS.
전체 Node483은 앞선 격리 gate 이후 실행한 결과이며 최신 races helper의 실제 실행 증거는 PG246이다.
withdraw/expiry 공통 lock 경쟁, private CONSENT_EXPIRY identity/worker와 audited 최소 read는
아직 NOT VERIFIED/미구현이다. 전체 D6 또는 최신 전체 MVP E2E PASS로 확장하지 않는다.
다음은 [철회·만료 경쟁 실행 프롬프트](../implementation/highpass-v3-p0-06-withdraw-expiry-contention-prompt.md)다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
