# Runtime Security Validation

## Status

Previous status: `CONDITIONALLY READY FOR NEXT SECURITY VALIDATION`

Current validation result: `LEVEL 3+ - RUNTIME SECURITY VALIDATED POC`

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
