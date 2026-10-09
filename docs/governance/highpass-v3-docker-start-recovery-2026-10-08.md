# Docker startup observation recovery

2026-10-08 / DRAFT / UNASSIGNED. Policy reviewer/approver 김범희.
Related TEN-003/AUTH-004, reproducible security validation; no clinical authority.
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`, dirty user changes preserved.

## Purpose and implementation

[Executed prompt](../implementation/highpass-v3-docker-pg-start-diagnostics-prompt.md)
addressed two current PG regressions that ended before assertions, plus uncertain
cleanup observations. New `owned-postgres-start.js` splits disposable create/start
and confirms full ownership independently of a CLI ACK. Running is not readiness;
existing readiness, host-port checks and actual SQL/test gates remain mandatory.
Unacknowledged commands inspect the SAME owned fixture, never launch replacements.
Cleanup removes only exact owned objects, then observes exact successful inventory;
late removal may be polled for at most15 seconds without another rm. A failed
inspect or CLI timeout alone never proves absence. No broad prune/Engine restart.

New `v3-docker-pg-start-check.js` compares cached network-none, bridge and localhost
random-port profiles, tmpfs synthetic DB. Outputs only safe phase/result/timing
metadata and opaque disposable fixture IDs, not credentials/full inspect/raw errors.
Commands have finite deadlines; original create/start command bounds45s, readiness
60s, query/connection5s/3s and removal20s are not weakened. Separating commands
changes protocol and total startup bound; it is not proof the underlying daemon
latency is repaired. TLS/auth/access gates and test coverage are unchanged.

Modified existing PG runner to use this protocol and hash its helper. Neither
application startup nor existing runtime Docker stack/DB was modified. Additional
023/024 ceremony checker uses same owned startup/cleanup protocol in a later gate.

## Evidence and tests

| Verification | Result | Evidence |
|---|---|---|
| Startup/ownership/late cleanup unit tests | PASS | 7/7, exit0,360.3527ms |
| Helper + patient command focused tests | PASS | 13/13, exit0,318.3246ms |
| First startup diagnostic | NOT VERIFIED | none profile actual readiness/SQL PASS; deletion ACK/initial absence uncertain |
| Three-profile startup diagnostic | PASS | actual SQL and cleanup3/3, exit0,215,160ms |
| Full Node | PASS | 430/430, exit0,39,666.1295ms |
| Current existing PG regression | PASS | 427/427, exit0,139,048ms; cleanup/sourceUnchanged true |
| Diagnostic manifest verification | PASS | exit0, DRAFT/UNASSIGNED remains |
| Current captured source comparison | PASS | diagnostic4/4, PG70/70 matched; exit0 |
| Current PG manifest verification | PASS | exit0, DRAFT/UNASSIGNED retained |

Preserve [first startup diagnostic](../../evidence/generated/hp-v3-docker-start-2026-10-08T02-57-59-179Z-832373d6/manifest.json)
and prior two startup failures; never rewrite them as PASS. Subsequent startup-label
inventory proved no leftover before retry. Latest
[three-profile manifest](../../evidence/generated/hp-v3-docker-start-2026-10-08T03-03-09-169Z-214e062c/manifest.json)
captures source hashes and sourceUnchanged true. Published profile used an actual
Node PG connection to random127.0.0.1 port, not a substituted container-only check.
[Current existing PG manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T03-05-36-410Z-50dfe16b/manifest.json)
covers006..022 identity/Session/PENDING/preauth regressions, NOT024 patient approval.
Full Node discovery skips live integration/staging scripts; no full MVP claim.

## Diagnosis and limitations

Successful published profile create29,324ms/start26,520ms; regression create25,151ms/
start30,769ms. Their totals exceed the old combined run CLI observation45s.
Inference: combined acknowledgement handling can terminate verification despite
a subsequently running fixture. This timing comparison is NOT proof that Docker
internal networking or a particular component causes the delay. Dedicated phases
and readiness resolve the verifier's ambiguity without inventing PASS from existence.

Regression removal CLI timed out after20,370ms. Exact absence was initially false,
then three bounded follow-up inventory observations confirmed removal; cleanup PASS
means confirmed absence, not a timely rm ACK. Unit tests cover unavailable inventory,
foreign ownership, copied/malformed config and lost acknowledgements without secrets.
Underlying Docker mutating-command latency and real runtime reliability remain
NOT VERIFIED. Startup/cleanup functional regression barrier is now cleared.

Next [patient projection prompt](../implementation/highpass-v3-p0-06-patient-projection-prompt.md)
was read and its024 read/lock RLS foundation started. No clinical approval, nonce
consumption, recipient acceptance, TransferGrant, independent review, legal/hospital
or whole MVP/v3 conclusion. New evidence stays DRAFT/UNASSIGNED.

Recommended commit groups only: owned startup helper/unit tests; diagnostic checker/
evidence; PG runner wiring and execution docs. No commit/push/merge/PR performed.
