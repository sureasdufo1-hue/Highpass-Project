# 환자 동의 결정 — 부모 만료·기관/참조 변경·취소 경쟁

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자 김범희. 새 기술 증적의 독립 사람 검토·승인은 미완료다.
관련 CON-001~006, AUTH-001/004, IAM-003/004, TEN-003,
FR-001~005/014~020/037~041. 전체 Highpass MVP/v3 완료는 선언하지 않는다.

## 실행·현재 증명

[실행 프롬프트](../implementation/highpass-v3-p0-06-parent-expiry-mutation-races-prompt.md)를
진행했다. 기존 026·private service·parent 취소/만료의 event/audit/cascade/receipt
및 lock 계약을 확인하고 두 test-only helper를 추가했다.

| 신규/보강 시나리오 | 실제 결과 | 판정 |
| --- | --- | --- |
| 기관 중지 먼저, 실제 lock 대기 후 ROLLBACK | 초기 결정 ACTIVE 기록 성공 | PASS |
| 기관 중지 먼저, 실제 lock 대기 후 COMMIT | TARGET_UNAVAILABLE, 신규 7개 테이블 행 수 동일 | PASS |
| 환자 참조 soft delete 먼저, 실제 lock 대기 후 ROLLBACK | 초기 결정 ACTIVE 기록 성공 | PASS |
| 환자 참조 soft delete 먼저, 실제 lock 대기 후 COMMIT | SOURCE_REF_UNAVAILABLE, 신규 저장 없음 | PASS |
| 최종 JS 검사 뒤 실제 COMMIT 안에서 재인증 만료 | SQL23514, client COMMIT_OUTCOME_UNKNOWN, 신규 저장 없음 | PASS |
| short parent 만료 후 결정/원본 receipt 재조회 | 둘 다 SESSION_EXPIRED, 추가 행 없음 | PASS |
| INSERT 후 연동된 preparation/parent/challenge 만료 | COMMIT 미시도, CONSENT_EXPIRED, 신규 저장 없음 | PASS |
| 실제 COMMIT 중 연동된 preparation/parent/challenge 만료 | SQL23514, client 결과 불명확, 신규 저장 없음 | PASS |
| 감사된 취소 먼저, 실제 대기 중인 결정과 기존 receipt | 취소 event/audit/cascade/result 확정 후 VERSION_MISMATCH, 신규 저장 없음 | PASS |

추가 8개 assertion 및 기존 취소 assertion의 실제 경쟁 보강으로 최종 135개다.
부모를 seed할 때 Session/resources/participants/creation audit/context/result와
preparation/scopes/actions/audit/result를 한 transaction으로 조립한다. 기존
immutable parent를 UPDATE해 만료시각을 조작하지 않는다. 생성은 fixture owner,
환자 결정은 제한된 nonowner/private signed synthetic binding을 사용한다.

변경 transaction의 COMMIT/ROLLBACK 전 `pg_stat_activity`의 Lock wait 및
`pg_blocking_pids` 관계를 관측했다. 식별값/PID/query 원문은 증적에 출력하지 않는다.
의도적인 짧은 실제 deadline 안의 sleep과 polling은 bounded다. 기관·참조 복구는
owned disposable fixture에서만 수행하고, pending 결과·blocker rollback·service
dispose를 finally에서 관측한다.

중요 한계: preparation 범위가 parent 이내이고 challenge가 그보다 길 수 없으므로
세 deadline은 종속된다. 위 2개 저장 경계 시험은 **연동된 유효기간 차단 증명**이지
각 guard를 독립적으로 제거해도 남은 guard가 작동한다는 세 가지 독립 증명이 아니다.
취소는 실제 DDL proof를 갖춘 owner transaction으로 실행했으며, 실제 nonowner
cancel service와의 양방향 경쟁 완료로 과장하지 않는다.

## 실제 명령·증적

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| 새 helper/연결 fixture의 `node --check` | 0 | 문법 PASS |
| 중간 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | 132/132 PASS, 102,262 ms, cleanup/sourceUnchanged PASS |
| 최종 같은 PG gate | 0 | 135/135 PASS, 88,374 ms, cleanup/sourceUnchanged PASS |
| 최신 manifest `node scripts/verify-evidence-manifest.js <manifest>` | 0 | 무결성 PASS, DRAFT 1/UNASSIGNED 1 |
| PG 종료 후 `node --test --test-concurrency=1` | 0 | 464/464 PASS, 78,780.530 ms |
| `node scripts/v3-lifecycle-document-check.js` | 0 | 문서 정적 검사 PASS; anchor/semantic OpenAPI/사람 승인/runtime 미검증 |
| `node scripts/security-secret-scan.js` | 0 | 발견 0, 2026-10-08T04:58:58.039Z; 보고서 등록 뒤 다시 실행 |

최종 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-58-45-402Z-c79c1259/manifest.json),
[결과·source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-58-45-402Z-c79c1259/schema-check.json).
중간 증적 `hp-v3-ceremony-schema-2026-10-08T04-56-50-262Z-fdb06b49`도 보존했다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, 미커밋 코드 hash,
Node v24.18.0 기준. 실제 runtime 스택/DB/공개 API/Grant는 변경하지 않았다.
이번 턴에 identity PG·HTTPS·브라우저·실 PACS/model 시험은 다시 실행하지 않았다.

## 문서 정렬·잔여 작업

ERD·API alignment·Architecture·traceability·lifecycle dependency 문서에서 오래된
최초 동의 artifact NOT IMPLEMENTED를 실제 PARTIAL 구현으로 정정했다. 역사적
설계 gate 기록은 삭제하지 않았다. contentVersion1/eventSequence1..2만 구현되어
CON-003~006의 철회·만료·교체 version·최소 관리자 조회는 여전히 미완료다.

다음 [실행 프롬프트](../implementation/highpass-v3-p0-06-consent-lifecycle-alignment-prompt.md)는
승인-first 역순 경쟁 및 철회·만료 계약 정렬이다. 현재 event CHECK/initial assembly는
후속 이벤트를 허용하지 않으며 maintenance actor를 patient로 위장할 수 없다.
별도 최소권한·실제 actor·eventSequence·original receipt·cascade 요청 계약을
설계한 뒤 additive migration을 구현한다. 기관 중지/terminal parent 중 철회
admission 같은 핵심 미결정은 임의로 확정하지 않는다.

전체 D6/다중 Session lock DAG, 완전한 등록된 다른 환자·기관 RLS,
AuthorizationDecision/Grant/임상 흐름·공개 HTTPS/UI·전체 API HA 및 새로운 독립
사람 검토는 필수 잔여다. 실제 IdP/KMS/PACS/model/Staging은 외부 자원 검증 필요,
PIPA/ISMS-P/병원 운영 승인 등은 DEFERRED/BLOCKED다. commit/push/merge/PR은 없다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
