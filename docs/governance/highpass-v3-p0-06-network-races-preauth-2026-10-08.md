# Strict network races and synthetic pre-auth adapter

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-014..025, FR-037..041; V3-SR-IAM-002, TEN-001..003/AUTH-001..004.
Repository HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`; dirty worktree.

## Verified isolated transaction evidence

`node scripts/v3-identity-transaction-check.js`: exit 0, 335 PASS checks,
93,681 ms, owned-container cleanup PASS, sourceUnchanged true.
Manifest: `evidence/generated/hp-v3-identity-tx-2026-10-08T00-57-58-414Z-a9464874/manifest.json`.
Transaction JSON SHA256 independently read:
`cef20b0f3340d1a21841b002ce8c8307e8c3d5ae913f6f64ecc5faf1f4007d91`.

Actual complete isolated HTTPS front proxy, mTLS backend and nonowner PG create/
retry returned 201, stored observed IP and public certificate fingerprint; network
INSERT failure rolled back paired state and domain denial persisted paired audit.
Separate actual-PG race fixtures use explicit network socket test doubles: lost
COMMIT acknowledgement with original receipt retry, concurrent same-key requests,
authority disposal after principal lock/INSERT/final clock, actual time expiry
after INSERT, foreign-tenant and expiry-maintenance audit invisibility passed.
These are not complete actual-TLS race tests, deployed staging or full MVP tests.

Preserved failed run: `hp-v3-identity-tx-2026-10-08T00-55-13-342Z-b88e7238`.
Its complete-proxy receipt assertion failed; the old fixture shared one short
future-start command across independent flows. Inputs are now created separately
at each fresh flow and explicit safe numeric status checks added. The previous
failure's exact HTTP code was not captured, so timing is a plausible cause, not
proven root cause. The earlier preliminary race run's final-clock hook could fire
too early; latest evidence requires network INSERT before that hook.

## Next prompt written and executed

[Pre-auth execution prompt](../implementation/highpass-v3-p0-06-preauth-security-sink-contract-prompt.md)
and [contract](../api/highpass-v3-preauth-security-event-contract.md) led to an
injection-only synthetic observer/test sink. Four focused tests PASS (exit 0).
No caller JSON can assert admitted metadata; public events have only fixed minimal
fields. Invalid socket address is null, never forwarded-header input. Unknown TLS
codes remain UNKNOWN_TLS. Size/error/overflow/timeout are explicit non-success
outcomes; ignored cancellation does not free capacity for unbounded new work.
In-memory success is RECORDED_TEST_ONLY, never durable audit PASS.

Full Node regression initially exited 1 on the existing transient-decrypt audit
test: random manifest hash contained `private`, triggering a broad secret-word
regex. Focused original rerun passed 5/5, confirming variability but not erasing
the failure. Test now verifies exact allowed fields, actual raw key encodings and
plaintext, excluding only the allowed digest from the word check. No runtime
encryption, authorization or logging policy was relaxed. Full rerun:
`node --test --test-concurrency=1`, exit 0, 407/407 PASS, 72,256.8216 ms.
Document checker: 46 files/133 local links PASS (links/labels only).
`git diff --check` exit 0, existing line-ending warnings only; untracked files
are not covered by that command. No live staging or full-MVP claim from Node tests.

## Unverified / unresolved

Real pre-auth TLS/HTTP admission, durable publisher/read roles, append-only storage,
retention, hash-chain/SIEM, integrated sink-failure DENY/readiness, human preparation
PoP/DPoP and actual IdP remain NOT VERIFIED or design pending. D1..D6 remain open.
김범희 approval on 2026-10-08 is synthetic integration preparation only, not
independent review of these new artifacts or clinical/legal/hospital approval.
Full MVP/v3 remains IN PROGRESS. No runtime enrollment, deployment, commit or push.

Next: [real observation and storage alignment prompt](../implementation/highpass-v3-p0-06-preauth-observation-storage-prompt.md).
That prompt has been read and initial inspection executed: fixture tlsClientError
captures code and authorizationError only; it permits generic
ERR_SSL_CERTIFICATE_VERIFY_FAILED, which cannot alone distinguish expired from
untrusted. The current synthetic adapter accepts only error.code and therefore
leaves this generic case UNKNOWN_TLS. Actual reason-specific classification and
integrated denial delivery remain the next verification gate, not inferred PASS.
