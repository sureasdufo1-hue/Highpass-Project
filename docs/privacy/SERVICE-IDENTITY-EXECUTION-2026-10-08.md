# Privacy 최소권한 서비스 identity 실행 결과

작성일: 2026-10-08. 증적 상태: `DRAFT / UNASSIGNED`.  
계획 채택 검토자·승인자: 김범희, 승인일 2026-10-08. 신규 결과의 사람 검토는 별도이며 자동 PASS 승인하지 않는다.

## 목적 및 구현

[실행 프롬프트](../implementation/highpass-privacy-least-privilege-service-identity-prompt.md)를 실행했다. PF-R01, PF-R10~PF-R11, FR-037~FR-041 및 FR-042~FR-046의 접근통제에 관련된다.

- `src/auth.js`: optional `HIPASS_PRIVACY_SERVICE_TOKEN`, 고정 `privacy-service` identity와 `privacy:inspect` 하나의 scope 구현. 설정 충돌·빈 값·명백한 취약값 차단, constant-time token 비교. caller header로 actor/scope/session을 선택하지 못함.
- 전용 token 활성화 시 기존 shared token의 Privacy scope 제거. 미설정 시 legacy 호환 유지. 잘못된 서비스 header가 존재하면 사용자 인증으로 downgrade하지 않고 401 처리.
- `src/server.js`: Privacy readiness에도 scope 검증; `/api/audit-logs`, `/gateway/audit`에는 `audit:write`, 내부 서비스의 `/gateway/token/introspect`에는 `gateway:introspect`를 본문 처리 전에 강제. 기존 security/platform admin introspection 경로 유지.
- `.env.example`: 실제 값 없는 optional 설정 설명. OpenAPI와 [전환 Runbook](PRIVACY-SERVICE-IDENTITY-RUNBOOK.md) 갱신.
- `test/privacy-service-identity.test.js`: caller 위조·잘못된 token·설정 충돌·scope·requester binding과 실제 격리 HTTP 시험 추가.

## 변경 영향

전용 token이 활성화된 경우 기존 shared token의 Privacy 요청은 403이다. `privacy-service`의 승인 registry requester가 미등록이면 inspection은 정책 403이며 자동 재등록·승인은 하지 않았다. 잘못된 service token과 사용자 인증을 함께 보내던 호출은 이제 401이므로 해당 header를 제거해야 한다. 다른 임상 API·UI·DDL·공개 edge는 변경하지 않았다.

## 검증

| 명령·시험 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --test test/privacy-service-identity.test.js test/privacy-filter.test.js` | 0 | PASS 29/29, 2,105.99 ms |
| `node --test` | 0 | PASS 451/451, 39,312.997 ms |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0, 2026-10-08T04:15:59.015Z |
| Privacy token → audit API/Gateway audit/introspect | 위 HTTP fixture 내 | PASS: 모두 403 `SERVICE_SCOPE_REQUIRED`, invalid JSON보다 권한검사가 먼저 적용됨 |
| Privacy token → readiness, 모델 없음 | 위 HTTP fixture 내 | PASS: 503, 인증 허용 후 model NOT_READY; 실제 추론 성공은 아님 |
| shared token → Privacy readiness (분리 활성) | 위 HTTP fixture 내 | PASS: 403 |
| shared token → Gateway audit/introspection | 위 HTTP fixture 내 | PASS: 정상 audit 201, token 누락 400; 기존 scope 경로 유지 |

HTTP fixture는 random port와 자체 temporary JSON store에서 실행하고 해당 child·temporary directory만 cleanup했다. 테스트용 random token은 메모리·child env에서만 사용했으며 실제 자격증명을 발급·출력·저장하지 않았다. 전체 Node PASS 중 live E2E/staging runner는 비실행 분기이므로 외부 실연동 PASS가 아니다.

## 남은 위험·미검증

설정형 token의 TTL·issuer·audience·tenant binding·무중단 rotation은 구현되지 않았다. 설정 기반 최소권한 분리가 실제 IdP/OAuth2 또는 완전한 병원별 격리를 대체하지 않는다. 기존 shared token에 남은 감사/Gateway 권한의 추가 분리는 별도 검토다.

실제 모델 checkpoint, 외부 Staging, TLS 경로, 독립 검토, DB·mTLS 전체 E2E는 이번 작업에서 검증하지 않았다. 새 환경변수를 현재 Compose에 실제 전달·배포하지 않았다. 적용 방법은 Runbook의 선택 override를 따른다.

다음은 [전체 deadline·abort 실행 프롬프트](../implementation/highpass-privacy-request-deadline-abort-prompt.md)다. 전체 MVP/v3 완료와 운영 승인·법률 적합성은 선언하지 않는다. commit/push/merge를 실행하지 않았다.
