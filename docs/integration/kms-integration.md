# External KMS Integration

## Current Status

| Item | Status |
|---|---|
| Local key rotation tests | PASS |
| External HTTP key provider fail-closed test | PASS |
| Provider-neutral envelope rewrap contract | PASS (`src/mobile-kms-adapter.js`) |
| Synthetic rewrap adapter contract tests | PASS (`test/mobile-kms-adapter.test.js`) |
| B Edge transient decrypt and zeroize boundary | PASS (`src/mobile-transient-decrypt.js`) |
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

## Local MVP Boundary

`TestKmsEnvelopeAdapter` exists only for synthetic unit and contract tests. It
stores opaque envelope references, models KMS availability and one-time
authorization, and never accepts or returns a raw DEK. It is not evidence of a
vendor KMS connection and must not be enabled in production-like deployments.

The provider-neutral `KmsEnvelopeAdapter.rewrapEnvelope()` contract is the
stable seam for a future AWS KMS, Google Cloud KMS, Azure Key Vault, or HSM
implementation. A real adapter must use workload identity/private network
access, return envelope metadata only, and fail closed on timeout or policy
denial.

## External KMS Cutover Checklist

The following checklist must be completed in a non-production tenant before
the local adapter can be replaced:

- [ ] Vendor, region/key-ring, HSM level, and retention policy approved.
- [ ] Workload identity and least-privilege permissions provisioned for A/B Edge and Control Plane.
- [ ] Private endpoint, TLS/mTLS, hostname/SAN/EKU, and egress allowlist verified.
- [ ] `GenerateDataKey`, envelope rewrap, transient decrypt, disable, destroy, and metadata operations tested.
- [ ] Key rotation overlap, retired-key denial, and unknown-key denial tested.
- [ ] Consent revocation, device loss, package expiry, replay, and KMS outage all produce `DENY`.
- [ ] KMS audit events correlate with `authorizationId`, `packageId`, `manifestHash`, and `traceId` without key material.
- [ ] Backup/restore, quota, timeout, retry, and incident-response runbooks rehearsed.
- [ ] Test evidence reviewed by an assigned human reviewer; only then may the status change from `BLOCKED`.

## Required Tests

| Test | Expected |
|---|---|
| New token after rotation | kid B |
| Existing valid A token during overlap | PASS |
| Unknown kid | DENY |
| Retired A after lifecycle end | DENY |
| KMS unavailable for new token | DENY |
| Local fallback in staging | DISABLED |
