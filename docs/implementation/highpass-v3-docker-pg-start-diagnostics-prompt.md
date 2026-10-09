# Next execution — bounded Docker PostgreSQL startup diagnosis

2026-10-08 / DRAFT / UNASSIGNED. Reviewer/approver of policy 김범희.
Related TEN-003/AUTH-004, CON-001..006, NFR reproducible verification.

1. Inspect current source and failed startup manifests; preserve existing changes.
   Prior turn made progress:023 schema/ADR and actual39/423 PASS; current published
   PG regression stopped before assertions twice, not a live process to restart.
2. Write a bounded disposable startup checker with independent create/start/inspect/
   readiness/SQL/port observations. Compare network none, default bridge without
   published ports and default bridge with random localhost-only published port.
3. Use cached PostgreSQL image, exact random container names and full ownership
   labels, tmpfs synthetic DB, finite command/poll/query deadlines. Never expose
   passwords, raw Docker/PG errors, full inspect/environment, keys or patient data.
4. An unacknowledged command is not proof the operation failed or never ran. Inspect
   the same exact owned fixture; never replace it solely because observation timed
   out. Derive readiness from pg_isready and actual SELECT1, not container existence.
5. Remove only confirmed owned fixtures; verify exact absence. Keep unavailable/
   uncertain phases explicitly NOT VERIFIED. No Engine restart/prune or live DB edit.
6. Infer root cause only from discriminating evidence. If create/start succeeds
   where combined run fails, update runner startup protocol minimally, preserving
   timeouts, network boundary, all test coverage and required ownership checks.
7. Rerun existing current-source PG regression and retain all failures. Full PG PASS
   cannot be assigned from startup checks. Manifests DRAFT/UNASSIGNED with exact
   source hashes and cleanup. Then continue patient-only projection prompt.
