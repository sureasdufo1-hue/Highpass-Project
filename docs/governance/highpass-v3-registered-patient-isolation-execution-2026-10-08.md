# 등록 환자·기관의 초기 동의 증적 격리 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자 김범희, 승인일 2026-10-08.
새 증적 독립 사람 검토와 철회 L1~L5 정책 승인은 아직 미완료다.
CON-006, IAM-003/004, TEN-003, AUTH-001/004, V3-AT-CON-004,
FR-001~005/014~020/037~041. 전체 MVP/v3 완료는 선언하지 않는다.

## 구현 및 검증 범위

[실행 프롬프트](../implementation/highpass-v3-p0-06-registered-patient-isolation-prompt.md)에 따라
`patient-decision-isolation-fixture.js`를 추가하고 기존 decision PG gate에 연결했다.
새 helper의 소스 해시를 gate closure에 포함했다. runtime code/DDL/권한은 변경하지 않았다.

같은 A 기관의 다른 등록 환자와 새 C 기관의 등록 환자·소유 PatientRef·registration을
폐기용 DB에 구성했다. 기관/환자/부모 생성은 owner bootstrap이며 실제 승인·challenge
발급·조회는 서명 TestProvider → private registry → approval-only nonowner pool의
실제 service/factory로 수행한다. 실제 IdP/MFA나 외부 기관 등록을 검증한 것은 아니다.
두 환자 각각 독립 Session/PENDING 준비/challenge로 ACTIVE 초기 artifact를 만들고
7개 테이블의 own read >0을 확인한 뒤 원래 환자 및 다른 환자와의 read가 0행인지 검사했다.
따라서 항상 0행만 반환하는 잘못된 RLS를 통과로 간주하지 않는다.

원본 nonce와 원래 재시도 key를 가진 foreign 요청은 같은 안전한 PREPARATION_NOT_FOUND로
거부된다. copied binding과 signed scope 부족도 별도 검증한다. 원본 7개 테이블의
행을 owner가 관측한 후 제한 계정에서 복사 INSERT를 시도하면 SQLSTATE 42501이며
전체 동의 7개 테이블 행 수는 유지된다. 원문 nonce/secret/PG 메시지를 증적에 넣지 않는다.

추가 6개 시험: 실제 결정 service의 SQL을 fixture에서만 변조해 foreign actor/ref/tenant
root INSERT와 audit actor INSERT가 RLS 42501로 실패함을 확인했다. 감사 상관관계만
바꾼 경우에는 reciprocal deferred FK가 COMMIT에서 23503으로 거부한다. 호출자에게는
COMMIT_OUTCOME_UNKNOWN이며 owner 관측으로 7개 테이블 rollback을 확인했다. source A와
C의 실제 등록 HOSPITAL_ADMIN도 모든 evidence read가 0행이다. A는 C Session의
INVITED destination인 동시에 기존 A Session의 source이며, 어느 역할도 환자 evidence
권한이 아니다. 추가 최소권한 관리자 reader API를 검증한 것은 아니다.

## 초기 결과 보존

| 실행 | 종료 코드 | 결과/원인 |
| --- | --- | --- |
| 최초 PG gate | 1 | NOT VERIFIED; 신규 기관 fixture가 `name`을 사용했으나 실제 스키마는 `display_name` |
| 기관명 수정 후 PG gate | 1 | FAIL; TestProvider 환자 JWT에 필수 합성 patientId 누락 |
| patientId 및 binding 사전 검증 추가 | 0 | PASS 154/154, 137,910 ms |
| tuple substitution 및 admin 음성 시험 추가 | 0 | PASS 160/160, 115,091 ms |

두 결함은 fixture 입력 문제다. 인증·RLS를 완화하거나 runtime 계약을 변경하지 않고
fixture를 실제 계약에 맞췄다. 실패 원본은 삭제/승격하지 않았다. 첫 실행은 setup이
assertion 밖에서 실패해 NOT VERIFIED였으며 이후 등록 작업도 이름 있는 assertion으로
감쌌다. 일반 인증 오류를 원문으로 출력하지 않아 두 번째 오류 label은 FIXTURE_ASSERTION이다.
원인 판단은 실제 auth.js의 PATIENT patientId 요구와 보완 후 정상 경로 PASS에 근거한다.

최초 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-25-22-840Z-673242ac/manifest.json),
두 번째 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-27-13-724Z-64ee1c23/manifest.json),
154개 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-30-13-607Z-a1e9d22a/manifest.json).
세 manifest 무결성 검사 종료 0이며, 이는 각 gate의 FAIL/NOT VERIFIED를 PASS로 바꾸지 않는다.
세 실행 모두 sourceUnchanged/cleanup PASS. HEAD
`59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 hashes/Node v24.18.0 기준이다.

최신 [160개 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-32-42-144Z-8d32684f/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-32-42-144Z-8d32684f/manifest.json).
최신 manifest 검사 종료 0, DRAFT 1 / UNASSIGNED 1. 최신 sourceUnchanged/cleanup PASS.

PG 종료 후 `node --test --test-concurrency=1`: 종료 0, 464/464 PASS,
79,583.922 ms, fail/cancel/skip 0. `node scripts/v3-lifecycle-document-check.js`:
종료 0, 정적 문서 PASS이며 semantic OpenAPI/anchor/사람 정책 승인은 미검증이다.
최종 `node scripts/security-secret-scan.js`: 종료 0, PASS/findings 0,
2026-10-08T05:34:55.888Z(검사 도구의 알려진 패턴 범위).
`git diff --check`: 종료 0, tracked whitespace 오류 없음, 기존 CRLF 경고.
README·현재 작업분류·CON-006 traceability·V3-AT-CON-004에 결과와 미완료 범위를 연결했다.

## 남은 범위와 다음 실행

CON-006은 내부 own-patient 초기 evidence RLS만 검증한 PARTIAL이다. 승인된 최소권한
관리자 evidence read 및 공개 audited read API는 구현하지 않았다. 일반 admin의 무조건
열람 권한을 추가하지 않는다. INVITED recipient는 clinical authority가 아니다.
전체 D6, WITHDRAWN/EXPIRED lifecycle, content replacement, Decision/Grant 및 공개 임상
HTTPS/Viewer는 미완료다. 실제 모델·IdP/KMS/PACS/Staging은 이번 실행에서 검증하지 않았다.

[다중 Session 잠금 순서 실행 프롬프트](../implementation/highpass-v3-p0-06-multisession-lock-order-prompt.md)를
작성하고 [기존 정적 lock audit](highpass-v3-lock-contract-audit-2026-10-08.md)에
현재 challenge/decision 경로를 추가했다. JOIN 내부 잠금 순서나 전체 workload의
deadlock 안전성을 문장 호출 순서만으로 주장하지 않는다. 사람 정책 미응답과 무관하게
안전한 기존 경합 검증은 계속 가능하다. 전체 목표는 active 상태로 유지한다.

권장 커밋: 합성 등록 환자 격리 helper/gate 연결 → 실행 보고서·다음 프롬프트·작업분류/
README/정적 audit 연결. 실제 commit/push/merge/PR 및 runtime DB 변경은 없다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
