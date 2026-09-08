# ISMS-P Control Matrix

검토 기준일: 2026-08-26

공식 KISA ISMS-P 절차와 인증기준을 기준으로 한 readiness 매핑이다. 인증 결과가 아니다.

| 기준번호 | 요구사항 | 적용 여부 | 구현 통제 | 구현 위치 | 검증 방법 | 증적 | 판정 | 보완조치 |
|---|---|---:|---|---|---|---|---|---|
| ISMSP-1.1 | 관리체계 수립 | YES | 거버넌스 문서 | `docs/governance/*` | 문서검토 | evidence index | PARTIAL | 조직 승인 필요 |
| ISMSP-1.2 | 위험관리 | YES | 취약점 예외 만료관리 | `security/container-vulnerability-exceptions.json` | `pnpm run ops:expiry` | EV-EXP-001 | PASS | 정기 위험위원회 필요 |
| ISMSP-1.3 | 정책·절차 | YES | 운영 runbook | `docs/operations/*` | 문서검토 | 문서 | PARTIAL | 병원 공동 승인 필요 |
| ISMSP-2.1 | 자산 식별 | YES | compose, inventory | `docker-compose.yml`, data inventory | evidence collect | EV-ENV-001 | PARTIAL | CMDB 미구현 |
| ISMSP-2.2 | 인적 보안 | YES | 역할 문서 | `docs/governance/access-control.md` | 문서검토 | 문서 | BLOCKED | 실제 인사 프로세스 없음 |
| ISMSP-2.3 | 외부자 보안 | YES | processor map | `THIRD-PARTY-AND-PROCESSOR-MAP.md` | 문서검토 | 문서 | BLOCKED | 계약 필요 |
| ISMSP-2.4 | 계정·권한 | YES | RBAC/ABAC | `src/auth.js`, policy tests | `npm test` | EV-SEC-001 | PARTIAL | 실제 IdP/MFA 미연동 |
| ISMSP-2.5 | 암호화 | YES | TLS/mTLS, token signing | compose, cert scripts | mTLS negative | EV-MTLS-001, EV-CERT-001 | PARTIAL | 운영 CA/KMS 필요 |
| ISMSP-2.6 | 네트워크 보안 | YES | Docker network segmentation | `docker-compose.yml` | `pnpm run security:network` | EV-NET-001 | PASS | 클라우드 VPC 검증 필요 |
| ISMSP-2.7 | 시스템 보안 | YES | health, non-public Orthanc | compose | Docker ps, E2E | EV-ENV-001 | PARTIAL | hardening benchmark 필요 |
| ISMSP-2.8 | 개발보안 | YES | unit/security gate | tests/scripts | `pnpm run security:gate` | EV-SEC-001 | PASS | SAST 확대 필요 |
| ISMSP-2.9 | 로그 관리 | YES | AuditLog, hash chain | `src/auditLog.js` | tests/E2E | EV-E2E-001 | PARTIAL | WORM/SIEM 미연동 |
| ISMSP-2.10 | 이상징후 | YES | rule-based detection | anomaly tests | `npm test` | EV-SEC-001 | PARTIAL | 운영 관제 미연동 |
| ISMSP-2.11 | 취약점 관리 | YES | dependency/container gates | scripts | container gate | EV-VULN-001 | PASS | 외부 pentest 필요 |
| ISMSP-2.12 | 사고 대응 | YES | runbook | `INCIDENT-RESPONSE-RUNBOOK.md` | 문서검토 | 문서 | PARTIAL | 모의훈련 필요 |
| ISMSP-2.13 | 재해복구 | YES | backup/rollback docs | `docs/operations/*` | 기존 증적 | operations docs | PARTIAL | 실제 DR site 없음 |
| ISMSP-3.1 | 개인정보 수집·이용 | YES | 동의 목적/범위 | consent API | E2E | EV-E2E-001 | PARTIAL | 법정 고지문 검토 필요 |
| ISMSP-3.2 | 제공·위탁 | YES | targetHospital scope | consent/policy | E2E | EV-E2E-001 | PARTIAL | 위탁계약 없음 |
| ISMSP-3.3 | 보유·파기 | YES | dry-run retention | `src/retention.js` | tests | EV-SEC-001 | PARTIAL | 실제 파기 승인 필요 |
| ISMSP-3.4 | 정보주체 권리 | YES | consent 조회/철회 | consent API/UI | E2E | EV-E2E-001 | PARTIAL | 열람·정정·삭제 절차 미완 |
| ISMSP-3.5 | 유출 대응 | YES | incident runbook | docs | 문서검토 | 문서 | PARTIAL | 법정 신고훈련 필요 |
