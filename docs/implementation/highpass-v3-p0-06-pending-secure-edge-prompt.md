# Next execution: preparation secure-edge/authentication alignment

2026-10-08 / DRAFT / UNASSIGNED. No deployment or clinical approval inferred.
Continue the complete preparation/transport scope, not a substitute smaller gate.

1. Inspect latest actual HTTP-to-PG/HTTPS evidence and exact source/certificate hashes.
   Preserve failed runs. Reconcile PA-01..09 coverage and tests before any activation.
2. Read pending HTTP contract, security IAM-001..004, GRT-003 and existing ingress/
   DPoP implementations. Existing legacy DICOMweb proof evidence does not prove a
   new human preparation API. TLS-server trust does not prove client mTLS/workload
   identity. Keep roles/control-plane preparation distinct from data-plane grants.
3. Write an explicit REVIEW REQUIRED preparation secure-edge contract: direct local
   fixture TLS versus authenticated proxy, client certificate role/SAN/EKU/CA chain,
   direct backend bypass, issuer/audience/scopes, mock MFA assurance and proof-binding
   applicability. Do not guess clinical ceremony D1..D6, external IdP or grant issuance.
   Where human JWT proof binding is not yet contracted, mark it NOT VERIFIED and
   retain the gap; do not silently accept a production Bearer-only conclusion.
4. Implement only injection-only finite strict-edge enforcement agreed by existing
   technical requirements, with actual isolated proxy/backend tests. Missing/forged/
   stale ingress metadata and direct bypass deny before preparation storage. If mTLS
   is tested, verify normal client and no-client/untrusted/expired client negatives
   using separated development certificates/negative fixture, no insecure options.
5. Never treat ingressMeta's untrusted fallback metadata as an authentication failure
   gate unless the wrapper explicitly denies it. Header authenticity and application
   identity are separate. No fake JA3, disabled hostname, raw secret/DEK/token evidence.
6. Persisted preparation audit currently lacks authoritative network-context fields;
   inspect whether an additive safe audit contract is required. Do not claim traceId
   alone proves trusted source IP or delivered hash-chain/SIEM evidence.
7. Bounded HTTP/TLS/handshake/body/DB/polls and owned exact cleanup. Actual PG plus
   related/full Node regression, manifest digests, public cert fingerprints and docs
   scope. No existing runtime DB/stack changes, new clinical routes or commit/push/PR.
8. Write the next residual gate prompt and execute safe work immediately. Keep
   evidence DRAFT/UNASSIGNED, D1..D6 unresolved, full MVP/v3 IN PROGRESS.

## Immediate inspection

src/ingress.js authenticates forwarded metadata using time/IP/method/path/HTTPS and
Authorization hash, but returns fallback untrusted metadata instead of denying a
request. The pending handler does not call it or require PoP. IAM-002 requires
machine identity/mTLS and IAM-003 capstone MFA remains PARTIAL; current TLS-server
fixture cannot close either item. Secure preparation edge contract is the next
explicit design gate, not automatic deployment or borrowed legacy proof approval.
