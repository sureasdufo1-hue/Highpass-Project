# Phase 3 Existing MVP End-to-End Validation

## Gate objective

Validate the existing v2.1 MVP as one fail-closed technical flow without implementing the v3 Mobile-Core target:

`consent → RBAC/ABAC policy → short-lived scoped token → mTLS DICOMweb Gateway → synthetic DICOM stream → Viewer route → audit trail → revoke/expire denial`

Repository evidence baseline: `22f9df96e02d377ee7083f6bfe70478d17143d19` on `codex/fix-edge-platform-assets`. The worktree was dirty and all pre-existing PHR changes were preserved.

## Execution plan and completion criteria

| Gate | Completion criterion | Result |
|---|---|---|
| Preflight | required files, Compose config, pnpm pin, Docker daemon | PASS |
| Readiness | six persistent services healthy and HTTPS health 200 | PASS |
| Regression | all current Node tests pass | PASS — 124/124 |
| Certificate policy | runtime certificates valid; expired negative fixture retained | PASS |
| Positive E2E | consent, token, Series/Instance, DICOM bytes, Viewer route, audit | PASS |
| Negative E2E | missing consent, scope/purpose/hospital mismatch, tampering, revoke, expiry | PASS |
| mTLS | valid Gateway allowed; missing/untrusted/wrong SAN/wrong EKU/expired denied | PASS |
| Network boundary | Viewer direct DB/PACS denied; approved internal paths allowed | PASS |
| Security Gate | tests, secret scan, production dependency audit | PASS |
| Container Gate | recorded scan policy and non-expired exceptions | PASS |
| Evidence | nine hashed records generated as DRAFT/UNASSIGNED | PASS |

## Executed command

```powershell
$env:COMPOSE_PROJECT_NAME='highpass-phase2'
$env:HIPASS_COMPOSE_PROJECT='highpass-phase2'
$env:HIPASS_NETWORK_PREFIX='highpass-phase2'
$env:HIPASS_MTLS_TEST_NETWORK='highpass-phase2_dicom_gateway_net'
$env:HIPASS_MTLS_TEST_IMAGE='highpass-platform-mvp:local'
$env:HIPASS_MVP_KEEP_RUNNING='1'
pnpm run mvp:verify
```

The command exited 0 with overall `PASS`. Recorded top-level step time was 154,503 ms, including a second evidence-collection validation. HTTPS E2E completed in 9,299 ms in the orchestrator and 9,063 ms in the final evidence record. All fourteen reported stages passed.

## Functional result

| Flow | Observed result |
|---|---|
| Consent required | missing consent denied with `ACCESS_DENIED_NO_CONSENT` |
| Scope enforcement | out-of-scope Series and Study denied |
| Purpose/institution binding | mismatches denied |
| Short-lived access token | issue, tamper rejection, revoke denial, expiry denial verified |
| DICOMweb | allowed Series/Instance and 678-byte synthetic DICOM stream verified |
| Viewer | HTTPS route loaded successfully |
| Audit | allow, token issue, image view, and denial reason records traced |
| Data minimization | no `DICM` payload persisted in Control Plane response/log data |

## Limitations

- The Viewer assertion verifies the protected web route and streamed synthetic DICOM bytes; a human visual rendering review was not performed in this Gate.
- The Container Gate validates the repository's recorded Trivy result and exception policy; it is not a newly acquired external registry scan.
- Actual IdP, KMS/HSM, hospital PACS, mobile device, external Staging, DR, and production monitoring remain `NOT VERIFIED` or `DEFERRED`.
- All generated evidence remains `DRAFT / UNASSIGNED`.
- No commit, push, merge, volume deletion, or Phase 3 Mobile-Core implementation was performed by this Gate.

## Decision

`PHASE 3 — PASS`

Next Gate: **Phase 4 capstone demonstration reproducibility and recovery rehearsal**. It should validate a clean documented start, readiness, presenter runbook, UI rendering, deterministic cleanup/restart without volume deletion, and evidence handoff. Per user instruction, this Gate may proceed directly when work continues; commit, push, production actions, and destructive cleanup remain excluded.

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
