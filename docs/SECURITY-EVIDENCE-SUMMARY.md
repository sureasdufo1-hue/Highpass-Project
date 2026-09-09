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
| PF-0 PostgreSQL/RLS | `pnpm run privacy:db-gate` | PASS |
| 개발 인증서 rollback | `pnpm run test:cert-rollback` | PASS |

2026-09-09 검증 기준선은 `9f3c8cc376808d1c0f452312c071b2a0522c7546`이다. Phase 5 Gate 5/5와 내부 MVP 14/14 단계, Node 139/139, HTTPS·mTLS·네트워크 경계, PF-0 DB/RLS가 PASS했다. 최신 Orthanc fresh Trivy 결과는 scanner Critical 1, confirmed runtime Critical 0, High 0이며 현재 이미지에 적용되는 High 예외는 0건이다.

최신 실행의 SHA, 실행시각, 종료 코드, 해시와 상태는 생성된 `manifest.json`을 기준으로 한다. 기존 생성물은 기준 문서가 아니라 실행 당시 DRAFT 스냅샷이다.

## 패키지 매니저 재현성

- 저장소와 CI는 `pnpm@11.7.0`, Node.js 24를 고정한다. lockfile은 변경하지 않았다.
- 현재 Windows에서는 검증된 `pnpm 11.7.0` 실행 경로로 전체 로컬 Gate를 실행했다.
- 새 환경에서 Corepack cache가 없으면 해당 버전 확보와 서명 확인을 위해 레지스트리에 접근할 수 있다. 제한망 실패는 `ENVIRONMENT_BLOCKED`로 기록한다.
- 서명·TLS 검증 완화, lockfile 재생성, 바이너리 vendoring은 하지 않았다.
- 네트워크 허용 환경의 재검증 명령은 `corepack pnpm --version`, `pnpm install --frozen-lockfile`, `pnpm run security:gate`다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`
