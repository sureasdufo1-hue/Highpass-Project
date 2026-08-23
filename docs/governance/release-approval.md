# Release Approval Governance

## Release Gate

Before a release candidate is promoted, record:

| Field | Requirement |
|---|---|
| Source SHA | exact git commit |
| Hosted SHA | must match source SHA |
| Security Gate | PASS |
| Container Gate | PASS |
| SBOM | generated for candidate |
| Risk Exceptions | valid, unexpired, digest-bound |
| Rollback Evidence | current candidate rollback evidence |
| Approver | named person or approved role |
| Timestamp | ISO timestamp |

## Promotion Model

```text
Feature Branch -> PR -> Security Gate -> master -> immutable release SHA -> test/staging validation -> explicit approval -> production promotion
```

Production promotion is a governance design item only. No production environment is created by this repository phase.

## Artifact Identity

Use build-once/promote-same-artifact where possible. Rebuilding per environment changes container digest and can invalidate SBOM and vulnerability exception binding.
