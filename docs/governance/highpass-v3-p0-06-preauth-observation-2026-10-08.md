# Pre-auth real TLS observation gate

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041, V3-SR-IAM-002. Overall MVP/v3 IN PROGRESS.

The [observation/storage prompt](../implementation/highpass-v3-p0-06-preauth-observation-storage-prompt.md)
was executed: actual server tlsClientError produces opaque synthetic admission;
the observer maps only fixed library error codes and fixed socket authorization
codes for generic CERTIFICATE_VERIFY_FAILED. Unknown classifications remain
UNKNOWN_TLS. Raw error text, headers and bearer/clinical IDs are not events.
Library authorisationError is used only from the observed server socket, never
browser headers. Backend socket IP is immediate peer (nullable if unavailable).

`node --test test/v3-preauth-security-events.test.js test/v3-preauth-live-tls.test.js`
exit 0, five PASS tests. New live TLS test proves no-certificate handshakes remain
rejected with no HTTP callback for RECORDED_TEST_ONLY, NOT_RECORDED, TIMEOUT and
OVERFLOW. A timed-out ignored sink holds capacity and authenticated synthetic
health still returns 200. This is owned actual HTTPS/mTLS, not mocked TLS flags;
its test sink is in memory, NOT PG/WORM/hash-chain/SIEM evidence. Real HTTP/JWT/
ingress rejection-to-sink integration remains unverified.

Existing full proxy/nonowner-PG fixture now additionally observes no-cert,
untrusted and expired TLS failures into test-only minimal events. Current exact
source transaction verification completed: exit 0, 338 PASS checks, 89,958 ms,
cleanup PASS, sourceUnchanged true. Manifest:
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-08-13-791Z-93e38764/manifest.json`.
JSON digest matches manifest; current captured source hashes match with zero
mismatches. No-certificate event was TLS_CERTIFICATE_REQUIRED; untrusted and
expired event classifications were UNKNOWN_TLS on this actual environment.
Do not infer that unit-tested socket authorization codes were present in these
actual handshakes. The fixture independently verifies TLS denial and expired
fixture dates, not perfect reason-specific TLS classification. Full Node rerun:
`node --test --test-concurrency=1`, exit 0, 408/408 PASS, 66,845.553 ms.
Syntax checks for observer, proxy fixture and live TLS test exit 0.
Document checker: 48 files/138 local links PASS (links/labels only).

Preserved run `hp-v3-identity-tx-2026-10-08T01-05-47-485Z-ad56e6d5` exited 1:
NOT VERIFIED / TimeoutError, 50,070 ms, cleanup PASS, sourceUnchanged true.
Last PASS was declared oversized Session body rejection; next awaited operation
was the 100-Study/500-Series maximum real HTTP/PG creation. The runner now captures
the fixed SESSION_MAXIMUM_RESOURCES diagnostic label (no URL, body or secret) on
failure. Current rerun retains all original finite timeouts and security checks.
Do not attribute a prior unrelated PG permission-denial diagnostic to this timeout.
The diagnostic rerun passed the maximum request; no timeout was increased.
The initial timeout's root cause remains unresolved and its NOT VERIFIED record
is preserved rather than replaced by a PASS claim.

Separate actorless publisher/read role and constraint alignment is documented in
the [contract](../api/highpass-v3-preauth-security-event-contract.md). Production
ownership/retention and human PoP/actual IdP/D1..D6 remain unresolved. No migration,
runtime wiring or organizational/legal approval inferred from these tests.

Next [isolated storage foundation prompt](../implementation/highpass-v3-p0-06-preauth-storage-isolated-prompt.md)
defines additive schema and actual nonowner acceptance before any durable claim.
김범희 2026-10-08 approval is scoped synthetic integration preparation only;
new evidence stays DRAFT/UNASSIGNED, not independently reviewed.
The next prompt has been read and existing migrations 006/007/020/021 and policy
role conventions inspected. No isolated storage migration has been created or
executed yet; the table/role tests and durable adapter remain pending.
