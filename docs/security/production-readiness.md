# Production Readiness

## Current Level

`SECURITY-HARDENED CLOSED POC`

The target of the next validation phase is:

`PRE-PRODUCTION SECURITY-VALIDATED POC`

This repository now includes local foundations for a Level 4 production-candidate path, but it must not be represented as production ready until external IdP, KMS, CI, backup, TLS, and operational controls are verified in the target environment.

## Allowed

- Synthetic data
- Virtual hospitals A/B/C
- Local Docker Compose testing
- Security demonstration
- Consent, policy, token, gateway, audit, and de-identification simulation

## Prohibited

- Real patient data
- Real hospital production network
- Real PACS integration
- Clinical use
- Production legal compliance claim
- Medical device certification claim

## Remaining Gates

- Real IdP/OIDC tenant integration and JWKS/key rotation verification
- KMS/HSM-backed token and pseudonym key provider implementation
- Orthanc authentication or mTLS in an operational environment
- Retention enforcement with legal approval
- Backup encryption and deletion verification
- Full browser E2E for OHIF token propagation

## Implemented Local Gates

- `npm test`: unit and integration-style service tests.
- `npm run security:secrets`: high-confidence repository secret scan.
- `npm run security:gate`: test, secret scan, and critical dependency audit gate.
- `npm run security:readiness`: fail-closed environment readiness check for auth mode, production secret placeholders, token TTL, and Orthanc credentials.

## Identity Boundary

- `AUTH_MODE=DEVELOPMENT_MOCK` is only for local development.
- `AUTH_MODE=OIDC` or `AUTH_MODE=PRODUCTION` requires `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_PUBLIC_KEY`.
- Production with development mock authentication is blocked at startup.

## Key And Secret Boundary

- DICOMweb access tokens include `kid` and are verified against the configured key provider.
- Local development uses an in-process key provider only.
- `KEY_PROVIDER=KMS` is an interface marker and remains `NOT VERIFIED` until integrated with a real KMS/HSM.
- Production secret validation rejects missing or placeholder values for database, token, internal service, JWT, audit hash, and pseudonym HMAC secrets.

## Retention Boundary

- Retention planning is dry-run by default.
- Enforced deletion requires `RETENTION_PURGE_MODE=ENFORCE`, `RETENTION_ALLOW_SYNTHETIC_DELETE=true`, an approved deletion record, and no active legal hold.
- Current enforce path is limited to synthetic DICOM access token logs; audit logs and pseudonym mappings remain non-purgeable in normal MVP operations.
