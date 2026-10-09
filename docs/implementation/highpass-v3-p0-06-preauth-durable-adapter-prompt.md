# Next execution: bounded durable pre-auth adapter contract and integration

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041, V3-SR-IAM-002. Overall MVP/v3 remains IN PROGRESS.

1. Read migration022, pre-auth admission/observer contract, current schema evidence
   and exact role privileges. Separate actual SQL integrity from actual TLS-to-PG
   provenance. Recheck latest full regressions and keep historical failures.
2. Define private admitted-event access for an observer-owned durable adapter:
   do not accept event JSON or a generic sink callback as proof of admission.
   Enforce exact fixed fields, finite lifetime, source-hop semantics and budget.
3. Define RECORDED_DURABLE, NOT_RECORDED, OUTCOME_UNKNOWN, TIMEOUT/OVERFLOW semantics
   before implementation. Insert acknowledgement must prove actual COMMIT; lost
   ACK/cancellation after dispatch is uncertain, not definitely NOT_RECORDED.
   Same UUID retry must distinguish identical original event versus conflict,
   without granting publisher unrestricted SELECT or silently overwriting rows.
4. Specify least-privilege retry design in a contract before changing SQL grants
   or creating SECURITY DEFINER. No bypass-RLS, generic clinical membership or
   publisher read escalation solely to make a test pass. No new public read API.
5. Implement injection-only bounded adapter only after that contract is aligned;
   prove forged admission rejects before pool access, acquisition/query deadlines,
   pending-operation capacity, role separation, storage outage and uncertainty.
6. Test owned actual TLS to isolated PG on no-cert/untrusted/expired denials plus
   sink outage/timeout and responsive readiness. UNKNOWN_TLS remains legitimate
   when server observations do not provide an exact safe code. No header/token/
   clinical/raw exception capture. No runtime enrollment or deployment.
7. Run current focused/full regressions, capture exact-source DRAFT/UNASSIGNED
   evidence and cleanup. Write and immediately start the next remaining gate.
   Retention ownership, actual IdP/human PoP and D1..D6 remain unresolved; no
   clinical/legal/hospital/MVP-completion claim, commit, push, merge or PR.
