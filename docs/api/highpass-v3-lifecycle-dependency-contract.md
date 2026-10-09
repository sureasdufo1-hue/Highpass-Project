# Highpass v3 lifecycle dependency contract

2026-10-08 / DRAFT TECHNICAL ALIGNMENT / UNASSIGNED.
This is not approval of new clinical transitions or activation of target APIs.
Sources: requirements ID-001..006/EX-001..007/CON-001..006/AUTH-001..005/GRT-001..005,
security IAM/TEN/AUTH/GRT, acceptance ID/EX/CON/AUTH/GRT/PRE/PROV, canonical OpenAPI,
architecture/ERD and migrations006..017. Legacy FR-001..005/014..025/037..041 apply.

## 1. Authoritative implementation boundary

| Area | Confirmed implementation | Remaining scope |
|---|---|---|
| Identity | own-ref registration/reconcile/review, maker/checker, protected identifier, isolated PG/HTTP | cross-institution approval and linking; deployed routes |
| Session | immutable request/resources/actions; SOURCE ACTIVE, DESTINATION INVITED; create/read/cancel HTTP adapters | invitation acceptance, nonterminal clinical transitions |
| Expiry | dedicated maintenance identity/pool; REQUESTED/v1 -> EXPIRED/v2; atomic event/audit/cascade request | deployed scheduler, later states, actual cascade delivery |
| Receipt | original typed creation ledger; terminal/effective expiry retry denial audit | live nonterminal replay and runtime integration |
| Consent/Decision/Grant | internal initial Consent content/version1 and patient decision/event1..2 in owned PG; proposed public OpenAPI and legacy components | withdrawal/expiry/replacement and public transport incomplete; no new AuthorizationDecision/TransferGrant service proven |
| Preflight/action/Provenance | target contracts; existing simulator/component work | scoped new v3 execution/readback/provenance chain |

Latest existing component evidence is the 2026-10-08 receipt report: serial352 Node,
197 independent nonowner PG/loopback checks. Not rerun by this document gate and not
evidence of full lifecycle. Existing default-concurrency failures remain historical.
External IdP/KMS/PACS/production controls remain DEFERRED/BLOCKED, not local PASS.

2026-10-08 later scope update: [initial consent artifact](../governance/highpass-v3-patient-decision-execution-2026-10-08.md)
and [actual deadline/lock evidence](../governance/highpass-v3-patient-decision-deadline-execution-2026-10-08.md)
supersede the earlier absence of initial artifact implementation only. They do not
implement Session CONSENTED, public APIs, clinical authority or the full lifecycle.

## 2. State/command coverage — proposed edges are not executable

Common proposed command envelope C: authenticated server actor/tenant/hospital;
active persisted binding/institutions; authorized Session under row lock; strong
If-Match/version; keyed actor/source/operation-scoped idempotency; DB clock and finite
window; immutable scope; event + audit + result + required cascade in one transaction.
Use existing registry-first lock behavior; no transition may reverse its order.
DENY is safely audited before response when authorized context permits. Missing and
foreign resources uniform404; stale412; unsupported/terminal409; invalid422; storage503.
These categories do not override existing implemented endpoint-specific codes.

| From -> target | Command / actor (proposal unless noted) | Required evidence and C-specific gate | Status / acceptance |
|---|---|---|---|
| none -> REQUESTED | existing create; bound PATIENT or source DOCTOR/HOSPITAL_ADMIN | own ref, active target registry, explicit action/resources; no consent implied | isolated implemented; EX-001/002/005 |
| REQUESTED -> IDENTITY_PENDING | prepare identity; source actor | unresolved mappings; no recipient clinical metadata; workflow record | proposed; ID-002, EX-003 |
| REQUESTED/IDENTITY_PENDING -> CONSENT_PENDING | prepare patient approval; bound patient/source workflow | patient binding verified; approval request is PENDING, not sharing | proposed edge/order; CON-001, EX-002/003 |
| CONSENT_PENDING -> CONSENTED | patient approval command | server-authenticated patient, current scoped artifact/version, approved policy/evidence, valid window | proposed; CON-001/002, AUTH-002 |
| CONSENTED -> AUTHORIZED | evaluate existing target authorization API; server policy | exact patient/role/purpose/action/scope/recipient and current consent; durable ALLOW Decision | proposed; AUTH-001..003 |
| AUTHORIZED -> PREFLIGHT | begin preflight; authorized workflow | scoped ISSUED Grant candidate, route/package versions; no payload movement | proposed; PRE-001..005 |
| PREFLIGHT -> READY | complete preflight; authorized workflow | all required checks PASS, current mappings/consent/decision/grant and endpoint identity | proposed; PRE-002/004/005 |
| READY -> ACTIVE | runtime admission; supported action actor/connector | revalidate current policy/Grant/participant and finite lifetime at admission | proposed; GRT-001/002/004 |
| ACTIVE -> VIEWING/DOWNLOADING/TRANSFERRING/MOBILE_EXPORTING | exact independent action capability | matching action+resource, revalidation every access; import requires destination VERIFIED | proposed; GRT-001, ID-004; mobile execution P1 |
| action substate -> COMPLETED | execution receipt; authenticated executor | real action result/integrity/provenance, not simulated or queued success | proposed; PROV/ACC criteria |
| eligible nonterminal -> REJECTED | explicit patient/recipient rejection | actor authority and safe rejection evidence; exact starting states undecided | proposed; EX-003, CON state contract |
| REQUESTED -> CANCELLED | existing source cancel command | implemented role/reason/If-Match; event/audit/cancel result/cascade | isolated implemented; EX-003/005 |
| other nonterminal -> CANCELLED | authorized cancellation | real dependent capability deny and separately acknowledged work cancellation | proposed; EX-004/006 |
| REQUESTED -> EXPIRED | existing source-scoped maintenance batch | DB deadline crossed, dedicated expiry pool; event/audit/EXPIRY_REQUESTED | isolated implemented; EX-004 |
| other nonterminal -> EXPIRED | bounded expiry workflow | current dependencies deny independent of worker; event plus downstream tracking | proposed; EX-006 |
| eligible nonterminal -> REVOKED | verified patient/policy revocation | versioned evidence and authority; current access deny, separately tracked cascade | proposed; CON-003, EX-006 |
| executing nonterminal -> FAILED | authenticated technical failure | safe classified technical error and evidence; not policy DENY disguised as failure | proposed; EX-003, PRE-001 |
| any terminal -> any state | no reopening command | COMPLETED/REJECTED/EXPIRED/REVOKED/FAILED/CANCELLED immutable; fresh exchange needs new Session | invariant; new transition implementation still pending |

Returning from an action substate to ACTIVE, multiple sequential actions, direct skips,
and resuming FAILED are not approved here. Do not infer these edges from enums.

## 3. Bootstrap without accidental clinical access

Confirmed: PatientRef registration records original ownership, not global membership.
VERIFIED Mapping is local identity review, not consent. Source creation is not consent.
Current participation CHECK only allows SOURCE/ACTIVE and DESTINATION/INVITED;
activation requires a reviewed additive migration and new RLS, not merely UPDATE.

Proposed preparation flow, pending the decisions below:

1. Source has own protected local mapping and creates immutable Session selection.
2. Authenticated patient bound to that PatientRef reviews a source-owned PENDING approval
   request. Destination Mapping is not required merely to review that request.
3. Patient explicitly approves recipient, purpose, window, exact resource/actions and
   an independently defined identity-link clause if linking is needed.
4. A recipient invitation service exposes only an opaque invitation handle, source
   institution, bounded expiry and safe workflow status to an authorized recipient actor.
   No PatientRef, name/local ID, Study/Series UID, evidence content, token or image is
   disclosed before the relevant authorization. Handles confer no capability alone.
5. Recipient institutional acceptance and verified patient approval are separate proofs.
   Only their conjunction may create linking authority and active administrative
   participation. This does not grant clinical access or imply a VERIFIED Mapping.
6. Destination creates its own UNVERIFIED protected mapping under that scoped authority;
   a distinct authorized reviewer verifies it. No source ownership copy/global lookup.
7. Current Consent + verified identity + participant + Decision + Grant + Preflight are
   required for applicable action. View-only and PACS import eligibility remain distinct.

The approval workflow must not require destination VERIFIED Mapping to request the
patient's identity-link approval, otherwise it deadlocks. Conversely preparation
must not release clinical data to solve that deadlock. Invitation UX/lookup/privacy
details are proposed, not an authorization to activate the current recipient policy.

## 4. Consent, linking, decision and grant separation

Existing CreateConsentArtifactRequest accepts state/evidenceDigest. Treat both as
untrusted input: a body ACTIVE or digest proves neither approver nor approval ceremony.
Before activation, split preparation from a server-verified patient approval command.
Evidence must bind Session/version, PatientRef, patient actor/binding, source/recipient
tuple, policy version, canonical scope/actions digest, finite window and approval
event/time. Evidence payload is restricted; audit uses minimal references/digests.

Proposed link approval clause is a separate purpose-limited policy object referencing
both institutions and the Session/consent version. Its field names and patient-facing
meaning require review. It is NOT a fifth clinical AccessAction, a JWT scope inferred
from study:pacs-transfer, or trusted JSON authority supplied by an administrator.

Consent content/scope/window changes create a new immutable version; prior evidence
cannot authorize its expansion. Content versions and lifecycle events must be modeled
separately or with immutable supersession; physical representation remains a decision.
Withdrawal/expiry must invalidate current eligibility even if historical evidence stays.
Read access: bound patient and specifically authorized administrator; institutional
membership alone never means unrestricted evidence access.

Decision is historical policy evidence; it cannot issue an image/key itself. Server
derives or checks claimed actor/tenant/hospital in EvaluateAuthorizationRequest. Grant
scope is a subset of request, consent and current ALLOW; recipient is server-authorized,
TTL30..600 seconds within every parent deadline, issuer/audience/jti/PoP verified.
Raw Grant secrets are not stored/replayed in GET, audit or idempotency metadata.
ISSUED candidate permits preflight only; runtime requires current ACTIVE eligibility.
Legacy DPoP tokens/KMS test adapter do not establish the new v3 Grant/KMS integration.

## 5. Locking, expiry and durable outcomes

Proposed global order: registry principal/source institution locks as existing
transaction wrapper; keyed operation advisory lock; additional institutions ordered by UUID;
Session; participants; consent/version; mapping; decision/grant; action/work records.
All new workflows must share this order with create/cancel/expiry; actual contention
tests must prove it before deployment. Registry locks cannot be retroactively reordered
by a downstream repository. Existing unordered cross-institution acquisition is a
deadlock-risk audit item, not proof that this proposed order is already implemented.

Under those locks, check DB time/current versions immediately before mutation and
commit. Store mutation/event/audit/typed result atomically. If audit/outbox fails,
rollback. Lost COMMIT ACK is outcome unknown; retry reads durable metadata and rechecks
current authority. Original create receipt never substitutes current state/version/time;
terminal/effectively expired replay denies without resurrection.

Revocation commit is the cutoff for subsequent access/link/Grant/key operations; each
path must validate current DB authority, not rely solely on JWT TTL or stale Decision.
Historical mapping may remain under retention but supplies no ongoing permission.
Cascade REQUESTED is enqueue only; delivery attempt/ack/error/timeout are separate
states. New access denial cannot wait for external acknowledgement. Retention cleanup,
in-flight cancellation and real key destruction are NOT VERIFIED until integrated.

RLS uses bounded base relationships, no recursive participant/parent policy loops,
SECURITY DEFINER, broad cross-tenant reads or BYPASSRLS. Maintenance never gets clinical
scope/evidence tables to satisfy policy planning. New pool privileges are explicit.

## 6. Required acceptance additions — NOT VERIFIED

LD-01: patient binding/foreign patient/admin spoofing denies; a valid PENDING request
does not issue Grant, payload, key or active recipient membership.
LD-02: INVITED recipient cannot query clinical/evidence/PatientRef; missing and foreign
invitation responses are indistinguishable; handle alone is not authentication.
LD-03: absent link clause/generic ACTIVE consent/transfer scope/raw digest denies linking.
LD-04: approved link creates local UNVERIFIED; self-review/stale version/conflict deny.
LD-05: scope/window expansion creates fresh version/evidence; old approval cannot apply.
LD-06: revoke/expire/terminal Session/inactive institution denies new link/access/Grant/key;
same-key retry after revocation must not replay prior ALLOW.
LD-07: real two-connection revoke/link and expiry/approval races serialize; trace cutoff.
LD-08: audit/outbox faults rollback; lost ACK retry creates no duplicate secret/action.
LD-09: each action scope/resource mismatch and stale preflight denies before connector.
LD-10: receipt restoration is independent of later state, but current clinical eligibility
is checked; actual cascade acknowledgement distinct from durable request.
Map LD cases to existing ID-001..004, EX-003..006, CON-001..004, AUTH-001..003,
GRT-001..004, PRE-002/004 and applicable PROV cases. They are specifications, not tests run.

## 7. Decision register / next safe implementation

| Decision | Proposed direction | Gate before activation |
|---|---|---|
| D1 patient approval ceremony/MFA assurance | bound server patient + explicit scoped confirmation; synthetic issuer in isolated tests only | approve policy and assurance contract; real IdP external |
| D2 identity-link clause | independent bounded link approval, never inferred clinical scope | approve exact clause and patient explanation |
| D3 recipient acceptance role and minimal invitation projection | named institution authority; no clinical fields before approval | approve actor role and privacy projection |
| D4 consent content versions vs state events | immutable versions with append-only lifecycle evidence | settle representation/API before DDL |
| D5 complete directed transitions/action completion | no implicit enum-order edges | approve edge/evidence matrix; unsupported transitions stay denied |
| D6 lock order across institutions/workflows | deterministic new order compatible with registry-first locking | contention tests and old-create lock-order audit |

Follow-up2026-10-08: 김범희 reviewed/approved [D1..D4 proposals and D5 sequencing](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md),
and D6 actual contention testing. This supersedes the earlier unapproved decision
status only for those choices. D5 later transitions remain unimplemented/pending
detail; D6 technical result NOT VERIFIED. Start the patient approval command/
ceremony/artifact gates, not automatic runtime activation or clinical Grant.
[Command contract](highpass-v3-patient-consent-command-contract.md) is pure input
validation first; durable approval/replay and full lifecycle remain to implement.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
