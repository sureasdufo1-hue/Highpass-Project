# Runtime Security Validation

## 2026-09-11 Current local validation

The 2026-09-09 table below is retained as a historical snapshot. The current local Docker Engine is 29.7.2 and the latest technical gate was rerun at repository SHA `343021d62971724856ff351a277c6d71642c24a5`.

| Control | Current result |
|---|---|
| Docker Engine 29.7.2 | PASS |
| Six-service Compose readiness | PASS |
| HTTPS health on local demo port 3443 | PASS, HTTP 200 |
| Node regression | PASS, 148/148 |
| HTTPS consent-to-Viewer E2E | PASS |
| mTLS positive and negative cases | PASS |
| Network boundary / direct Orthanc denial | PASS |
| PF-0 PostgreSQL/RLS | PASS |
| Phase 5 final gate | PASS, 5/5 |
| Actual IdP / KMS / hospital PACS | NOT VERIFIED / BLOCKED |

The latest generated evidence manifest is `evidence/generated/2026-09-11T11-05-03-661Z/manifest.json` (9/9 hash and confinement checks PASS; review status `DRAFT / UNASSIGNED`).

## 2026-09-09 Superseding Local Validation

The Docker failure record below is retained as historical diagnosis. It is no longer the current local state.

| Control | Current result |
|---|---|
| Docker Engine 29.5.3 | PASS |
| Six-service Compose readiness | PASS |
| HTTPS health | PASS, HTTP 200 |
| Node regression | PASS, 139/139 at validated SHA `9f3c8cc376808d1c0f452312c071b2a0522c7546` |
| HTTPS consent-to-Viewer E2E | PASS |
| mTLS positive and six negative cases | PASS |
| Browser image rendering and bearer-header trace | PASS |
| Network boundary / direct Orthanc denial | PASS |
| PF-0 PostgreSQL migration and FORCE RLS | PASS |
| Actual IdP / KMS / hospital PACS | NOT VERIFIED / BLOCKED |

The current phase remains a synthetic local capstone MVP, not a production-readiness or compliance determination.

## Status

Previous status: `CONDITIONALLY READY FOR NEXT SECURITY VALIDATION`

Historical validation result: `LEVEL 3+ - RUNTIME SECURITY VALIDATED POC`

`LEVEL 4 - PRODUCTION CANDIDATE` is not achieved because Docker full stack, TLS/mTLS, real CI execution, real IdP, and real KMS/HSM are not fully verified in the target runtime.

## Evidence

| Control | Evidence | Result |
|---|---|---|
| Existing regression tests | `npm test` | PASS, 52 tests |
| Security gate | `npm run security:gate` | PASS |
| Secret scan | `npm run security:secrets` via gate | PASS |
| Dependency audit | `pnpm audit --prod --audit-level critical` via gate | PASS |
| Docker compose syntax | `docker compose config --quiet` | PASS |
| Docker engine runtime | `docker version`, `docker info`, `docker compose up -d --build` | FAIL, Docker Desktop Engine API 500 |
| Application SBOM | `npm run sbom` | PASS for npm dependencies only |

## Identity Runtime

Synthetic OIDC runtime tests cover:

- Discovery endpoint validation.
- JWKS lookup.
- RS256 JWT signature validation.
- Unknown `kid` denial.
- JWKS rotation from key A to key B.
- Hospital claim preservation in verified claims.

The local test provider is synthetic. Real hospital IdP integration remains prohibited and `NOT VERIFIED`.

## Key Management Runtime

Synthetic DICOM key rotation tests cover:

- `ACTIVE` signing key issues new tokens.
- Previous key transitions to `VERIFY_ONLY`.
- Existing token remains valid while its key is verify-only.
- `RETIRED` key is rejected.
- External HTTP KMS-compatible provider connection failure fails closed.

Real KMS/HSM integration remains `NOT VERIFIED`.

## Tenant And DICOM Scope

Existing service tests continue to cover:

- RBAC doctor checks.
- Hospital mismatch denial.
- Study scope mismatch denial.
- Series scope mismatch denial.
- Unknown DICOM token `kid` denial.
- Expired and tampered DICOM token denial.

Full OHIF to Gateway to Orthanc browser E2E is blocked by Docker runtime failure and remains `NOT VERIFIED`.

## Docker Diagnosis

Classification: `DOCKER_DESKTOP / WSL2 / DOCKER_DAEMON`

Observed:

- Docker client is installed.
- Current context is `desktop-linux`.
- `docker-desktop` WSL distribution was reported as `Stopped`.
- Docker Engine named pipe returns HTTP 500 for `/version`, `/info`, and image inspection.
- Non-destructive recovery attempted with `wsl --shutdown` and Docker Desktop restart; `docker-desktop` remained stopped.

Application configuration is not the failing layer for the Docker startup attempt.

## Security Evidence Matrix

| ID | Control | Test | Result | Evidence |
|---|---|---|---|---|
| SEC-ID-001 | JWT signature, issuer, audience, expiry | `npm test` | PASS | `test/hipass-service.test.js`, `test/security-runtime.test.js` |
| SEC-ID-002 | Synthetic OIDC Discovery and JWKS | `npm test` | PASS | Local HTTP OIDC test server |
| SEC-ID-003 | JWKS rotation and unknown `kid` denial | `npm test` | PASS | `OIDC discovery, JWKS lookup...` test |
| SEC-TEN-001 | Hospital-bound access policy | `npm test` | PASS | Policy mismatch tests |
| SEC-DICOM-001 | Study/Series scoped DICOM token | `npm test` | PASS | Gateway and token scope tests |
| SEC-KEY-001 | DICOM key rotation | `npm test` | PASS | ACTIVE, VERIFY_ONLY, RETIRED test |
| SEC-KEY-002 | External KMS-compatible provider failure | `npm test` | PASS | Fail-closed unavailable provider test |
| SEC-RET-001 | Legal hold and deletion approval | `npm test` | PASS | Retention enforce test |
| SEC-CI-001 | Local security gate | `npm run security:gate` | PASS | Unit test, secret scan, dependency audit |
| SEC-CI-002 | Application dependency SBOM | `npm run sbom` | PASS | `artifacts/sbom/application.cdx.json` |
| SEC-NET-001 | Docker full-stack network boundary | Docker runtime | FAIL | Docker Engine API 500 |
| SEC-NET-002 | TLS/mTLS service trust | Docker runtime | NOT VERIFIED | Blocked by Docker Engine |

## Operational Restrictions

- Real patient data: `PROHIBITED`
- Real hospital PACS: `PROHIBITED`
- Real hospital network: `PROHIBITED`
- Real hospital IdP: `PROHIBITED`
- Synthetic OIDC: `PASS`
- KMS/HSM: `NOT VERIFIED`
- TLS/mTLS: `NOT VERIFIED`
- Docker full stack: `FAIL`
- GitHub Actions hosted run: `NOT VERIFIED`
