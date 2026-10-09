# 환자 동의 결정 — 만료 경계·실제 lock 대기 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자 김범희. 신규 기술 증적의 독립 사람 검토는 미완료다.
관련 CON-001~006, AUTH-001/004, IAM-003/004, TEN-003,
FR-001~005/014~020/037~041. 전체 MVP/v3 완료는 선언하지 않는다.

## 실행·변경

[준비된 실행 프롬프트](../implementation/highpass-v3-p0-06-decision-deadline-races-prompt.md)를
실행했다. 기존 service·private factory·025/026 계약을 확인한 후 신규
`scripts/test-support/patient-decision-deadline-fixture.js`를 기존 owned PG gate에
연결했다. 실제 runtime 보안 정책·서비스·DB·외부 통신·공개 API는 변경하지 않았다.
테스트 전용 발급기의 짧은 재인증 정책으로 실제 유한 challenge를 발급하며,
서명된 합성 patient binding만 사용한다. 시스템 시계·DB 시각·nonce를 위조하거나
runtime 만료 검사를 우회하지 않는다.

## 추가한 실제 PG 증명 7개

| 검증 | 실제 결과 | 판정 |
| --- | --- | --- |
| 소비하지 않은 challenge 만료 | 새 결정 CEREMONY_EXPIRED, 신규 저장 없음 | PASS |
| 소비 완료 후 challenge 만료 | 현재 fresh patient/live parent에서 원본 receipt 그대로, 추가 행 없음 | PASS |
| receipt까지 INSERT 후 challenge 만료 | COMMIT 미시도, CONSENT_EXPIRED, 7개 테이블 원상 유지 | PASS |
| receipt까지 INSERT 후 private 재인증 만료 | SYNTHETIC_REAUTH_REQUIRED, COMMIT 미시도, 7개 테이블 원상 유지 | PASS |
| 최종 JS 검사 후 실제 COMMIT 중 challenge 만료 | deferred assembly 23514, client COMMIT_OUTCOME_UNKNOWN, DB 기록 증가 없음 | PASS |
| 실제 Session lock 대기 후 challenge 만료 | blocker PID 관계·Lock wait 관측, 해제 후 CEREMONY_EXPIRED | PASS |
| 실제 수신 병원 및 patient reference lock 대기 후 challenge 만료 | 각각 blocker 관계·Lock wait 관측, 해제 후 CEREMONY_EXPIRED | PASS |

표의 첫 두 행은 하나의 필수 시나리오이며 마지막 행은 2개 시나리오다.
총 추가 assertion 7개, 기존 120개와 합계 127개다. lock 경쟁은
`pg_stat_activity.wait_event_type='Lock'`와 `pg_blocking_pids`로 확인했으며
식별값·PID·query 원문은 증적에 출력하지 않는다. polling은 1,200 ms,
실제 DB sleep은 검사된 짧은 deadline까지만 적용하고 기존 query/transaction
timeout 안에서 종료한다. 모든 pending rejection을 관측하고 blocker rollback 및
서비스 dispose를 finally에서 수행한다.

COMMIT 결과 불명확은 client 관점의 보수적 오류다. 이 fixture에서는 별도 owner
조회로 불저장을 확인했지만 실제 연결 장애의 결과를 항상 rollback이라고
단정하지 않는다. receipt는 과거 증명이며 새 authority/nonce 소비가 아니다.

## 실행 결과·증적

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| 신규 helper/연결 fixture/schema checker `node --check` | 0 | 문법 PASS |
| `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 127/127, 89,557 ms, sourceUnchanged=true, cleanup PASS |
| `node scripts/verify-evidence-manifest.js <manifest>` | 0 | SHA-256 무결성 PASS, DRAFT 1 / UNASSIGNED 1 |
| PG 종료 후 `node --test --test-concurrency=1` | 0 | PASS 464/464, 88,758.735 ms |
| `node scripts/security-secret-scan.js` | 0 | PASS findings 0, 2026-10-08T04:53:05.973Z |
| tracked 변경 `git diff --check` | 0 | whitespace 오류 없음, 기존 CRLF 경고 |

[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-51-11-826Z-6f3d563b/manifest.json),
[결과·source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-51-11-826Z-6f3d563b/schema-check.json).
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 코드 해시,
Node v24.18.0 기준. 테스트용 postgres container는 exact owned removal 및
별도 부재 관측 PASS다. 자동 생성물은 ignored 증적이며 기준 보고서는 보존한다.

이전 identity PG 427/427 결과는 [이전 실행 기록](highpass-v3-patient-decision-execution-2026-10-08.md)에
보존한다. 이번 변경은 decision test helper만 확장했으며 identity PG를 이번
턴에서 다시 실행했다고 주장하지 않는다.

## 남은 검증·다음 실행

- 준비/부모 만료를 서로 종속된 challenge 만료와 분리한 INSERT/COMMIT 경계 검증.
- 실제 COMMIT 중 private reauth 만료의 SQL guard 검증.
- 기관 중지·reference 삭제·감사된 취소·만료의 양방향 경쟁과 전체 D6 lock DAG.
- 완전한 등록된 다른 환자/기관 RLS 행렬, withdrawal/expiry/replacement event 모델.
- AuthorizationDecision·TransferGrant·후속 임상 authority·공개 HTTP/UI·전체 API HA.
- 실제 model/IdP/KMS/PACS/Staging·새 독립 사람 검토 및 상용화 법무/운영 승인.

이번 7개 PASS를 위 항목의 완료로 확장하지 않는다. schema gate의 넓은
notVerified deadline/D6 항목도 완전 검증 전까지 유지한다.
[다음 실행 프롬프트](../implementation/highpass-v3-p0-06-parent-expiry-mutation-races-prompt.md)를
작성하고 취소/만료 service의 실제 Session UPDATE lock, event/audit/cascade/receipt
구조 분석을 시작했다. 다음 owned fixture로 이어간다. commit/push/merge/PR,
사용자 파일 삭제 또는 실제 runtime schema 변경은 수행하지 않았다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
