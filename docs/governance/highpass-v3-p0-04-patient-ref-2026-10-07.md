# P0-04 PatientRef bootstrap 실행 결과

기준일: 2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 변경.
범위: CAPSTONE-P0 / INTERNAL SERVICE ONLY / RUNTIME NOT ACTIVATED.
관련: V3-FR-ID-001/002/005, V3-FR-TEN-002/003, FR-037~041.
이전 턴의 write 계약/validator 구현을 진행으로 확인한 뒤
[다음 프롬프트](../implementation/highpass-v3-p0-04-patient-ref-prompt.md)를 작성하고 실행했다.

## 기존 구조 및 변경

기존 global patient_refs는 매핑이 없으면 기관에서 읽을 수 없어 최초 mapping 등록의 선행조건이 없었다.
V3PrincipalRegistry/V3TenantTransaction/appendIdentityAudit를 재사용하고 legacy runtime과 DB는 보존했다.

생성 파일:

- `db/migrations/008_highpass_v3_patient_ref_registration.sql`
- `src/v3-patient-ref-service.js`
- `test/v3-patient-ref.test.js`
- 실행 프롬프트 및 이 보고서

수정 파일: `src/v3-identity-audit.js`, 독립 PG helper, Mapping write 계약, ERD, Master Plan.
package.json/lockfile, 기존 server.js/Compose 데이터, 임상 자료는 이번 단계에서 변경하지 않았다.

## 구현·보안 검토

- 서버에서 random UUID 발급. 입력으로 patientRef/localRef/인구통계/actor/owner를 받지 않는다.
- 신규 ref는 owner tenant/hospital 및 registered actor를 기록한다. 과거 row는 세 필드 NULL을 유지한다.
- 기존 매핑 기반 global ref 읽기 정책은 유지하고, 미매핑 신규 ref의 owner scoped SELECT 및 INSERT RLS를 추가했다.
- 활성 principal/tenant/hospital 및 자체 기관 관리자+mapping:write가 필요하다. 정지 기관은 직접 context를 설정해도 owner SELECT에서 거부한다.
- 등록 ref와 PATIENT_REF_CREATED typed audit를 같은 tx에 기록한다. 감사 실패는 ref도 rollback한다.
- 감사에 patient_ref FK와 restrictive INSERT policy를 추가했다. 기존 scoped append policy에 OR 우회를 만들지 않는다.
- audit module은 008 이후 schema를 요구한다. 기존 서버에는 이 신규 경로가 아직 활성화되지 않았다.
- SECURITY DEFINER, global SELECT 우회, 과거 owner 추정/backfill은 없다. app fixture에는 ref UPDATE/DELETE 권한이 없다.
- 다른 기관에 동일 PatientRef를 연결하려면 별도 명시적 승인/membership이 필요하다. 소유자를 바꾸거나 자동 identity merge하지 않는다.

## 검증 결과

| 검증 | 결과 | 종료 코드·근거 |
|---|---|---|
| 초기 대상 4개 suite | PASS | 23/23, exit 0; 후속 옵션 검증 이전 |
| 최종 PatientRef + Privacy Filter 대상 | PASS | 25/25, exit 0, 1.853초 |
| 최종 독립 PG + 기존 metadata HTTP | PASS | 42 checks, exit 0, 33.235초 |
| 006~008 migration dry-run rollback | PASS | 새 schema 부재 확인 후 fresh DB에서 실제 적용 |
| 소유권 위조/교차기관/정지기관/무context | PASS | 실제 RLS + own/foreign SELECT 및 INSERT 검증 |
| 감사 실패 시 등록 rollback | PASS | 실제 INSERT grant 회수, error code와 ref 수 불변 확인 |
| 임시 container cleanup | PASS | 소유 label 확인 후 해당 container만 제거; label 재조회 비어 있음 |
| manifest 검사 | PASS | verifier exit 0, 1 entry DRAFT / UNASSIGNED |
| 문법/secret/diff 검사 | PASS | node --check, scanner findings 0, git diff --check exit 0 |
| 전체 Node 최종 재실행 | PASS | 309/309, fail/skip 0, exit 0, 39.312초; 아래 실패 이력 보존 |
| bootstrap HTTP/idempotency/reconcile/review | NOT VERIFIED | 아직 미구현 |
| 최신 이미지 HTTPS/mTLS/full v3/HA | NOT VERIFIED | 이번 검증 범위 아님 |

최종 독립 DB 증적:
`evidence/generated/hp-v3-identity-tx-2026-10-07T11-23-45-153Z-03fec8b5/manifest.json`.
manifest SHA-256: `02ca3b330b447a9b502a5f632593699ee38edef1b097f4580ee4f5a39542e6c1`.
008 SHA-256: `7d94ae382a7b9e8365560825e7b7d3e1bf4ae3810eed63e692cbed785f77c097`.
PG image: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
13개 대상 host source snapshot이 시작/종료 및 후속 실제 파일 hash와 일치했다.
이는 전체 dirty diff 또는 앱 container attestation이 아니다.

### 전체 회귀 실행 이력

초기 전체 회귀 309/309 PASS(exit 0, 45.223초) 이후 내부 옵션 검증 및 정지기관 RLS를 보완했다.
보완 후 Docker helper와 함께 실행한 전체 회귀는 308 PASS / 1 FAIL(exit 1, 42.040초)이었다.
기존 Privacy Filter Python fixture에서 예상 MODEL_OUTPUT_INVALID 대신 MODEL_TIMEOUT으로 실패했다.
2초 Python fixture 호출 deadline과 timeout 오류 처리는 확인했다. 실행 경합 가능성은 추정이며
원인을 확정하지 않았다. Python/보안 timeout을 늘리거나 테스트를 skip하지 않았다.
Privacy Filter+PatientRef 단독 재실행은 25/25 PASS였다. 과거 실패는 보존하고 전체 재실행으로 최종 상태를 확인한다.
Docker helper 종료 후 전체 재실행은 309/309 PASS였다. 실행 경합에 따른 fixture 지연은
잔여 재현성 위험으로 남긴다. 이 PASS는 모든 부하에서 결정적 실행을 증명하지 않는다.

## 남은 위험·다음 단계

새 내부 bootstrap은 자동 retry/idempotency 보장이 없다. COMMIT 장애 시 결과는 unknown일 수 있으므로
이 상태로 HTTP를 활성화하거나 무조건 재발급하지 않는다.
다음은 scoped durable idempotency와 등록된 ref의 reconcile, 등록 actor·reviewer 분리,
optimistic version·원자적 감사 및 독립 PostgreSQL 동시성 검증이다.
원본 영상 저장·의료 identity 증명·환자 동의·VERIFIED mapping·full audit delivery는 이번 작업으로 완료되지 않았다.
사람 검토 UNASSIGNED / NOT VERIFIED. 김범희의 과거 legacy r3 승인 승계 없음.
기존 데이터 삭제 없음. 합성 임시 container/tmpfs 데이터만 정리했고 재생성 가능하다.
commit/push/merge/PR 없음. 전체 P0-04/MVP/v3 완료 선언 없음.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
