# LEVEL 7 Staging Validation

## Result

| Field | Status |
|---|---|
| Target | LEVEL 7 - External Infrastructure Integration & Pre-Production Staging Validated Candidate |
| Result | NOT ACHIEVED |
| Reason | Required external staging infrastructure is not configured in this repository or runtime |
| Qualifier | Technical pre-production validation only; no hospital production approval or certification |

## Preconditions Checked

| Gate | Result | Evidence |
|---|---|---|
| Working tree clean | PASS | `git status --short --branch` returned `## master...origin/master` before branch creation |
| Local / remote SHA match | PASS | `6b9a17fabf5082539c09b1c2917628482c8282e7` |
| GitHub authentication | PASS | `gh auth status` authenticated as repository owner |
| Hosted Security Gate | PASS | GitHub Actions run `32629310277`, conclusion `success` |
| Risk exception validity | PASS | `pnpm run ops:expiry`, expired exceptions `0` at `2026-08-23T08:42:40.298Z` |

## Required LEVEL 7 Gates

| Gate | Result | Evidence |
|---|---|---|
| Independent staging environment | BLOCKED | No external staging endpoint, tenant, or deployment target is configured; run `pnpm run staging:smoke` after providing `STAGING_BASE_URL` |
| Environment secret separation | PARTIAL | `.env.staging.example` added; real staging secret separation not executed |
| External secret provider | BLOCKED | `src/secrets.js` contains only an interface marker that fails closed; smoke command hook added |
| External secret rotation | BLOCKED | No external Secret Manager credential A/B rotation executed; smoke command hook added |
| External KMS integration | BLOCKED | `src/key-provider.js` KMS provider is an interface marker; no vendor KMS configured; smoke command hook added |
| KMS fail closed | PASS | Local tests cover external provider unavailable fail-closed behavior |
| External test IdP | BLOCKED | OIDC/JWKS code exists; no external test tenant configured; discovery and test-token smoke checks added |
| OIDC negative tests | PASS | Synthetic tests cover issuer, audience, expiry, unknown kid, and signature rejection |
| Staging PostgreSQL security | BLOCKED | No dedicated staging PostgreSQL connection details or runtime provided |
| DB TLS | BLOCKED | `verify-full` required in example; no external DB TLS session tested |
| Immutable artifact promotion | BLOCKED | No registry digest promotion to staging was executed; digest command hooks added |
| Digest binding | BLOCKED | Source, registry, and staging runtime digest were not compared |
| Human alert notification | BLOCKED | Monitoring receiver exists; no email, Slack, or Teams delivery configured |
| Staging network segmentation | BLOCKED | Local network checks exist; no external staging network tested |
| DR staging exercise | BLOCKED | Local restore evidence exists; no independent recovery environment executed |
| Staging full E2E | BLOCKED | No external staging endpoint tested |
| Staging browser authorization | BLOCKED | Browser trace not run against external staging HTTPS endpoint |
| Staging mTLS | BLOCKED | Local mTLS evidence exists; no staging mTLS negative test executed |
| Secret scan | PASS | Run during local security gate and Hosted Security Gate |
| Container gate | PASS | Hosted Security Gate executed container scan on current master |
| Hosted required security gate | PASS | Required `security-gate` passed for current master |
| Release SHA binding | PASS | Local SHA, remote SHA, and hosted head SHA match for `6b9a17fabf5082539c09b1c2917628482c8282e7` |
| Risk exception | VALID | Approved exceptions valid until `2026-08-23T23:59:59+09:00` |

## Decision

LEVEL 7 is blocked until actual non-production external infrastructure is supplied and tested. The project must not claim external staging validation, real KMS/HSM validation, real hospital IdP validation, real DR validation, legal certification, PIPA certification, or ISMS-P certification from the current evidence.

## Required Inputs To Resume

- Non-production staging deployment target and base URLs.
- One approved external Secret Manager or Vault instance.
- One non-production KMS or equivalent managed key service.
- One external OIDC test tenant with issuer, audience, JWKS, role, and tenant claims.
- Dedicated staging PostgreSQL endpoint using TLS.
- Container registry namespace with digest-based pull access.
- Non-production human notification channel.
- Recovery environment and encrypted backup location for staging DR exercise.

## Integration-Ready Additions

- Provider-neutral staging contract: `infra/staging/`.
- Example staging configuration: `.env.staging.example`.
- Executable smoke test: `pnpm run staging:smoke`.
- Manual GitHub workflow: `Staging Validation`.
- Evidence template: `docs/integration/level-7-evidence-template.md`.
- LEVEL 7C closure report: `docs/integration/level-7c-closure-report.md`.

The smoke test returns `BLOCKED` when required external resources are absent. That result is intentional and must not be reclassified as PASS.
