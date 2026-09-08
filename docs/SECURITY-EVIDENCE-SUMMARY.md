# Security Evidence Summary

증적은 합성 데이터 기반 로컬 Capstone MVP에만 적용된다. 자동 생성 결과는 `evidence/generated/`에 저장되고 Git에서 제외한다. 검토 전 상태는 항상 `DRAFT / UNASSIGNED`다.

| 통제 | 검증 방법 | 기대 상태 |
|---|---|---|
| RBAC/ABAC·동의·토큰 | `node --test` | PASS |
| HTTPS 전체 흐름 | `node scripts/e2e-integration-test.js` | PASS |
| mTLS 정상·음성 | `node scripts/mtls-negative-check.js` | PASS |
| 네트워크 분리 | `node scripts/security-network-check.js` | PASS |
| 인증서 만료 정책/fixture | expiry 및 cert fixture script | PASS/WARNING |
| 의존성 audit | `node scripts/security-gate.js` | PASS 또는 ENVIRONMENT_BLOCKED |
| 컨테이너 취약점 예외 | container gate | PASS 또는 ENVIRONMENT_BLOCKED |

최신 실행의 SHA, 실행시각, 종료 코드, 해시와 상태는 생성된 `manifest.json`을 기준으로 한다. 기존 생성물은 기준 문서가 아니라 실행 당시 DRAFT 스냅샷이다.

## 패키지 매니저 재현성

- 저장소와 CI는 `pnpm@11.7.0`, Node.js 24를 고정한다. lockfile은 변경하지 않았다.
- 현재 Windows에는 npm shim 형태의 `pnpm.cmd`가 있으나 실제 11.7.0 바이너리는 Corepack cache에 없다.
- Corepack 0.35.0은 해당 버전을 확보하기 위해 레지스트리에 접근하며, 제한망/샌드박스에서는 cache 생성 또는 서명 확인 단계에서 중단된다.
- 서명·TLS 검증 완화, lockfile 재생성, 바이너리 vendoring은 하지 않았다.
- 네트워크 허용 환경의 재검증 명령은 `corepack pnpm --version`, `pnpm install --frozen-lockfile`, `pnpm run security:gate`다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`
