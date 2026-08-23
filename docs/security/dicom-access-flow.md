# DICOM Access Flow

## Required Flow

```text
Authenticated Principal
  -> Consent
  -> RBAC + ABAC
  -> Scoped DICOM Token
  -> OHIF
  -> Gateway
  -> Orthanc
  -> Synthetic DICOM
  -> AuditLog
```

## Enforcement

- Policy checks are server-side.
- DICOMweb tokens are short-lived.
- Tokens include hospital, study, series, permission, purpose, and audit session scope.
- Gateway validates token signature, expiry, hospital, Study UID, Series UID, permission, and consent state.
- Query-string access tokens are not used.

## Current Verification

- Unit/security tests verify token tampering, expiry, hospital mismatch, Study mismatch, Series mismatch, and VIEW_ONLY download denial.
- Live Docker E2E must be run separately with `scripts/e2e-integration-test.js`.

## Not Verified

- Actual OHIF canvas rendering with token header propagation in browser automation.
