# Threat Model

## Primary Assets

- Consent and ConsentScope
- DICOMweb access tokens
- Study/Series/Instance metadata
- AuditLog and hash chain
- Pseudonym mapping
- Research export decisions

## Key Threats

| Threat | Control |
|---|---|
| Principal spoofing | Server-side principal binding |
| Mock auth in production | Startup fail closed |
| Cross-hospital access | RBAC + ABAC hospital checks |
| Study/Series scope escape | ConsentScope and token scope validation |
| Token tampering | Signed token verification |
| Expired token reuse | Gateway expiry checks |
| AuditLog tampering | Append-only API and hash-chain verification |
| Orthanc direct exposure | Private Docker network, Gateway path |

## Not Yet Closed

- Real IdP compromise handling
- Production key rotation
- Orthanc mTLS
- SIEM integration
- Backup exfiltration controls
