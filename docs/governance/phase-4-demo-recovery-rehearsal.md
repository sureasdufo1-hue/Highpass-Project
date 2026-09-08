# Phase 4 Capstone Demo Reproducibility and Recovery Rehearsal

## Phase result

- Previous Level: Phase 3 existing MVP end-to-end validation PASS
- Target: Phase 4 capstone demo reproducibility and recovery rehearsal
- Achieved: **YES**
- Qualifier: Automated replay, non-destructive recovery, trusted-TLS portal rendering, and Viewer acceptance PASS in the local synthetic environment.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`

## Baseline

- Repository SHA: `22f9df96e02d377ee7083f6bfe70478d17143d19`
- Branch: `codex/fix-edge-platform-assets`
- Environment: Windows + Docker Desktop Linux Engine 29.5.3
- Compose project: `highpass-phase2`
- Data: synthetic-only MVP fixtures
- Existing dirty PHR worktree changes: preserved

## Reproducibility changes

| Item | Previous behavior | Phase 4 behavior | Result |
|---|---|---|---|
| Compose start | `--wait` returned non-zero for successful one-shot jobs | `up -d --build` plus bounded service/HTTPS readiness | PASS |
| Project/network selection | Six external environment assignments required | Safe `highpass-phase2` defaults with explicit override support | PASS |
| Readiness | Single immediate status read | Polls for up to 120 seconds, then fails closed | PASS |
| Start command | Manual multi-command sequence | `pnpm run mvp:start` | PASS |
| Cleanup command | Could target a different default project | `pnpm run mvp:cleanup` uses the same project resolution | Implemented; destructive cleanup not used |
| Endpoint documentation | Portal and OHIF paths were reversed | Portal `/hipass/`, OHIF `/` | PASS |
| Orthanc UI path | Portal linked to an intentionally unpublished direct port | Direct link removed; Gateway-only boundary is explained | PASS |
| OHIF startup contract | Missing `extensions`/`modes` caused a black screen | Bundled-version configuration contract restored and regression-tested | PASS |

## Recovery rehearsal

No `down`, volume deletion, or destructive reset was performed.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Compose stop | No persistent service remains running | Running service list empty | PASS |
| Stop duration | Finite | 8.94 seconds | PASS |
| Compose start | Six required services recover | All running and healthy | PASS |
| HTTPS health | HTTP 200 with trusted project CA | 200 | PASS |
| Recovery duration | Within 120-second readiness limit | 34.62 seconds | PASS |
| PostgreSQL data | Counts unchanged | `consents=19`, `imaging_studies=5` before and after | PASS |
| Named volumes | Same volume names remain | PostgreSQL and Orthanc volumes unchanged | PASS |

Preserved volumes:

- `highpass-phase2_hipass-postgres-data`
- `highpass-phase2_hospital-a-orthanc-data`

## Demo surface validation

| Check | Actual | Result |
|---|---|---|
| Portal HTTPS response | `/hipass/` returned 200 using the project CA | PASS |
| MVP limitation banner | `CAPSTONE MVP`, `합성 데이터`, `비운영` present in served HTML | PASS |
| OHIF response | `/` returned the OHIF application HTML | PASS |
| Browser visual rendering | Development CA trusted in `CurrentUser\Root`; portal rendered in Chrome | PASS |
| TLS bypass | No warning bypass or verification-disable option used | PASS |
| Authorized portal Viewer flow | Instance loaded, image visible, QIDO/WADO sent with Authorization header and no token in URL | PASS |
| OHIF unauthenticated state | Viewer shell rendered; data request denied with a generic connection error | PASS — expected fail-closed behavior |

The development CA `CN=hipass-dev-root-ca` was imported into the current user's Windows root store with thumbprint `22A2DF443112028EB3A194FACE963436A7B6F787`. It expires on 2026-12-07 KST and is test-only. No machine-wide trust or TLS bypass was used.

## Regression validation

The first `pnpm run mvp:verify` attempt failed at `unit-integration`. A direct `node --test` rerun passed 124/124. After adding the OHIF configuration regression test, the final run passed 125/125 and the complete command was rerun from the beginning. The passing full rerun is the current result; the earlier failure is retained here rather than hidden.

| Validation | Actual | Result |
|---|---|---|
| `pnpm run mvp:start` | Compose start 95.23 s; readiness 6.66 s; exit 0 | PASS |
| Node unit/integration | 125/125 | PASS |
| HTTPS E2E | 10.83 s; exit 0 | PASS |
| mTLS positive/negative | 41.20 s; exit 0 | PASS |
| Network boundary | 23.38 s; exit 0 | PASS |
| Security Gate | exit 0 | PASS |
| Container Gate | exit 0 | PASS |
| Compliance evidence | 65.81 s; exit 0 | PASS |
| Full `pnpm run mvp:verify` | 14/14 orchestration stages; approximately 151.5 s; exit 0 | PASS |

## Evidence

- Latest generated evidence: `evidence/generated/2026-09-08T12-18-59-324Z/`
- Manifest review state: `DRAFT / UNASSIGNED`
- Manifest flags: `containsPersonalData=false`, `containsSecrets=false`
- Evidence index: `docs/evidence/phase-4-evidence-index.md`

## Next gate

Phase 4 is complete. The next gate is **Phase 5 presentation package freeze and final handoff**: freeze the verified command set, consolidate the evidence links, record the merged commit SHA, and prepare the final presentation checklist without promoting local results to production or compliance approval.

PIPA, ISMS-P, hospital security approval, production readiness, real IdP/KMS/PACS, and external staging remain `DEFERRED` or `BLOCKED` as documented in the commercialization backlog.
