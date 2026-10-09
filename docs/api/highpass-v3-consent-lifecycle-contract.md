# v3 Consent lifecycle — proposed internal/transport contract

2026-10-08 / DRAFT / PARTIAL PRIVATE WITHDRAWAL IMPLEMENTATION; PUBLIC TRANSPORT/EXPIRY PENDING / UNASSIGNED.
CON-003~006, AUTH-001~003, V3-AT-CON-002~004, FR-001~005/014~025/037~041.
The [lifecycle ADR](../architecture/highpass-v3-consent-lifecycle-adr.md) owns L1~L5
adopted policy decisions (김범희, 2026-10-08; direct L1~L5 adoption).
Technical implementation/review remains pending. No new public route or runtime role is activated here.

## Withdrawal proposal

Private registry-issued PATIENT binding, own exact source/PatientRef/content,
fresh signed synthetic reauth in this MVP, proposed `consent:withdraw` scope.
L3 adopts this separate scope; runtime principal enrollment and DB capability remain inactive.
Never trust actor/hospital/patient/evidence/MFA from the request. Body is an exact
target selector `{consentId,contentVersion,expectedEventSequence}`; initial version1,
expectedEventSequence2 only. Arbitrary objects/getters/extra fields rejected.
Idempotency key is separate bounded header metadata, hashed with actor/source/
operation-scoped HMAC and canonical command digest; no raw key/nonce/token ledger.
If later route uses path ID or If-Match, define one canonical identity/version source
and reject ambiguous duplicate selectors before enabling transport.

Successful proposed typed receipt: consentId, contentVersion, eventId,
eventSequence3, state WITHDRAWN, effectiveAt, recordedAt, evidenceDigest,
cascadeStatus REQUESTED. It is a historic operation result, not an access token,
Grant or confirmation that all consumers have stopped. Same key/exact command
recovers original receipt only under reviewed current identity/read policy;
changed command conflicts; duplicate terminal/new key does not append another event.
Exact HTTP status/reason codes require the implementation contract gate, not guessed
compatibility with the legacy revoke endpoint.

Safe uniform resource unavailable responses prevent foreign consent enumeration.
Invalid selector, stale sequence, already terminal, authorization denial and storage/
COMMIT-unknown outcomes remain distinct. Denial audit stores fixed safe codes under
the correct admitted actor/context; no stack/query/certificate/secret in response.
Future HTTP must use HTTPS, no-store, body/no URL token and DPoP/ingress alignment.

## Expiry proposal

Dedicated authenticated maintenance identity/pool/scope `consent:expire` and purpose
CONSENT_EXPIRY, not a fake PATIENT binding or ordinary admin scope. Finite bounded
source-owned batch selects expired ACTIVE content and serializes each event3 with
withdrawal. Event actor is the real service; subject remains the original patient.
EffectiveAt is immutable validUntil; recordedAt is the actual DB writing time.
Worker delay never extends validity or permits new authority. Service close/drain,
query deadlines and cleanup are bounded; the deployed scheduler is a separate gate.

Audit/typed maintenance receipt/cascade request are atomic and immutable. The initial
decision receipt remains exactly original ACTIVE/REJECTED evidence and is not updated
to a later state. Current lifecycle read returns recordedState separately from
effectiveState/reason based on DB clock and current constraints. Original raw nonce
is neither accepted nor returned in lifecycle operations.

## Boundaries and pending activation

WITHDRAWN is not legacy REVOKED or Session CANCELLED. This operation neither creates
nor assumes AuthorizationDecision/TransferGrant or delivery acknowledgments. Source
stop/ref deletion must deny safely without reporting successful withdrawal (L2).
Authenticated, freshly reauthenticated owners may withdraw still-valid consent despite
parent termination or target stop (L1); expired commands deny independently of workers (L4).
L5 permits only own minimum patient DTO and explicitly registered source SECURITY_ADMIN
with consent:evidence:read, purpose checks and audited reads; ordinary admins have no automatic read.
These policies are adopted; the private withdrawal subset has the isolated evidence below,
while public reads, expiry worker and downstream authority remain incomplete. Content replacement requires fresh
version/evidence and a separate contract, not an in-place scope/window UPDATE.
Approval-only factory intentionally requires live parent/target and cannot simply
be reused as a withdrawal capability. Real IdP/MFA remains NOT VERIFIED.

## Pure withdrawal selector — scoped implementation

`src/v3-patient-consent-withdraw-command.js` now validates the exact selector with a
registry-issued PATIENT/consent:withdraw binding and private signed synthetic reauth.
The immutable command is bound to that exact binding; reuse rechecks expiry and reauth.
This is command provenance only, not proof of DB ownership, ACTIVE source/live ref,
current consent or successful withdrawal. No public route, pool, role enrollment,
event3, receipt, audit or cascade is activated by the parser.

## Additive physical foundation and private projection

027 now implements terminal event3/audit/results/cascade in disposable PG only.
Typed operation-scoped results are historical records; a SQL fixture does not prove
cryptographic HMAC receipt creation, real reauthentication or a deployed service.
The private withdrawal pool/factory/projection uses signed synthetic bindings and
separate consent:withdraw capability, current registry/ref/content/terminal/DB-clock
checks without parent/target admission. Branded projection is not a withdrawal receipt,
an access token or an audited public read. The initial projection gate did not implement
withdrawal/expiry services; the withdrawal follow-up below has scoped implementation.

## Internal withdrawal service — isolated verification in progress

`V3PatientConsentWithdrawalService` now uses the private withdrawal factory and a copied
32-byte HMAC key. Selector is exactly the existing three fields; key metadata is bounded
16..128 ASCII-safe characters, never persisted raw. Domains bind tenant/hospital/actor/
patientRef/CONSENT_WITHDRAW and canonical selector. Receipt includes exact PG text timestamps
(including sub-millisecond precision), immutable evidence digest and REQUESTED cascade only.

Order: authenticated/current DB registry/source locks → operation key advisory → common
consent advisory/live own-ref lock → branded owned historical context. Exact original result
is recovered before requiring a *new live withdrawal* projection. This permits safe
historical recovery after original validUntil under current fresh authentication, source
ACTIVE and live own-ref ownership; it neither renews consent nor asserts current access.
New key against a terminal consent denies; an expired ACTIVE consent denies even without worker.
This is L4 historical/current separation, not a public evidence-read endpoint or new authority.

028 records immutable internal retry/denial outcomes with actual admitted actor/source/ref,
HMAC selector/key digests, fixed reason, optional exact receipt-event reference and correlation.
Foreign requested consent identifiers are not recorded raw. Denial or original-result recovery
does not return successfully when required outcome audit fails. Pre-acquisition authentication
or inactive-source errors cannot write an admitted-actor outcome; future transport preauth audit
must cover that boundary. No public route/runtime credential/migration is activated.
COMMIT failures remain OUTCOME_UNKNOWN; owner-only fixture inspection establishes actual rollback.
Independent review/full races/downstream enforcement/public read/expiry service remain pending.
Private withdrawal transactions fix UTC and ISO DateStyle so pooled session locale cannot
change exact receipt timestamps or typed JSON evidence. This does not alter consent deadlines.

[Registered isolation and institution races](../governance/highpass-v3-withdrawal-isolation-execution-2026-10-08.md)
add scoped PG246: three signed patients/six foreign pairs, actual parent cancel/target suspension,
and witnessed two-way source/principal/ref mutations. Institutional mutations are owned SQL
fixtures, not runtime APIs. The next expiry-contention gate identified that the expiry role's
existing actor-restricted event SELECT could not observe a patient's WITHDRAWN terminal.
The [expiry contention follow-up](../governance/highpass-v3-withdraw-expiry-contention-execution-2026-10-08.md)
adds expiry-only source-bound terminal history with restrictive patient result/cascade
reads/writes and scoped PG252. Generic-plan COMMIT failure was fixed by separating the
withdrawal-only ref check in PL/pgSQL, not by granting patient_refs to maintenance.
This remains SQL expiry fixture evidence; no public read or private worker/runtime
maintenance identity activation follows from it.

## CONSENT_EXPIRY registration and private command follow-up

[Private principal/command contract](highpass-v3-consent-expiry-principal-contract.md)
now aligns Node registry with DB027's explicit CONSENT_EXPIRY/sole consent:expire.
It does not replace SESSION_EXPIRY or allow human maintenance scopes. Commands bind to
the exact private signed binding and bounded own-field-only limit. Actual generic DB
context matches registered source/service purpose; the dedicated guarded factory/event
service/worker and public read remain separate gates. No runtime enrollment is activated.

The subsequent [private transaction contract](highpass-v3-consent-expiry-transaction-contract.md)
implements the dedicated factory, not the expiry event service/worker. Actual scoped
factory evidence is PG261/Node502; event receipt/ACK/drain/public read/clinical authority
and runtime activation remain pending. All new evidence is DRAFT/UNASSIGNED.

Subsequent [authenticated batch execution](../governance/highpass-v3-consent-expiry-service-execution-2026-10-08.md)
adds actual private expiry events and additive029 original batch/empty-result recovery.
PG272/Node506 covers scoped actual service races and lost ACK, not full ledger isolation,
retry invocation audit, close/drain, deployed scheduler or downstream Grant/access denial.
