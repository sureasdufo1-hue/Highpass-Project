# Data Flow Register

| Flow | Data Category | Authentication | Authorization | Encryption | Audit | Storage |
|---|---|---|---|---|---|---|
| Viewer -> Edge -> API/Gateway -> Orthanc | synthetic DICOM metadata/images | short DICOMweb token | RBAC + ABAC + token scope | HTTPS / mTLS downstream | IMAGE_VIEWED / DENIED | Orthanc only |
| API -> PostgreSQL | consent, metadata, audit | DB credential | app role | Docker network, production TLS required | application audit | PostgreSQL |
| Gateway -> mTLS Proxy -> Orthanc | DICOMweb request/response | mTLS client cert | token scope | mTLS | transfer/audit logs | Orthanc |
| OIDC/JWKS validation path | identity claims | issuer/JWKS | issuer/audience/role checks | HTTPS required for real IdP | LOGIN / TOKEN events | no raw token persistence |
| SecretProvider / KeyProvider path | signing keys, secret references | provider credential | key lifecycle state | TLS required | key operation audit | provider-controlled |
| Audit path | audit events and reason codes | service identity | security/admin scope | storage protection required | hash-chain integrity | PostgreSQL / evidence archive |

Real hospital network, real PACS, and real patient data are not connected.
