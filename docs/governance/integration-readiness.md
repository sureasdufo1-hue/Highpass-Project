# Integration Readiness Contracts

## Hospital IdP

Required before real IdP connection:

| Contract Item | Requirement |
|---|---|
| Issuer / discovery URL | explicit allowlist |
| JWKS | rotation-capable |
| Algorithms | allowlisted asymmetric algorithms |
| Audience | exact platform audience |
| Subject claim | stable non-PHI identifier preferred |
| Role/group claim | mapped to platform roles |
| Tenant/hospital claim | mapped to hospitalId |
| Clock skew | bounded |
| Logout/revocation | defined |
| Failure mode | fail closed |

Acceptance tests: test tenant, non-production users, JWKS rotation, unknown kid denial, wrong issuer denial, wrong audience denial, expired token denial, tenant mapping validation, audit validation.

```text
REAL HOSPITAL IDP:
NOT VERIFIED
```

## PACS / DICOMweb

Required before real PACS connection:

QIDO-RS, WADO-RS, Study/Series scope enforcement, endpoint contract, TLS/mTLS, service identity, timeout/retry policy, audit, rate limit, patient identifier handling, and de-identification boundary.

Safety gate: hospital network approval, security review, test environment, synthetic/non-patient data, PACS administrator approval, data processing agreement where applicable, rollback plan, and audit validation.

```text
HOSPITAL PACS:
NOT CONNECTED
```

## KMS/HSM

Provider contract: key ID, lifecycle (`ACTIVE`, `VERIFY_ONLY`, `RETIRED`), sign, verify, authentication, TLS, timeout, retry, audit, failure mode, rotation, and revocation.

Failure requirement:

```text
New signing operation:
DENY

Development fallback:
DISABLED
```

```text
REAL KMS/HSM:
NOT VERIFIED

INTEGRATION CONTRACT:
PASS
```
