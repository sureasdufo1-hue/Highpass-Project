# P0-04 next gate: cross-institution identity contract

Before enabling mapping writes across institutions, inspect the approved Identity,
ExchangeSession participant, Consent and Preflight contracts and current DDL.
Document dependencies and negative acceptance criteria without treating a UUID,
admin role, mapping review, registration row or legacy consent as sharing approval.

Do not change PatientRef ownership, broaden global SELECT or weaken RLS to make
A-to-B mapping work. Distinguish patient sharing approval, active institution
participation and local human identity verification. Establish exact authority,
expiry/revocation behavior, transaction locks and audit before implementation.

Output an evidence-backed gap analysis and a proposed contract for alignment with
ExchangeSession. If the required authorization objects are not implemented, keep
that integration NOT VERIFIED and implement its explicit dependency first after
contract alignment. Do not claim P0-04/v3 completion.
