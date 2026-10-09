# Cross-institution Identity gate — initial gap analysis

Date: 2026-10-07. DRAFT / UNASSIGNED. Analysis, not an approved new API contract.
Executed the first inspection step of the
[next prompt](../implementation/highpass-v3-p0-04-cross-institution-contract-prompt.md).

## Confirmed requirements

- V3-FR-ID-001~006 require opaque PatientRef, hospital-local protected mappings,
  explicit identity review and VERIFIED destination mapping before PACS_IMPORT.
- Architecture alignment §3.1 requires active ExchangeSession participants plus
  role/action checks; knowledge of source/destination IDs cannot authorize access.
- Mapping write contract requires a separate approval/membership contract for
  connecting another institution to the same PatientRef, never owner reassignment.
- Current migrations 008/010 and MappingWriteService only authorize an owned,
  registered PatientRef. The registration row is explicitly not patient consent.

## Gap and next decision

The current own-ref mapping HTTP implementation is not a cross-hospital identity
linking mechanism. A recipient cannot simply submit a foreign PatientRef and
become its owner or obtain global patient enumeration. That denial must remain.
The next dependency is an explicit, narrowly scoped authorization contract linking
an authorized session/recipient to the opaque reference without changing ownership.
The existing ExchangeSession participant design is the alignment anchor, not a
new unrelated global membership system.

## Required contract decisions before implementation

1. Identify the server-authenticated patient approval source and evidence, not a
   body-supplied patient UUID or a hospital administrator's own assertion.
2. Bind a grant of linking authority to PatientRef, source/destination institutions,
   session, intended action, expiry and approval version. Separate this permission
   from image viewing, downloading and local mapping verification.
3. Require active recipient participation and local write role/scope; define whether
   mapping remains historically retained after expiry while new linking and clinical
   use are denied. Historical retention must not imply continuing consent.
4. Specify locks/version checks for consent revocation, session cancellation,
   institution suspension and concurrent linking; fail closed and audit the outcome.
5. Preserve independent local identity review, no demographic automatic merging,
   immutable PatientRef/owner/local digest, and conflict handling.
6. Define RLS reads/inserts narrowly enough to prevent PatientRef enumeration and
   circular policies. Verify with separate actual PostgreSQL institution sessions.

## Candidate negative acceptance criteria (not executed)

Foreign UUID only; missing approval; forged patient; wrong recipient; inactive
participant; expired/revoked approval; cancelled session; suspended institution;
stale approval version; self-verification; conflicting local identity; audit failure;
revocation racing a transaction; replay after revocation. All are NOT VERIFIED for
the future cross-institution implementation, not inferred from own-ref tests.

Follow-up: [dependency/authority contract](highpass-v3-cross-institution-identity-contract.md)
documents the P0-04→05→06 cycle and source-owned Session foundation ordering.
The Session create validator is now locally tested; no persistence or linking
permission is created. Exact machine-readable identity linking approval and
persistent patient binding remain P0-06 alignment requirements. Next action is
Session DB/participant authority, not relaxing the current deny.
