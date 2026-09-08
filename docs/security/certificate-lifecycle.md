# Certificate Lifecycle Policy

This project separates runtime certificates from negative security test fixtures. The goal is to keep runtime expiry enforcement strict without breaking mTLS denial tests that intentionally use invalid certificates.

## Runtime Certificates

Runtime certificates are used by the local HTTPS edge, the development CA, the Gateway client, and the Orthanc mTLS proxy.

Policy:

- `type`: `runtime`
- `expiryPolicy`: `enforce`
- Expired runtime certificates fail `pnpm run ops:expiry`.
- Certificates inside the warning window are reported as warnings.
- Runtime certificate expiry remains a release blocking condition.
- Development certificates default to 90 days so a newly issued certificate is
  outside the 30-day warning window. The generator rejects values longer than
  397 days and values that would begin inside the warning window.

The runtime list is declared in [certificate-lifecycle.json](../../config/certificate-lifecycle.json).

## Negative Test Fixtures

Negative security test certificates are explicitly classified as test fixtures. They are excluded from runtime certificate expiry enforcement but are independently validated to ensure that their intended invalid state remains intact.

Examples include expired clients, untrusted clients, or wrong-identity clients used to prove that mTLS rejects invalid callers.

Policy:

- `type`: `test-fixture`
- `production`: `false`
- `expiryPolicy`: `expect-expired` when the fixture must be expired
- `expectedState`: `expired` for the current expired-client fixture
- Fixture state is validated with `pnpm run test:cert-fixtures`.

If a fixture expected to be expired becomes valid, fixture validation fails. If a runtime certificate expires, `ops:expiry` fails. These checks are intentionally separate.
