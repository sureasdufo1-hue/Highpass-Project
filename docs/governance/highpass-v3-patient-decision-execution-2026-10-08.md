# v3 최초 환자 동의 결정 저장·격리 검증 결과

2026-10-08 / PARTIAL IMPLEMENTATION / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자: 김범희, 2026-10-08. 신규 기술 증적의 독립 사람
검토·승인은 아직 적용하지 않는다. 전체 MVP/v3 완료는 선언하지 않는다.

## 실행 범위

[Privacy 인계·v3 재개](../implementation/highpass-privacy-handoff-v3-consent-resumption-prompt.md)와
[RLS 보강 프롬프트](../implementation/highpass-v3-p0-06-decision-rls-hardening-prompt.md)를 실행했다.
CON-001~006, AUTH-001/004, IAM-003/004, TEN-003,
FR-001~005/014~020/037~041에 관련된다.

기존 미커밋 026 DDL 및 내부 `V3PatientConsentDecisionService`를 보존하고,
owned disposable PostgreSQL gate에 연결했다. content version·scope·action·
PENDING/결정 event·audit·nonce hash consumption·최초 typed receipt를 하나의
transaction으로 검증했다. APPROVE의 identityLink true/false와 REJECT false가
구분된다. 동일 key 재시도는 원본 receipt를 재조회하며 추가 기록을 만들지 않는다.
변경된 command·재소비·잘못된 nonce/digest는 거부된다. COMMIT ACK 유실 후에는
결과 불명확 오류를 반환하고 저장된 receipt로 복구한다.

scope/action/event/audit/receipt 누락 주입 시 모든 신규 테이블의 행 수가
유지됨을 실제 DB로 확인했다. suspended target은 신규 결정과 receipt 재조회에
모두 거부된다. 동일 preparation의 서로 다른 challenge·key·선택은 최초 결정
하나만 저장된다. 이 병렬 기능 검증을 전체 D6 lock 대기 증명으로 취급하지 않는다.

제한된 nonowner 직접 SELECT는 본인 context에서 조회되고, context 없음·실제
HOSPITAL_ADMIN actor·미등록 actor·다른 tenant·다른 hospital에서는 7개 테이블 모두
0행이다. 이는 완전한 등록된 다른 환자/기관 행렬 검증이 아니다. owner의 7개
테이블 UPDATE/DELETE도 42501로 차단되며 행 수가 유지된다.

Preparation은 PENDING/UNVERIFIED, Session은 REQUESTED/version1,
수신 participant는 INVITED로 유지된다. 여기서 ACTIVE는 **최초 동의 증적의
상태**일 뿐 AuthorizationDecision·Grant·임상 영상 접근 ALLOW가 아니다.
live schema, runtime grants 및 공개 HTTP/UI 경로는 변경하지 않았다.

## 실제 실행 결과

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --test test/v3-patient-consent-decision-service.test.js` | 0 | PASS 7/7, 367.837 ms |
| 최초 `node --test` (두 PG gate와 동시 실행) | 1 | FAIL: Privacy HTTP 내 normal-masking-review-only, model-unavailable, output-overflow, queue-full-and-total-timeout |
| `node --test test/privacy-isolated-http.test.js` | 0 | 재실행 PASS 2/2, 12,020.832 ms; 앞선 실패를 삭제하지 않음 |
| `node --test --test-concurrency=1` | 0 | 최종 PASS 464/464, 86,080.898 ms |
| `node scripts/v3-patient-ceremony-schema-check.js` | 0 | 최종 PASS 120/120, 76,348 ms, sourceUnchanged=true, cleanup PASS |
| `node scripts/v3-identity-transaction-check.js` | 0 | PASS 427/427, 124,120 ms, sourceUnchanged=true, cleanup PASS |
| 각 최신 manifest의 `node scripts/verify-evidence-manifest.js <manifest>` | 0 | 두 증적 무결성 PASS, DRAFT/UNASSIGNED 유지 |
| `node scripts/security-secret-scan.js` | 0 | PASS findings 0, 2026-10-08T04:46:53.171Z |
| tracked 변경 `git diff --check` | 0 | whitespace 오류 없음; 기존 CRLF 경고 있음 |

동시 실행 실패 후 시험 내부 concurrency를 1로 제한해 전체 회귀를 재실행했다.
CPU/프로세스 경합 가능성이 있지만 정확한 OS 원인은 별도 측정하지 않았다.
Privacy runtime deadline·보안 정책을 완화하거나 실패를 PASS로 덮지 않았다.
다음 heavyweight gate는 전체 Node와 순차 실행한다. Node v24.18.0 기준이며
Node20 binary·live HTTPS/Viewer/PACS/model 검증을 이번 단위 결과로 대체하지 않는다.

증적: [최종 동의 schema manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-46-23-479Z-a219be76/manifest.json),
[120개 결과·소스 해시](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T04-46-23-479Z-a219be76/schema-check.json),
[identity manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T04-44-20-625Z-26f6a14e/manifest.json).
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 source hashes 기준이다.
초기 동의 gate 118/118 결과도 각각 04:38:58, 04:43:52 생성 디렉터리에 보존했다.
자동 생성 증적은 ignored이며 Git 보존 기준 문서는 이 보고서다.

## 파일 및 다음 게이트

신규 `scripts/test-support/patient-consent-decision-fixture.js`,
`test/v3-patient-consent-decision-service.test.js`, 실행 프롬프트·본 보고서를 추가했다.
기존 schema checker와 patient projection fixture를 연결하고 persistence 계약의
NOT IMPLEMENTED를 최초 artifact의 PARTIAL로 정정했다. README·작업 분류에 등록한다.
기존 사용자 변경을 삭제하지 않았고 commit/push/merge/PR은 수행하지 않았다.

[다음 실행 프롬프트](../implementation/highpass-v3-p0-06-decision-deadline-races-prompt.md):
COMMIT 경계의 challenge/reauth/preparation/parent 만료, 실제 lock 대기·취소·기관
경쟁 증명. 이후 withdraw/expiry·후속 authority·Grant·HTTP/UI가 필수 잔여 작업이다.
전체 API HA, 외부 IdP/KMS/PACS/Staging, 실제 model 품질 승인 및 신규 독립 사람 검토는
NOT VERIFIED 또는 외부 자원 BLOCKED를 유지한다. PIPA·ISMS-P·병원 운영 승인과
법무·영향평가 등은 상용화 전 DEFERRED/BLOCKED다.

권장 커밋 분리: (1) 026+내부 service+계약, (2) PG/단위 검증,
(3) 실행 프롬프트·governance·상태 문서. 실제 커밋은 별도 승인 후 수행한다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
