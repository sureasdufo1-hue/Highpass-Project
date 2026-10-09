# P0-05 expiry maintenance enrollment and isolation

2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + dirty worktree.
Result: MAINTENANCE IDENTITY FOUNDATION VERIFIED; PERSISTED EXPIRY NOT IMPLEMENTED.
Evidence DRAFT / UNASSIGNED; earlier 김범희 r3 review is not inherited.
Related V3-FR-EX-007, V3-FR-TEN-002/003, FR-014~025/037~041.

## Changes

Existing auth has INTERNAL_SERVICE, while v3 registry/DDL admitted only human roles.
The v3 registry now explicitly admits source-scoped SESSION_EXPIRY service enrollment,
no patient binding and sole exchange:expire scope. Mixed JWT roles/scopes deny;
human expiry enrollment denies. Server purpose cannot be overwritten by body/header/JWT.
Legacy shared InternalServiceProvider and developer header authentication remain unsupported.

016 adds persistent service_purpose and null-safe exact CHECK; tenant transactions compare
persisted purpose under active principal/source locks. Restrictive clinical-context policies
block maintenance from identity refs/mappings/audits/ledgers and Session scope/creation/cancel
metadata. Existing human create/read/cancel/Mapping flows retain regression coverage.
New expiry batch contract accepts only limit1..100/default25 and frozen source IDs.
This is not an expiry event service, scheduler or clinical capability. No runtime DB applied.

## Commands and current evidence

| Command | Exit/result |
|---|---|
| node --test expiry contract / registry / tenant transaction | 0 / 24 PASS, 442.5874ms |
| node --test (final) | 0 / 347 PASS, 0 FAIL/skip, 41239.3496ms |
| node scripts/v3-identity-transaction-check.js (final) | 0 / 174 PASS, 44082ms; cleanup PASS |
| node scripts/verify-evidence-manifest.js <final manifest> | 0 / 1 digest PASS, DRAFT/UNASSIGNED |
| node scripts/security-secret-scan.js | 0 / PASS, no findings |
| git diff --check | 0; CRLF notices only |

Final manifest: `evidence/generated/hp-v3-identity-tx-2026-10-07T13-52-57-553Z-72654700/manifest.json`.
SHA-256: `35b0fb614d313aa6ac62581b1a60ed00bf4dadfd47f3774828a409e45213f1d1`.
33 covered source hashes unchanged during run; not whole-worktree attestation.
016 SHA-256: `c9ac9d584a77a76300e4ad6260cc400627fd42031a850f8d199cfe637648ee76`.
Node live-script guards are not live E2E. Secret scan does not prove absence of every
possible personal-data pattern.

Actual nonowner PG proves dedicated bound source batch, zero clinical metadata/audit
visibility, identity audit forgery denied42501 despite old permissive policy, overbroad
DB enrollment denied23514, and suspension denies before repository callback. Unit tests
cover issuer/audience/subject/role/institution/scope/expiry, mixed roles, raw binding clone,
purpose spoofing, invalid configuration and bounded/accessor/prototype batch input.

## Startup failures retained

`...13-49-53-438Z-84623cce` and `...13-51-15-966Z-5e44cc22` each exited1,
POSTGRES_START_UNAVAILABLE / NOT VERIFIED, zero DB checks, cleanup PASS. They are not
reclassified as PASS. Docker Engine29.8.0 responded and existing unrelated stacks were
running; none was stopped. Fixture launch limit changed20s->45s, still finite, followed
by a successful full run. Exact cause of launch latency is not independently established.
Only own labelled disposable fixtures were removed; existing project data untouched.

## Remaining and next execution

Persisted EXPIRED transition/worker, separate least-privilege maintenance pool, batch/race/
lost-ACK tests, complete original create receipt lifecycle, actual cascade delivery,
complete clinical transitions, external workload identity/rotation and independent human
review remain pending. Separate test issuer/audience does not prove external IdP isolation.
New tenant transaction code requires016 in its isolated DB; old DB must not activate it.
[Expiry transaction prompt](../implementation/highpass-v3-p0-05-expiry-transaction-prompt.md)
was written and migration/privilege/proof dependencies inspected. Full P0-05/MVP/v3 are
incomplete. No commit/push/merge or existing worker/server activation performed.
