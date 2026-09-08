# Phase 2 Evidence Index

## Evidence set

- Repository SHA: `22f9df96e02d377ee7083f6bfe70478d17143d19`
- Environment: local Docker Desktop / WSL2 test environment
- Evidence root: `evidence/generated/2026-09-08T11-08-07-528Z`
- Manifest: `evidence/generated/2026-09-08T11-08-07-528Z/manifest.json`
- Review status: `DRAFT`
- Reviewer: `UNASSIGNED`
- Personal data: none declared; synthetic data only
- Secrets/private keys: excluded

| Evidence ID | Description | Result | File |
|---|---|---|---|
| EV-ENV-001 | Docker Compose service state | PASS | `compose-ps.json` |
| EV-NET-001 | network segmentation | PASS | `network-gate.txt` |
| EV-MTLS-001 | mTLS positive/negative tests | PASS | `mtls-negative.txt` |
| EV-SEC-001 | unit, secret, dependency Security Gate | PASS | `security-gate.txt` |
| EV-VULN-001 | container vulnerability exception gate | PASS | `container-gate.txt` |
| EV-EXP-001 | exception and runtime certificate expiry | PASS | `expiry-gate.txt` |
| EV-CERTFIX-001 | expired fixture state | PASS | `cert-fixtures.txt` |
| EV-E2E-001 | consent→policy→token→DICOMweb→Viewer→audit E2E | PASS | `https-e2e.txt` |
| EV-CERT-001 | non-sensitive certificate metadata | PASS | `certificate-metadata.json` |

The HTTPS E2E result is 22/22 PASS. Current Node regression is recorded separately in the Security Gate; after the externally added PHR tests, the final direct run is 124/124 PASS. Container Gate reports zero confirmed runtime critical findings and six approved, unexpired high-risk exceptions.

These generated files are technical test evidence, not reviewed audit evidence. They remain `DRAFT / UNASSIGNED` until an authorized reviewer verifies hashes, commands, environment, and scope.

## Out of Phase 2 / not verified

Actual IdP, KMS/HSM, hospital PACS, mobile device, external Staging, legal PIPA determination, ISMS-P certification, hospital security approval, and production readiness are `NOT VERIFIED` or `DEFERRED` as applicable.

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
