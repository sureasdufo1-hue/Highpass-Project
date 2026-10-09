# Patient challenge issuance — hash-only recovery contract

2026-10-08 / DRAFT / UNASSIGNED. Adopted policy reviewer/approver 김범희2026-10-08.
Related CON-001..006, IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020/037..041.

Confirmed: challenge issuance is not consent approval. Use the same-live-transaction
[patient projection](highpass-v3-patient-approval-projection-contract.md), privately
verified signed synthetic reauthentication and immutable023 snapshot. No runtime
route, real MFA, consent ACTIVE, recipient activation, Mapping/Decision/Grant yet.

Implementation decision: exact data-only selector `{preparationId,
expectedSessionVersion}`; idempotency key16..128 safe characters passed separately.
Server clause policy and max reauth age are captured internally. Unknown fields,
getters, body actor/digest/nonce/MFA/decision and altered key payload fail closed.
Actor/source/patient/operation-scoped HMAC-SHA256 key/request digests use a generated
32-byte service key, never raw idempotency strings in DB/audit. Key provisioning is
server-owned; stable secure key is required for restart recovery. Ephemeral test key
is not production KMS or HA evidence. Rotation needs a later versioned-key contract.

Generate32 CSPRNG bytes per new issuance. Store only SHA256 nonce, never raw or
encrypted nonce. First successful transaction returns raw base64url nonce plus
ceremony/preparation/version/content digest and issued/expiry metadata. Receipt,
ceremony and exact creation audit are atomic and immutable. Raw response is strictly
post-COMMIT, memory-only: no log/URL/browser persistence. Future transport must use
HTTPS/body/no-store with response redaction; no route is opened in this gate.

Retry of a committed same scoped key+selector returns `ISSUED_NONCE_UNAVAILABLE`,
`nonceAvailable:false`, original metadata, and `requiresFreshChallenge:true`.
It is NOT a new usable challenge, original raw nonce retransmission, approval or
HTTP201 success. Future handler should map this to an explicit recovery response,
not silently flatten it into success. If a different command reuses the key, return
IDEMPOTENCY_CONFLICT. Check authenticated current eligibility before exposing any
receipt, including expired/cancelled Session or stopped institution. Original
issuance timestamp/digest/window never changes under retry or new clause policy.

Lost COMMIT acknowledgment returns V3_COMMIT_OUTCOME_UNKNOWN with no nonce. Retry
the same key resolves whether a receipt exists: if none, a new atomic issuance is
possible; if present, the nonce-unavailable result directs a fresh key. No rollback
claim for unknown commit. Fresh issuance creates a new independently bounded
challenge; older challenge remains unapproved and expires. Future consumption must
serialize the preparation's decision, not allow multiple challenges to approve
different decisions. Exactly-once consumption is a separate required gate.

Registry SHARE→actor/operation/key advisory→Session SHARE→ref SHARE→target hospital
SHARE→target tenant SHARE→ceremony/audit/receipt INSERT→final checks→COMMIT.
Lifetime min(5min, reauth deadline, preparation deadline, parent deadline, binding
expiry). DB exact timestamp values are used for content/link windows and audit
creation time; no JS millisecond roundtrip changes the canonical snapshot.

Additive025 replaces only023 assembly's SELECT-star preparation read with named
minimum columns; all existing live/digest/identity/registry checks remain. Patient
INSERT/SELECT policies and dedicated immutable issuance result are added; no
UPDATE/DELETE admission and no runtime login/table grants. RLS protects patient
and source, excludes creator identity/evidence and accepts no client-selected GUC
authority as signed proof. Actual signed reauth/CSPRNG provenance is service-enforced,
not a property PostgreSQL can infer from session settings or supplied timestamps.

Acceptance: actual nonowner service issuance, original metadata/retry conflict,
concurrent same key, missing audit/result rollback, altered digest/clauses/windows,
nonce uniqueness and hash-only storage, foreign actor/admin/unassured/role mix,
revocation/expiry/cancel/target suspension, finite lock waits/timeout and lost ACK.
No raw PG/assertion operands or nonce in evidence. Runtime public audit/HTTPS/UI,
approval consumption and full D6 remain NOT VERIFIED until separately executed.
