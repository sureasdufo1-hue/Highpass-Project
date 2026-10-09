# Next execution — bounded pre-auth security event sink contract

2026-10-08 / DRAFT / UNASSIGNED / NOT DEPLOYED.
Related FR-037..041, V3-SR-IAM-002, TEN-001..003/AUTH-001..004.

1. Inspect exact-source strict network race evidence. Keep actual PG races with
   explicit socket test doubles distinct from actual complete HTTPS proxy tests.
   Existing domain/network events do not record rejected TLS handshakes or human
   authentication failures before the domain callback.
2. Draft a separate pre-auth event contract before implementation: fixed TLS/
   ingress/JWT/mock-assurance failure reasons, actual observation time and socket
   facts only, no invented patient/session/human/tenant identity. Untrusted forwarded
   headers are never authoritative source IP. No raw tokens/claims/paths/stacks.
3. Define bounded event size, sink deadline, concurrency/queue limits and overflow/
   unavailable behavior. A failed sink must not turn DENY into ALLOW; never claim
   durable audit when the sink failed. Do not let denial flooding hang readiness.
4. Align separate publisher/read role, append-only storage, retention/privacy and
   global-versus-tenant event ownership before any migration or runtime wiring.
   Security-admin-only access is not a generic patient/doctor audit view.
5. Implement only an explicitly synthetic/injection-only typed event admission and
   finite sink contract test adapter first. In-memory success is NOT durable PG,
   WORM, hash-chain or SIEM delivery. Verify forged metadata, excessive input,
   slow/error sink, overflow and deny semantics; then define actual storage tests.
6. In parallel scope analysis (not delegated agents), preserve human preparation
   PoP/DPoP applicability gap: proxy HMAC, mTLS and mock-MFA do not prove human
   possession, actual IdP assurance or D1..D6 ceremony. Write explicit unresolved
   decisions and follow-up contracts, no guessed clinical architecture.
7. Run relevant/full regressions and current actual proxy/PG evidence as required.
   Keep new evidence DRAFT/UNASSIGNED and preserve failed runs. No deployment,
   clinical/legal/hospital approval, actual patient data or commit/push/merge/PR.

Initial inspection target: server-side TLS failures are currently fixture observations
only; edge rejection uses safe403 but no durable pre-auth event sink. The domain
helper cannot create an event without an authenticated source actor, by design.
