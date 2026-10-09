# 비운영 Privacy 서비스 자격증명 분리 Runbook

범위: 합성 데이터·로컬 기술 검증. 실제 기관·모델 사용 승인 또는 운영 준비 완료가 아니다.

## 설정과 전환

`HIPASS_PRIVACY_SERVICE_TOKEN`이 없으면 legacy shared 내부 토큰 동작을 유지한다. 활성화하려면 안전한 secret 관리 경로에서 **서로 다른 CSPRNG 생성 32-byte base64url 자격증명**을 제공한다. 실제 값을 문서·채팅·CLI 인자·로그·Git에 쓰지 않는다. 설정값이 빈 값, 허용 문자/길이 밖, 명백한 placeholder/반복값이거나 기존 토큰과 같으면 startup은 실패한다. 길이/문자 검사는 실제 엔트로피나 발급 적합성을 증명하지 않는다.

활성화 시:

- `privacy-service`의 role은 `INTERNAL_SERVICE`, scope는 `privacy:inspect` 하나다. 요청 header로 identity·scope·session을 바꿀 수 없다.
- 기존 `internal-service`는 `audit:write`, `gateway:introspect`만 유지하며 Privacy readiness/inspection에 접근하지 못한다.
- `approved_use_ref`는 requester가 `privacy-service`인 서버 등록 record에 정확히 연결되어야 한다. 기존 synthetic registry의 `internal-service` record는 자동 변경하지 않는다. 별도 합성 사용 record를 명시적으로 등록·검토하기 전 inspection은 정책 403으로 차단된다.
- 잘못된 서비스 token header가 존재하면 mock/OIDC 등 다른 인증 방식으로 fallback하지 않는다. 일반 사용자 인증 클라이언트는 해당 header를 보내지 않는다.

현재 Compose는 새 환경변수를 자동 전달하지 않는다. Docker에서 검증할 경우 별도 검토된 override의 `hipass-control-api.environment`에 아래 **참조만** 추가한다. secret 값 자체는 override 파일에 넣지 않는다.

```yaml
services:
  hipass-control-api:
    environment:
      HIPASS_PRIVACY_SERVICE_TOKEN: ${HIPASS_PRIVACY_SERVICE_TOKEN:?Provide the dedicated credential securely}
```

이 override는 선택적으로 적용하며 미설정 기본 스택을 깨뜨리지 않는다. `.env.example`에는 값이 아닌 설명만 제공한다. 공개 HTTPS edge는 여전히 `/internal/privacy/`를 API로 전달하지 않으므로 공개 접속 URL로 사용하지 않는다. 허용된 내부 네트워크/TLS 설계는 별도 게이트다.

## 검증 및 교체

```powershell
node --test test/privacy-service-identity.test.js test/privacy-filter.test.js
node scripts/privacy-local-integration-check.js
```

전용 토큰의 감사·Gateway 호출은 403 `SERVICE_SCOPE_REQUIRED`; 잘못된 토큰은 401; 모델 미준비 상태에서 허용된 readiness 호출은 503이다. 503을 인증 실패나 모델 실행 성공으로 기록하지 않는다.

설정 기반 정적 token이므로 issuer/audience/자동 만료는 없다. 교체는 새 secret 제공 → 환경 교체·재시작 → 허용 및 이전 token 거부 재검증 순서다. 무중단 HA rotation은 구현되지 않았다. 전용 token이 활성화된 환경에서 제거하면 legacy shared 토큰의 Privacy 권한이 복구되므로, 이를 조용한 rollback으로 실행하지 않는다. rollback 필요 시 서비스 중단·정책 영향 검토 후 명시적으로 결정한다.

scope 분리는 완전한 egress·tenant 격리, 실제 MFA/IdP/KMS, 외부 Staging 또는 전체 deadline을 증명하지 않는다.

## 전체 요청 시간 예산

후속 구현은 `HIPASS_PRIVACY_REQUEST_TIMEOUT_MS`(기본 30000, 정수 1~60000ms)를 Privacy handler 진입 시 적용한다. 본문 수신·queue·countTokens·detect가 같은 예산을 공유하며, readiness도 적용 대상이다. HTTP header 수신 전·TLS handshake는 이 handler budget 밖이며 해당 ingress/server timeout을 별도로 검증해야 한다.

초과 시 504 `MODEL_TIMEOUT`, 연결 종료 시 취소한다. 취소한 queue 작업은 제거하고 실행 중 child는 종료 요청 후 1초에 강제 종료를 시도한다. 실제 close 전까지 슬롯을 잡아두므로 늦은 결과나 새 작업으로 자원 한도를 넘지 않는다. OS가 close를 확인하지 못하면 슬롯을 격리 상태로 유지하며 운영자의 프로세스 상태 점검이 필요하다. 완료되지 않은 child를 완료했다고 기록하지 않는다.

자동 재시도는 없다. 재시도는 정책·자원 상태를 재확인한 뒤 명시적으로 실행하며 중복 추론 비용이 생길 수 있다. 이 API는 반출을 하지 않고 durable job/audit receipt도 제공하지 않으므로 timeout을 근거로 반출을 재시도하거나 성공으로 기록하지 않는다.
