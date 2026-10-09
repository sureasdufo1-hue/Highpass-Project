# P0-05 internal Session creation execution

Date: 2026-10-07. IN PROGRESS — INTERNAL SOURCE CREATION TESTED / NOT ACTIVATED.
Review: DRAFT / UNASSIGNED; no legacy reviewer approval is inherited.

## Implemented against existing structure

Executed [Session repository prompt](../implementation/highpass-v3-p0-05-session-repository-prompt.md).
Migration 012 adds source creation authority without changing immutable 011 rows.
V3ExchangeSessionService uses the branded principal, existing bounded transaction,
source PatientRef/registry locks, target institution locks and a finite injected
expiry policy. Target tenant is derived from registry, never body input.

Creation writes Session, root creation record, both participants, canonical selected
scope hash/snapshot, typed audit and keyed result together. REQUESTED/version 1
is not consent/authorization; DESTINATION stays INVITED. Study/Series insertion is
one parameterized bulk statement, not unbounded sequential per-Series calls.
HMAC key is injected, privately copied, zeroized on disposal and never printed.

Concurrent same-key/normalized-command requests share one DB advisory-lock scope
and durable result. Different command returns 409. Replay rechecks active principal,
patient binding, source ref, target statuses, expiry and stored snapshot hash.
Original metadata is unchanged because current foundation Sessions are immutable
REQUESTED/version 1; later state gates must preserve ledger response semantics and
deny replay of expired/cancelled/revoked authorization rather than treating an old
snapshot as present permission. Key rotation/ledger retention is not implemented.

## Security/RLS decisions

- Directory access is limited to the selected hospital/derived tenant via LOCAL
  context and active registered create-scope caller. It exposes nonpatient registry
  metadata only, not patient/session access. Actual creation checks/locks source
  activity first. A bare app-SQL principal context is not a verified bearer token.
- Original requester can read its own creation metadata with create scope so atomic
  assembly/retry works. The recipient cannot use a named target ID to see the Session.
- A root record binds recorded source/recipient/PatientRef tuples by deferred FKs;
  participant INSERT checks that root, not the parent participant policy recursively.
- Audit identity/existence is bound by a deferred composite FK. Patient creation
  does not enable administrative audit SELECT and does not use SECURITY DEFINER.
- Missing source ref/target authority commits a safe scoped DENY audit before uniform
  404. Audit failure rolls all creation records back. Conflict/pre-validation audit
  coverage and dedicated metadata-read audit remain a subsequent gate.
- Snapshot append and recipient self-insertion fail actual constraint/RLS checks;
  registry updates are not enabled by lock-only policies. No clinical grant is issued.

## Actual tests

| Command/check | Result | Evidence |
|---|---|---|
| Targeted Session service/contract | PASS | 8/8, fail/skip 0, exit 0, 341.6753 ms |
| Independent PG + prior Mapping HTTP + internal Session create | PASS | 108 checks, exit 0, 40,310 ms; owned fixture cleanup PASS |
| 006~012 rollback/apply | PASS | disposable DB only; no existing data migration |
| Provider/admin and patient creation | PASS | actual nonowner/NOBYPASSRLS pool; bound patient drift denies replay |
| Concurrent retry and lost COMMIT ACK | PASS | one committed Session/creation audit; outcome unknown then durable retry |
| Invited recipient and snapshot append | PASS | no recipient Session read; raw INSERT 42501; append 23514+rollback |
| Audit fault and suspended target replay | PASS | 503 rolls back Session/context/result; target suspension DENY, restore same result |
| Manifest verifier | PASS | 1 entry DRAFT / UNASSIGNED |
| Post-run hashes | PASS | 23 recorded sources, zero differences; not full dirty diff/image attestation |
| Secret pattern scanner | PASS | zero findings at 2026-10-07T12:54:59.166Z; not comprehensive secret/PII proof |
| Full Node regression | PASS | `node --test`: 328/328, fail/skip 0, exit 0, 41,477.3522 ms; guarded script entries are not live HTTPS/staging execution |

Evidence directory: `evidence/generated/hp-v3-identity-tx-2026-10-07T12-53-56-673Z-c3ce6a57/`.
Manifest SHA-256: `97f51351948baf28e2777f0779c10d6729d47b9f05f04d7560558c31f6c4c2e1`.
012 SHA-256: `a57cc8f1d412ffe92b8f38cb87ab99428e1eb3c99dbc062fe754ea215186810d`.
HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` plus uncommitted changes.

Failed/intermediate evidence retained: `12-42-28-661Z-d78dd976` and
`12-44-38-774Z-f839191c` record 42P17, not policy DENY PASS. Participant INSERT
was corrected to a FK-bound root without recursive parent SELECT. The provider-only
PASS is retained. `12-48-17-075Z-b893f218` records patient assembly failure because
the old audit SELECT was correctly invisible; the composite-FK proof fixed assembly
without granting patient audit read. Later PASS plus final expanded tests are retained.
No fixture containers remain; no TLS/mTLS relaxation or gate skip used.

## Remaining scope

Dedicated Session GET/audit service, complete conflict/pre-auth denial audit,
target-suspension race tests, clinical DOCTOR service integration case, state/cancel,
Session HTTP, consent/recipient activation, cross-institution mapping and full v3
E2E remain NOT VERIFIED. Session creation does not yet encode the future requested
clinical access modes; action/scope alignment with Consent/Grant must remain PARTIAL.
Actual IdP enrollment/KMS/PACS, audit-chain delivery and deployed HTTPS/mTLS remain
outside this internal test evidence. No whole MVP/v3 or production readiness claim.
No existing DB/server activation, runtime grants, commit/push/merge/PR.

Next: [Session metadata/audit prompt](../implementation/highpass-v3-p0-05-session-read-audit-prompt.md).
Related: V3-FR-EX-001/002/004/005/006, TEN-002/003, ID-001~005, AUD-001/002;
legacy FR-014~025/FR-037~041 are impact references, not end-to-end completion claims.
