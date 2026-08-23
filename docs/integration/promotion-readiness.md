# Promotion Readiness

## Required Promotion Model

```text
Build once
  -> scan
  -> SBOM
  -> identify digest
  -> push to registry
  -> deploy the same digest to staging
```

Staging must not rebuild the image from source when validating a release candidate.

## Release Binding

Each release candidate must bind:

- Git SHA.
- Container digest.
- SBOM.
- Trivy or equivalent scan evidence.
- Container gate result.
- Hosted run ID.
- Staging runtime digest.

## Production Promotion Blockers

Production promotion must not proceed without:

- Release owner approval.
- Security approval.
- Valid risk exception state.
- Staging E2E PASS.
- Rollback plan.
- Monitoring evidence.
- Backup and DR evidence.

Independent security approval remains `NOT VERIFIED` until a separate reviewer or approver is assigned outside the implementer role.
