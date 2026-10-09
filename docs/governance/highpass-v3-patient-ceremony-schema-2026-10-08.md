# Patient ceremony schema execution record

2026-10-08 / DRAFT TECHNICAL EVIDENCE / UNASSIGNED.
Policy reviewer and approver 김범희 / approval date2026-10-08.
His adoption authorizes implementation, not independent technical evidence PASS.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020.
Repository HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, dirty worktree preserved.

## Purpose, existing structure and decisions

Execute the schema foundation subset of the
[persistence prompt](../implementation/highpass-v3-p0-06-patient-ceremony-persistence-prompt.md).
018 PENDING objects are immutable UNVERIFIED;020 own-creator RLS cannot serve a
doctor-created preparation to a different patient actor. Pure patient command
already verifies private signed synthetic reauth but performs no durable approval.
[ADR and proposed lock DAG](../architecture/highpass-v3-patient-ceremony-persistence-adr.md)
were written BEFORE023. Actual D6 contention is still NOT VERIFIED.

## Generated and updated files

New:023 migration, `scripts/v3-patient-ceremony-schema-check.js`, ceremony ADR,
this execution record and [next projection prompt](../implementation/highpass-v3-p0-06-patient-projection-prompt.md).
Updated: patient command contract, ERD physical addendum, traceability matrix,
implementation master plan and lifecycle document checker. No existing runtime
DB, package manager, lockfile, production configuration or user code was changed.

## Implementation and security review

Two append-only tables bind a ceremony to preparation/session/version/patient/
source/target and separate patient actor. Required exact-tuple creation audit
commits with it; missing or swapped patient/correlation audit rolls back. Both
tables FORCE RLS, with no admission policies or runtime role grants. Dedicated
NOLOGIN nonadmin capability is separate from clinical/pending/expiry roles.

Server SQL canonical digest includes ordered scopes/actions, institutions/purpose/
policy/window and an independent linking clause version/text hash/purpose/window.
PG16 domain-specific JSONB canonicalization is not JS JSON.stringify. Unicode
clause hash and timezone-independent epoch serialization were checked. Submitted
staging commitment is not approval evidence. Only nonce hash is stored; uniqueness
is not proof of CSPRNG generation or one-time consumption. Finite five-minute TTL
and synthetic reauth freshness are storage checks, not private signed claims proof.

Owner fixture assembles synthetic values ONLY for constraints. Nonowner checks
prove default-deny even with direct table SELECT/INSERT privileges; they do NOT
prove patient-only admitted writes. No nonce/token/private key is logged or Git
tracked by this step. No real patient data or external PACS/IdP/KMS is used.
No ACTIVE approval, Decision ALLOW, Grant, linking, recipient activation or runtime
deployment occurs. Preparation PENDING/UNVERIFIED, Session REQUESTED1 and recipient
INVITED remain unchanged after negative tests.

## Commands and results

| Command/check | Result | Evidence |
|---|---|---|
| `node --check scripts/v3-patient-ceremony-schema-check.js` | PASS | exit0 |
| First ceremony schema run | NOT VERIFIED | 37 constraints PASS; cleanup not confirmed, exit1,73,223ms |
| Second ceremony schema run | PASS | 39 checks including cleanup, exit0,66,311ms |
| Focused patient command/registry/secure edge Node | PASS | 27/27, exit0,905.7921ms |
| `node --test` | PASS | 423/423, exit0,39,789.2037ms |
| Existing PG transaction regression, first run | NOT VERIFIED | start unavailable; no test assertions, exit1,60,337ms |
| Existing PG transaction regression, retry | NOT VERIFIED | start unavailable; no test assertions, exit1,80,123ms |
| New manifest verification | PASS | exit0, hash/path/Git identity valid, DRAFT/UNASSIGNED retained |
| Current captured source hashes | PASS | 20/20 unchanged and separately matched, exit0 |
| Lifecycle document links/coverage labels | PASS | exit0,74 files; not semantic/policy validation |
| Full patient approval/API/browser/D6 races | NOT VERIFIED | not implemented by this schema gate |

Full Node discovery explicitly skips live integration and external staging scripts;
423 PASS is not a full Docker MVP/HTTPS/staging claim. Previous DPoP failures are
not erased by this new successful run. All command/network/readiness/SQL loops in
the new checker have finite deadlines; owned fixture uses cached image `--pull=never`,
`--network none`, tmpfs and exact random name/ownership label. No broad prune/delete.

Preserved first [cleanup-uncertain schema manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T02-43-31-143Z-a41106ec/manifest.json).
The container was absent on subsequent inventory; first evidence was not rewritten.
Latest [schema manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T02-45-40-298Z-4eff8828/manifest.json):
39 PASS, cleanup PASS, sourceUnchanged true. Its removal CLI exit0 and independent
exact-name inventory exit0 confirmed absence. Start/end source hashes include all
006..023 migrations, checker and ADR; a separate current-source comparison follows.

Preserved [PG startup-unavailable manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T02-47-20-784Z-271bd285/manifest.json).
Docker later created exact fixture `hp-v3-tx-8dd118fa-ccdd-4872-9ab6-f539212904b8`;
creation time and full owner label were verified against the failed run before
removal. Only that synthetic tmpfs fixture was removed; absence confirmed exit0.
It contained no runtime data. Failure manifest retains NOT VERIFIED cleanup;
subsequent manual cleanup does not retroactively change its observations.

Preserved [PG retry startup-unavailable manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T02-51-08-593Z-2317dc85/manifest.json).
Subsequent bounded exact capability-label inventory succeeded with no containers.
The startup fault is reproducible twice in the existing published-port PG runner;
network-isolated schema runner succeeds. This is a diagnostic observation, NOT
proof that published ports, Windows networking or a specific Docker component is
the cause. No Docker restart, prune, broader container deletion or timeout/security
relaxation was performed. Current full PG regression remains NOT VERIFIED despite
previous427 successes. All failure evidence is preserved.

## Risks, unverified scope and next work

Patient-only nonowner projection, private verified nonce issuance, immutable
content versions/state events, exactly-once consumption, idempotency/lost ACK and
actual approval/revoke/cancel/expiry/institution races remain incomplete. Real
MFA/identity proof and clinical operations are not simulated into a production PASS.
The full persistence prompt is PARTIAL, not complete. Next projection prompt is
written/read; source analysis confirms the separate patient capability is required.
Before its admitted PG service gate, compare finite owned startup/readiness/port
observations to resolve the current Docker regression environment failure. Do not
silently skip current PG verification or assign PASS from previous runs.
Do not substitute more observability work for Consent→Decision→Grant downstream.

Recommended commits only: ADR/schema foundation; isolated checker and evidence;
alignment/execution docs. No commit, push, merge or PR was performed.
Overall MVP/v3 remains IN PROGRESS, NOT ACHIEVED by this gate.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
