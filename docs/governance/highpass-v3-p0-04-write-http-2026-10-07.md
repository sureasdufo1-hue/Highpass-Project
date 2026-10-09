# P0-04 Mapping write HTTP verification

Date: 2026-10-07. Status: LOCAL HTTP/PG TESTED — NOT ACTIVATED.
Human review: UNASSIGNED / NOT VERIFIED. No legacy approval is inherited.

## Work performed

Executed [write HTTP prompt](../implementation/highpass-v3-p0-04-write-http-prompt.md).
Added dependency-injected reconcile/review routes; existing server and databases
were not changed or migrated. Principal registry derives identity, role and scope;
the existing transactional service owns mutations, idempotency and audit.

Required idempotency/audit headers, optional trace validation, duplicate security
header rejection, no URL query tokens, JSON-only unencoded bodies, strict UTF-8,
16 KiB size limit and a maximum 5-second body deadline are enforced. Error
responses are no-store Problems without body/token/SQL/stack reflection; rejected
bodies close their connection. Normal responses contain only metadata.
Idempotency key alphabet now matches the existing OpenAPI (`._:-` included).

## Executed verification

| Command/check | Result | Evidence |
|---|---|---|
| Targeted reader/idempotency tests | PASS | 8/8, exit 0, 201.9875 ms |
| Independent PostgreSQL + loopback HTTP helper | PASS | 90 checks, exit 0, 25,293 ms; cleanup PASS |
| Manifest verifier | PASS | 1 entry; DRAFT / UNASSIGNED |
| Post-run source hashes | PASS | 19 recorded files, zero differences; not full worktree/image attestation |
| Secret pattern scan | PASS | zero findings at 2026-10-07T12:06:49.596Z; not proof against all secret/PII classes |
| Full Node regression | PASS | `node --test`: 320/320, fail/skip 0, exit 0, 38,008.4222 ms; script entry guards are not live HTTPS/staging gates |

The PG/HTTP checks cover creation 201, separate reviewer 200, same-key retry,
different-command 409, context forgery 422, maker 403, stale version 409,
foreign/missing uniform 404, audit-fault rollback 503, invalid/oversized bodies,
header/media/auth/scope denial, actual duplicate headers and incomplete-body 408.

Evidence directory:
`evidence/generated/hp-v3-identity-tx-2026-10-07T12-06-28-780Z-30ed7815/`.
Manifest SHA-256:
`a9437ebc7be4728fa6613037b0a55bc0dc008856e14f2bda322db264e24c33fa`.
Repository HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` plus uncommitted diff.
The prior 88-check run is retained; latest adds two actual transport probes.

## Remaining gates

- Cross-institution PatientRef approval/membership contract and implementation:
  no implicit sharing, owner copying or global patient search is implemented.
- Runtime route activation with trusted ingress/DPoP, role provisioning,
  migration/rollback rehearsal, rebuilt image and HTTPS/mTLS live gates.
- Full audit chain/outbox delivery, external IdP/KMS/PACS and DB verify-full.
- New scoped independent human review, full API HA and remaining v3 P0 packages.

Impact references: legacy FR-014~FR-025 and FR-037~FR-041; this report does not
claim their complete end-to-end fulfilment. P0-04 remains IN PROGRESS.
No commit/push/merge/PR performed. No whole MVP/v3 or production readiness claim.
