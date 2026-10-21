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

## Scoped synthetic standby checkpoint — 2026-10-16

An isolated East Asia VM and a read-only PostgreSQL 16.15 asynchronous streaming
standby were provisioned and checked without restarting primary PostgreSQL or
changing public DNS/Entra/application routing. The existing primary received a
dedicated replication role, role-only HBA rules and a bounded outbound SSH tunnel.
Source TLS private key files were excluded before backup disk extraction; manifest
verification explicitly reports the exclusion. Original Vault/KEK/app signing keys
were not copied and the standby identity has no new Vault access. Its only assigned
action is deallocation of that exact standby VM after the demo deadline.

This supersedes only the absence of a synthetic read-only DB standby. It does NOT
change overall real-service DR readiness to PASS: independent key recovery,
primary fencing/promotion, post-recovery authorization/tenant reconciliation,
hospital paths and actual user cutover remain NOT VERIFIED. New image CVE/SBOM
validation and future scheduled deallocation execution also remain NOT VERIFIED.
Evidence, failures, reversible staging-file preservation and precise checks:
[standby execution record](../operations/azure-dr-standby-replication-2026-10-16.md).
