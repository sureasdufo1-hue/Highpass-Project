# DB TLS remediation — 2026-10-19

## Applied after explicit short-Control-restart approval

The historical diagnosis below is superseded by this result:

- Control image: `sha256:731fccdffbdeb0a61dedab145ecdf64f61681fe35f18f589d1b5e080df4fa8e0`.
- Active Compose: `/opt/highpass/db-tls-20261019/control/after.json`.
- All five Control DB client construction paths use `postgresTlsOptions` with
  CA validation, expected certificate hostname and minimum TLS 1.2.
- Main/PACS/patient-authority read-only live probes negotiated TLS 1.3.
- Wrong hostname and untrusted CA were rejected. Plaintext TCP was rejected.
- HBA now starts with `hostnossl all all all reject` and
  `hostnossl replication all all reject`; existing authorization rules retained.
- DB postmaster start unchanged; DR WAL sender PID unchanged and streaming.
- Current Control healthy; other protected containers unchanged; source hashes match.
- Tests: 13/13 PASS. Public root HTTP 200, unauthenticated patient records HTTP 401.
- Authenticated browser/CT E2E: NOT VERIFIED in this change.
- Unix sockets remain local admin/health transport, not TLS TCP connections.
- No commit/push requested or performed. User's unrelated DR work preserved.

Evidence: `artifacts/azure/db-tls-20261019/tls-verify.json`, `verify.json`.
Before/after configs and HBA backup remain root-protected on server. Future
deployments must derive from the current Compose config and preserve TLS env/CA
mount; older Compose snapshots can fail after plaintext rejection.
Application rollback to the old non-TLS image requires coordinated HBA rollback;
do not use the generic image rollback alone. No rollback drill was performed.

## Confirmed live cause

Read-only `pg_stat_activity` + `pg_stat_ssl` and Docker address matching identified
the plaintext TCP connection as `hipass_app` / `hipass`, owned by
`hp-capstone-control-control-1`. Container was healthy. The DR WAL sender
`hp_dr_repl_20261016` / `hp-dr-standby` was using TLS 1.3.
The diagnostic psql connection uses a local Unix socket; this is not network TLS.
No SQL text, passwords, token values or patient rows were collected.

The running Control environment has POSTGRES_HOST/DB/USER but no TLS option.
`scripts/start-postgres.js` builds a URL without TLS options. `PostgresStore.load()`
creates a persistent pg Client at startup. Other pools (DPoP, key release,
patient grants and PACS jobs) must be included in the migration inventory.
Existing HBA rules restrict the DR/v3 roles, but the legacy application still
matches the generic host/scram rule which permits non-TLS TCP.

## Safety decision

No live configuration was changed. No connection was terminated. No service was
restarted. User requested no impact to the existing service. A running plaintext
PostgreSQL connection cannot be upgraded by merely reloading pg_hba.conf.
The current single Control process requires replacement to adopt TLS settings;
an unreviewed parallel instance is unsafe because the application has in-memory
state and persistence behavior that is not established as multi-instance safe.

## Next approved maintenance sequence

1. Inventory every DB client, including lazy pools, bootstrap and DR tooling.
2. Verify CA and server hostname with the actual deployed certificate, without
   disabling certificate validation. Test a read-only connection and wrong-CA /
   wrong-hostname failures before activation.
3. Preserve the deployed image, complete Compose configuration and HBA backup.
4. During an approved brief maintenance window, replace only the Control API
   using strict TLS settings and CA mount; keep PostgreSQL and replication up.
5. Verify health and all affected pool paths. Then prepend hostnossl rejection
   for normal and physical replication TCP traffic; preserve narrower existing
   authorization rules. Parse-check and reload HBA without restarting PostgreSQL.
6. Test TLS allow, plaintext deny, zero non-TLS network sessions, replication
   continuity and authenticated service flows. Keep local Unix-socket admin
   recovery distinct from network TLS. Capture dated evidence.
7. On failure, restore only this operation's exact changed configuration and
   previous API candidate; never overwrite concurrent changes.

## Results

| Check | Result |
|---|---|
| Plaintext connection owner identified | PASS |
| Existing DR sender TLS | PASS |
| Control API health at inspection | PASS |
| All DB TCP sessions encrypted | FAIL |
| Remediation activated | NOT VERIFIED — awaiting maintenance choice |

Scope: transport-security requirement (AGENTS §14.5), FR-014–025 and FR-037–041
dependent DB paths. This is a diagnosis, not an assertion of their E2E completion.
Local evidence: `Downloads/MediQ_DB_암호화_증적_20261019/tls-diagnosis.json`.

Reference: https://www.postgresql.org/docs/16/auth-pg-hba-conf.html
(host matches SSL/non-SSL; hostssl and hostnossl distinguish them; first match wins).
