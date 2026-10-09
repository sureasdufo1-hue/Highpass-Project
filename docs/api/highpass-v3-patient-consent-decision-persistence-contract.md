# Patient decision persistence — initial artifact contract

2026-10-08 / PARTIAL IMPLEMENTATION / DRAFT / UNASSIGNED.
Migration026 and the internal service have passed an owned disposable PostgreSQL
fixture for initial APPROVE/REJECT, atomic evidence assembly, retry and lost ACK.
This is not public API enablement, current clinical authority or full D6 verification.
Policy reviewer/approver 김범희2026-10-08; no new technical review PASS inferred.
Related CON-001..006, AUTH-001/004, IAM-003/004, TEN-003,
legacy FR-001..005/014..020/037..041.

Confirmed requirements: Consent is versioned evidence, not a Boolean or PENDING
staging commitment. Immutable content and append-only state events are distinct.
Only a bound patient can approve/reject; identity-link choice is explicit and
independent. Consent/Decision/Grant/recipient acceptance are separate authorities.
Preparation, challenge, request acceptance and future effect must not be conflated.

Additive physical model; applied only in the owned synthetic validation fixture,
not the runtime database:

- Content root: consentId, sessionId, preparationId, contentVersion, patient/source/
  target tuple, purpose, finite window, policyVersion, canonical contentDigest and
  immutable linking clause text/hash/version/purpose/window. Exact023/025 snapshot;
  no raw nonce, patient name, staging commitment or opaque arbitrary evidence JSON.
- Scope/action child snapshots: ordered Study/Series selections/actions, immutable
  and no wider than preparation/Session. Include counts/canonical integrity proof.
- State events: eventId, consent/contentVersion, eventSequence, prior/resulting
  canonical state, authenticated actor/context, time and safe correlation. Content
  versions and event sequences must not share one overloaded version column.
- Consumption/decision proof: unique ceremonyId and unique preparation initial
  decision, actor/source/patient, command digest, decision APPROVE/REJECT, independent
  link approved boolean, exact content/version, approvedAt and creation audit/event.
- Typed receipt: actor/source/operation/key+request digests, event/content/consent
  references, exact original response state/version/time. No raw nonce/key/token.

Implementation decision: materialize initial content version
and its initial PENDING event, then explicit APPROVE→ACTIVE or REJECT→REJECTED event
atomically with consumption/audit/receipt. Both creation and decision must have
mandatory immutable proof; no unaudited intermediate commit. Initial command state
events do not mutate Session state or staging. Future content replacement needs a
new immutable content version, fresh challenge and fresh decision; existing evidence
must never silently authorize expansion. Later event types are disabled until their
own contracts/service/constraints/tests exist.

An ACTIVE event may be recorded for a future validFrom; effective authorization is
still false before validFrom, after validUntil, after WITHDRAWN, or when any parent,
principal/registry/recipient/policy constraint fails. Never infer clinical ALLOW from
the event alone. Full withdrawal/expiry and new Grant consumers remain required.

Outer command `{ceremonyId,nonce,command}` delegates the command field to existing
exact parser. The service maps live internal projection to parser's exact subset;
this adaptation must not drop the service's complete locked snapshot/digest checks.
Nonce is canonical base64url of32 bytes. Compare SHA256 to ceremony hash in constant
time, exact patient/content/version/clause and live deadline. Nonce possession alone
does not authenticate; private fresh synthetic reauth/current registry is mandatory.

Hash-only issuance retry remains nonce-unavailable. Lost decision ACK can replay an
exact typed decision receipt because that response contains no raw secret. Duplicate
ceremony/different key/changed decision cannot create another event or expand content.
Preparation-scoped decision serialization prevents multiple valid challenges from
creating conflicting approvals/rejections; actor key lock alone is not sufficient.
Cancellation/expiry and institution mutation must be rechecked under actual locked
context. No future Session UPDATE is acquired after ref/target locks without a new
reviewed lock DAG. SQL assembly proves storage consistency, not private signed MFA.

Remaining uncertainty: precise full withdrawal/expiry event proof and supersession
implementation; full D6 cross-session graph; public evidence read/administrator
minimum role; production IdP/key provisioning. These cannot be called implemented.
This contract advances artifact-first design, not runtime approval/clinical access.

## Physical initial-decision gate

Proposed026 names: consent_content_versions, consent_content_scopes,
consent_content_actions, consent_state_events, consent_decision_audit,
consent_patient_decisions, consent_patient_decision_results in highpass_v3.
Current insertion assembly admits only contentVersion1/eventSequence1 and2.
Replacement/withdrawal/expiry need their own later admitted transition, not a
false claim that every positive version/state label is already implemented.
Decision evidenceDigest uses a separate SQL domain from displayed contentDigest,
binding ceremony/consent/version/decision/link choice/time/reauth to its immutable
patient/source/target/content. No raw nonce or staging commitment in evidence.

Exact original receipt can be recovered after ceremony expiry with a currently
authenticated, freshly reauthenticated patient and still-live locked parent/
institutions; this recovery creates no new event or effective authority. A new
consumption must prove the nonce and live ceremony deadline. Parent cancellation/
expiry/stop denies even recovery. Raw nonce is included only via SHA256 in the
HMAC request digest; no nonce/raw key/request payload persisted or logged.
