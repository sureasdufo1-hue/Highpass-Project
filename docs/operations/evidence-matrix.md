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
| OPS-BROWSER-001 | Browser Authorization | Chrome CDP trace over trusted HTTPS | PASS | Authorization Bearer present on QIDO/WADO; token not present in URL |
| OPS-HOSTED-CI-001 | Hosted Security Gate | GitHub Actions run `32624417918` | PASS | head SHA `c67488deead6b8a2caad5d5a4f608504bbe3b1ff`, conclusion `success` |
| OPS-BRANCH-001 | Branch Protection Review | GitHub branch protection API | PASS | default branch `master` protected in Level 6 |
| GOV-BRANCH-001 | Default Branch Protection | GitHub branch protection API | PASS | master protection configured |
| GOV-REQUIRED-CHECK-001 | Required Security Check | Required status check context | PASS | required context `security-gate` |
| GOV-CHANGE-001 | Change Management | governance document | PASS | `docs/governance/change-management.md` |
| GOV-ACCESS-001 | Access Review / Role Matrix | governance document | PASS | `docs/governance/access-control.md`; independent approval NOT VERIFIED |
| GOV-RISK-001 | Security Exception Governance | governance document and expiry gate | PASS | `docs/governance/security-exception-governance.md`, `pnpm run ops:expiry` |
| GOV-RELEASE-001 | Release Approval | governance document | PASS | `docs/governance/release-approval.md` |
| COMP-PIPA-001 | PIPA Readiness Mapping | compliance matrix | PASS | `docs/compliance/pipa-readiness-matrix.md`; NOT CERTIFIED |
| COMP-ISMSP-001 | ISMS-P Readiness Mapping | compliance matrix | PASS | `docs/compliance/isms-p-readiness-matrix.md`; NOT CERTIFIED |
| COMP-GAP-001 | Compliance Gap Register | gap register | PASS | `docs/compliance/gap-register.md` |
| INT-IDP-001 | Hospital IdP Contract | integration readiness document | PASS | real hospital IdP NOT VERIFIED |
| INT-PACS-001 | PACS / DICOM Contract | integration readiness document | PASS | real PACS NOT CONNECTED |
| INT-KMS-001 | KMS/HSM Contract | integration readiness document | PASS | real KMS/HSM NOT VERIFIED |
| DR-ARCH-001 | DR Architecture Readiness | DR readiness document | PARTIAL | real DR site NOT VERIFIED |
| STG-ENV-001 | Independent Staging Environment | `pnpm run staging:smoke` | BLOCKED | no external staging deployment target configured |
| STG-NET-001 | Staging Network Segmentation | `pnpm run staging:smoke` plus provider checks | BLOCKED | local network checks exist; external staging network not tested |
| STG-DB-001 | Staging PostgreSQL Security | `pnpm run staging:smoke` | BLOCKED | no dedicated staging DB endpoint or TLS session tested |
| EXT-SECRET-001 | External Secret Provider | `pnpm run staging:smoke` command hook | BLOCKED | no external Secret Manager command configured |
| EXT-KMS-001 | External KMS | `pnpm run staging:smoke` command hook | BLOCKED | no non-production KMS vendor configured |
| EXT-IDP-001 | External Test IdP | `pnpm run staging:smoke` discovery check | BLOCKED | no external OIDC test tenant configured |
| REL-ARTIFACT-001 | Immutable Artifact Promotion | `pnpm run staging:smoke` digest hooks | BLOCKED | no registry digest promotion to staging executed |
| REL-PROMOTE-001 | Promotion Governance | LEVEL 7 validation | PARTIAL | checklist documented; production promotion not executed |
| MON-HUMAN-001 | Human Notification | `pnpm run staging:smoke` command hook | BLOCKED | no external email, Slack, or Teams delivery configured |
| DR-STAGING-001 | Staging DR Exercise | `pnpm run staging:smoke` command hook | BLOCKED | no independent recovery environment executed |
| L7C-DISCOVERY-001 | External Resource Discovery | GitHub vars/secrets and local environment review | BLOCKED | no external staging vars or secrets configured; see `docs/integration/level-7c-closure-report.md` |

## RTO / RPO Status

Technical test RTO is measured for the local PoC failure drills. Technical test RPO is partially validated through point-in-time backup and restore consistency. Business-approved RTO/RPO remains `NOT VERIFIED`.
