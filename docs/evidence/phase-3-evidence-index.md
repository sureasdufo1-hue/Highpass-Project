# Phase 3 Evidence Index

## Result

- Phase: existing v2.1 MVP end-to-end validation
- Verdict: `PASS`
- Repository SHA: `22f9df96e02d377ee7083f6bfe70478d17143d19`
- Orchestrator: `pnpm run mvp:verify`
- Orchestrator exit code: `0`
- Evidence root: `evidence/generated/2026-09-08T11-23-01-612Z`
- Review state: `DRAFT / UNASSIGNED`
- Synthetic data only: YES
- Secrets/private keys collected: NO

| Evidence | Result | Notes |
|---|---|---|
| `compose-ps.json` | PASS | six persistent services healthy; one-shot jobs exit 0 |
| `network-gate.txt` | PASS | five allow/deny boundaries |
| `mtls-negative.txt` | PASS | seven certificate cases |
| `security-gate.txt` | PASS | actual pnpm 11.7.0, tests, secret scan, audit |
| `container-gate.txt` | PASS | zero confirmed runtime critical; six approved unexpired high findings |
| `expiry-gate.txt` | PASS | four runtime development certificates `OK` |
| `cert-fixtures.txt` | PASS | expired bad-client fixture preserved |
| `https-e2e.txt` | PASS | 22/22, 9,063 ms |
| `certificate-metadata.json` | PASS | non-sensitive subject/issuer/SAN/EKU/fingerprint metadata |

Manifest: `evidence/generated/2026-09-08T11-23-01-612Z/manifest.json`.

This index does not convert local evidence into legal, certification, hospital approval, or production-readiness evidence.
