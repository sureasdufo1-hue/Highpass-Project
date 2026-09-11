# Phase 6 Evidence Index — PHR-W05

## Baseline

- Validated code SHA: `1754f259a5e06b6a6ca96a13f0e132d30c7b058d`
- Generated evidence root: `evidence/generated/2026-09-09T06-15-58-357Z/`
- Review status: `DRAFT / UNASSIGNED`
- Data classification: synthetic-only; manifest flags `containsPersonalData=false`, `containsSecrets=false`

## Results

| Evidence | Result |
|---|---|
| PHR-W05 targeted test | PASS, 6/6 |
| Node unit/integration | PASS, 144/144 |
| Browser PHR summary | PASS, synthetic patient A and one ImagingStudy |
| Browser PHR consent | PASS, MAPPED scope produced ACTIVE consent |
| Browser console | PASS, warning/error 0 |
| URL/token/UID exposure | PASS, no token query/storage and no DICOM UID in PHR UI |
| Docker Compose | PASS, six required services healthy |
| PF-0 PostgreSQL/RLS | PASS after final-server readiness race correction |
| Development certificate rollback | PASS |
| Fresh Trivy | PASS, image `sha256:8ebb9d6329d7e1b54b5b0754f2105b66645bf2a6c7292805c80c2342d9910f1e`, 1 scanner Critical/0 confirmed runtime Critical/0 High |
| CycloneDX SBOM | PASS |
| Capstone MVP gate | PASS |

PHR-W05 UI와 기존 W07 서비스 수직경로는 각각 검증됐다. 환자 PHR의 opaque 참조를 의료진 Viewer 역할로 전달하는 단일 브라우저 handoff는 W08/W09이며 PHR-T15는 `PARTIAL PASS`다.

자동 PASS는 사람의 독립 검토 서명, PIPA 법률 판단, ISMS-P 인증, 병원 운영 승인 또는 실제 MyHealthWay/IdP/PACS 검증을 의미하지 않는다.

## 2026-09-11 W09/W10 갱신

W08 handoff 이후 W09/W10 종단검증과 시연 고정을 완료했다. 최신 기준 SHA는 `96e20cd19357cf0e07c0e389f74456d1c1b0d129`이며, 최신 evidence manifest `evidence/generated/2026-09-10T22-42-19-136Z/manifest.json`은 9/9 source hash 및 confinement 검증 PASS다. 브라우저 Viewer trace는 HTTPS, QIDO, WADO, Bearer header, token URL 비노출을 PASS로 확인했다. 기존 표의 W05 시점 결과는 역사적 기준선으로 보존하며, 현재 PHR-T15 로컬 합성 종단 판정은 PASS로 갱신한다.

## 2026-09-11 MVP gate refresh

최신 발표 패키지 게이트는 기준선 `343021d62971724856ff351a277c6d71642c24a5`에서 재실행했다. `pnpm run mvp:finalize`는 PF-0 DB/RLS, 개발 인증서 rollback, fresh container scan, CycloneDX SBOM, 내부 MVP 14/14를 모두 PASS했다. 최신 manifest는 `evidence/generated/2026-09-11T11-05-03-661Z/manifest.json`이며 9/9 source hash 및 confinement 검증 PASS, 상태는 `DRAFT / UNASSIGNED`다. `pnpm test`는 148/148 PASS다. 이 갱신은 로컬 합성 MVP 증적이며 PIPA, ISMS-P, 병원 운영 승인 또는 Production Readiness를 의미하지 않는다.
