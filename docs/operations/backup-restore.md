# Backup and Restore Runbook

## Data Classification

| Data | Classification | Backup Requirement |
|---|---|---|
| PostgreSQL application data | CRITICAL DATA | Required |
| Audit logs and token logs | SECURITY EVIDENCE | Required, integrity-preserving |
| Pseudonym mappings | SECRET/SENSITIVE LINKAGE | Required, restricted access |
| Orthanc synthetic DICOM volume | TEST DATA | Required for PoC restore drills |
| Container images | RECREATABLE DATA | Rebuild and rescan |
| TLS/mTLS private keys | SECRET MATERIAL | Do not include in DB/DICOM backups |
| SBOM and scan results | SECURITY EVIDENCE | Preserve with release evidence |

## PostgreSQL Procedure

1. Create a custom-format dump with `pg_dump -Fc`.
2. Record timestamp, source DB, byte size, and SHA-256.
3. Restore only into an isolated test DB/container.
4. Validate critical table counts, FK integrity, pseudonym mappings, and audit hash fields.

Latest local evidence:

```text
Backup file:
artifacts/operations/backup-restore-20260823-143550/hipass-ops.dump

Size:
104666 bytes

SHA-256:
AAEBE346D83025E862D5889F8AB060BDE826AE6DEC5CDF12BE137D352EF90FF0

Restore:
PASS in isolated postgres:16-alpine container
```

## Orthanc Procedure

Synthetic Orthanc storage is backed up as a volume tar archive. Do not place real patient DICOM in this workflow.

Latest local evidence:

```text
Backup file:
artifacts/operations/backup-restore-20260823-143550/orthanc-data.tar

Size:
450560 bytes

SHA-256:
038D470B23A1E567800718507A872AF453AF03AFBA9DDF1BFA5A419558E0D2D8

Restore:
PASS in isolated Orthanc container on 127.0.0.1:18042

Restored studies:
2

Restored DICOM bytes:
680
```

## Security

Backup encryption was validated for the synthetic PostgreSQL and Orthanc backup artifacts using AES-256-GCM with a temporary passphrase provided through `OPS_BACKUP_PASSPHRASE`.

Evidence:

- `artifacts/operations/encrypted-backup-20260823-152901/summary.json`
- `artifacts/operations/encrypted-backup-20260823-152901/orthanc-retest.json`

Validated:

- PostgreSQL backup encryption: `PASS`
- Orthanc backup encryption: `PASS`
- Wrong-key decrypt rejection: `PASS`
- Corrupt encrypted backup rejection: `PASS`
- Decrypted PostgreSQL restore: `PASS`
- Decrypted Orthanc restore with `orthanc/hospital-a.json`: `PASS`

Backup artifacts can contain synthetic security evidence and must not be committed. Production backup storage, retention automation, offsite disaster recovery, and organization-managed encryption keys remain outside the verified scope.
