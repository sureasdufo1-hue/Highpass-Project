# Pre-auth isolated append-only storage gate

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

The [isolated storage prompt](../implementation/highpass-v3-p0-06-preauth-storage-isolated-prompt.md)
is being executed. Migration022 adds a separate nine-column actorless security
event table (eight admitted fields and DB recorded_at), fixed stage/reason pairs,
host-only nullable IP and finite observation time within ten seconds of storage.
No actor/tenant/patient/session identity or raw JSON is invented at handshake
failure. NOLOGIN publisher/read policy roles are separate, FORCE RLS and immutable
triggers required. Publisher INSERT is explicit-column only, reader SELECT only;
PUBLIC gets no grants. SQL credentials alone are not socket provenance.

New owned nonowner fixture checks insert/read separation, general clinical role
denial, invalid enums/stage pair/ALLOW/subnet/infinite/stale time, duplicate UUID,
nullable IP, UPDATE/DELETE denial including privileged accidental mutation,
recorded-at override denial and exact retained-row count. These are SQL storage
tests, NOT a durable adapter, TLS-to-PG delivery or SIEM/hash-chain proof.
Actual PostgreSQL verification: `node scripts/v3-identity-transaction-check.js`
exit 0, 362 PASS checks, 78,654 ms, cleanup PASS, sourceUnchanged true.
Manifest `evidence/generated/hp-v3-identity-tx-2026-10-08T01-12-37-850Z-e41d2716/manifest.json`:
transaction digest independently matches; captured current source hashes have no
mismatch. Migration006..022 rollback removes schema; new policy roles and table
are created only in the owned fixture. Full Node regression:
`node --test --test-concurrency=1`, exit 0, 408/408 PASS, 76,569.5871 ms.
`node --check scripts/test-support/v3-preauth-storage-fixture.js` exit 0.
Document check: 51 files/143 local links PASS (links/labels only).
`git diff --check` exit 0 with existing CRLF warnings; untracked files are not
covered by this command. Existing maximum-Session HTTP timeout remains unresolved
in its preserved NOT VERIFIED run; later PASS does not establish its root cause.

Existing runtime/Compose database and login enrollment remain unchanged. Owned
test credentials are random and not printed; container is separately labelled.
Organizational retention and production security-reader ownership stay unresolved.
No retention deletion, backfill, runtime activation, commit or push is performed.
김범희 2026-10-08 approval remains synthetic preparation only, not independent
review of this new schema, production/log-retention or clinical/legal approval.

Next [durable adapter execution prompt](../implementation/highpass-v3-p0-06-preauth-durable-adapter-prompt.md)
requires truthful commit-uncertainty/idempotency semantics before any read/grant
expansion. Overall MVP/v3 remains IN PROGRESS; fresh evidence DRAFT/UNASSIGNED.
That prompt was read and its first contract analysis executed. The
[durable adapter draft](../api/highpass-v3-preauth-durable-adapter-contract.md)
distinguishes NOT_RECORDED before dispatch from OUTCOME_UNKNOWN after dispatch and
proposes separate internal reader reconciliation without publisher SELECT grants.
This design is not an implemented adapter or approved production read purpose.
