# External KMS Integration

## Current Status

| Item | Status |
|---|---|
| Local key rotation tests | PASS |
| External HTTP key provider fail-closed test | PASS |
| External KMS vendor integration | NOT VERIFIED |
| Dedicated HSM | NOT VERIFIED |

## Required Capabilities

- Key ID.
- ACTIVE, VERIFY_ONLY, and RETIRED lifecycle states.
- Sign or key access for DICOM scoped-token signing.
- Verify or public-key lookup for existing tokens.
- Rotation from key A to key B.
- Disable or retire old key.
- Audit of signing and key lifecycle events.

## Required Restrictions

If external KMS is used, private signing keys must not be exported into the application container, environment variables, logs, or committed files.

## Required Tests

| Test | Expected |
|---|---|
| New token after rotation | kid B |
| Existing valid A token during overlap | PASS |
| Unknown kid | DENY |
| Retired A after lifecycle end | DENY |
| KMS unavailable for new token | DENY |
| Local fallback in staging | DISABLED |
