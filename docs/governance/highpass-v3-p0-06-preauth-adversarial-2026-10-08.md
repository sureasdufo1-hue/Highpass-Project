# Pre-auth actual PG role/conflict and TLS sink-failure gate

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002.

[Adversarial prompt](../implementation/highpass-v3-p0-06-preauth-durable-adversarial-prompt.md)
was executed after the latest SQL-profile regression PASS. Existing pre-auth
fixture now additionally exercises actual same-UUID different-IP conflict,
actual borrowed open transaction, swapped/mixed publisher-reader roles, real
publisher column-grant revocation during rejected TLS handshake, authenticated
synthetic health and real reader SELECT-grant outage. Privileges are restored
in finally inside the owned test DB only; no runtime DB or credential changes.
Same-UUID test explicitly uses socket test doubles for SQL integrity, whereas
TLS sink-revocation test uses actual sockets/certificates. Do not conflate them.

Actual verification: `node scripts/v3-identity-transaction-check.js` exit0,
382 checks PASS, 52,137 ms, cleanup PASS, sourceUnchanged true. Manifest
`evidence/generated/hp-v3-identity-tx-2026-10-08T01-32-27-420Z-da65cbbc/manifest.json`:
transaction digest and current captured source hashes independently match.
New eight role/conflict/TLS-grant-fault checks PASS. Maximum Session response201
completed1331 ms after body-end; COMMIT758 ms, resource INSERT157 ms and READ91 ms.
This is a second successful measured run, not proof of the earlier timeout cause.
Current full Node rerun: `node --test --test-concurrency=1`, exit0,
413/413 PASS, 74,920.8495 ms. No earlier result used as fresh evidence.

Still unverified: actual slow/disconnected PG with uncertain delivery and flooding,
real-clock admission expiry, long-outage confirmation, pre-auth HTTP/JWT/ingress
delivery. Current role/grant-fault test is not a complete outage matrix. Actual
IdP/human PoP, production global-reader/retention approval and D1..D6 remain open;
no WORM/hash-chain/SIEM or overall MVP/v3 completion claim. New evidence DRAFT/
UNASSIGNED; scoped 김범희 approval is not independent approval of these tests.

Next [outage/HTTP execution prompt](../implementation/highpass-v3-p0-06-preauth-outage-http-prompt.md).
That prompt has been read and initial source/contract analysis executed. The
[HTTP observation alignment](../api/highpass-v3-preauth-http-observation-contract.md)
separates trusted-ingress, registry and verified mock-assurance rejections while
preserving safe403, no unverified-claim identity and no fabricated domain event.
It is not implemented HTTP publication; actual delay/disconnect/flood and real
clock expiry remain the next implementation/verification work.
