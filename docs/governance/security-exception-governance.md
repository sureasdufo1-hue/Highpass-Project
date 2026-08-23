# Security Exception Governance

## Lifecycle

Every vulnerability exception must include:

- finding and affected package
- technical analysis
- compensating controls
- risk owner
- explicit approval
- expiry timestamp
- image digest or artifact binding where applicable
- re-review trigger
- patch availability decision
- closure condition

## Non-Negotiable Rules

- No automatic approval.
- No automatic renewal.
- Expired exception makes the gate fail.
- New image digest requires re-evaluation.
- Fixed package availability prefers remediation over acceptance.
- New CVE requires separate review.

Current policy file:

```text
security/container-vulnerability-exceptions.json
```
