# Certificate Rotation

## Inventory

Latest inspected test certificates:

| Certificate | Subject | Issuer | Not After | Fingerprint |
|---|---|---|---|---|
| `tmp/certs/edge/localhost.crt` | CN=localhost | CN=hipass-dev-root-ca | 2026-09-22T01:54:42Z | 97:EC:F0:9A:2F:7B:1A:BE:16:D9:AC:C8:1A:7E:A7:BC:86:50:08:0F:47:23:5B:B7:B9:A6:A8:64:60:99:C5:37 |
| `tmp/certs/mtls/ca.crt` | CN=hipass-dev-root-ca | CN=hipass-dev-root-ca | 2026-09-22T01:54:42Z | EB:31:4B:21:33:B8:2C:98:01:BB:54:02:E7:B8:7A:5D:DD:23:35:CE:7B:03:68:8D:73:B3:C5:72:73:4B:1C:F4 |
| `tmp/certs/mtls/gateway-client.crt` | CN=hipass-gateway-service | CN=hipass-dev-root-ca | 2026-09-22T01:54:42Z | 8A:69:74:1F:93:08:81:6E:5B:07:1F:F1:D0:B3:21:05:FF:B5:F7:DF:97:C8:CC:33:29:95:F1:C7:38:08:10:DF |
| `tmp/certs/mtls/orthanc-server.crt` | CN=hospital-a-orthanc-mtls | CN=hipass-dev-root-ca | 2026-09-22T01:54:42Z | F9:D6:5D:42:40:F6:A4:7A:91:D2:3F:35:A4:FF:B2:D3:7F:22:85:43:C3:51:11:83:A4:33:5A:CA:61:D3:4F:F0 |

Private keys are not printed in evidence.

## Procedure

1. Generate replacement test certs with `scripts/generate-dev-certs.ps1` into a separate directory first.
2. Validate SAN, issuer, validity, and fingerprint.
3. Replace mounted cert files during an approved maintenance window.
4. Restart `hipass-edge`, `hospital-a-orthanc-mtls`, and `hipass-control-api`.
5. Verify HTTPS health, mTLS allow with the new client cert, and denial for wrong cert.

## Current Status

Certificate inventory is `PASS`. Active certificate rotation was not performed in this run because it would change the current trusted test CA and browser trust state. Runtime mTLS failure/recovery was validated by stopping `hospital-a-orthanc-mtls` and confirming the Gateway returned `503 ORTHANC_UNAVAILABLE` without direct Orthanc fallback.
