# Staging Infrastructure Contract

This directory defines provider-neutral LEVEL 7 staging requirements. It is not a deployed cloud stack.

Use this contract to implement one selected provider only, such as AWS, Azure, GCP, or HashiCorp Vault plus an approved compute platform. Do not create fake provider resources or commit credentials.

## Required Inputs

See `variables.example.json`.

## Required Outputs

See `outputs.example.json`.

The smoke test consumes these outputs through environment variables and external command hooks. Run:

```bash
pnpm run staging:smoke
```

If external resources are missing, the smoke test must return `BLOCKED`, not `PASS`.

## Required Boundaries

- Staging secrets are separate from development and production.
- Staging database is dedicated and requires TLS.
- Staging OIDC client is a non-production tenant/client.
- Staging KMS key is non-production and auditable.
- Container promotion uses immutable digests.
- Synthetic healthcare data only.
- No real hospital PACS, real hospital network, or real patient data.
