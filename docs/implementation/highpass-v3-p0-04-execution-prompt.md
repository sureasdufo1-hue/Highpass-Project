# P0-04 — Identity / Tenant 실행 프롬프트

작성일: 2026-10-07. 이전 작업: legacy 코드·증적의 사용자 제공 독립 검토 등록 완료.
승인 범위는 legacy 기술 검증이며 신규 v3 구현이나 전체 API HA 승인이 아니다.

## 실행 지시

최신 요구사항·Security·ERD·OpenAPI·Acceptance Criteria와 실제 저장소를 기준으로
P0-04를 단계별 구현한다. 기존 미커밋 변경과 병원/DB 볼륨을 보존한다.

1. 기존 문자열 hospital ID와 v3 UUID 모델의 충돌을 분석하고 additive 스키마 경계를 명시한다.
2. Tenant/Hospital/opaque PatientRef/PatientMapping DDL, 복합 FK, active mapping unique,
   상태·검토 증적·버전 제약과 fail-closed tenant/hospital RLS를 작성한다.
3. 독립 합성 PostgreSQL에서 실제 migration dry-run을 실행한다. 비소유·비superuser 역할로
   정상/외부 tenant·hospital/누락 context CRUD, pool-compatible transaction-local context,
   중복·충돌·FK·검토 증적 조건을 검증한다. legacy 표본은 변경되지 않아야 한다.
4. 식별자 보호 및 keyed lookup digest의 서버 신뢰 경계, authenticated principal registry,
   reviewer 권한과 state transition, optimistic concurrency, transactional audit를 구현한다.
5. 승인된 `/api/v3/patient-mappings/reconcile` 및 metadata GET 계약과 idempotency를 연결한다.
   환자/tenant/hospital은 클라이언트 주장만으로 신뢰하지 않는다. raw local ID나 protected value,
   digest, secret를 응답·로그·증적에 출력하지 않는다. 임의 자동 병합은 금지한다.
6. V3-AT-ID-001~004/TEN-001~002 및 관련 IAM/tenant/privacy 음성 시험과 전체 회귀를 실행한다.
   import 차단은 실제 connector 호출 전 zero side effects로 확인한 경우만 PASS다.
7. 결과와 다음 실행 프롬프트를 기록한다. 서비스/API/실제 pool 시험을 SQL 시험으로 대신하지 않는다.

관련: V3-FR-ID-001~006, V3-FR-TEN-001~003, V3-SR-TEN-001~003,
V3-SR-PAT-001, FR-014~020/037~041.

## 첫 실행 단위와 결정

확인된 요구사항: UUID 모델, 보호 local ref+keyed digest 분리, 다섯 mapping 상태,
tenant/hospital 격리, optimistic version, VERIFIED 증적.
합리적 가정: legacy와 v3가 공존하는 additive namespace는 API 계약을 변경하지 않는다.
구현 결정: `highpass_v3` 스키마. runtime legacy schema loader에는 자동 연결하지 않는다.
첫 단위는 DDL과 실제 독립 PostgreSQL 검증이며 P0-04 전체 완료와 구분한다.
남은 불확실성: reviewer API/credential provisioning과 identifier encryption/key rotation 계약은
서비스 착수 전에 상세화한다. 기존 보호값 입력을 암호화 검증 완료로 해석하지 않는다.

## 금지 및 종료 기준

기존 스택 변경, public 테이블 변환, 임상 backfill, 실제 환자정보, TLS 완화,
`down -v`/system prune, commit/push/merge/PR을 하지 않는다.
명령/readiness/cleanup에 유한 timeout을 적용하고 실행하지 못한 검증은 NOT VERIFIED다.
자동 증적은 DRAFT / UNASSIGNED다. 다음 프롬프트 실행은 기존 권한 범위 안에서만 한다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
