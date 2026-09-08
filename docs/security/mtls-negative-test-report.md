# mTLS Positive and Negative Test Report

## Result

Gateway transport authentication is `PASS` in the local `highpass-phase2` network. mTLS establishes the Gateway/service identity only; user authorization remains the responsibility of OIDC/development authentication plus server-side RBAC/ABAC and Study/Series token scope validation.

| Test | Expected | Actual | Verdict |
|---|---|---|---|
| Valid CA, Gateway SAN, clientAuth certificate | ALLOW | ALLOW | PASS |
| No client certificate | DENY | DENY | PASS |
| Wrong/untrusted issuer | DENY | DENY | PASS |
| Wrong SPIFFE SAN signed by trusted CA | DENY | DENY | PASS |
| Wrong EKU signed by trusted CA | DENY | DENY | PASS |
| Expired certificate signed by current development CA | DENY | DENY | PASS |
| Expired `bad-client` fixture | DENY | DENY | PASS |
| Gateway→Orthanc mTLS proxy | ALLOW | ALLOW | PASS |
| Viewer/browser→Orthanc direct | DENY | DENY | PASS |
| Host→Orthanc direct port | DENY | no host port binding | PASS |

The proxy requests and verifies a client certificate, then compares the authenticated peer SAN with `URI:spiffe://highpass.local/gateway/hipass-gateway-service`. A trusted CA alone is insufficient. Wrong SAN returns a generic identity denial and does not disclose certificate paths.

Reproduction:

```powershell
$env:HIPASS_MTLS_TEST_NETWORK='highpass-phase2_dicom_gateway_net'
$env:HIPASS_MTLS_TEST_IMAGE='highpass-platform-mvp:local'
node scripts/mtls-negative-check.js
```

Evidence: `evidence/generated/2026-09-08T11-08-07-528Z/mtls-negative.txt` and `network-gate.txt`.
