# Patient consent command — approved policy / partial technical contract

2026-10-08 / POLICY CHOICES USER-APPROVED / IMPLEMENTATION EVIDENCE DRAFT / UNASSIGNED.
검토자·승인자 김범희 / 승인일2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-001/004, FR-001..005/014..020.

Confirmed: [policy choices](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md)
adopt D1..D4 proposals, D5 patient artifact-first sequence, D6 actual contention
testing. Later clinical transitions are not automatically approved/implemented.
Current PENDING objects remain immutable/UNVERIFIED. There is no approved artifact,
consumed ceremony/decision ledger, recipient activation or TransferGrant implementation here.

## Command and input boundaries

Proposed patient command, NOT a deployed route:

```json
{
  "preparationId": "00000000-0000-4000-8000-000000000001",
  "expectedSessionVersion": 1,
  "contentDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "decision": "APPROVE",
  "identityLink": {"approved": false, "clauseVersion": "synthetic-link-v1"}
}
```

Only exact plain data properties are accepted; body actor/patient/state/MFA/evidence/
Grant/token fields are rejected. Decision is APPROVE or REJECT; REJECT cannot approve
identity linking. Link consent is independent and explicit, never derived from
clinical approval. Clause version must match server policy. First ceremony design
must bind displayed source/target, identity-link purpose/finite validity and clause
text digest; a version string alone is not a complete linking approval evidence.

Server private registry binding must be PATIENT with `consent:approve` and own source
tenant/hospital/PatientRef. This gate is source-bound synthetic identity only, not
federated/cross-institution patient identity proof. `consent:write` does not approve.
Signed claims are captured privately only after existing signature/issuer/audience/
expiry/role/hospital/registration checks. Synthetic reauth requires TestProvider,
exact mock acr, true highpass_test_assurance, three unique pwd/otp/mfa values and
integer auth_time. Configured max age1..300 seconds, wall time and internal clock
both reject old/future authentication. Config is internal, never body-selected.
There is no real IdP MFA/biometric/human proof assertion.

Internal projection contains preparation/session/version, bound patient/source/
target, fixed PENDING/UNVERIFIED, canonical64-hex content digest and valid window.
Parser checks exact ID/version/digest/context/state/expiry and makes a frozen
deep-copied command. Private command branding proves parser provenance only.
Projection/policy arguments do not prove locked DB authority. A copied command or
binding is rejected. Parser never writes a consent, returns ACTIVE/ALLOW, grants
linking/clinical access, or consumes a one-time ceremony.

## Persistence and security acceptance still required

Future service must reread/lock current preparation/Session, institutions/principal/
patient binding and displayed content under reviewed D6 lock order; create separate
immutable content version and append-only approval/reject/state event, audit and
typed idempotency result atomically. Server-generated ceremony nonce/challenge must
bind patient, content digest/version, reauth and independent link clause; store
hash only, finite expiry, consume exactly once and safely classify retries/lost ACK.
All replay, rejection/withdrawal/expiry races and rollback/audit failures require
actual nonowner PG tests. Submitted staging commitment is never approval evidence.
Approval itself is not AuthorizationDecision, Grant, recipient acceptance or
Mapping VERIFIED. No automatically activated runtime route or existing DB change.

Implemented: pure command and privately captured signed synthetic reauth facts.
Unit cases prove input/auth/context/freshness rejection, NOT durable consent,
ceremony replay prevention, D6 or end-to-end patient approval. New evidence stays
DRAFT/UNASSIGNED despite policy approval. Legal/hospital/production claims excluded.

## 023 ceremony foundation follow-up

[Technical ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md)
precedes additive023: immutable patient-bound challenge plus mandatory exact-tuple
creation audit, separate approval capability with no admission policies or runtime
grants. Server SQL computes domain/versioned displayed content digest, including
scope/action/window and independent linking clause text hash/version/purpose/window.
Nonce hash uniqueness and finite reauth/expiry bounds are storage constraints,
not verified nonce issuance or exactly-once consumption. Staging is unchanged.
Content versions, decision events, safe idempotent responses and actual patient-only
nonowner service remain next gates. Schema owner constraints do not prove signed
claims, human approval or D6 contention safety.
