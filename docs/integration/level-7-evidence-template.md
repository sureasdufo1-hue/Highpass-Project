# LEVEL 7 Evidence Template

Use one row for each external P0. Do not include passwords, raw tokens, private keys, bearer tokens, patient data, or raw PHI.

| Field | Value |
|---|---|
| Control ID | L7-xx |
| Requirement |  |
| Status | PASS / FAIL / BLOCKED / NOT VERIFIED / NOT APPLICABLE |
| Environment | staging |
| Execution command |  |
| Execution timestamp |  |
| Commit SHA |  |
| Artifact / Log |  |
| Evidence |  |
| Reviewer |  |
| Residual risk |  |
| Owner |  |
| Exit condition |  |

## Required P0 Controls

| Control ID | Requirement |
|---|---|
| L7-01 | Independent external staging environment |
| L7-02 | External Secret Provider |
| L7-03 | External KMS / HSM or managed key service |
| L7-04 | External OIDC test tenant |
| L7-05 | Staging PostgreSQL TLS session |
| L7-06 | Registry digest promotion to staging |
| L7-07 | Human notification channel |
| L7-08 | Independent staging DR exercise |
| L7-09 | Staging browser and required mTLS regression |
