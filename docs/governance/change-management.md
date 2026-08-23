# Change Management Governance

## Change Classes

| Class | Evidence | Tests | Approval | Rollback | Audit |
|---|---|---|---|---|---|
| STANDARD CHANGE | linked SHA, summary | security gate when code/workflow changes | maintainer | documented if runtime impact | PR / commit history |
| NORMAL CHANGE | change description, risk notes | unit, security, affected E2E | release approver | required | PR / release record |
| EMERGENCY CHANGE | incident link, impact | secret scan, security gate, post-change regression | release approver, post-review | required | incident and release logs |
| SECURITY HOTFIX | vulnerability or control issue | security gate, container gate if image affected | security reviewer | required | security evidence |
| RISK EXCEPTION CHANGE | finding, compensating control, expiry | expiry gate, container gate | risk owner | remediation plan | exception file history |

## Rules

- All release changes must bind source SHA, hosted SHA, Security Gate result, risk exception status, SBOM, and rollback evidence.
- Emergency changes do not bypass secret scan, container gate, hosted Security Gate, or post-change review.
- Actual production SLA values are not defined in this PoC.
