# P0-04 Identity 스키마 및 독립 PostgreSQL 검증

기준일: 2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 diff.
상태: IN PROGRESS — SCHEMA FOUNDATION TESTED. 검토 상태: DRAFT / UNASSIGNED.
legacy 독립 검토 PASS는 이 신규 구현에 자동 승계하지 않는다.

## 목적·실행 경계

[실행 프롬프트](../implementation/highpass-v3-p0-04-execution-prompt.md)를 작성하고
첫 단계인 additive DDL과 실제 독립 PostgreSQL 검증을 실행했다.
Node ESM + 기존 pg/PostgreSQL 기술 스택을 유지한다. 기존 public hospitals는 문자열 ID이므로
UUID 기반 v3 테이블은 `highpass_v3` 스키마에 격리했다. Control DB에 영상 원본을 추가하지 않는다.
관련: V3-FR-ID-001~006, V3-FR-TEN-001~004, V3-SR-TEN-001~003,
V3-SR-PAT-001 및 FR-014~020/037~041의 후속 구현 기반.

## 변경 파일

- `db/migrations/006_highpass_v3_identity.sql`: Tenant/Hospital/PatientRef/Mapping,
  composite FK, active local digest unique, mapping 상태/VERIFIED 증적/버전 제약, RLS.
- `scripts/v3-identity-schema-check.js`: 격리된 임시 컨테이너의 실제 psql 검증과 소유 label 확인 cleanup.
- P0-04 실행 프롬프트, master plan, ERD 공존 경계 및 이 결과 문서.

기존 서버/API/UI/legacy schema loader를 수정하지 않았다. runtime DB/볼륨에 migration을
적용하지 않았으며 신규 runtime role 권한도 부여하지 않았다. 기존 작업트리 변경은 보존했다.

## 실제 실행 결과

| 명령·검증 | 결과 | 근거 |
|---|---|---|
| `node --check scripts/v3-identity-schema-check.js` | PASS | exit 0 |
| 최초 `node scripts/v3-identity-schema-check.js` | FAIL | exit 1 / 10개 PASS 후 foreign INSERT 검증기의 종료 코드 기대 불일치; cleanup PASS; 17.645초 |
| 수정 후 동일 명령 | PASS | exit 0 / 22개 assertion PASS / cleanup PASS; 20.505초 |
| `node --test` | PASS | exit 0 / 255 PASS, fail·skip 0 / 40.4225811초 |
| `git -c core.safecrlf=false diff --check` | PASS | exit 0; 신규 미추적 파일의 전체 검증을 뜻하지 않음 |
| 소유 label로 잔여 컨테이너 조회 | PASS | 조회 결과 0개 |

SQL 오류의 psql `ON_ERROR_STOP` 종료 코드는 3이다. 최초 검증기는 1을 기대했으며,
이를 3 + 정확한 SQLSTATE(42501/23505/23503/23514) 확인으로 수정했다.
일반 Docker/psql 장애를 예상 DENY로 분류하지 않는다. 최초 FAIL 기록을 삭제하지 않는다.

DB 이미지 ID: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
migration SHA-256: `8435d3118f38edabd6ac8880401f352e0a56c6859009574f95f5a36e77015515`.

22개 검증은 migration transaction rollback/commit, legacy sentinel 보존, A/B mapping,
비superuser·NOBYPASSRLS 역할, own mapping/ref read, missing/mismatched context,
foreign INSERT/UPDATE/DELETE, local digest 중복 bind, hospital FK, VERIFIED 증적,
허용 상태·양수 version, 동일 backend의 SET LOCAL 종료, suspended tenant 차단,
거부 후 기존 데이터 보존을 포함한다. legacy sentinel은 독립 DB에 만든 합성 표본이며
운영 데이터 전체 migration 호환성 검증을 대신하지 않는다.

## 보안·미검증

격리 컨테이너는 `--network none`, port 미공개, tmpfs, 합성 UUID·무작위 byte fixture를 사용한다.
무작위 DB 비밀번호/보호값/digest를 결과에 출력하지 않는다. cleanup은 고유 이름과 소유 label을
확인한 자기 컨테이너만 제거하며 해당 임시 데이터는 폐기된다. 기존 스택/볼륨은 대상으로 삼지 않는다.
readiness 60초, SQL statement 5초/lock 3초, 개별 Docker 명령 4~20초의 유한 timeout이다.
RLS context는 애플리케이션이 검증해야 하며 SQL session setting 자체는 인증이 아니다.
테스트 역할에 부여한 CRUD는 임시 DB 검증용이며 runtime 권한 설계가 아니다.

다음은 모두 NOT VERIFIED / 미완료다:

- V3-AT-ID-001 전체: 실제 identifier 암호화·keyed digest 생성 및 HTTP 비노출.
- ID-002/003: ambiguous matching, reviewer 권한, immutable ownership/state transition,
  optimistic concurrency와 transactional audit.
- ID-004: 실제 import connector 호출 전 차단과 zero side effects.
- TEN-001/002 전체: authenticated app ACL, 실제 application pool의 context 재사용·joins.
- v3 HTTP reconcile/GET/idempotency 및 기존 데이터에 대한 migration/rollback rehearsal.

DB 제약 통과만으로 mapping 검증 증거의 진위·환자 identity를 인증하지 않는다.
보호값의 바이트 길이 제약은 암호화의 증명이 아니다. API·암호화 envelope 계약을 후속 단계에서 정렬한다.
전체 P0-04, API HA, 신규 Grant, MVP/v3 완료는 선언하지 않는다. commit/push/merge/PR 없음.

## 다음 실행 단위

동일 실행 프롬프트의 4~6번을 진행한다. 먼저 authenticated principal↔registry UUID binding,
protectedLocalRef/localRefDigest의 발행자·envelope·key version 신뢰 계약, reviewer 및
idempotency/audit 계약을 상세화한 뒤 transactional repository/service/API를 구현한다.
현재 OpenAPI의 보호값은 문자열이고 DDL은 bytea이므로 encoding/decoded length 검증을 명시해야 한다.
사람 identity 승인이나 암호화 검증을 임의로 만들어 PASS로 표시하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
