# Compliance Evidence Pack

> 설계 참고자료 및 상용화 전환 백로그다. PIPA 법률 적합성, ISMS-P 인증, 병원 운영 승인을 PASS로 판정하지 않으며 각각 `DEFERRED — PRE-COMMERCIALIZATION`, `DEFERRED — PRE-PRODUCTION` 또는 외부 자원 필요 시 `BLOCKED`로 관리한다.

검토 기준일: 2026-08-26

이 디렉터리는 하이패스 Platform의 법률, ISMS-P, 병원 보안 심사 대응을 위한 추적 문서이다. 기술 테스트 통과를 법률 준수, ISMS-P 인증, 병원 운영 승인으로 해석하지 않는다.

## 범위

- 대상: 로컬 MVP/PoC, Control Plane API, PostgreSQL, Gateway, Orthanc mTLS proxy, Orthanc, Viewer, Docker Compose 네트워크
- 제외: 실제 환자정보, 실제 병원망, 실제 PACS/HIS/EMR, 운영 KMS/HSM, 외부 Staging, 정식 병원 계약, ISMS-P 심사
- 증적: `evidence/generated/<run-id>/manifest.json`

## 문서 구조

| 문서 | 목적 |
|---|---|
| `scope-and-boundary.md` | 시스템 경계, 역할, 제외 범위 |
| `data-flow-and-inventory.md` | 개인정보 흐름과 데이터 분류 |
| `legal-register.md` | 공식 법령·고시·가이드라인 출처 |
| `lawful-basis-matrix.md` | 데이터 항목별 처리 근거 후보 |
| `isms-p-control-matrix.md` | ISMS-P 대응 통제 매핑 |
| `hospital-security-checklist.md` | 병원 보안 심사 관점 체크리스트 |
| `risk-register.md` | 미충족 위험과 P0/P1 조치 |
| `evidence-index.md` | 증적 ID와 재현 명령 |
| `gap-remediation-plan.md` | 보완 순서와 책임 역할 |
| `privacy-impact-screening.md` | 개인정보 영향평가 사전 점검 |

## 자동 증적 수집

```powershell
$env:NODE_EXTRA_CA_CERTS=(Resolve-Path "tmp\certs\mtls\ca.crt").Path
pnpm run compliance:evidence
```

수집 스크립트는 모든 외부 명령에 timeout을 적용하고, 토큰·비밀번호·개인키 원문을 증적에 포함하지 않는다.
