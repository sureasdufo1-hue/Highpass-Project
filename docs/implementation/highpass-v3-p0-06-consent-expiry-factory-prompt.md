# 다음 실행 — consent expiry 전용 minimum-capability factory

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 김범희 승인, 2026-10-08.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001, FR-001~005/014~025/037~041.

1. consent-expiry principal/command 최신 증적, lifecycle ADR/API, 027의 actor별 RLS 및
   generic-plan guard 보완, V3TenantTransaction과 withdrawal private factory를 읽는다.
2. registry-issued INTERNAL_SERVICE/CONSENT_EXPIRY/sole consent:expire/no patientRef와 그
   정확한 binding에 묶인 private batch command만 받아 connection 전에 검증한다.
   copied command/binding이나 plain frozen object는 DB admission authority가 아니다.
3. 전용 NOLOGIN hp_v3_consent_expiry_policy capability만 상속하는 nonowner pool guard를
   구현한다. super/BYPASS/owner/schema owner/dangerous inherited role과 approval/withdrawal/
   clinical/SESSION_EXPIRY membership 혼합을 거부하고 부적합 connection을 폐기한다.
   role 조회/connection fault는 안전한 enum으로 처리한다. patient_refs 권한을 추가하지 않는다.
4. 기존 generic tenant transaction의 exact role/ref/servicePurpose/source ACTIVE registry
   SHARE 검증을 유지한다. finite query/transaction budget, UTC/ISO DateStyle 고정과 callback
   전후 credential expiry 검증을 적용한다. transaction provenance는 callback 수명에 한정한다.
5. brand를 확인하는 guarded internal API를 제공하고 종료/timeout/rollback/COMMIT unknown을
   성공 receipt로 바꾸지 않는다. pure factory는 event expiry나 clinical authority가 아니다.
6. unit 정상/음성/unsafe role/fault/copy/closed lifetime를 실행하고 owned PG 실제 signed
   maintenance role로 정상·foreign source/principal mismatch·혼합 role·deadline/rollback을
   검증한다. source hash closure, manifest DRAFT/UNASSIGNED, exact cleanup를 기록한다.
7. 다음 finite batch private expiry service가 같은 consent advisory domain과 정확한 event3/
   audit/result/REQUESTED cascade를 사용하게 한다. 실제 worker와 양방향 actual service races,
   ACK/drain 후 최소 audited read→authority/Grant/HTTPS/Viewer를 이어간다.

실 운영 DB/공개 API/runtime enrollment·scheduler/credential 배포 및 commit/push/merge/PR 금지.
실 IdP/MFA/KMS/PACS/법률·PIPA·ISMS-P/기관 운영 승인은 DEFERRED/BLOCKED.
전체 MVP/v3 또는 complete D6를 이 factory 단계만으로 완료 선언하지 않는다.
