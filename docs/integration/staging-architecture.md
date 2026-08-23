# Staging Architecture

## Scope

This document defines the intended LEVEL 7 staging shape. It is not evidence that the environment is deployed.

## Environment Layers

| Layer | Purpose | Status |
|---|---|---|
| Development | Local Docker and synthetic data | VERIFIED in prior phases |
| Test | Node test suite and synthetic runtime checks | VERIFIED in prior phases |
| Staging | External non-production infrastructure | NOT VERIFIED |
| Production | Hospital production use | NOT DEPLOYED / NOT APPROVED |

## Required Isolation

Staging must have dedicated values for:

- Secrets and key material.
- Database and database roles.
- TLS and mTLS certificates.
- OIDC client and test tenant.
- Monitoring and human notification channel.
- Container runtime pulling by digest.

Development secrets, development certificates, local PostgreSQL volumes, and local mock authentication must not be reused in staging.

## Data Boundary

Allowed:

- Synthetic patient records.
- Synthetic or de-identified sample DICOM.
- Test accounts.
- Non-production cloud resources.

Prohibited:

- Real patient information.
- Real hospital PACS.
- Real hospital network.
- Real clinical workflow.
- Production secrets.

## Target Request Path

```text
Browser / Viewer
  -> Edge HTTPS endpoint
  -> Control Plane API for consent, policy, and token issuance
  -> DICOMweb Gateway
  -> Orthanc over mTLS
  -> Synthetic DICOM only
```

The Control Plane must continue to store only consent, policy, token, metadata, and audit records. It must not persist original DICOM files.
