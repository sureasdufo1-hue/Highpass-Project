# Rollback Validation

## Scope

Rollback testing is limited to the technical PoC runtime. Database downgrade was not performed because destructive schema rollback is not safe without an approved migration rollback plan.

## Tested Scenario

Rollback candidate:

- `1b22eae81b64a70149cd2c86b2cc6fb2c3ce4933`

Current candidate at test start:

- `4009d80e9d1fdce54a752d68b3462ea945ac8183`

Method:

1. Created a detached git worktree at the rollback SHA.
2. Built an isolated rollback Docker image.
3. Started an application-only rollback container against the current synthetic database schema.
4. Checked `/api/health`.
5. Removed the rollback container/worktree and verified the latest runtime health.

## Result

`ROLLBACK_VALIDATION: PASS`

The isolated rollback image was started with the current runtime security configuration. The health probe returned `200` with `status=UP` and `database=UP`. The script then removed the rollback container and verified the latest roll-forward runtime health.

Database downgrade was not performed because destructive schema rollback is not safe without an approved migration rollback plan.

Evidence:

- `artifacts/operations/rollback-20260823-153032/summary.json`
- `artifacts/operations/rollback-20260823-153032/retest-summary.json`
- `artifacts/operations/rollback-recovery-20260823-155621/summary.json`

## Current Limits

This validation proves application-level rollback container compatibility against the current synthetic database and current cert/secret mounts. Full production DR, schema downgrade, real cloud restore, and real hospital PACS rollback remain out of MVP scope.
