# Privacy 전용 최소권한 서비스 identity 실행 프롬프트

작성일: 2026-10-08. 선행: [Privacy API 계약 정렬](../privacy/API-CONTRACT-ALIGNMENT-2026-10-08.md).

## 목표

내부 서비스 토큰 하나가 Privacy·감사·Gateway 권한을 동시에 갖는 현재 구현을 비운영 환경에서 최소권한으로 분리한다. PF-R01, PF-R10~PF-R11 및 인증·접근통제 원칙에 관련된다. 실 IdP·OAuth2·운영 승인으로 오인하지 않는다.

## 순서

1. `src/auth.js`, `requireInternalService`, Privacy inspection scope 검사, 감사·Gateway 내부 handler와 startup configuration 검사 및 기존 인증 시험을 모두 확인한다.
2. Privacy 전용 token 설정을 추가할 최소 변경안을 정한다. 별도 `INTERNAL_SERVICE` principal과 고정 `privacy:inspect` scope만 허용하고 기존 서버 registry requester binding과 맞춘다. 원래 token과 중복·빈 값·취약 설정은 fail closed로 처리한다. 사용자 입력의 role/scope/requester를 신뢰하지 않는다.
3. 기존 shared token의 호환 범위를 명시하되 Privacy token으로 감사 기록·Gateway introspection 등을 호출할 수 없도록 실제 handler의 scope 검증을 점검·보완한다. 기능별 권한이 필요한 경우 `requireInternalService`만으로 충분하다고 가정하지 않는다.
4. secret 없이 configuration·OpenAPI·runbook을 정렬한다. 자격증명 전달·rotation은 별도 안전한 경로로 하고 env 값·raw token을 로그·증적에 출력하지 않는다.
5. 인증 성공, 잘못된 token, header role 위조, 누락 scope, 다른 내부 기능 호출, registry requester 불일치, 기존 정상 호출 회귀를 시험한다. 가능하면 격리 HTTP fixture에서 실제 응답까지 확인한다.
6. 전체 회귀와 secret scan을 실행하고 새 증적을 DRAFT / UNASSIGNED로 보고한다. 다음은 HTTP 전체 deadline·abort 계약이다.

## 경계

공개 edge에 Privacy 경로를 추가하거나 내부 HTTP 포트를 외부에 노출하지 않는다. TLS/mTLS 검증을 완화하지 않는다. secret 또는 checkpoint를 다운로드·발급·저장하지 않는다. 실제 병원·DB·IdP를 변경하지 않는다. commit/push/merge는 하지 않는다. 최소권한 분리가 실제 음성 시험으로 확인되기 전 완료/PASS를 기록하지 않는다.
