# Operational Evidence Matrix

| Control ID | Control | Test | Result | Evidence |
|---|---|---|---|---|
| OPS-BACKUP-001 | PostgreSQL Backup | `pg_dump -Fc` | PASS | `artifacts/operations/backup-restore-20260823-143550/hipass-ops.dump` |
| OPS-RESTORE-001 | PostgreSQL Restore | isolated `postgres:16-alpine` restore | PASS | source/restore counts matched |
| OPS-DICOM-RESTORE-001 | Synthetic DICOM Restore | Orthanc volume tar restore | PASS | 2 restored studies, 680-byte DICOM instance |
| OPS-RTO-001 | Measured RTO | DB outage/recovery observation | PARTIAL | fixed 30s recovery wait, health restored |
| OPS-RPO-001 | Measured RPO | backup hash and restore counts | PARTIAL | point-in-time dump only; business RPO not approved |
| OPS-MON-001 | Service Monitoring | health/readiness/expiry checks | PASS | `pnpm run ops:expiry`, `/api/health` |
| OPS-ALERT-001 | Security Alert | severity policy documented | PARTIAL | no external alert backend |
| OPS-CERT-001 | TLS Certificate Rotation | inventory and runbook | PARTIAL | active CA rotation not performed |
| OPS-MTLS-001 | mTLS Failure Recovery | stop mTLS proxy | PASS | Gateway returned `503 ORTHANC_UNAVAILABLE`; recovery returned 200 |
| OPS-KEY-001 | Signing Key Rotation | unit tests | PASS | key lifecycle tests pass |
| OPS-SECRET-001 | Credential Rotation | reviewed | NOT VERIFIED | DB credential rotation not performed |
| OPS-IR-001 | Incident Runbook | runbooks created | PASS | `docs/operations/incident-response.md` |
| OPS-VULN-001 | Vulnerability Exception Expiry | `ops:expiry`, container gate | PASS | 0 expired exceptions at test time |
| OPS-ROLLBACK-001 | Rollback Validation | reviewed | NOT VERIFIED | no rollback execution in this Phase |
