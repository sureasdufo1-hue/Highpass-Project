# P0-05 Session schema foundation verification

2026-10-07. IN PROGRESS — SCHEMA / NONOWNER READ RLS TESTED ONLY.
New evidence: DRAFT / UNASSIGNED. No legacy human approval inherited.

## Executed prompt and change

Executed the schema stage of the [Session DB prompt](../implementation/highpass-v3-p0-05-session-db-prompt.md).
Added migration 011 with Session, SOURCE/DESTINATION participants, immutable
Study/Series snapshot, Session audit outbox and typed create-result ledger.
No existing DB was migrated; no application route or credentials were activated.

Source ownership and requester institution use composite foreign keys; original
PatientRef ownership is not reassigned. Initial state/version are REQUESTED/1.
SOURCE is ACTIVE; DESTINATION is INVITED and sees no patient/session/scope rows.
Patient reads require its persistent registered reference; institution suspension
removes session/audit/result visibility. Audit reads require scoped admin+audit:read.

Deferred assembly requires selected resources, both consistent participants,
active registry/source ownership, audit correlation and a result ledger in one
transaction. Missing parts roll back. An immutable resource count plus insert
constraint also prevents later scope append; UPDATE/DELETE are denied. Empty Series
cannot turn into whole Study. Whole Study is explicit `whole_study` with NULL Series.

This is a fail-closed rollout stage: there are deliberately no application write
policies or runtime grants. The assembly success checks use an isolated schema
owner fixture. They are NOT evidence of authenticated application creation,
idempotency concurrency or actual consent. Owner/superuser protection is limited
to ordinary tested statements, not immunity to disabling triggers/DDL/TRUNCATE.

## Verification

| Command/check | Result | Evidence |
|---|---|---|
| `node scripts/v3-exchange-schema-check.js` | PASS | 32 checks, exit 0, 41,713 ms; owned fixture cleanup PASS |
| Migration rollback and apply | PASS | 006~011 rolled back to no schema, then applied inside disposable PG only |
| Scoped RLS/constraint checks | PASS | source, invited target, bound/other patient, missing context, suspended institution; exact SQLSTATE for denial |
| Missing assembly and late scope append | PASS | rollback/23514; no orphan Session/scope/result rows |
| Manifest verifier | PASS | 1 entry hash verified; DRAFT/UNASSIGNED |
| Post-run source hash comparison | PASS | 7 recorded SQL/helper files unchanged; not full worktree/image parity |
| Secret pattern scanner | PASS | zero findings at 2026-10-07T12:30:42.875Z, not comprehensive PII certification |
| Full Node regression | PASS | `node --test`: 325/325, fail/skip 0, exit 0, 38,138.9395 ms; guarded live scripts are not HTTPS/staging gates |

Evidence: `evidence/generated/hp-v3-exchange-schema-2026-10-07T12-29-16-389Z-f1de2659/`.
Manifest SHA-256: `a632be89525204c4359ce747578cfb925dcd04c33459da3695115f86624c76ba`.
011 SHA-256: `6bdf67ccb746fa58f8638fffd6e945328474f3be6d49c0d12db7b3fe32286fd4`.
Repository HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` plus uncommitted diff;
PostgreSQL image `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.

Initial failed run `12-25-47-287Z-49fa2a52` is retained: expected 23514 for immutable
mutation, but inherited reject_identity_audit_mutation explicitly raises 42501.
The test expectation was corrected after inspecting migration 007, not accepting
arbitrary errors or changing the guard. The next 31-check PASS is retained; latest
32-check run adds the sealed-snapshot append denial. All fixture containers removed.

## Remaining gates and next action

Authenticated Session repository, write/read-after-create policies, target registry
row locks, finite policy expiry checks at commit, generated canonical snapshot hash,
durable HMAC idempotency/concurrency/lost ACK, read/denial audit services, transitions,
cancel, recipient consent/activation, HTTP and live HTTPS/mTLS remain NOT VERIFIED.
The current identity/root registry SELECT is not silently widened to solve these.
No whole P0-05/P0-04/v3/MVP completion, hospital/PIPA/ISMS-P or production claim.

Next: [Session repository authority prompt](../implementation/highpass-v3-p0-05-session-repository-prompt.md).
Related: V3-FR-EX-001~007, V3-FR-TEN-002/003, V3-FR-ID-001~005, V3-FR-AUD-001/002.
No commit/push/merge/PR; existing volumes and runtime remain untouched.
