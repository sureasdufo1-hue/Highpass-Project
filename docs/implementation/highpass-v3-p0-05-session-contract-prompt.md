# P0-05 first dependency execution prompt

Implement CreateExchangeSessionRequest validation against existing target OpenAPI
and the cross-institution dependency contract. Use the authenticated v3 registry
capability; ignore no mismatches and accept no state/consent/grant/actor overrides.
Distinguish patient and provider initiation, caller-owned source/requester and
server-configured finite expiry. Validate bounded Study/Series data, reject empty
or duplicate scopes and preserve explicit whole-Study selection. Return a copied,
deeply frozen internal command; do not call that command a consent or authorization.

Test normal patient/provider input and each negative field/context/expiry/scope
case. Do not add runtime routes or apply migrations. Record targeted/full tests
honestly; keep Session DB, participants, audit, idempotency, Consent and linking
integration incomplete. Then write the next Session DB implementation prompt.
