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
