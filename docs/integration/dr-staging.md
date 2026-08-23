# Staging DR Exercise

## Current Status

Local backup and restore drills exist from earlier operational validation. An independent staging recovery environment has not been executed.

| Item | Status |
|---|---|
| Local PostgreSQL restore | PASS |
| Local synthetic DICOM restore | PASS |
| Encrypted local backup restore | PASS |
| Independent staging DR exercise | NOT VERIFIED |
| Real production DR | NOT VERIFIED |

## Required Staging DR Inputs

- Encrypted PostgreSQL backup.
- Encrypted synthetic DICOM backup.
- Configuration manifest.
- Certificate recovery procedure.
- External Secret Provider access.
- Staging container image digest.

Private keys must not be stored inside data backups.

## Required Validation

| Check | Expected |
|---|---|
| Secret retrieval | PASS |
| Database restore | PASS |
| DICOM restore | PASS |
| Audit integrity | PASS |
| HTTPS | PASS |
| mTLS | PASS |
| Authentication | PASS |
| Authorization | PASS |
| QIDO | PASS |
| WADO | PASS |
| Fail closed behavior | PASS |

Any measured recovery time from this exercise is a staging technical recovery time only. It is not a business-approved RTO.
