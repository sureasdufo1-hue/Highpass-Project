# Privacy 로컬 검증 인계 및 v3 환자 동의 결정 저장 재개 프롬프트

작성일: 2026-10-08. 선행: [Privacy 격리 HTTP 결과](../privacy/ISOLATED-HTTP-EVIDENCE-2026-10-08.md).

## 범위 결정

Privacy의 실제 모델·외부 URL·기관 품질 승인에는 추가 자원이 필요하다. 로컬 fake HTTP 결과를 실제 model/Staging PASS로 승격하지 않는다. 개인정보 연구 반출 확장이 핵심 환자 동의 기반 교류를 뒤로 밀지 않도록, 기존 승인된 v3 P0-06 최초 환자 결정 저장 구현·검증을 재개한다. 전체 Highpass MVP/v3 목표는 유지한다.

## 실행 순서

1. 현재 worktree와 [기존 동의 결정 저장 실행 프롬프트](highpass-v3-p0-06-patient-consent-decision-persistence-prompt.md)를 확인한다. Privacy 보고서의 외부 blocker·미검증을 유지한다. 새로운 사람 검토를 자동 승인하지 않는다.
2. 최신 요구사항 CON-001~006, 동의 persistence 계약·ADR·025 challenge issuance, 026 DDL와 `V3PatientConsentDecisionService`를 모두 분석한다. 기존 코드가 있다는 이유로 완료/PASS를 주장하지 않는다.
3. 현재 schema gate에 026이 포함되는지 확인한다. 지금 저장소 검색에서는 026/decision fixture 연결 근거가 없었으므로, owned synthetic PostgreSQL 환경에 additive migration을 적용·검증한다. live DB를 변경하지 않는다.
4. 기존 프롬프트에 정의된 APPROVE/REJECT·identityLink 독립 선택, nonce/context/scope/fresh reauth, actor 격리, 필수 snapshot/event/audit/consumption/receipt의 원자성을 구현·보완·실제 시험한다.
5. 같은/다른 key·challenge의 동일 preparation 경쟁, 취소·만료·기관 중지와 대기 deadline, commit ACK 유실 및 최초 typed receipt 재조회가 모순 없이 작동하는지 실제 PG 증적으로 확인한다. 원본 nonce/DEK/token을 저장·로그·반환하지 않는다.
6. Preparation PENDING/UNVERIFIED, Session 및 Mapping·Grant의 미활성 경계를 유지한다. 초기 artifact를 영상 접근 ALLOW로 연결하지 않는다. withdrawal/expiry/후속 권한·전송은 별도 필수 게이트다.
7. 전체 Node와 기존/새 PG 회귀, source hash/manifest, secret scan, exact owned cleanup을 수행하고 DRAFT / UNASSIGNED 보고서를 등록한다. 실패·미실행을 숨기지 않는다. 다음 lifecycle 프롬프트를 작성하고 승인된 범위에서 자동 진행한다.

## 금지

실제 환자·병원·KMS/IdP/PACS 사용, live schema 변경, TLS/mTLS·RLS·재인증 완화, commit/push/merge/PR 생성, 사용자 기존 변경 덮어쓰기 금지. 개인정보 문서·통제 매핑은 유지한다. 김범희의 계획 채택은 신규 증적의 독립 사람 검토 완료가 아니다. 전체 MVP/v3 완료는 실제 completion audit 전 선언하지 않는다.
