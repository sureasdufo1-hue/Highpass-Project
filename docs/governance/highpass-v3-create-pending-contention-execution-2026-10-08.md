# 실제 Session 생성·PENDING·환자 결정과 취소·만료 경합

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
기존 계획 채택 검토자·승인자 김범희, 승인일 2026-10-08.
새 기술 증적의 독립 사람 검토는 미완료다. 신규 L1~L5 정책은 후속 직접 답변으로
김범희가 2026-10-08 채택했으며 기술 증적 검토와 구분한다.
D6, EX-003/005/006, CON-001/006, IAM-003/004, TEN-003, AUTH-001/004,
FR-001~005/014~025/037~041. 전체 MVP/v3 완료는 선언하지 않는다.

## 작업과 보안 경계

[실행 프롬프트](../implementation/highpass-v3-p0-06-create-pending-contention-prompt.md)를 실행했다.
`patient-create-pending-fixture.js`를 추가했다. 기존 clinical fixture pool에 Session
생성에 필요한 grants만 추가하고, 별도 pending-only nonowner pool을 만들었다.
approval/maintenance pool에 추가 capability를 섞지 않았다. pending pool의 superuser/
BYPASSRLS/clinical/approval/expiry membership 및 consent INSERT 권한 없음도 확인했다.
기존 registry의 실제 source HOSPITAL_ADMIN과 서명 TestProvider를 각각 create/write
최소 scope로 resolve한다. 실제 IdP/MFA와 별개다.

Session → PENDING → challenge → 초기 patient decision은 각각 실제 최소권한 service가
반환한 부모/receipt를 사용한다. owner seed로 그 service의 성공을 대신하지 않았다.
등록된 ref/기관/주체 bootstrap은 여전히 합성 owned DB 준비다. runtime code·DDL·환경
설정은 변경하지 않았으며 실제 영상/환자정보도 사용하지 않았다.

## 추가 검증 12개

| 검증 묶음 | 결과 |
| --- | --- |
| create fixture grants·pending 분리와 실제 pending role profile | PASS 2개 |
| 실제 create→PENDING→challenge→patient decision | PASS; ACTIVE 초기 artifact 이후에도 Session REQUESTED v1, recipient INVITED; 원본 create/PENDING receipt 보존 |
| 실제 결정이 SHARE 잠금을 가진 동안 동일 ref의 새 create·부모 replay | PASS; 잠금 호환 경로가 barrier 해제 전에 완료, 다른 Session ID 및 동일 과거 receipt 확인 |
| fresh PENDING·PENDING replay × pending-first/cancel-first | PASS 4개; 실제 waiter/blocker PID 관측, 선행 PENDING은 저장 후 취소, 취소-first는 VERSION_MISMATCH; 과거 PENDING receipt 재접근도 거부 |
| target stop-first/PENDING-first | PASS 2개; 실제 대기 관측, 선행 PENDING COMMIT 이후 stop 또는 선행 stop COMMIT 이후 RESOURCE_UNAVAILABLE; stopped target retry도 거부 |
| 실제 짧은 부모의 PENDING COMMIT 대기 중 deadline 경과 | PASS; NOWAIT 55P03으로 Session 잠금 확인, worker SKIP LOCKED, deferred COMMIT 23514/OUTCOME_UNKNOWN 및 preparation 0행, 이후 worker drain |
| 실제 부모를 maintenance가 EXPIRED로 전환 | PASS; 과거 PENDING receipt 거부, challenge/decision VERSION_MISMATCH; 7개 동의 테이블 변화 없음, 정확한 maintenance actor event 1개 |

PENDING-first/fresh에서만 준비 레코드가 한 개 증가하며 다른 경우에는 해당 Session의
준비 수가 유지된다. PENDING replay는 새 preparation을 만들지 않는다. policy DENY,
DB lock 충돌 55P03 및 COMMIT 제약 위반 23514를 구분했다. COMMIT 오류의 호출자
판정은 UNKNOWN이며 owner 관측으로 실제 rollback을 확인한다. 이 시험에서 40P01은
성공 경로로 처리하지 않으며 모든 오류는 named assertion 실패가 된다.

Session EXPIRED는 Consent EXPIRED lifecycle의 구현 증명이 아니다. 이 시험의
PENDING transport는 내부 plain service 호출이며 실제 공개 ingress/mTLS/PoP/MFA,
clinical AuthorizationDecision/Grant나 Viewer 권한 활성화를 검증한 것이 아니다.
cascade는 REQUESTED이지 delivery ACK가 아니다. raw token/nonce/password/SQL 원문은
증적에 넣지 않고 모든 query/poll/barrier/수명/cleanup은 유한하게 설정했다.

## 실제 명령·증적

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --check scripts/test-support/patient-create-pending-fixture.js` | 0 | 문법 PASS |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 179/179, 103,820 ms |
| 실제 service-built expiry까지 같은 PG gate | 0 | PASS 181/181, 119,681 ms |
| 두 `node scripts/verify-evidence-manifest.js <manifest>` | 0 | 무결성 PASS, 각 DRAFT 1 / UNASSIGNED 1 |
| `node --test` | 0 | PASS 464/464, 75,956.6242 ms; fail/cancel/skip 0 |

최초 [179개 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-52-22-962Z-5a72fcb4/manifest.json),
최신 [181개 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-55-34-121Z-ae99fdf0/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-55-34-121Z-ae99fdf0/manifest.json).
두 실행 모두 sourceUnchanged/cleanup 및 정확한 container 부재 관측 PASS.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`와 미커밋 hashes, Node v24.18.0 기준이다.
새 helper 및 실제 create/pending의 source dependencies를 gate 해시에 추가했다.
expiry helper는 fixture-only exercise callback을 받아 실제 부모 시험을 같은 전용
maintenance identity로 실행한다. 기존 expiry role 생성은 한 번만 수행하고 pool 종료,
service dispose/key zeroization을 유지했다. manifest는 기술 판정/사람 승인을 대신하지 않는다.

## 다음 단계와 미완료

[Consent lifecycle 정책 패킷](highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md)과
[정책 동결 실행 프롬프트](../implementation/highpass-v3-p0-06-lifecycle-policy-freeze-prompt.md)를
작성했다. 사용자의 직접 답변 `L1~L5 기준안 채택`을 승인 기록에 반영했다.
기본 선택·기존 계획 채택·무응답을 승인으로 간주하지 않는다.
패킷은 신규 scope/role/API/DDL을 활성화하지 않으며 순수 철회 command 검증부터 진행한다.

미완료: 전체 D6/JOIN 내부 row 순서·production workload, Consent WITHDRAWN/EXPIRED,
content replacement, 공개 evidence read/최소 admin view, AuthorizationDecision/Grant,
통합 v3 임상 HTTPS/Viewer. 실제 IdP/KMS/PACS/model/Staging과 법무·PIPA·ISMS-P·병원
운영 승인도 DEFERRED/BLOCKED다. 전체 목표는 active 상태로 유지한다.
권장 커밋: 실제 create/pending helper·fixture 연결/hash → service-built expiry callback/
cleanup → 정책 패킷·다음 프롬프트·보고서/현재 문서 연결. commit/push/merge/PR 및
runtime DB 변경은 수행하지 않았다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
