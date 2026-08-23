# Supply Chain Governance

## Required Controls

| Control | Current Requirement |
|---|---|
| Lockfile | `pnpm-lock.yaml` required |
| Install | `pnpm install --frozen-lockfile` |
| Unit/security gate | `pnpm run security:gate` |
| SBOM | `pnpm run sbom` |
| Dependency audit | part of security gate |
| Container scan | Trivy result consumed by container gate |
| Action version policy | stable major tag minimum; immutable SHA pinning recommended |
| Base image policy | scan and exception lifecycle required |
| Workflow permissions | least privilege; current Security Gate uses `contents: read` |

Third-party GitHub Actions should be periodically reviewed and pinned to immutable SHAs where operationally feasible.
