# Next execution: PENDING consent preparation contract foundation

2026-10-08 / DRAFT / UNASSIGNED. Use the lifecycle dependency contract and retain all
P0-04..06 completion requirements. D1..D6 are proposals; do not turn them into approved
patient ceremonies, invitation authority or clinical transitions.

1. Inspect current principal registry, Session structural parser, immutable resource
   selections and target Consent request. Identify approved reusable shape constraints.
2. Define an internal, pure, non-authorizing PENDING preparation contract for a source
   authenticated actor. Validate server-branded binding, fixed PENDING intent, exact
   fields, bounded times, purpose/actions/resources subset of the immutable selection.
   For patient requests verify bound PatientRef. A digest supplied by an actor is not
   approval. No ACTIVE consent, link clause acceptance or recipient activation.
3. Specify structure only; row ownership and current eligibility must be checked by
   the future DB service. Do not call a raw caller-supplied snapshot authoritative.
   Reuse DICOM UID/whole-Study-vs-Series semantics; never widen an omitted scope.
4. Unit-test foreign/cloned binding, patient spoof, state ACTIVE, extra fields, empty/
   duplicate/out-of-scope selections, purpose/action/window expansion and malformed
   digest. Approved-shape control returns a branded intent, not a clinical capability.
5. No migration, DB mutation, public route, Grant/key/payload or authority bypass.
   Record parser tests separately from NOT VERIFIED PG/HTTPS/runtime/approval gates.
6. Before any later approval-bearing implementation, obtain exact D1 patient ceremony,
   D2 link clause, D3 institutional acceptance and D4 content/event decisions. Keep
   D5/D6 directed-edge and lock-order review requirements. Report proposed choices.
7. Full relevant regressions under finite timeouts; DRAFT/UNASSIGNED evidence, scoped
   report and next prompt. No commit/push/merge/PR or inherited Kim reviewer approval.

## Initial inspection executed with the preceding document gate

Existing registry provides server-branded bindings and patientRef; Session parser
provides immutable canonical actions/resources. Target Consent request still accepts
state/evidenceDigest from caller. Existing participant CHECK cannot represent accepted
recipient. The next safe parser must not implement approval, membership or clinical
state mutation. Existing source scope parser can be reused or minimally factored;
the future service must reread authoritative DB scope rather than trust a JSON snapshot.

## Execution result — 2026-10-08

Pure PENDING validator and7 negative/control test groups implemented. Full serial359
Node PASS; existing197 PG/loopback regressions PASS after shared normalization factoring.
No approval/persistence/audit/HTTP route or recipient activation. See
[report](../governance/highpass-v3-p0-06-pending-contract-2026-10-08.md).
Next authority-read/write contract prompt created and initial inspection executed.
