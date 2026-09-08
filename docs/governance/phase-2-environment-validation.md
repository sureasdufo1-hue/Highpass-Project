# Phase 2 Environment Validation

## Result

`PASS` for the Phase 2 local technical environment at repository SHA `22f9df96e02d377ee7083f6bfe70478d17143d19`.

| Item | Observed result | Verdict |
|---|---|---|
| Branch | `codex/fix-edge-platform-assets` | PASS |
| Node.js | `v24.18.0` | PASS |
| pnpm | executed `11.7.0` | PASS |
| Docker Engine | `29.5.3`, daemon reachable | PASS |
| Docker Compose | `v5.1.4` | PASS |
| Compose project | `highpass-phase2` | PASS |
| HTTPS API readiness | `https://localhost:3443/api/health` → 200, DB `UP` | PASS |
| Viewer readiness | `https://localhost:3443/hipass/` → 200 | PASS |
| Persistent services | Edge, Control API, PostgreSQL, Orthanc, mTLS proxy, Viewer healthy | PASS |
| Seed/mapping jobs | exited 0 | PASS |
| Orthanc host publication | no host binding for 8042/4242 | PASS |
| Log disclosure scan | 0 JWT, Bearer, private-key marker, secret assignment, token query parameter | PASS |

The application image now copies the runtime privacy configuration and inference service files required by `src/server.js`. Edge, Control API, mTLS proxy, and seed jobs reference one common locally built application image so that stale tags cannot run older security code.

Network tests verified Viewer→PostgreSQL `DENY`, Viewer→Orthanc `DENY`, Viewer→Gateway `ALLOW`, API→PostgreSQL `ALLOW`, and Gateway→Orthanc mTLS proxy `ALLOW`.

## Worktree observation

Before adding the six Phase 2 reports, the externally advanced HEAD had five tracked modifications and two untracked PHR test files. They were preserved and were not classified as Phase 2 implementation. Generated certificates and evidence remain ignored/generated artifacts. No volume was deleted.

`docker compose -p highpass-phase2 up -d --build --wait` reports non-zero when the current one-shot `hospital-a-phr-mapping-check` exits successfully; this is Compose `--wait` behavior for a completed job, not a failed health check. Phase 2 uses `up -d` plus explicit `ps -a`/endpoint readiness. Aligning one-shot job semantics with `--wait` is a follow-up orchestration improvement.

## Reproduction

```powershell
docker compose -p highpass-phase2 config --quiet
docker compose -p highpass-phase2 up -d --build
docker compose -p highpass-phase2 ps -a
$env:NODE_EXTRA_CA_CERTS=(Resolve-Path 'tmp/certs/mtls/ca.crt').Path
Invoke-WebRequest https://localhost:3443/api/health
```

Evidence: `evidence/generated/2026-09-08T11-08-07-528Z/manifest.json` (`DRAFT`, reviewer `UNASSIGNED`).

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
