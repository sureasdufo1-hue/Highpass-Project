# Consent terminal DDL·private withdrawal projection 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 새 기술 증적 독립 검토는 별도다.
관련: V3-FR-CON-003/005/006, V3-SR-AUTH-004/AUD-001/TEN-001, FR-001~005/014~025/037~041.
전체 Highpass MVP/v3 미완료.

## 목적·분석·구현

[DDL 프롬프트](../implementation/highpass-v3-p0-06-consent-lifecycle-ddl-prompt.md)를 실행했다.
026 초기 contentVersion1/event1..2/decision/원본 receipt는 변경하지 않았다.
027은 ACTIVE event2의 정확한 predecessor와 불변 content identity/hash/window/policy에
묶인 유일한 event3를 별도 저장한다. WITHDRAWN/EXPIRED는 Session 상태와 구분한다.
실제 actor와 patient subject를 분리하며 reciprocal deferred audit + full-row/digest guard,
typed actor/source/operation/key/request/state/time 결과 FK, 정확한 REQUESTED cascade를 요구한다.
각 테이블 FORCE RLS/append-only, PUBLIC 권한 회수. 미래 ACK/실제 downstream 중단은 미구현이다.

withdrawal/consent-expiry NOLOGIN capability는 분리되고 runtime grant/credential은 배포하지 않았다.
DB enrollment 제약은 CONSENT_EXPIRY의 sole consent:expire만 별도 허용하며 SESSION_EXPIRY나
환자/임상 scope 혼합은 거부한다. Node registry의 CONSENT_EXPIRY 정렬과 private expiry 서비스는
다음 단계다. 직접 SQL의 reauth metadata는 실제 서명·본인 인증의 증거가 아니다.

이어서 [private projection 프롬프트](../implementation/highpass-v3-p0-06-withdraw-transaction-prompt.md)를
작성·읽고 실행했다. 별도 nonowner pool guard는 sole withdrawal membership, owner/BYPASS/
관리 권한/혼합 role를 거부한다. 실제 registry-issued PATIENT/consent:withdraw command와
서명 합성 재인증을 DB 접속 전·DB clock·callback 후 검증한다. registry/source SHARE →
consent advisory → live own ref SHARE → immutable content/initial/current terminal 조회를 사용한다.
현재 factory/projection은 완료된 철회·감사된 공개 조회·임상 권한이 아니다.

target 중지/parent CANCELLED와 무관하게 own live withdrawal 후보를 조회하며,
source 중지는 DB principal 거부, ref 삭제/외부 resource는 uniform unavailable다.
deadline 이후는 worker 기록 전에도 EXPIRED로 거부한다. maintenance가 작성한 terminal을
환자 철회 pool에서도 볼 수 있도록 **internal own terminal history** SELECT 정책을 분리했다.
이는 L5의 미구현 공개 최소 DTO/감사 조회를 대신하지 않는다.

## 실제 검증

| 명령/검증 | 종료 코드 | 결과 |
| --- | --- | --- |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 202/202, 157,928 ms |
| 감사 변조·교차 capability·부모 취소 보강 후 같은 gate | 0 | PASS 207/207, 122,234 ms |
| actual private withdrawal projection 포함 같은 gate | 0 | PASS 208/208, 124,178 ms |
| 최초/보강 manifest verifier | 0 | 무결성 PASS; 각각 DRAFT 1 / UNASSIGNED 1 |
| withdrawal command/projection `node --test` scoped | 0 | PASS 13/13, 186.1487 ms |
| 최신 manifest verifier | 0 | 무결성 PASS; DRAFT 1 / UNASSIGNED 1 |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0; 2026-10-08T06:24:29.681Z |
| `node --test --test-concurrency=1` | 0 | PASS 477/477, 76,354.6479 ms; fail/cancel/skip 0 |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |

최초 [202 결과](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-16-32-727Z-b4730d97/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-16-32-727Z-b4730d97/manifest.json).
보강 [207 결과](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-19-47-916Z-8462616c/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-19-47-916Z-8462616c/manifest.json).
두 실행 모두 sourceUnchanged/cleanup 및 정확한 컨테이너 부재 관측 PASS.
최신 [208 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-23-53-718Z-d452d3cc/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T06-23-53-718Z-d452d3cc/manifest.json)도
sourceUnchanged/cleanup/정확한 부재 관측 PASS. 실제 서명 합성 binding과 withdrawal-only role로
live projection/copy/closed brand, 무작위 foreign resource, terminal/deadline, source/ref failure,
parent cancellation/target stop, maintenance terminal visibility를 확인했다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 source hashes, Node v24.18.0.

정상 own withdrawal/실제 서비스 principal 명의 expiry SQL 조립, 원본 receipt/event 보존,
missing audit/result/cascade deferred COMMIT rollback, actor/source/subject/sequence/purpose/role/
predecessor/time 오류, REJECTED predecessor, 감사 trace/증적 hash 위조, capability 교차 사용,
source/ref failure, terminal 중복, owner UPDATE/DELETE DENY를 실제 PG로 검증했다.
부모 취소 시나리오의 초기 parent 및 audited cancel은 owner fixture 준비이며 actual cancel service
시험이라고 주장하지 않는다. 초기 결정은 실제 서비스 호출, terminal 조립은 직접 nonowner SQL이다.
query/lock/acquisition/barrier/cleanup은 유한하며 raw token/password/nonce/SQL을 증적에 넣지 않는다.

## 변경 파일·위험·미검증

신규: 027 DDL, consent-lifecycle-schema-fixture, withdrawal projection 및 unit test,
다음 실행 프롬프트와 이 보고서. 수정: 기존 decision fixture 연결·schema gate source hash closure,
ADR/ERD/API/README/master plan/추적·수용 문서. 사용자 runtime DB/Compose/공개 API는 변경하지 않았다.
commit/push/merge/PR 없음. 권장 분리: additive DDL/SQL fixture → private projection/tests → 문서/증적.

남음: patient withdrawal 실제 원자적 서비스·HMAC 원본 receipt 복구/lost ACK, expiry private 서비스/
registry/scheduler, 전체 경합/최종 COMMIT deadline/권한 격리, audited 최소 read, downstream authority/
Grant/DICOM 차단·ACK, content replacement, 새 증적 독립 검토 및 전체 HTTPS/Viewer.
시간·key digest를 직접 SQL에 넣은 fixture를 신뢰 가능한 API 증거로 확장하지 않는다.
외부 IdP/MFA/KMS/PACS/Staging/법률/PIPA/ISMS-P/병원 운영은 DEFERRED/BLOCKED.

다음 [원자적 철회 서비스 프롬프트](../implementation/highpass-v3-p0-06-withdraw-service-prompt.md)를
작성·읽고 기존 initial decision의 HMAC/retry/COMMIT 계약과 비교 분석을 시작한다.
실제 철회 서비스는 아직 구현했다고 판정하지 않는다. 전체 목표는 active다.
기존 initial service는 live projection 이후 원본 receipt를 조회한다. 새 철회에서는
terminal 후 정확한 receipt 복구가 필요하므로 이 순서를 그대로 복사하면 안 된다.
새 service의 현재 ownership/registry/ref 검증과 과거 receipt 복구를 분리하는 계약 분석을 시작했다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
