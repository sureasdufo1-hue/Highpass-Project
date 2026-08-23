# Audit and Retention Governance

## Evidence Classes

| Evidence | Owner | Retention Basis | Deletion Authority | Legal Hold | Integrity |
|---|---|---|---|---|---|
| Security Audit Logs | Security Reviewer | LEGAL REVIEW REQUIRED | restricted security process | preserve | hash chain / append-only API |
| Release Evidence | Release Approver | operational traceability | release governance | preserve | SHA and hosted run binding |
| Risk Acceptance Evidence | Risk Owner | risk lifecycle | risk owner plus security review | preserve | tracked policy file |
| Backup Evidence | Database Administrator | recovery validation | DBA plus release approver | preserve if incident-related | hash and restore validation |
| Access Review Evidence | Auditor | access accountability | auditor process | preserve | signed or tracked review |
| Incident Evidence | Security Reviewer | incident handling | incident commander plus legal review | preserve | immutable archive preferred |

Legal retention periods are not finalized in this PoC.

```text
LEGAL REVIEW REQUIRED
```
