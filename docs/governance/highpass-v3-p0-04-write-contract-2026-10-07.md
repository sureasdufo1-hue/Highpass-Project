# P0-04 Mapping write 계약 실행 결과

기준일: 2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 변경.
분류: CAPSTONE-P0 / INPUT CONTRACT TESTED / WRITE WORKFLOW NOT IMPLEMENTED.
앞 턴은 transaction/metadata 결과 및 검토 범위 문서 갱신으로 진행했다.
이번은 [실행 프롬프트](../implementation/highpass-v3-p0-04-write-contract-prompt.md)를 작성하고 실행했다.

## 작업 목적 및 구조

관련 요구사항: V3-FR-ID-001~005, V3-FR-TEN-002/003, V3-AT-ID-001~003, FR-037~041.
기존 V3PrincipalRegistry, V3IdentifierProtection, V3TenantTransaction을 유지했다.
review 요구사항은 있었지만 endpoint·scope·version body 계약이 없어 additive하게 정렬했다.
이 단계는 전체 ID 요구사항 완료가 아니라 write 구현 전 검증 가능한 입력 계약이다.

생성: write-contract prompt, API 상세 계약, `src/v3-mapping-write-contract.js`,
`test/v3-mapping-write-contract.test.js`, 이 실행 보고서.
수정: v3 OpenAPI, API Alignment, ERD, Acceptance Criteria, Master Plan.
기존 legacy UI/server/DB/의존성/lockfile은 이번 단계에서 변경하지 않았다.

## 구현 및 보안 검토

- write와 review 권한을 분리하고 인증된 binding의 own tenant/hospital을 사용한다.
- reconcile은 canonical AEAD/HMAC 검증과 추가 필드 거부 후 UNVERIFIED 내부 command만 생성한다.
- review는 exact fields, 별도 scope, 제한 role, 정수 version, enum state, canonical SHA-256 reference가 필요하다.
- body actor/verifiedBy/state 자동승인 우회, 평문 localRef, demographics, accessor와 unbranded binding은 거부한다.
- digest와 protected envelope는 내부 command의 Buffer다. HTTP 응답이나 ledger/audit에 그대로 기록하지 않는다.
- 실제 DB mutation·사용자 review·idempotency 검증은 아직 없다. command 생성은 identity 적합성 판정이 아니다.

## 테스트 결과

| 명령/검증 | 종료 코드 | 결과 | 범위 |
|---|---|---|---|
| 초기 새 테스트 | 1 | FAIL | 4/5, 합성 DOCTOR JWT에 doctorId 누락 |
| 새+관련 4개 suite | 0 | PASS | 31/31, 694.177 ms; fixture만 보완, 인증 요구 완화 없음 |
| node --test | 0 | PASS | 305/305, fail/skip 0, 40.934초 |
| OpenAPI YAML + local refs 검사 | 0 | PASS | 21 paths / 312 refs 해석 |
| node --check src/v3-mapping-write-contract.js | 0 | PASS | 문법 |
| node scripts/security-secret-scan.js | 0 | PASS | findings 0 / 2026-10-07T11:17:01.448Z; pattern 기반 |

전체 Node 명령은 live HTTPS/staging 스크립트를 별도 명령으로 실행하도록 안내하고 실행하지 않는다.
따라서 unit/isolated HTTP 회귀 PASS를 live HTTPS/v3 write E2E PASS로 해석하지 않는다.
앞 단계 manifest는 앞 단계 소스와 scope만 검증하며 이번 새 파일의 container attestation이 아니다.
새 사람 검토: UNASSIGNED / NOT VERIFIED. 김범희의 legacy r3 PASS 승계 없음.

## 남은 위험·다음 단계

1. PatientRef bootstrap의 명시적 기관/주체 소유 계약과 제한된 DB 경로 구현.
2. Mapping 등록 actor, 자기 승인 금지, optimistic version 및 동일 tx audit 구현.
3. scoped durable idempotency, concurrent retry와 COMMIT outcome unknown 복구 검증.
4. 실제 write/review HTTP handler, 독립 PostgreSQL 정상·음성 검증.
5. runtime 활성화 전 migration/rollback rehearsal, 새 이미지 attestation, HTTPS/mTLS gates와 새 독립 검토.

전체 P0-04·API HA·신규 Grant·MVP/v3 완료는 선언하지 않는다. commit/push/merge/PR 없음.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
