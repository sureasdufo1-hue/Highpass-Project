# Preparation secure-edge contract — capstone synthetic only

2026-10-08 / DRAFT / REVIEW REQUIRED / NOT DEPLOYED.
Related V3-SR-IAM-001..004, TEN-001..003/AUTH-001..004; V3-FR-CON-001/002,
EX-005/006/007; legacy FR-001..005/014..020/037..041.

Confirmed: current isolated preparation has real HTTP/HTTPS-to-PG evidence, but
server TLS alone does not authenticate a proxy/workload. ingressMeta returns an
untrusted fallback rather than denies. IAM-003 requires capstone mock-MFA negatives.
Human preparation is NOT a data-plane TransferGrant or approval ceremony.

Implementation decision: additive injection-only capstone edge wrapper, never a
production configuration. Require mode CAPSTONE_SYNTHETIC_ONLY, dedicated32-byte
ingress HMAC secret, actual TLS socket with authorized client chain, clientAuth EKU
and exact URI SAN spiffe://highpass.local/dev/pending-edge-proxy. This role is
distinct from Orthanc gateway-client. The fixture must issue a separate short-lived
dev proxy client with the existing project CA; neither expired negative nor Gateway
client may act as the normal preparation proxy.

HTTPS frontend -> dedicated proxy -> mutually authenticated HTTPS backend -> wrapper
-> real pending handler/registry/service. Backend cert hostname and chain verified.
Frontend must overwrite client forwarding/signature fields with observed source IP,
HTTPS scheme and generated signed metadata. Backend must deny missing/forged/stale/
duplicate metadata, untrusted TLS, wrong proxy role and direct bypass before storage.
Existing ingress signature binds time,method,path,IP,HTTPS and Authorization hash;
it is NOT a body/idempotency signature or human-token proof of possession. Authenticated
mTLS channel protects that trusted proxy hop; compromised authorized proxy remains
a separate risk. Do not claim global replay prevention from this HMAC metadata.

After server registry verifies the exact JWT, capstone mock-MFA requires signed
acr=urn:highpass:capstone:mock-mfa, amr exactly the three unique pwd/otp/mfa markers,
and highpass_test_assurance=true. Headers/body cannot supply these claims. Missing/
wrong type/partial/duplicate/single-factor claims deny403 before the inner handler.
This demonstrates test assurance enforcement only, NOT actual MFA, external IdP
assurance, patient approval or Production eligibility. Existing JWT/role/hospital/
scope and fresh DB authorization remain mandatory. No registry/auth behavior change.

Use fixed safe403 problem codes, no certificate/path/key/token/claims/stack details.
Ingress secret copied into private wrapper state; explicit disposal zeroizes that
copy. Inner preparation handler remains independently injection-only; never register
it behind an insecure fallback as a deployment substitute.

Uncertainty: human JWT DPoP/PoP binding, actual proxy certificate issuance/rotation,
live frontend/backend integration and full negative mTLS matrix require their own
actual evidence. Existing legacy DICOMweb PoP tests cannot close this gap. Runtime
activation stays gated. Current preparation outbox lacks network context; traceId
does not establish authoritative source IP or durable security-denial/hash-chain/SIEM
delivery. An additive reviewed audit contract is required before that claim.

Validation order: wrapper normal/negative unit tests (mock TLS socket, real registry
and HMAC) -> actual isolated proxy/backend and dedicated cert -> real nonowner PG
with normal/no-client/untrusted/expired/wrong-role/bypass/ingress/MFA tests -> current
regression/evidence -> review. None of these transition Session/Consent/Grant state.
