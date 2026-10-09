# 다음 실행 — consent expiry close/drain·격리·재시도 감사 보강

2026-10-08 / DRAFT / UNASSIGNED. CON-003/005/006, IAM-003/004, TEN-001/003,
AUD-001, FR-001~005/014~025/037~041. L1~L5 김범희 정책 승인과 기술 검토는 별도다.

1. 최신 expiry service 증적/contract 및 additive029, private factory와 actual service
   races를 읽는다. 미통과·미실행 항목은 보존하고 먼저 해결한다.
2. service close는 새 admission을 차단하고 이미 admitted finite transaction의 원래
   성공/실패를 유지하며 Promise.allSettled로 drain한다. inflight가 끝나기 전에 HMAC
   key를 zero하여 이미 승인된 request/object digest가 바뀌지 않도록 한다.
   dispose/close 재호출, 동시 close/COMMIT unknown/deadline, drain 후 key zero를 시험한다.
3. 각 batch의 새 실행/원본 복구/같은 키 변경 limit 거부를 최소 내부 audit로 기록한다.
   기존 immutable batch/event/result를 수정하지 않는다. 필요하면 별도 additive outcome
   table 및 exact actor/source/RLS 계약을 먼저 정렬한다. raw execution key/token/patient
   identifiers는 기록하지 않으며 필수 감사 실패는 성공으로 반환하지 않는다.
4. 실제 등록된 2개 maintenance actor와 다른 source/tenant의 batch 조회·복사 INSERT·
   receipt 복구를 검증한다. 환자/withdrawal/clinical role에 ledger 권한을 주지 않는다.
   owner mutation과 forged receipt snapshot/count의 COMMIT 거부, multi-object bound/order,
   실제 권한 혼합과 source 중지를 서비스에서도 검증한다.
5. 실제 private expiry service와 withdrawal의 동시 경합, same/different execution key,
   lost ACK, rollback, worker-independent expired denial을 최신 code에서 재실행한다.
   SQL-only fixture를 실제 authenticated service 성공 증적으로 승격하지 않는다.
6. bounded single-run worker entrypoint는 필요시 별도 계약으로 정렬하되 runtime scheduler/
   credential/enrollment/migration은 자동 배포하지 않는다. 반복은 유한한 batch·timeout,
   retry는 기술 오류에만 bounded; policy deny/unknown COMMIT의 blind 재실행 금지.
7. Node serial regression, owned PG gate, secrets/diff/manifest/cleanup를 기록하고
   DRAFT/UNASSIGNED를 유지한다. 다음은 minimum audited read와 Decision/Grant/HTTPS/Viewer.

전체 CON/D6/MVP/v3·실 KMS/IdP/PACS·운영 승인 완료 선언 및 Git publication 금지.
