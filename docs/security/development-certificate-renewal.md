# Development Certificate Renewal

## Scope and result

Only ignored local development certificates under `tmp/certs` were renewed. No production certificate, production key, real hospital credential, or patient data was accessed. Runtime certificate expiry changed from 2026-09-25 07:32:29 UTC to 2026-12-06 23:18:39 UTC (2026-12-07 08:18:39 KST). All four runtime certificates are `OK` with 89 days remaining at validation time.

| Certificate | Subject | Issuer | SAN | EKU | Key match / chain |
|---|---|---|---|---|---|
| Edge | `CN=localhost` | development CA | `DNS:localhost`, `IP:127.0.0.1` | serverAuth | PASS / PASS |
| Development CA | `CN=hipass-dev-root-ca` | self-signed | N/A | CA signing | PASS |
| Gateway client | `CN=hipass-gateway-service` | development CA | `URI:spiffe://highpass.local/gateway/hipass-gateway-service` | clientAuth | PASS / PASS |
| Orthanc mTLS server | `CN=hospital-a-orthanc-mtls` | development CA | `DNS:hospital-a-orthanc-mtls` | serverAuth | PASS / PASS |

The generator defaults to 90 days and accepts only 31–397 days. Key Usage is critical and role-specific, and the Gateway client has a pinned service SAN. The existing `bad-client` fixture was not regenerated: its certificate/key SHA-256 values match the pre-renewal backup and its 2026-08-24 expiry remains independently verified.

## Rollback material

Pre-renewal development files were copied to `tmp/certs-phase2-rollback-20260908T080400Z`. Certificate/key pairing and CA chains were checked without printing private-key material. Because the former Gateway certificate predates the new SPIFFE SAN requirement, rollback uses an explicit legacy subject-CN pin rather than disabling client identity validation.

On 2026-09-09 an isolated live rollback rehearsal ran the old CA, server certificate, and client certificate on `highpass-phase2_dicom_private_net`. The old pinned client was allowed, a client without a certificate was denied, and the current-CA client was denied by the old CA. The temporary proxy was removed and the active current-certificate stack remained healthy. Result: `PASS — ISOLATED DEVELOPMENT CERTIFICATE ROLLBACK REHEARSAL`.

Private keys and generated fixtures remain outside Git. Repository and container log scans found no private-key body, token, or secret assignment.

Evidence: `pnpm run test:cert-rollback`, `evidence/generated/2026-09-09T05-14-59-590Z/certificate-metadata.json`, `expiry-gate.txt`, and `cert-fixtures.txt`.
