# Next execution: PENDING nonowner RLS and authoritative projection

2026-10-08 / DRAFT / UNASSIGNED. Continue the full persistence prompt; do not
replace its PA-01..09 storage/replay/race/transport requirements with read-only tests.

1. Reinspect 006..018 and current owned-fixture evidence. Verify next unused migration
   number. 018 adds immutable staging with NO admission policies or runtime grants;
   it does NOT complete nonowner preparation. Keep complete clinical lifecycle/D1..D6.
2. Implement purpose-built source read/lock policies for hp_v3_pending_policy.
   No clinical/expiry group membership, Mapping SELECT, exchange:create/read scope,
   SECURITY DEFINER, target INVITED activation or clinical state mutation.
   Role-scope existing permissive policies only where needed to avoid hidden Mapping
   permissions/planner recursion; preserve existing clinical behavior with 197 regressions.
3. Pin a concrete minimum COLUMN SELECT/UPDATE-lock privilege matrix for the dedicated
   nonowner pool. Registry-first active binding -> Session share -> live owned ref and
   SOURCE participant -> server-selected target locks -> canonical scope/digest -> DB
   clock/version/state. Immutable creation root must not read parent or child policies.
   Doctor requester-only, patient bound-ref and source hospital-admin staging only.
4. Build server-only same-transaction projection, not a public metadata endpoint or
   client-supplied selection. Refuse unsafe role memberships, missing/foreign/inactive
   context, malformed row/window/hash, version mismatch and whole-Study expansion.
   Uniform inaccessible response; technical DB/query failure is not policy DENY.
5. Actual nonowner PG controls/negatives: consent:write ONLY; no-context/foreign actor/
   hospital; wrong patient; other doctor; INVITED recipient; revoked principal;
   suspended source/target; deleted ref; terminal/expired parent; FOR SHARE success
   but UPDATE rejection; no Mapping/protected-field privileges. Scoped fixtures only.
6. Then complete staging write/audit/idempotency service and PA-01..08 actual storage,
   concurrency/lost-ACK/fault/race gates. Original receipt replays exact immutable result
   only after current authority and time revalidation; elapsed-start fresh request denies.
   Do not leave read-only success described as complete persistence.
7. Finite owned Docker startup/query/lock/cleanup, source hashes, DRAFT manifest verify,
   related/full Node and full existing PG regressions. Report actual command exit codes.
   No existing DB migration, live route, commit/push/merge/PR or secret/PHI output.
8. Write next execution prompt and immediately execute safe in-scope work. Human policy
   approvals remain separate; full MVP/v3 is not achieved by these gates.

## Immediate execution inspection — 2026-10-08

Started by inspecting existing policies and V3TenantTransaction, not activating them.
patient_ref_read (006) references Mapping; patient_ref_owner_read (008) permits broader
source owner visibility than bound-patient preparation. Both require explicit role
separation before a narrow pending pool can safely use the ref. Session/root/scope
policies use exchange:create/read; do not add those scopes to consent actors.
017 already role-scopes Session clinical policies, but root/ref/participant/scope remain
separate work. Wrapper checks dangerous owner/admin roles, not pending-vs-clinical group
separation: future pending service must also check that separation before any query.
018/NOLOGIN capability exists in disposable evidence only; new RLS/projection/service
is NOT IMPLEMENTED/NOT VERIFIED. The next concrete edit is the numbered RLS migration
and actual minimum-privilege fixture, not reusing broad legacy app credentials.

## Execution progress — 2026-10-08

019 source-only policies and trusted internal projection helper implemented; unit
controls/negatives4 PASS; actual nonowner source/schema52 checks and existing197
regressions with019 PASS. JS real-PG projection and full final results belong to
the scoped report. Continue [atomic write prompt](highpass-v3-p0-06-pending-atomic-write-prompt.md),
whose initial deferred-FK/admission-policy inspection has started. Staging writes,
DENY audit/exact replay/races/transport and approval remain incomplete.

Real JS projection gate subsequently found/fixed guard ordering: pending-only pool
membership is checked on acquisition before registry RLS via guardPendingPool.
Final actual PG202/202 PASS includes197 baseline +5 projection cases. See
[scoped report](../governance/highpass-v3-p0-06-pending-projection-2026-10-08.md)
for intermediate failures and current full-suite result; no earlier PASS is inherited.
