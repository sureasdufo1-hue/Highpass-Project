# Consent L1~L5 승인 반영·철회 입력 검증 결과

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
정책 검토자·승인자 김범희, 승인일 2026-10-08 (Asia/Seoul).
정책 승인 근거: 사용자의 직접 답변 `L1~L5 기준안 채택`.
이 승인은 새 기술 증적의 독립 검토·운영/법률 승인 또는 기술 PASS가 아니다.

## 작업 목적·관련 요구사항

V3-FR-CON-003/005/006, V3-SR-AUTH-004/AUD-001/TEN-001,
FR-001~005/014~025/037~041. 정책 패킷·ADR·API·ERD·요구사항·추적행렬·수용기준을
정렬하고 [실행 프롬프트](../implementation/highpass-v3-p0-06-withdraw-command-prompt.md)를 실행했다.

## 기존 구조·구현·보안 검토

기존 Node ESM 및 V3PrincipalRegistry의 private WeakMap binding, TestProvider의 서명된
합성 재인증을 유지했다. 새 `src/v3-patient-consent-withdraw-command.js`는 별도의
PATIENT/consent:withdraw를 요구한다. consent:approve나 일반 admin 권한을 승계하지 않는다.
정확한 selector 3개(consentId/contentVersion/expectedEventSequence), 초기 v1/sequence2만
허용하며 body authority/추가 필드/symbol/prototype/accessor/잘못된 타입을 거부한다.
정규화·불변 command를 원래 private binding에 묶고 재사용 시 토큰 및 재인증 만료를 재검증한다.
테스트는 실제 서명·registry-issued 합성 binding을 사용하며 DB 성공을 mock하지 않는다.

이것은 입력 출처 검증만 구현한다. DB ownership, source ACTIVE/live ref, 현재 동의
상태/DB clock, 철회 event3/감사/receipt/cascade는 아직 구현·검증하지 않았다.
runtime enrollment·DB migration·공개 API·Grant는 활성화하지 않았다. 실제 MFA/IdP도 미검증이다.

## 실행한 명령·결과

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --test test/v3-patient-consent-withdraw-command.test.js` | 0 | PASS 8/8, 224.7371 ms |
| `node --test` | 1 | FAIL: 472개 중 471 PASS/1 FAIL, 40,108.6034 ms |
| `node --test --test-concurrency=1` | 0 | PASS 472/472, 88,798.0383 ms; fail/cancel/skip 0 |
| parser/test 각각 `node --check` | 0 | 문법 PASS |
| `git -c core.safecrlf=false diff --check` | 0 | PASS |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0; 2026-10-08T06:05:29.372Z |

병렬 전체 회귀 실패는 기존 privacy-isolated-http 테스트의 model-unavailable,
output-overflow, token-limit-before-detect, queue-full-and-total-timeout assertion이다.
해당 HTTP fixture는 1,500 ms deadline/합성 Python child를 사용한다. 동시 부하에 따른
시간 민감성은 추정이며, 근본 원인은 확정하지 않았다. 실패를 PASS로 바꾸지 않고
파일 단위 직렬 재검증은 472/472 PASS로 종료했다. 병렬 실행 안정성/근본 원인은 잔여 조사
항목이며 직렬 PASS로 최초 실패를 지우지 않는다. 테스트 삭제/skip·deadline·인증·TLS 완화는 하지 않았다.

기존 실제 Session create/PENDING/decision PG gate 181/181은 이전 scoped 증적이며,
이 새 parser 또는 미구현 withdrawal 서비스의 DB 검증으로 확대 해석하지 않는다.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`와 미커밋 코드 기준이다.

## 파일·다음 gate·미검증

신규: withdrawal parser/test, 실행 프롬프트, 이 보고서, additive DDL 다음 프롬프트.
수정: 정책 패킷·ADR·API·ERD·요구사항·추적행렬·수용기준·master plan·README 및
create/PENDING 실행 보고서의 실제 정책 승인/기존 Node 결과.
기존 사용자 변경 보존; commit/push/merge/PR 없음. 권장 분리: 정책 정렬 → parser/tests → 보고서.

다음은 [additive lifecycle DDL gate](../implementation/highpass-v3-p0-06-consent-lifecycle-ddl-prompt.md).
프롬프트를 작성·읽고 026 초기 event CHECK와 reciprocal audit FK의 경계 분석을 시작했다.
기존 event CHECK는 sequence1/2만 허용하므로 상태 문자열만 추가해 후속 철회를 구현하지 않는다.
새 DDL은 아직 작성·실행하지 않았다.
철회/만료 실제 서비스·전체 D6·새 증적 독립 검토·audited 최소 read·v3 Grant/임상 HTTPS/Viewer는
미완료다. 실제 IdP/KMS/PACS/Staging 및 법률/PIPA/ISMS-P/병원 운영 승인은 DEFERRED/BLOCKED.
전체 MVP/v3 완료는 선언하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
