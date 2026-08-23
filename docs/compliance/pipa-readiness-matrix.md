# PIPA Readiness Matrix

This is a technical control readiness mapping, not a legal certification.

| Control | Status | Evidence |
|---|---|---|
| Access control | IMPLEMENTED | RBAC + ABAC tests, `pnpm test` |
| Authentication | PARTIAL | synthetic OIDC/JWKS tests; real IdP NOT VERIFIED |
| Authorization | IMPLEMENTED | policy engine, scoped token, gateway tests |
| Encryption in transit | PARTIAL | local HTTPS/mTLS PASS; production TLS governance required |
| Secret management | PARTIAL | no hardcoded secret, rotation evidence; real KMS/HSM NOT VERIFIED |
| Audit logging | IMPLEMENTED | AuditLog tests and hash-chain integrity |
| Retention/deletion | PARTIAL | dry-run retention controls; legal periods require review |
| Backup security | IMPLEMENTED | encrypted backup restore tests |
| Incident response | PARTIAL | runbook exists; real organization process NOT VERIFIED |
| Least privilege | PARTIAL | network segmentation PASS; production IAM NOT VERIFIED |
| Vulnerability management | IMPLEMENTED | Trivy, risk exception gate, expiry gate |
| Real patient data processing | NOT APPLICABLE | PROHIBITED / NOT USED in PoC |
| Legal retention basis | LEGAL REVIEW REQUIRED | `docs/governance/audit-retention-governance.md` |

```text
PIPA LEGAL COMPLIANCE:
NOT CERTIFIED
```
