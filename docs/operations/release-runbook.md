# Release and Rollback Runbook

## Pre-Release

1. Confirm no real patient data or real hospital PACS/network integration.
2. Verify risk exception validity.
3. Run secret scan, unit tests, E2E, security gate, network gate, readiness, container gate, and SBOM.
4. Confirm local SHA, remote SHA, and hosted workflow `headSha` match.
5. Preserve Hosted CI run URL and release SHA.

## Current Validated Baseline

```text
Release SHA:
1b22eae81b64a70149cd2c86b2cc6fb2c3ce4933

Hosted Run:
https://github.com/sureasdufo1-hue/Highpass-Project/actions/runs/32620142659

Status:
LEVEL 4 - TECHNICAL PRODUCTION CANDIDATE ONLY
```

## Rollback

Rollback is a controlled test-environment action, not a production DR claim.

1. Select previous known-good SHA or image digest.
2. Rebuild or pull the matching images.
3. Restore matching configuration and cert mounts.
4. Start compose stack.
5. Run health, security, network, container, and E2E checks.

Rollback validation is `PASS` for the controlled PoC runtime. An isolated rollback image was built from `1b22eae81b64a70149cd2c86b2cc6fb2c3ce4933`, started with the current security configuration, and returned `/api/health` `200` with `status=UP` and `database=UP`. Final roll-forward health also returned `UP`.

Database downgrade was not performed because destructive schema rollback requires an approved migration rollback plan.
