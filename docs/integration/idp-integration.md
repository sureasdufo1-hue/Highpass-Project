# External IdP Integration

## Current Status

| Item | Status |
|---|---|
| Synthetic OIDC/JWKS tests | PASS |
| External test IdP | NOT VERIFIED |
| Real hospital IdP | NOT VERIFIED |

## Required External Test Tenant Claims

- `iss`: approved non-production issuer.
- `aud`: `hipass-staging-api` or approved equivalent.
- `sub`: stable test subject.
- `exp`: short-lived token expiry.
- `role` or `groups`: mapped to `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `SECURITY_ADMIN`, or `PLATFORM_ADMIN`.
- `tenant` or `hospitalId`: mapped to the synthetic hospital boundary.

## Required Tests

| Test | Expected |
|---|---|
| Valid issuer, audience, kid, role, and tenant | ALLOW |
| Wrong issuer | DENY |
| Wrong audience | DENY |
| Expired token | DENY |
| Unknown kid | DENY |
| Wrong tenant | DENY |
| Missing role | DENY |

External JWKS rotation remains `NOT VERIFIED` until the selected test IdP can rotate from kid A to kid B and the runtime evidence is captured.
