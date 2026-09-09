# Phase 5 Evidence Index

## Baseline

- Validated code SHA: `9f3c8cc376808d1c0f452312c071b2a0522c7546`
- Generated evidence root: `evidence/generated/2026-09-09T05-35-19-746Z/`
- Review status: `DRAFT / UNASSIGNED`
- Data classification: synthetic-only; manifest flags `containsPersonalData=false`, `containsSecrets=false`

## Results

| Evidence | Result |
|---|---|
| Node unit/integration | PASS, 139/139 at validated SHA |
| Docker Compose | PASS, six required services healthy |
| HTTPS E2E | PASS |
| mTLS positive/negative | PASS |
| Network segmentation | PASS |
| Security Gate | PASS |
| Fresh Trivy | PASS, image `sha256:91f7c2446ddf4bff9c0342ebeb102c19501b661e97123a8f763c343cb8a18ec7`, 1 scanner Critical/0 confirmed runtime Critical/0 High |
| SBOM | PASS, CycloneDX 1.5 generated locally |
| PF-0 PostgreSQL/RLS | PASS |
| Development certificate rollback | PASS, isolated rehearsal |
| Certificate expiry | PASS, runtime certificates OK |

The generated evidence directory is intentionally ignored by Git and must be regenerated with `pnpm run mvp:verify` on another evaluator machine. Its manifest hashes every captured record. Human review has not been inferred from automated PASS results.
