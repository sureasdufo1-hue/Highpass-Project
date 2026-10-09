# Preparation pre-auth security event contract — design draft

2026-10-08 / DRAFT / REVIEW REQUIRED / SYNTHETIC TEST ADAPTER ONLY / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

Confirmed: paired preparation domain/network audit requires authenticated actor
and a real domain event. TLS handshake rejection never reaches that handler.
Current fixture TLS observer and safe HTTP403 are not durable security logging.
Do not overload domain-denial rows or invent actor/patient/session/tenant IDs.

Proposed synthetic-only event fields: server-generated eventId and observation
time, stage TLS/INGRESS/HUMAN_AUTH/MOCK_ASSURANCE, fixed reason enum, observed socket
source IP (nullable if no valid socket fact), optional observed public peer fingerprint
only when securely obtained, result DENY, scope CAPSTONE_SYNTHETIC_ONLY. No URL/body,
header values, bearer/JWT/proof, raw TLS error, filesystem path, guessed JA3, personal
identifier or principal/tenant authority. Unverified forwarded IP must never replace
socket observation. Backend socket identifies its immediate proxy hop, not necessarily
the browser; that distinction must survive persistence and presentation.

Admission is trusted-server-only, opaque and typed; caller JSON cannot assert
observed socket provenance. TLS library failure classification must use fixed code
allowlists, not raw exception text. Unknown technical failure remains UNKNOWN_TLS
or a fixed UNCLASSIFIED_SECURITY_FAILURE, not a fabricated certificate-policy reason.

Initial test adapter design: no asynchronous queue; bounded concurrent sends,
per-event size and a finite deadline, immediate OVERFLOW if full. A caller-supplied
sink callback is internal configuration, not evidence of server facts. Timeout must
release caller control and signal cancellation; ignored cancellation is a sink fault,
not proof that remote side effects stopped. A still-live ignored sink must continue
occupying its capacity slot so repeated timeouts cannot create unbounded background
operations. No silent drops, infinite retries or fake durable success.

Fixed outcomes RECORDED_TEST_ONLY / NOT_RECORDED / OVERFLOW / TIMEOUT;
all mean original access remains DENY. In-memory adapter success is not durable PG,
WORM, chain-integrity or SIEM delivery. Readiness cannot depend on waiting for a
full security-event queue. Pending persistence must use its own safe publisher and
security-admin read role, append-only constraints, limits and explicit retention;
organizational retention/ownership approval is unresolved. Do not grant ordinary
patients, doctors or hospital admins global pre-auth events.

No runtime sink wiring or existing runtime database migration authorized by this draft. Next technical gate
must define/test provenance admission, bounded adapter fault/overflow behavior and
connection lifecycle before actual isolated durable storage and HTTP/TLS integration.
Production ownership/retention, actual IdP, human preparation PoP/DPoP applicability
and D1..D6 clinical decisions remain open. mTLS/HMAC/mock-MFA do not close them.
New evidence DRAFT / UNASSIGNED; previous 김범희 approval remains scoped synthetic
integration preparation, not independent/legal/hospital/production approval.

Implementation evidence: `src/v3-preauth-security-events.js` and its four focused
tests implement opaque observer-owned admission, fixed TLS classification, exact
minimal event fields, bounded UTF-8 size, concurrent capacity, abort signal and
finite timeout. Foreign/cloned admission and raw event JSON are rejected. A
timed-out non-cooperative sink keeps its capacity slot until settlement. This
observer is internal synthetic injection: a socket test double does not prove real
TLS provenance. Owned actual TLS test listeners now capture admission and verify
that sink success/error/timeout/overflow cannot allow a rejected handshake; the
authenticated fixture health route remains responsive. There is no runtime
listener wiring, durable storage, read API, hash chain or SIEM delivery. HTTP/JWT/
ingress denial-to-sink integration remains unverified. Actual no-cert handshake
maps to TLS_CERTIFICATE_REQUIRED; untrusted and expired actual handshake events
remain UNKNOWN_TLS when library observations do not expose a specific safe code.
Unit-tested socket code classification is not evidence that those codes occurred
on the actual server. Do not invent a more specific reason from fixture labels.

## Isolated storage alignment and acceptance draft

Pre-auth rows cannot inherit the authenticated-domain tuple FK/RLS from migration
021: no trustworthy actor/tenant exists at handshake failure. Proposed separate
table fields are the exact eight admitted fields plus DB-assigned recorded_at;
finite timestamps, fixed stage/reason pairs, host-only nullable inet, UUID event
uniqueness, capped fixed text and constant DENY/synthetic scope are required.
No raw JSON column, caller-assigned principal or automatic tenant attribution.

An isolated publisher credential gets explicit INSERT columns only, no SELECT,
UPDATE, DELETE, schema ownership, bypass-RLS, role administration or clinical
membership. A separate security-reader credential has SELECT only. Generic
runtime, patient, doctor and hospital-admin roles get no global visibility.
FORCE RLS and immutable triggers must be tested, including privileged accidental
UPDATE/DELETE. This is a proposed isolated technical role model, NOT an approved
production global-reader or organizational retention policy.

Acceptance before durable audit claims: real nonowner INSERT/read visibility,
forged stage/reason and subnet rejection, duplicate UUID behavior, missing sink
privilege/disconnection/deadline outcomes, finite caller return, bounded ignored
operations, immutable owner mutation denial, absent clinical/global read grants,
and actual HTTPS/TLS rejection remaining DENY across each sink outcome. A committed
event with lost acknowledgement needs an outcome-unknown contract before retry;
neither NOT_RECORDED nor RECORDED may falsely claim certainty. Retention deletion
must not be added until retention/access ownership is explicitly resolved.
The following isolated storage prompt implements additive migration022 for owned
test containers only: two NOLOGIN policy roles, exact-column publisher INSERT,
reader SELECT, FORCE RLS and immutable trigger. Its independent storage tests must
pass before any storage-integrity claim. This is not a durable delivery adapter
or approved production grant/retention policy. No existing database migration,
runtime login enrollment, public API or production access change is made.
