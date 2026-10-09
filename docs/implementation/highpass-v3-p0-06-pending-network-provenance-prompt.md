# Next execution — unforgeable preparation network provenance

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY.
Related FR-037..041 and V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

1. Read the authoritative network audit contract and current secure-edge wrapper.
   Inspect actual proxy/PG evidence and preserve historical evidence scope.
2. Implement an injection-only internal network capability that is created only
   after authorized TLS peer, exact proxy role and signed ingress validation. Carry
   normalized observed IP, public certificate fingerprint, observation timestamp
   and a private binding to the exact server request. Never accept JSON authority.
3. Test normal context, clone/plain-object forgery, wrong request, missing/duplicated/
   forged/stale headers, wrong proxy role, stale capability, disposal and secrecy.
   Keep mock-MFA and human registry authority separate. No PoP claim from ingress.
4. Align additive domain network audit schema/RLS/helper contracts before adding
   transactional persistence. Preserve immutable receipt/creation tuple and atomic
   domain audit. Define pre-auth security sink separately, without invented actors.
5. Run focused regression and owned actual PG as appropriate to modifications.
   No deployment, real patient data, clinical approval or automatic reviewer PASS.
6. Write and immediately begin the next persistence/sink or proof-binding gate;
   preserve unresolved IdP, D1..D6 and full MVP/v3 limitations.

Initial execution: the current wrapper validates TLS/ingress but discards trusted
network facts before invoking the inner handler. appendPendingAudit accepts only
typed domain fields/correlation. An opaque request-bound context must precede any
claim that stored audit identifies an authoritative source IP/proxy.
