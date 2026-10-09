# Privacy 격리 HTTP 통합 검증·증적 결과

작성일: 2026-10-08. 결과 검토 상태: `DRAFT / UNASSIGNED`. 계획 채택 검토자·승인자는 김범희(2026-10-08)이며 신규 증적의 독립 검토·승인으로 자동 적용하지 않는다.

## 범위·구현

[실행 프롬프트](../implementation/highpass-privacy-isolated-http-evidence-prompt.md)를 실행했다. PF-R01~PF-R06, PF-R10~PF-R11, PF-R14, FR-042~FR-046에 관련된다. 실제 모델·TLS·외부 Staging이 아닌 **LOOPBACK HTTP / SYNTHETIC DATA / FAKE MODEL ONLY**다.

`src/privacy-http-handler.js`로 기존 Privacy handler를 최소 범위로 추출했다. 실제 `src/server.js`와 테스트가 같은 handler를 사용한다. runtime에 fake 모델 설정이나 공개 경로를 추가하지 않았다. 예기치 않은 내부 오류도 원문·stack 대신 고정 500 코드를 반환한다. 알 수 없는 내부 경로는 고정 `RESOURCE_NOT_FOUND` 404다.

`src/privacy-adapter.js`에는 비민감 process lifecycle 진단 counter와 수동 signal 연결·정리를 추가했다. 초기 Node 20에 없는 `AbortSignal.any` 의존을 제거했지만 **Node 20 실제 binary 실행은 NOT VERIFIED**다. 이번 실행은 Node `v24.18.0`이다. stdout 오류 listener 구현 자체와 stdout 출력 오류·overflow 시험을 구분하며 실제 OS stdout stream error 강제 재현은 미검증이다.

`scripts/test-support/privacy-http-fixture.js`는 loopback 임의 port, 명시적 합성 registry, 기존 fake bridge로 정상 마스킹부터 종료까지 시험한다. 필수 31개 ID의 누락·중복·NOT VERIFIED·cleanup 실패·active child 잔존을 gate 실패로 처리한다. 이를 확인하는 음성 단위 시험도 추가했다.

## 결과

| 검증 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node scripts/privacy-local-integration-check.js` | 0 | PASS 31/31, 6,643 ms, sourceUnchanged=true, source closure 44개 |
| 해당 manifest의 `node scripts/verify-evidence-manifest.js <manifest>` | 0 | PASS evidence 1개, SHA-256 무결성, DRAFT 1/UNASSIGNED 1 |
| `node --test` (최종 gate coverage 코드 이후) | 0 | PASS 457/457, 38,591.221 ms |
| `node scripts/security-secret-scan.js` | 0 | PASS findings 0, 2026-10-08T04:32:04.788Z |
| tracked 변경 `git diff --check`, PyYAML/JSON parse | 0 | PASS; 전체 표준 OpenAPI/JSON Schema validator는 아님 |

최종 증적: [manifest](../../evidence/generated/hp-privacy-http-2026-10-08T04-31-10-325Z-7376af48/manifest.json), [결과 및 source hashes](../../evidence/generated/hp-privacy-http-2026-10-08T04-31-10-325Z-7376af48/result.json). HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 파일 해시에 묶었다. 자동 증적은 Git ignored이며 기준 문서는 결과 위치를 참조한다.

검증에는 정상 inspection의 마스킹·5 mm/발열 없음 보존·REVIEW_REQUIRED/PENDING/releaseEligible=false, 무인증/잘못된 token/공용 token scope, requester·기관·artifact·version·recipient·purpose·approved use 불일치, 잘못된 JSON/UTF-8·추가 필드·body/text/token 한도, 실제 fake child 출력 오류·overflow·모델 장애·spawn/stdio 오류, queue 포화·timeout·느린 body·실제 child 실행 중 client abort·queue 취소·listener 정리·종료 후 health가 포함된다.

main adapter는 spawned=15, closed=15, active=0, queued=0을 관찰했고 HTTP server/socket cleanup은 PASS다. 별도 spawn 실패·stdin failure·queue fixture의 close/active도 각 시험에서 확인한다. 원문·redacted preview·token·개인키·raw 내부 오류는 증적에 저장하지 않는다.

## 실패 보존·한계

첫 실행 [실패 manifest](../../evidence/generated/hp-privacy-http-2026-10-08T04-28-59-987Z-a925e3dd/manifest.json)는 0 assertions/cleanup NOT VERIFIED로 FAIL이었다. 원인은 source closure 검색이 테스트 문자열 안의 `import ... from`까지 실제 import로 오인한 것이며, 실제 import statement의 행 시작으로 제한해 수정했다. 파일은 삭제하지 않았다. digest verifier 성공은 gate 성공이 아니므로 이 실패를 PASS로 바꾸지 않았다.

generic manifest verifier는 저장된 result 파일의 무결성을 확인한다. 현 코드의 test 재실행·source closure 검증을 대체하지 않으며 최신 결과를 얻으려면 게이트를 다시 실행해야 한다. 전체 Node discovery의 live E2E/Staging runner 비실행 분기를 실제 E2E PASS로 해석하지 않는다.

실제 model checkpoint·모델 사용권·품질/잔존 후보 평가·외부 Staging·TLS/기관 네트워크·독립 사람 검토는 미검증 또는 외부 자원 필요 상태다. 전체 MVP/v3, 운영 승인, PIPA/ISMS-P 적합성 완료는 선언하지 않는다.

## 재현과 다음 작업

```powershell
node scripts/privacy-local-integration-check.js
# pnpm을 안전하게 사용할 수 있는 환경에서는 pnpm run privacy:verify-local
node scripts/verify-evidence-manifest.js <출력된-manifest.json-경로>
```

Corepack 다운로드·서명/TLS 검증을 우회하지 않는다. 실제 모델 없이 가능한 계약/HTTP 검증 범위를 명시적으로 완료했고, 실제 모델이나 품질 평가를 대체하지 않았다. [다음 실행 프롬프트](../implementation/highpass-privacy-handoff-v3-consent-resumption-prompt.md)에 따라 Privacy 외부 자원 인계를 보존하고, 핵심 v3 환자 동의 저장의 아직 미완료인 실제 PostgreSQL 검증을 재개한다. commit/push/merge는 실행하지 않았다.
