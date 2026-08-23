# Access Control and Separation of Duties

## Role Matrix

| Role | Read | Modify | Approve | Deploy | Rotate | Audit |
|---|---|---|---|---|---|---|
| Developer | YES | feature branches | NO | NO | NO | own changes |
| Repository Maintainer | YES | repository config | PR merge | NO | NO | repo settings |
| Release Approver | YES | NO | release | promotion request | NO | release evidence |
| Security Reviewer | YES | security docs/policy | security controls | NO | NO | audit/security evidence |
| Risk Owner | YES | risk exception record | risk acceptance | NO | NO | exception lifecycle |
| Database Administrator | limited | DB config | DB change | DB migration | DB credential | DB/audit evidence |
| PKI / Secret Administrator | limited | cert/secret config | rotation window | NO | certs/secrets | rotation evidence |
| Auditor | YES | NO | NO | NO | NO | audit evidence |

## Current Limitation

This is a personal PoC repository. The same account may currently act as developer, repository maintainer, release owner, and risk approver.

```text
SEPARATION OF DUTIES:
PARTIAL / PROCESS-DEFINED

INDEPENDENT SECURITY APPROVAL:
NOT VERIFIED
```
