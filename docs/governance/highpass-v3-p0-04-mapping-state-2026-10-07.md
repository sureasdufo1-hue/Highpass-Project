# P0-04 Mapping 내부 생성·검토 실행 결과

기준일 2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 변경.
상태: LOCAL OWN-REF SERVICE TESTED / HTTP AND CROSS-INSTITUTION LINKING PENDING.
관련: V3-FR-ID-001~005, TEN-002/003, V3-AT-ID-001~003, FR-037~041.
이전 ledger 구현/검증은 진행으로 분류했고 [다음 프롬프트](../implementation/highpass-v3-p0-04-mapping-state-prompt.md)를 작성·실행했다.

## 기존 구조·변경 파일

기존 protected identifier/registry/tenant transaction/idempotency/outbox를 재사용했다.
생성: `010_highpass_v3_mapping_review.sql`, `src/v3-mapping-write-service.js`,
`test/v3-mapping-write-service.test.js`, 실행 프롬프트 및 이 보고서.
수정: Identity idempotency/audit/PatientRef service, 독립 PG helper, OpenAPI/API 계약,
ERD/Acceptance/Requirements/Master Plan. 기존 서버·DB/Compose volume 및 의존성/lockfile은 변경하지 않았다.
Traceability의 ID 항목도 같은 PARTIAL 범위로 갱신했다.

## 구현·보안 검토

- own registered PatientRef와 AEAD/HMAC 검증을 통과한 reconcile만 허용한다. 신규 매핑은 UNVERIFIED/version 1, maker 및 evidence digest를 기록한다.
- 같은 scoped digest/PatientRef는 기존 매핑을 보존한다. 다른 PatientRef 충돌은 재배정/자동 merge 없이 기존 상태를 IDENTITY_CONFLICT로 차단한다.
- reviewer는 자체 기관 관리자 + mapping:review, 등록자와 다른 actor, expectedVersion/evidence가 필요하다. NULL maker는 추정·승인하지 않는다.
- 모든 enum을 명시적 검토로 지원한다. version은 한 번 증가하고 VERIFIED 해제 시 verifier/time을 비운다. 동일 성공 retry는 원래 결과만 반환한다.
- 새 매핑의 DB guard는 참조/기관/maker/protected ref/digest 재배정과 자기 승인을 거부한다. deferred 제약은 actor·old/new·version·evidence의 감사 없이는 COMMIT하지 못하게 한다.
- 안전한 정책 DENY는 감사와 필요한 conflict 차단만 commit하고, success ledger 없이 403/404/409를 반환한다. 감사 장애는 모두 rollback한다.
- raw patient ID/인구통계/envelope/token은 response/ledger/audit에 출력하지 않는다. envelope는 mapping 보호 컬럼에만 보관하고 evidence에는 digest만 남긴다.
- replay는 mapping 및 연결된 PatientRef가 살아 있고 scoped visible인지 다시 확인하고 row lock을 유지한다. snapshot의 VERIFIED를 현재 접근 승인으로 사용해서는 안 된다.
- patient_ref_registrations는 기록된 owner tuple의 FK 기반 root다. 기존 ref SELECT와 mapping INSERT의 RLS 순환을 제거했다. 전역 SELECT/SECURITY DEFINER/NULL owner 추정 없이 명시된 owner만 복사한다.
- 이 root는 동의/기관간 공유 승인 객체가 아니다. 신뢰 조직 reviewer 위임, 환자 계정/실제 identity, cross-institution linking은 아직 별도다.

## 실제 실행 결과

| 검증 | 결과 | 명령·근거 |
|---|---|---|
| 초기 Mapping/contract/ledger | PASS | node --test 대상 3개 파일, 12/12, exit 0 |
| 최종 관련 5개 파일 | PASS | 25/25, exit 0, 555.099 ms |
| 최종 전체 Node | PASS | node --test, 316/316, fail/skip 0, exit 0, 37.968초 |
| 실제 독립 PG + metadata HTTP | PASS | helper 73 checks, exit 0, 17.564초 |
| own Mapping 생성·5 states·self/stale/foreign/competing reviews | PASS | 실제 role/row/version/audit 검증 |
| collision 차단 및 반복 DENY | PASS | 기존 PatientRef 유지, VERIFIED 해제, 반복 version 불변 |
| review audit 장애 | PASS | 실제 INSERT grant 회수, 변경 rollback |
| audit 없는 새 INSERT / 직접 SQL 자기 승인 | PASS | DB constraint/guard 거부, 새 row 미커밋 |
| 삭제 ref의 old snapshot / NULL maker | PASS | 404/403 및 safe audit |
| manifest | PASS | 1 entry digest 검사 exit 0; DRAFT / UNASSIGNED |
| secret scan | PASS | findings 0, 2026-10-07T11:54:50.511Z; pattern 검사 |
| 문법/diff/OpenAPI | PASS | node --check / git diff --check exit 0; YAML 및 312 refs / 21 paths 해석 |
| write HTTP / 최신 이미지 HTTPS/mTLS | NOT VERIFIED | 아직 미연결, 해당 live 게이트 이번 실행 아님 |
| 기관간 ref 공유 및 전체 P0-04/v3 | NOT VERIFIED | 명시적 연결 승인·남은 종단 gate 필요 |

최종 증적: `evidence/generated/hp-v3-identity-tx-2026-10-07T11-53-34-192Z-e4efa5d6/manifest.json`.
manifest SHA-256: `84f85638cb755595b306e59b13f29c0bf34fd9470803d5d577ef0ec402e8857a`.
010 SHA-256: `240d88e90c5f272369a251eb3280126649eef9878fdfb74be6c355c4d7b6f5b4`.
17개 대상 source 시작/종료 snapshot 일치. 전체 diff/앱 container attestation은 아니다.
후속 실제 파일 hash와 증적의 차이도 0이었다.
PG image ID: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
cleanup PASS 및 후속 label 조회 비어 있음. 소유 확인한 임시 container/tmpfs만 제거했고 기존 데이터 삭제 없음.

## 실패·미검증 이력 보존

초기 DB 실행은 mapping INSERT의 V3_DATABASE_UNAVAILABLE로 NOT VERIFIED/exit 1이었다.
후속 safe SQLSTATE 42P17과 정책 의존 그래프를 확인해 mapping INSERT→ref SELECT→mapping 순환을 분리했다.
모든 진단은 코드/고정 단계만 저장하고 raw SQL 오류·params는 출력하지 않았다.
중간 재시작 결과 비교도 JSONB key order를 JSON.stringify로 비교하여 FAIL/exit 1이었다.
isDeepStrictEqual로 값 비교하도록 수정했다. 응답/인가를 완화하지 않았다.
`11-46-26-881Z-bf903218`, `11-48-11-604Z-297ecc23`, `11-49-46-842Z-34802a84` 실패·미검증 증적은 그대로 보존한다.
최종 PASS로 과거 결과를 덮어쓰지 않는다. 과거 Python/DNS timeout 재현성 위험은 이전 기록에 유지한다.

## 남은 위험·다음 단계

다음은 write HTTP adapter/body/header/error contract 및 실제 임시 HTTP 검증이다.
이어 같은 global PatientRef의 다른 기관 매핑을 위해 명시적 환자/기관 승인과 linking evidence 계약을 정렬한다.
owner 재배정 또는 root registry의 무승인 복제로 대체하지 않는다. fresh mapping/preflight 없이 old VERIFIED snapshot을 사용하지 않는다.
HTTP auth/scope 이전 거부·retry request audit 통합, key rotation/TTL/quota, runtime migration/rollback과 새 image/live gates도 잔여다.
신규 사람 검토 UNASSIGNED/NOT VERIFIED; 김범희 legacy 승인 승계 없음. commit/push/merge/PR 없음.
전체 API HA/신규 Grant/MVP/v3 완료 선언 없음.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
