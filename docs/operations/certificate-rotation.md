# Certificate Rotation

## Inventory

Latest inspected test certificates:

| Certificate | Subject | Issuer | Not After | Fingerprint |
|---|---|---|---|---|
| `tmp/certs/edge/localhost.crt` | CN=localhost | CN=hipass-dev-root-ca | 2026-09-22T06:20:25Z | 67:5F:93:79:15:A9:01:38:00:A8:BB:26:E0:6E:26:EB:55:77:74:E1:35:59:44:55:FE:B3:31:97:F7:E8:EB:87 |
| `tmp/certs/mtls/ca.crt` | CN=hipass-dev-root-ca | CN=hipass-dev-root-ca | 2026-09-22T06:20:25Z | FD:F6:03:0B:01:05:3A:86:D3:8E:5F:E8:62:F7:31:46:FA:87:BE:38:7E:95:45:C0:30:30:AD:B0:28:EC:12:A0 |
| `tmp/certs/mtls/gateway-client.crt` | CN=hipass-gateway-service | CN=hipass-dev-root-ca | 2026-09-22T06:20:25Z | 36:0F:80:23:2F:B3:02:7F:F4:F3:27:60:E7:0E:42:2B:1C:44:76:A8:2C:27:6C:C3:53:B9:2C:8E:32:0F:57:86 |
| `tmp/certs/mtls/orthanc-server.crt` | CN=hospital-a-orthanc-mtls | CN=hipass-dev-root-ca | 2026-09-22T06:20:25Z | 1B:16:5C:07:6A:86:9B:62:B0:85:72:6A:F6:13:64:3A:E7:48:6E:95:66:92:43:66:B9:BB:FF:AD:0B:59:54:92 |

Private keys are not printed in evidence.

## Procedure

1. Generate replacement test certs with `scripts/generate-dev-certs.ps1` into a separate directory first.
2. Validate SAN, issuer, validity, and fingerprint.
3. Replace mounted cert files during an approved maintenance window.
4. Restart `hipass-edge`, `hospital-a-orthanc-mtls`, and `hipass-control-api`.
5. Verify HTTPS health, mTLS allow with the new client cert, and denial for wrong cert.

## Runtime Rotation Evidence

Runtime rotation was performed with development/test certificates only.

Evidence:

- `artifacts/operations/certificate-rotation-20260823-152021/summary.json`
- `artifacts/operations/certificate-rotation-20260823-152021/mtls-node-retest.json`
- `artifacts/operations/certificate-rotation-20260823-152021/mtls-old-client-retest.json`

Results:

- Edge TLS `CERT-A -> CERT-B`: `PASS`
- Edge wrong hostname denial: `PASS`
- Edge rollback to `CERT-A`: `PASS`
- Edge final roll-forward to `CERT-B`: `PASS`
- mTLS CA/client/server replacement: `PASS`
- New mTLS client accepted: `PASS`
- Old mTLS client rejected after CA rotation: `PASS`
- Missing mTLS client rejected: `PASS`

Private keys were not copied into repository-tracked evidence. Temporary private material remains only under ignored `tmp/` paths.

## Browser Trust Repair

Root cause: the active development CA was not trusted in the Windows CurrentUser Root store after rotation.

Fix:

1. Added the active test CA with `certutil -f -user -addstore Root tmp/certs/mtls/ca.crt`.
2. Removed the stale previous `hipass-dev-root-ca` entry.
3. Re-ran browser authorization trace.

Result:

- Active CurrentUser Root thumbprint: `0C8D10AF3767BDFCFA623B3BC8DF8CCD13FBEE72`
- HTTPS browser trust: `PASS`
- Authorization header present on DICOMweb QIDO/WADO requests: `PASS`
- Bearer token in URL: `false`
- Evidence timestamp: `2026-08-23T06:57:17.419Z`

The UI click path reported `Missing instance row`, then the browser automation used the secured browser fetch fallback. The security boundary still passed because all DICOMweb requests used HTTPS, carried the Authorization header, and did not expose the token in URLs.
