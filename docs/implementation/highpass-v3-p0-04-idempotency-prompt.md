# P0-04 다음 실행 프롬프트 — durable Identity idempotency

작성일: 2026-10-07 / CAPSTONE-P0. PatientRef 내부 등록 다음 단계.
관련: V3-FR-ID-001~005, V3-FR-TEN-002/003, FR-037~041.

1. tenant/hospital/actor/operation/key 범위의 append-only 결과 ledger를 additive migration으로 추가한다.
2. key와 request는 독립 domain HMAC-SHA-256만 저장한다. credential/raw patient ID/envelope를 결과에 넣지 않는다.
3. 같은 scoped key 동시 요청은 DB transaction advisory lock으로 순서화한다.
4. callback의 write/audit/result INSERT를 같은 tx에 둔다. ledger 오류/감사 오류는 모두 rollback한다.
5. auth·DB registry는 replay마다 확인한다. foreign/missing/deleted 자원에는 저장 응답을 반환하지 않는다.
6. 같은 key/다른 payload는 409, 같은 payload는 원래 safe metadata를 반환하고 callback을 다시 실행하지 않는다.
7. 실제 PatientRef 등록에 연결하고 독립 DB의 동시성/새 coordinator 재시작/실패 rollback을 검증한다.
8. 자동 key rotation/ledger TTL 삭제/무조건 retry는 추가하지 않는다. outcome-unknown 복구 범위와 제한을 문서화한다.
9. 기존 서버·DB·volume 유지. HTTP 활성화와 mapping reconcile/review는 후속이며 완료로 표기하지 않는다.
10. 실제 테스트·증적 및 실패를 기록하고 과거 사람 승인을 복사하지 않는다. commit/push 없음.
