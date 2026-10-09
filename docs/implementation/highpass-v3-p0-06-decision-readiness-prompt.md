# Next execution — approval-bearing lifecycle decision readiness

2026-10-08 / DRAFT / UNASSIGNED / CAPSTONE SYNTHETIC ONLY.
Related CON-001..006, AUTH-001..005, GRT-001..005, legacy FR-001..005/014..025.

1. Read lifecycle dependency contract and its D1..D6 register, latest Requirements
   v3, security requirements, traceability, canonical OpenAPI, ERD and acceptance
   criteria. Confirm actual implemented boundary, not old milestone summaries.
2. Stop growing the pre-auth observation matrix as a substitute for the core
   patient approval/recipient acceptance/Decision/Grant lifecycle. Preserve its
   verified evidence, residual risks and honest nonoperating qualification.
3. Prepare a concrete decision packet D1..D6 with confirmed requirements, exact
   proposed choices, alternatives, API/DDL/RLS/lock impacts, acceptance scenarios
   and remaining uncertainty. No runtime or approval-bearing code in this gate.
4. Separate patient approval from identity linking, institutional acceptance,
   authorization Decision and TransferGrant. Synthetic mock MFA is not actual
   IdP/human proof; PENDING input evidence cannot become approval by inference.
5. Do not infer approval of these exact policies from 김범희's2026-10-08 synthetic
   integration-preparation approval, old PASS, or this automatic continuation.
   Request decisions where authority would materially change. D6 implementation
   requires lock-order evidence even if a human agrees with the design.
6. Update only relevant repository documents and cross-reference checks. Preserve
   old test failures and dirty user edits. No commit/push/deployment or real data.
7. Once exact choices are approved, write the patient approval contract execution
   prompt and implement/tests according to the original dependency ordering.
   Until then clinical permissions, recipient activation and new Grant stay denied.

Overall MVP/v3 remains IN PROGRESS. External IdP/KMS/PACS and legal/hospital/
production approvals are DEFERRED/BLOCKED, never technical PASS.
