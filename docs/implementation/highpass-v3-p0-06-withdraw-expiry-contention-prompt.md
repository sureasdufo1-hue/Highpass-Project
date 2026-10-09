# 다음 gate — 철회·동의 만료 공통 잠금 경쟁

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 채택: 김범희, 2026-10-08.
CON-003/005/006, AUTH-004, TEN-001/003, AUD-001, legacy FR-001~005/014~025/037~041.

1. [현재 실행 보고서](../governance/highpass-v3-withdrawal-isolation-execution-2026-10-08.md),
   lifecycle ADR/contract, 027/028과 실제 private withdrawal factory/service를 읽는다.
   PG246 subset을 전체 D6 완료로 표시하지 않는다.
2. 현재 CONSENT_EXPIRY 역할의 terminal SELECT가 다른 actor의 WITHDRAWN을 볼 수 있는지
   확인한다. 필요한 경우 expiry-only source-bound terminal history SELECT를 additive로
   정렬한다. 일반 관리자/다른 source/환자 scope에 maintenance 권한을 주지 않는다.
   own event audit/write actor 제한은 유지하고 audit/result/cascade 읽기 확장을 최소화한다.
3. 소유한 임시 DB에서 등록된 sole CONSENT_EXPIRY/consent:expire nonowner SQL writer를
   사용한다. 실제 private worker가 없으므로 SQL expiry fixture라고 명시한다. 환자를
   impersonate하지 않고 exact predecessor/content/event3와 reciprocal audit/receipt/cascade를
   원자적으로 기록한다. common advisory domain은 actual withdrawal과 동일해야 한다.
4. 짧은 consent deadline과 유한 barrier, 정확한 backend/blocker PID로 다음을 시험한다:
   expiry-first → withdrawal terminal deny; withdrawal admitted-first but deadline elapsed
   before COMMIT → rollback/deny then EXPIRED; withdrawal committed before deadline → later
   expiry sees WITHDRAWN and creates no duplicate terminal. Worker 미실행에도 expired 신규
   withdrawal은 DENY다. 성공 ACK 유실은 성공으로 추정하지 않고 실제 row로 구분한다.
5. finite query/poll/deadline/cleanup, copied/tampered service purpose/scope/actor/source,
   missing assembly rollback와 original receipt 유지도 회귀한다. source hash, SHA, 실제 종료
   코드/시간, exact owned absence와 DRAFT/UNASSIGNED manifest를 기록한다.
6. 이후 별도 CONSENT_EXPIRY registry/private factory/worker → 최소 audited DTO read →
   authority/Grant/HTTPS/Viewer 순서로 진행한다. SESSION_EXPIRY scope나 일반 human에
   consent:expire가 암묵 승계되지 않도록 한다. 외부 IdP/MFA/KMS/PACS는 별도 backlog다.

운영 DB/공개 API/runtime enrollment·Grant 활성화 및 commit/push/merge/PR은 금지한다.
기관/법률/PIPA/ISMS-P 승인 또는 전체 MVP/v3 완료를 선언하지 않는다.
