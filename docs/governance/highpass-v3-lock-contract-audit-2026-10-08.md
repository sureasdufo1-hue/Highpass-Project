# D6 잠금 순서 및 환자 승인 계약 충돌 점검

2026-10-08 / DRAFT / UNASSIGNED / STATIC SOURCE AUDIT ONLY.
후속 사용자 승인: 김범희2026-10-08 D1~D4 제안/D5 순차 구현/D6 경합 검증 채택.
아래 미승인 표기는 감사 당시 상태이며 현재 정책 선택은 [승인 기록](highpass-v3-lifecycle-decision-packet-2026-10-08.md)을 따른다.
D6 기술 NOT VERIFIED와 이 문서의 독립 증적 미검토 상태는 그대로다.
관련 V3-FR-EX-003/006/007, CON-001..006, V3-SR-TEN-003/AUTH-004.
[실행 프롬프트](../implementation/highpass-v3-p0-06-lock-contract-audit-prompt.md),
[정책 결정 초안](highpass-v3-lifecycle-decision-packet-2026-10-08.md).

## 확인된 코드와 잠금 흐름

아래는 애플리케이션 SQL 문장 호출 순서다. JOIN 내부 row 잠금 순서나
FK/trigger 전체 실행 순서가 동일하다고 증명한 표가 아니다.
P는 principal/소속 tenant/hospital SHARE, A는 actor/operation/key 범위
advisory lock, R은 PatientRef, T는 수신 hospital/tenant, S는 Session,
M은 PatientMapping이다. SHARE는 S, UPDATE는 U로 표시한다.

| 경로 | 확인된 명시 잠금 순서 | 코드 근거 |
|---|---|---|
| 공통 인증 transaction | P(S) → callback → COMMIT | `v3-tenant-transaction.js`, activePrincipalSql와 run |
| Session fresh create | P → A(create) → R(S) → target hospital(S) → target tenant(S) → Session/children INSERT → S(S) metadata | `v3-exchange-session-service.js`, create/metadata |
| Session create replay | P → A(create) → R(S) → target hospital(S) → target tenant(S) → S(S) eligibility/metadata | 동일 파일 prior 경로 |
| PENDING fresh/replay | P → A(prepare) → S(S) → R(S) → target hospital/tenant JOIN(S) → staging/audit/result → COMMIT | `v3-pending-service.js`, `v3-pending-projection.js` |
| Cancel fresh/replay | P → A(cancel) → S(U) → state/event/audit/cascade/result | `v3-exchange-cancel-service.js` |
| Expiry batch | P → deadline/session 정렬 S(U,SKIP LOCKED) → 상태/event/audit/cascade | `v3-exchange-expiry-service.js` |
| Mapping reconcile | P → A(identity key) → A(local-ref digest) → R(S) → M(U) → audit → M/R JOIN(S) | `v3-identity-idempotency.js`, `v3-mapping-write-service.js` |
| Mapping review | P → A(identity key) → M(U) → R(S) → update/audit → M/R JOIN(S) | 동일 파일 review/resourceVisible |
| Identity replay | P → A(identity key) → R(S) 또는 M/R JOIN(S) | `v3-identity-idempotency.js`, resourceVisible |
| Patient challenge | P → A(issue key) → S(S) → R(S) → target hospital(S) → target tenant(S) → challenge/audit/result INSERT | `v3-patient-challenge-issuance.js`, `v3-patient-approval-projection.js` |
| Initial patient decision | P → A(decision key) → A(preparation) → S(S) → R(S) → target hospital(S) → target tenant(S) → 7개 artifact 테이블 INSERT | `v3-patient-consent-decision-service.js`, 같은 projection |

2026-10-08 후속: [실제 취소/승인 경쟁](highpass-v3-nonowner-cancel-races-execution-2026-10-08.md)은
별도 nonowner service 계정의 양방향 Session lock 경쟁과 timeout/ACK/audit fault를
검증했다. 이는 표의 일부 경로에 대한 실제 관측이며 다중 Session/전체 D6 증명이 아니다.
[다중 Session 실행 프롬프트](../implementation/highpass-v3-p0-06-multisession-lock-order-prompt.md)에
따라 기존 JOIN의 실제 취득 순서, 반대 source/target, expiry와 기관 변경 경쟁을
추가 검증해야 한다. 위 두 행은 최신 코드의 문장 호출 순서이며 runtime 정책을 변경하지 않았다.

후속 [다중 Session 실행 결과](highpass-v3-multisession-contention-execution-2026-10-08.md)는
같은 source 두 Session의 취소/승인 양방향, 동일 취소 key 충돌, A→C/C→A와 기관 중지,
별도 nonowner maintenance의 SKIP LOCKED/승인 rollback 후 drain을 실제 검증했다.
상태: 해당 추가 9개 scenario PASS, 전체 D6 PARTIAL. 한 waiter의 blocker를 단계별
관측한 것이며 모든 JOIN 계획/미구현 linking·withdrawal·Grant의 잠금 순서를 증명하지 않는다.
다음은 [실제 create/PENDING 경합](../implementation/highpass-v3-p0-06-create-pending-contention-prompt.md)이다.

핵심 발견: Session 생성과 PENDING은 R/T/S 순서가 다르고 Mapping reconcile과
review는 R/M 순서가 다르다. 그러나 표에 있는 R/T SHARE끼리는 서로 호환되므로
순서 차이만으로 현재 deadlock 발생을 주장할 수 없다. 기존 코드에서 실제 교착을
재현한 증적은 이 점검에 없다. 미래 승인/연결/기관정지가 UPDATE를 추가하면 공유
잠금의 호환성만으로 보호되지 않는다. 모든 기능이 기관 UUID 정렬을 한다는 주장도
현재 소스와 일치하지 않는다. 이 점검에서 잠금 순서를 변경하지 않았다.

## 명시 잠금 외에 포함해야 할 경로

011 Session은 ref registration/principal/target hospital을 FK로 참조하고,
participant/resource/audit/result가 Session을 참조한다. 012 creation_context의
Session/audit composite FK와 018 staging/audit/result composite FK 일부는
DEFERRABLE INITIALLY DEFERRED이다. 011 exchange assembly/scope count 및018
pending assembly constraint trigger도 COMMIT 시 실행된다. 따라서 callback의
마지막 SQL만 검사해 COMMIT 잠금이 없다고 결론내릴 수 없다.

이번 점검은 FK/trigger 정의와 애플리케이션 문장 순서를 확인한 것이다. 실제 DB의
모든 row-level lock 수집, trigger 내부 종합 그래프, 계획별 JOIN 순서, production
다중기관 workload는 NOT VERIFIED. FK의 묵시 잠금 모드는 임의로 단정하지 않는다.
새 경합 시험에는 실제 `pg_locks`/`pg_stat_activity` 관측과 blocker PID를 사용하고
해당 owned 테스트 프로세스만 조작해야 한다. raw SQL 파라미터·환자·token은 수집 금지.

## 새 기능 추가 시 검증할 후보 충돌 — 미재현

1. 새 linking/ref mutation이 R(U) 뒤 S(U)를 잠그면 PENDING의 S(S) 뒤 R(S)와
   반대 방향이 될 수 있다. 실제 새 명령이 아직 없으므로 현재 버그로 판정하지 않는다.
2. 기관정지가 target T(U)를 잡고 Session을 잠그면 PENDING S→T와 충돌할 수 있다.
   신규 정지 정책이 어느 기관/Session을 변경할지 먼저 정해야 한다.
3. Mapping mutation이 R(U)→M(U)를 추가하면 review M(U)→R(S)와 경합할 수 있다.
   identity linking 권한을 기존 own-ref review에서 추정하면 안 된다.
4. 승인/철회가 각각 Consent와 Session을 반대로 잠그면 오래된 ALLOW와 철회가
   경쟁한다. Session/Consent/Decision/Grant의 고정 순서·최종 유효성 검사가 필요하다.
5. 복수 Session 작업은 단일 Session API 순서를 확장한 것만으로 안전하지 않다.
   expiry SKIP LOCKED는 대기 회피이지 전체 워크플로 deadlock/완료 보증이 아니다.

## API·DDL 정렬 충돌 및 후속 작업

| 현재 계약/구현 | 부족한 계약 | 구현 전 필요한 결정 |
|---|---|---|
| OpenAPI CreateConsentArtifactRequest.state는 target enum 입력, 설명은 untrusted | PENDING 준비와 서버 검증 승인 command를 별도로 표현해야 함 | D1: 환자 principal/re-auth, 준비 version/digest, replay 규칙 |
| ConsentArtifact.version 하나, state는 content와 함께 DTO로 표시 | contentVersion과 state/event sequence의 의미 및 If-Match 대상을 구분 | D4: immutable 내용+append-only 상태 선택 여부 |
| 018 staging은 PENDING/UNVERIFIED 고정, submitted commitment는 증거 검증이 아님 | approved artifact 및 서버 생성 evidence의 별도 저장/검증 | 기존 staging을 ACTIVE로 UPDATE하거나 backfill하지 않음 |
| 011 DESTINATION participant는 INVITED 고정 | 최소 invitation 조회/기관 수락/연결 증거와 새 RLS | D2/D3: 연결 동의 분리 및 수락자 capability |
| target EvaluateAuthorizationRequest에 actor/tenant/hospital 필드 존재 | 서버 registry 결합이 권위, body spoof를 거부하는 계약 | D1/D3 이후 별도 Decision 구현; body만으로 actor 채택 금지 |
| terminal/각 action 상태 enum만 존재 | 명시 directed-edge 명령·증거 및 completion semantics | D5: 재개/여러 action/거절·철회 시작 상태 확정 |

위 변경은 제안이며 canonical OpenAPI/DDL/RLS를 변경하지 않았다. 기존 화면에는
영향을 주지 않았고 target 환자 승인/기관 inbox 화면과 신규 테스트에 영향을 준다.
실제 법률 동의서나 병원 운영 승인 완료를 의미하지 않는다.

## 감사 기준 소스 SHA-256

```text
src/v3-tenant-transaction.js 8985628ab294037c0e3643452eebd5eb04850de90a7f0b8831cd8ceb429a5dc7
src/v3-exchange-session-service.js c00e9d21220bc9217944d54d4b7cb842e93b724ba90acc54101c1cebaa6671b9
src/v3-pending-service.js a690192d5f6158da213aef132f6bea9524d3d3df475442124c0c0483266b0c72
src/v3-pending-projection.js e251a90972e00fc0a266e68d9004d2a391a2ed6d6229099bf3a5e2eb15d2f2fb
src/v3-exchange-cancel-service.js 675670e774d2cb924842a1e0bc419e950108692e3f5c8c73f6bfeba7d07def55
src/v3-exchange-expiry-service.js e2dfbdecf7a7e7f2661b5b690aa4515bcf842befd72a9223803f32a5848aa03f
src/v3-mapping-write-service.js 0c3fdcdc31141386d50dddf2a0ce61fd99ae1e83903f52fafad248e1b2de56a5
src/v3-identity-idempotency.js 87240b34a0bd3ea540f2c5fc5855404cccf79c5f3f2656d2e67ff2bda9b3467b
```

## 판정 및 필요한 방향

소스/계약 분석 수행: 확인됨. D6 전체 deadlock/race 검증: NOT VERIFIED.
새 DB/HTTP/브라우저 테스트는 이 문서 작업에서 실행하지 않았다. 이전427/417
PASS는 이전 격리 기술 게이트이며 이 신규 환자 승인 계약의 PASS가 아니다.
`node scripts/v3-lifecycle-document-check.js` exit0,67개 파일/179개 로컬 링크 PASS
(참조와 coverage label만 검사). 분석 문서에 기록한8개 소스 해시는 현재 파일과
별도 재대조한 결과8/8 일치(PASS), 종료 코드0이다. 링크 통과가 정책 승인 또는
deadlock 안전성 검증은 아니다.
D1~D5 NOT APPROVED, 전체 MVP/v3 IN PROGRESS. 검토자는 아직 UNASSIGNED.
정책 변경에는 [의사결정 초안](highpass-v3-lifecycle-decision-packet-2026-10-08.md)의
각 선택 확인이 필요하다. D5는 거절/철회와 여러 action 정책을 확정하기 전 해당
전이를 비활성화한다. 승인 전까지 신규 임상 권한·수신기관 활성화·Grant는 부여하지 않는다.
