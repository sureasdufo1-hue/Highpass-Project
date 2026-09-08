# Phase 4 Evidence Index

## Evidence baseline

- Repository SHA: `22f9df96e02d377ee7083f6bfe70478d17143d19`
- Full validation time: 2026-09-08 21:17–21:20 KST
- Generated evidence root: `evidence/generated/2026-09-08T12-18-59-324Z/`
- Review status: `DRAFT / UNASSIGNED`
- Scope: local synthetic CAPSTONE MVP only

## Automated evidence

| Evidence | Result | Location |
|---|---|---|
| Compose service state | PASS | `compose-ps.json` |
| Network segmentation gate | PASS | `network-gate.txt` |
| Gateway-to-Orthanc mTLS | PASS | `mtls-negative.txt` |
| Security Gate | PASS | `security-gate.txt` |
| Container exception gate | PASS | `container-gate.txt` |
| Certificate expiry policy | PASS | `expiry-gate.txt` |
| Expired certificate fixture | PASS | `cert-fixtures.txt` |
| HTTPS consent-to-Viewer E2E | PASS | `https-e2e.txt` |
| Non-sensitive certificate metadata | PASS | `certificate-metadata.json` |
| Hashes and review metadata | PASS | `manifest.json` |

All paths in the table are relative to the generated evidence root. The manifest records nine evidence items, each with a SHA-256 digest and local-test qualification.

## Rehearsal evidence

| Evidence | Result | Source |
|---|---|---|
| Environment-free `mvp:start` | PASS | Phase 4 report command result |
| Bounded readiness | PASS | `scripts/mvp-verify.js` and Phase 4 report |
| Non-destructive stop/start | PASS | Phase 4 report |
| PostgreSQL count preservation | PASS | `consents=19`, `imaging_studies=5` before/after |
| PostgreSQL/Orthanc volume preservation | PASS | Same two named volumes before/after |
| Served portal limitation banner | PASS | CA-verified HTTPS response |
| Interactive portal rendering | PASS | Chrome rendered the MVP banner, synthetic patient portal, roles, and Gateway boundary under trusted TLS |
| Authorized portal Viewer flow | PASS | Browser trace confirmed image visibility, QIDO/WADO Authorization headers, and no token in URL |
| OHIF startup | PASS | Required runtime configuration restored; unauthenticated DICOMweb request denied fail-closed |

## Evidence handling

- No private key, raw access token, password, or real patient data was intentionally captured.
- Generated records remain `DRAFT / UNASSIGNED` until human review.
- The test-only development CA was registered in `CurrentUser\Root`; browser TLS verification was not weakened.
- These records are technical test evidence, not legal, certification, hospital approval, or production-readiness evidence.
