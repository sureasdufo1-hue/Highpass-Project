# 다음 실행 — authenticated finite consent expiry service

2026-10-08 / DRAFT / UNASSIGNED. CON-003/005/006, AUTH-004, TEN-001/003,
AUD-001, FR-001~005/014~025/037~041. L1~L5 김범희 정책 승인, 2026-10-08.

1. 최신 expiry factory 실행 결과와 private transaction 계약, lifecycle ADR/API,
   027/028 DDL, withdrawal service 및 SQL contention fixture를 읽는다.
   factory 증적을 실제 expiry event/worker 완료로 승격하지 않는다.
2. private registry binding/command/factory만 받는 내부 finite batch service를
   구현한다. scope/purpose/source/actor 검증을 유지하고 patient 명의 또는 일반
   clinical pool로 실행하지 않는다. batch는 command.limit 이내이며 무한 polling 금지.
3. source-owned 만료 ACTIVE content 후보를 선택하되 candidate 조회를 현재 권한으로
   취급하지 않는다. 각 content에 withdrawal과 같은
   ['HP-V3-CONSENT-LIFECYCLE',tenant,hospital,consentId,contentVersion] advisory lock을
   적용하고 lock 이후 DB clock/정확한 predecessor/content/terminal을 재조회한다.
   withdrawal 및 이미 기록된 expiry는 새 event를 만들지 않는다.
4. EXPIRED event3의 actor는 실제 maintenance principal, subject는 원본 환자다.
   effectiveAt=원본 validUntil, recordedAt=실제 DB 시각. 027 계약의 immutable
   audit/result/REQUESTED cascade를 한 transaction에서 정확히 조립하고 COMMIT 후만
   성공 결과를 반환한다. raw credential/key/patient local ID를 저장·출력하지 않는다.
5. 실행 식별 및 원본 maintenance receipt 재조회 계약을 명시한다. lost ACK/동일
   재시도는 중복 event를 만들지 않으며 현재 ALLOW나 consumer ACK로 해석하지 않는다.
   receipt 재조회가 필요하면 먼저 최소권한 RLS·별도 식별 namespace를 문서로 정렬한다.
   기존 immutable 초기 approval receipt와 patient withdrawal ledger를 변경하지 않는다.
6. 순수 service 정상/미만료/이미 terminal/foreign source/위조 command/잘못된 pool/
   DB fault/COMMIT unknown/credential expiry/한계 batch 테스트와 실제 owned PG 테스트를
   실행한다. withdrawal↔expiry 양방향 실제 service 경합과 atomic rollback을 검증한다.
   직접 SQL fixture PASS로 authenticated service 시험을 대체하지 않는다.
7. bounded worker close/drain/재시도 정책과 실제 ACK 유실 시험을 후속 게이트로 잇는다.
   worker 실패·지연과 무관하게 DB clock 만료는 downstream 접근 DENY여야 하며 아직
   없는 Grant 소비자 중단을 성공했다고 기록하지 않는다.
8. source hash closure, 종료 코드/시간, manifest DRAFT/UNASSIGNED 및 exact owned
   cleanup를 기록한다. 실패 증적은 보존한다. 다음은 최소 audited read 및
   AuthorizationDecision/TransferGrant/HTTPS/Viewer 통합이다.

공개 API/운영 DB migration/runtime principal·credential·scheduler 배포 및 Git publication 금지.
실 IdP/MFA/KMS/PACS/법률/운영 승인은 DEFERRED/BLOCKED. 전체 MVP/v3 완료 선언 금지.
