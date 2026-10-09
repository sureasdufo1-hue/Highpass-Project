# P0-04 transaction / metadata implementation record

기준일: 2026-10-07. 입력 HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 변경.
상태: PARTIAL — LOCAL COMPONENTS TESTED / RUNTIME NOT ACTIVATED.

## 사람 검토와의 경계

김범희 / 2026-10-07 / PASS / 예외·의견 없음은
[기존 실행 기록](highpass-v3-p0-execution-2026-10-07.md#독립-사람-검토-결과-등록)의
legacy r3 DPoP·ingress·영속 replay 후보에 대한 사용자 제공 검토다.
이후 추가된 Identity 트랜잭션 및 metadata GET 코드에는 그 판정을 승계하지 않는다.
이 문서의 새 변경 검토자: UNASSIGNED / 판정: NOT VERIFIED.

## 구현 범위

관련 요구사항: V3-FR-TEN-002/003, Identity/PatientMapping P0-04,
감사 추적 FR-037~041, V3-NFR-TST-001. 전체 요구사항 충족 판정은 아니다.

- `007_highpass_v3_identity_transactions.sql`: principal_bindings와 identity_audit_outbox,
  actor/tenant/hospital 기반 RLS 및 감사 UPDATE/DELETE 거부. 기존 DB에 적용하지 않았다.
- `v3-principal-registry.js`: 인증된 binding 내부 식별과 만료 재검증.
- `v3-tenant-transaction.js`: 제한된 app-role 검사, 같은 connection의 SET LOCAL,
  활성 principal/tenant/hospital row lock, 유한 deadline, 실패 rollback 및 연결 폐기.
- `v3-identity-audit.js`: 고정 이벤트 필드 검증과 같은 트랜잭션의 parameterized INSERT.
- `v3-mapping-read-service.js`, `v3-mapping-read-handler.js`: 자체 기관의 mapping:read
  metadata GET. 보호 식별자는 DTO에서 제외하며 foreign/missing은 동일한 404,
  감사 실패는 데이터 없이 503이다. URL query의 토큰 전달은 거부한다.
- `test/v3-tenant-transaction.test.js`, `test/v3-mapping-read.test.js`,
  `scripts/v3-identity-transaction-check.js`: 단위 및 독립 합성 PostgreSQL/HTTP 검증.

프롬프트 작성 후 순서대로 실행:
[트랜잭션](../implementation/highpass-v3-p0-04-transaction-prompt.md) →
[metadata GET](../implementation/highpass-v3-p0-04-metadata-get-prompt.md).
기존 `server.js`에 새 handler를 연결하거나 기존 Compose DB를 변경하지 않았다.

## 실제 실행 결과

| 검증 | 결과 | 근거 |
|---|---|---|
| 전체 Node 회귀 | PASS | `node --test`, 300/300, fail/skip 0, exit 0, 47.745초 |
| transaction/read 대상 테스트 | PASS | 두 파일 14/14, exit 0 |
| 독립 PG + loopback HTTP | PASS | helper 33 checks, exit 0, 32.834초 |
| 임시 container cleanup | PASS | 소유 label 확인 후 해당 container만 삭제; 후속 label 조회 비어 있음 |
| manifest 무결성 | PASS | verifier exit 0, 1 entry; DRAFT / UNASSIGNED |
| 민감정보 패턴 검사 | PASS | secret scanner findings 0; 개인정보 적합성 인증은 아님 |
| 문법 및 diff 검사 | PASS | 새 JS node --check / git diff --check exit 0 |
| 기존 서버의 새 API, HTTPS/mTLS, 최신 앱 이미지 | NOT VERIFIED | 새 handler 비활성, 재빌드·live gate 필요 |
| reconcile/reviewer/idempotency, 전체 P0-04/v3 | NOT VERIFIED | 구현 및 종단 검증 잔여 |

최종 증적:
`evidence/generated/hp-v3-identity-tx-2026-10-07T11-05-12-617Z-b6243163/manifest.json`.
manifest SHA-256: `8a6e39a26cd2553eb07754379fce0504feb33c9153abd2528f6d2101160b8158`.
PG image ID: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
006 SHA: `8435d3118f38edabd6ac8880401f352e0a56c6859009574f95f5a36e77015515`.
007 SHA: `76b2c468fb396a1aa4462da0a85c2924a8fa18ead743371e7616e82aeb726e88`.
9개 대상 source의 시작·종료 snapshot이 일치했다. 전체 dirty diff 또는 앱 container attestation은 아니다.

## 실패 이력 및 수정

초기 FOR SHARE 검증은 UPDATE 권한/RLS 가시성 부족으로 실패했다.
scoped UPDATE USING과 WITH CHECK(false)를 추가하여 lock만 허용하고 실제 registry 변경은 거부했다.
[PostgreSQL SELECT 문서](https://www.postgresql.org/docs/16/sql-select.html)의 locking 권한에 맞춘다.

GET 확장 초기 실행은 borrowed PG client의 unhandled error로 exit 1이었다.
client error 처리와 안전한 연결 폐기를 추가하고 실제 fixture backend 종료 음성 테스트로 검증했다.
그 실패에서 남은 소유 확인된 합성 임시 container만 제거했다. 기존 volume은 제거하지 않았다.
이후 31개 검증 PASS 실행도 cleanup timeout으로 전체 NOT VERIFIED/exit 1이었다.
해당 `11-02-12-370Z-26e2b80c` 증적은 그대로 보존한다. 최종 재실행의 PASS로 과거 실패를 덮어쓰지 않는다.

## 남은 위험과 다음 작업

- 감사 outbox는 같은 트랜잭션의 기반이다. 전달/hash chain/WORM/SIEM 또는 인증 이전 거부의 전체 감사 연결은 아직 아니다.
- registry lock은 진행 중인 승인 트랜잭션과 철회를 순서화한다. 이미 실행 중인 작업을 즉시 취소한다는 보장은 아니다.
- COMMIT 중 장애는 V3_COMMIT_OUTCOME_UNKNOWN이다. idempotency 없이 무조건 재시도하거나 rollback 확정으로 보고하지 않는다.
- fixture app-role grant는 실제 환경 provisioning 완료 증적이 아니다. loopback HTTP는 HTTPS/mTLS 검증이 아니다.
- 다음은 reconcile/reviewer 계약 확인 → optimistic version/idempotency 구현 → 새 API 활성화 전 독립 DB 검증 → 이미지 재빌드 및 live gates.
- 전체 API HA, 신규 v3 Grant, 전체 MVP/v3 완료는 선언하지 않는다. commit/push/merge/PR 없음.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
