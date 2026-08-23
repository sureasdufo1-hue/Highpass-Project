# DR Architecture Readiness

## Required Design Elements

| Area | Requirement |
|---|---|
| Primary environment | defined source of service |
| Recovery environment | isolated and tested before production use |
| Database backup replication | encrypted, integrity checked |
| DICOM backup | synthetic in PoC; real policy requires hospital approval |
| Encryption | backup encryption separate from application data |
| Key availability | separate secret/key recovery path |
| DNS / endpoint recovery | documented cutover |
| Certificate recovery | separate PKI process |
| Secret recovery | not stored with data backup |
| Audit evidence recovery | integrity-preserving restore |
| Runbook | tested periodically |
| DR test cadence | business-approved cadence required |

## Current Status

```text
TECHNICAL BACKUP/RESTORE:
PASS

REAL DR SITE:
NOT VERIFIED

DR ARCHITECTURE READINESS:
PARTIAL
```

Private keys must not be stored inside the same backup dump as application data.
