# PHR-W09/W10 실행 보고서 — 종단검증·시연 고정·증적

작성일: 2026-09-11  
기준 SHA: `96e20cd19357cf0e07c0e389f74456d1c1b0d129`  
범위: CAPSTONE MVP / 합성 데이터 / 로컬 Docker Compose

## 다음 게이트 결정

W08 handoff 구현 후 다음 로컬 게이트를 W09 회귀·음성·장애 검증과 W10 시연·증적 고정으로 결정했다. 실제 IdP·PACS·법률·병원 승인 항목은 이 게이트의 완료조건이 아니며 상용화 백로그에 남긴다.

## 실행 결과

| 검증 | 명령/증적 | 결과 |
|---|---|---|
| Docker/Compose 사전점검 | `pnpm run mvp:preflight` | PASS, Engine 29.7.2 |
| Compose 기동·readiness | `pnpm run mvp:start` | PASS, 6개 서비스 healthy, HTTPS 200 |
| 단위·통합 회귀 | `pnpm test` | PASS, 148/148 |
| HTTPS E2E | `pnpm run mvp:verify` 내부 `https-e2e` | PASS |
| mTLS 정상·음성 | `pnpm run mvp:verify` 내부 `mtls-positive-negative` | PASS |
| 네트워크 경계 | `pnpm run mvp:verify` 내부 `network-boundary` | PASS |
| Security/Container Gate | `pnpm run mvp:verify` 내부 게이트 | PASS |
| 증적 수집 | `pnpm run compliance:evidence` (Compose 환경변수 지정) | PASS |
| 증적 manifest | `evidence/generated/2026-09-10T22-42-19-136Z/manifest.json` | 9/9 무결성 PASS |
| 브라우저 Viewer | `scripts/run-browser-authorization-trace.ps1` | PASS, QIDO/WADO/Viewer 로드 |
| 토큰 URL 노출 | 브라우저 네트워크 trace | PASS, query/storage 미노출 |

## W09 판정

- 정상 PHR→동의→단기 토큰→Gateway→Viewer 경로: PASS
- 동의 없음·범위 밖·병원 불일치·만료/철회·위조·mTLS 음성: PASS
- Orthanc 직접 접근 차단과 네트워크 경계: PASS
- 감사·hash chain·증적 생성: PASS
- Windows OPF fixture cold-start 변동은 정상 경로 2초 제한으로 안정화했고, 30ms timeout 음성 시험은 유지했다.

## W10 판정

- 재현 명령과 Demo Runbook 사용 가능: PASS
- 합성 데이터·개발 인증서·로컬 환경 한정: 확인
- 증적은 `DRAFT / UNASSIGNED`로 보존: 독립 검토자 승인 전까지 유지
- PIPA 적합성, ISMS-P 인증, 병원 운영 승인, 실제 IdP/PACS: `DEFERRED/BLOCKED`

최종 한정 문구:

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`
