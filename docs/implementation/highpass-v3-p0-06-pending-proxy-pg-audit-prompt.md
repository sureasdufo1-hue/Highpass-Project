# Next execution — combined proxy/PG and authoritative audit alignment

2026-10-08 / DRAFT / UNASSIGNED. Capstone synthetic only; NOT DEPLOYED.
Related V3-SR-IAM-001..004, TEN-001..003/AUTH-001..004,
V3-FR-CON-001/002 and legacy FR-001..005/014..020/037..041.

1. Inspect current secure-edge code, transport tests and actual transaction manifest.
   Separate actual proxy with mocked persistence from actual backend with nonowner PG.
   Neither alone proves the complete HTTPS frontend -> mTLS backend -> PG path.
2. Extend owned PG fixture with actual HTTPS forwarding proxy. Derive and overwrite
   ingress fields from observed TLS connection. Preserve finite body, request,
   handshake, upstream, DB and cleanup deadlines. Never touch deployed stack/DB.
3. Prove frontend normal/retry with actual PG, header spoof replacement, missing
   mock assurance, unknown human principal, direct no-cert bypass, wrong proxy role,
   untrusted and expired clients, stale/forged metadata, and no storage after denial.
   Do not equate generic socket resets to specific certificate causes: inspect the
   server-side TLS failure, certificate dates/issuer and absence of app callbacks.
4. Inspect preparation audit schema/helper and review an additive authoritative
   network-context contract. Distinguish domain denials from pre-auth security events;
   raw bearer tokens, key material, certificate paths and patient data are forbidden.
   Trace IDs alone do not prove source IP, hash-chain, SIEM or durable delivery.
5. Verify certificate generator subprocess deadlines; preserve refusal to overwrite
   existing outputs, existing CA/serial and ignored private-key storage.
6. Run focused and full Node regression, actual PG fixture and manifest hash checks.
   Preserve failed evidence, add public certificate/source hashes only, report exact
   covered scopes. New evidence stays DRAFT / UNASSIGNED despite earlier approval.
7. Write and immediately begin the residual proof-binding/audit gate. Actual IdP,
   human PoP/DPoP contract, D1..D6 ceremony and deployment remain separate gates.
   No actual clinical approval, TransferGrant activation, commit, push, merge or PR.

Initial audit inspection: migration018 and appendPendingAudit persist server-bound
actor/tenant/hospital plus correlation and fixed domain reasons, but have no trusted
ingress IP/proxy-identity fields. Existing HMAC is not body-bound human PoP. Preserve
these gaps explicitly rather than claiming the new edge closes them.
