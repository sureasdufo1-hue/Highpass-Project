# Operational Evidence Matrix

| Control ID | Control | Test | Result | Evidence |
|---|---|---|---|---|
| OPS-BACKUP-001 | PostgreSQL Backup | `pg_dump -Fc` | PASS | `artifacts/operations/backup-restore-20260823-143550/hipass-ops.dump` |
| OPS-RESTORE-001 | PostgreSQL Restore | isolated `postgres:16-alpine` restore | PASS | source/restore counts matched |
| OPS-DICOM-RESTORE-001 | Synthetic DICOM Restore | Orthanc volume tar restore | PASS | 2 restored studies, 680-byte DICOM instance |
| OPS-RTO-001 | Measured RTO | DB outage/recovery observation | PARTIAL | fixed 30s recovery wait, health restored |
| OPS-RPO-001 | Measured RPO | backup hash and restore counts | PARTIAL | point-in-time dump only; business RPO not approved |
| OPS-MON-001 | Service Monitoring | health/readiness/expiry checks | PASS | `pnpm run ops:expiry`, `/api/health` |
| OPS-ALERT-001 | Security Alert | `pnpm run ops:monitor` | PASS | independent receiver received 10 alerts |
| OPS-CERT-001 | TLS Certificate Rotation | CERT-A -> CERT-B -> rollback -> roll-forward | PASS | `artifacts/operations/certificate-rotation-20260823-152021/summary.json` |
| OPS-MTLS-001 | mTLS Rotation and Failure Recovery | CA/client/server rotation plus negative tests | PASS | new client accepted, old/missing clients rejected |
| OPS-KEY-001 | Signing Key Rotation | unit tests | PASS | key lifecycle tests pass |
| OPS-SECRET-001 | Credential Rotation | DB credential A -> B | PASS | old credential rejected from `newproject_db_net` |
| OPS-IR-001 | Incident Runbook | runbooks created | PASS | `docs/operations/incident-response.md` |
| OPS-VULN-001 | Vulnerability Exception Expiry | `ops:expiry`, container gate | PASS | 0 expired exceptions at test time |
| OPS-ROLLBACK-001 | Rollback Validation | isolated rollback image | PASS | `artifacts/operations/rollback-recovery-20260823-155621/summary.json`; rollback and roll-forward health PASS |
| OPS-BACKUP-ENC-001 | Backup Encryption | AES-256-GCM encrypt/decrypt/restore | PASS | wrong-key and corrupt backup rejected; DB/Orthanc restore PASS |
