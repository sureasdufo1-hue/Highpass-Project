# P0-04 다음 실행 프롬프트 — Mapping 생성·검토 전이

2026-10-07 / CAPSTONE-P0. 이전 durable idempotency 단계가 검증되었다.
V3-FR-ID-001~005, TEN-002/003, V3-AT-ID-001~003, FR-037~041을 기준으로 실행한다.

1. 등록 actor를 additive DDL로 추가하고 과거 row를 임의 backfill하지 않는다.
2. own registered ref만 reconcile한다. AEAD/HMAC 검증, UNVERIFIED 초기화, metadata whitelist 유지.
3. 동일 local digest + 동일 PatientRef는 기존 mapping을 보존한다. 다른 PatientRef collision은
   재배정/merge 없이 기존 mapping을 IDENTITY_CONFLICT로 차단하고 안전한 감사+409를 반환한다.
4. 별도 mapping:review scope와 자체 기관 reviewer, maker/checker 분리, expectedVersion을 요구한다.
5. 모든 enum 결과를 명시적 review로 지원하고 VERIFIED 해제는 verifier/time을 비운다.
6. write/audit/idempotency는 같은 tx다. 정책 DENY는 safe audit를 commit 후 오류를 반환한다.
7. 등록·검토·충돌·stale·foreign·self-review·동시 요청·audit fault를 독립 PG에서 검증한다.
8. 실제 의료 identity 검토/자동동의/Grant/임상 import 완료는 주장하지 않는다.
9. 현재 서버·DB에는 활성화하지 않는다. 증적 DRAFT/UNASSIGNED, commit/push 없음.
