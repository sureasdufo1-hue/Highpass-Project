# Evidence Index

검토 기준일: 2026-08-26

자동 증적은 `pnpm run compliance:evidence`로 생성한다. 출력 위치는 `evidence/generated/<run-id>/`이며, `manifest.json`에 SHA-256이 기록된다.

| Evidence ID | 통제 | 재현 명령 | 기대 | 민감정보 |
|---|---|---|---|---|
| EV-ENV-001 | Docker 서비스 상태 | `docker compose ps --format json` | PASS | 없음 |
| EV-NET-001 | 네트워크 분리 | `pnpm run security:network` | PASS | 없음 |
| EV-MTLS-001 | mTLS 정상·음성 | `pnpm run test:mtls-negative` | PASS | 개인키 원문 없음 |
| EV-CERT-001 | 인증서 메타데이터 | `pnpm run compliance:evidence` | PASS | fingerprint만 |
| EV-SEC-001 | Security Gate | `pnpm run security:gate` | PASS | 없음 |
| EV-VULN-001 | 컨테이너 취약점 Gate | `pnpm run security:container` | PASS | 없음 |
| EV-EXP-001 | 예외·인증서 만료 Gate | `pnpm run ops:expiry` | PASS | 없음 |
| EV-CERTFIX-001 | 만료 fixture 분리 | `pnpm run test:cert-fixtures` | PASS | 없음 |
| EV-E2E-001 | HTTPS E2E | `pnpm run e2e:https` | PASS | access token 출력 금지 |

## 증적 한계

로컬 PoC 증적은 병원 운영 승인, 법률 의견, ISMS-P 인증서를 대체하지 않는다. 외부 Staging, 실운영 KMS, 병원 IdP, 실제 PACS, 위탁계약은 BLOCKED로 남긴다.
