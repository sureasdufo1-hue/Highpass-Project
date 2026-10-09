# Highpass v3 integrated technical review

기준일: 2026-10-07 / 입력 SHA: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`
상태: TECHNICAL REVIEW COMPLETE / REMEDIATION REQUIRED
분류: CAPSTONE-P0. 이 기록은 자동 기술 검토이며 사람의 서명이나 법률·운영 승인을 대신하지 않는다.

## Reviewed sources

- [Requirements](../requirements/highpass-v3-requirements-definition.md), [Security](../security/highpass-v3-security-requirements.md), [Traceability](../traceability/highpass-v3-traceability-matrix.md)
- [Architecture](../architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md), [ERD](../data/highpass-v3-erd.md), [API](../api/HIGHPASS-V3-API-ALIGNMENT.md), [OpenAPI](../api/highpass-v3.openapi.yaml)
- `src/server.js`, `src/services.js`, `src/pacs-import-engine.js`, `src/pacs-crypto-engine.js`, `scripts/edge-proxy.js`, `public/app.js`, `public/mobile/app.js`, `public/mobile/sw.js`, Compose and tests

## Findings and disposition

| ID | Finding | Requirement | Disposition / acceptance |
|---|---|---|---|
| R-01 | Mobile device/vault/login/erase handlers precede authentication and return fixed hardware/erase successes | V3-SR-IAM-001, V3-FR-TEN-002, V3-FR-MOB-006 | Authenticate and bind patient; explicit simulation and NOT VERIFIED for hardware/erase; V3-AT-FIX-001 |
| R-02 | Archive list has no role/hospital resource filter; imaging list without patientId returns all studies | V3-FR-TEN-002/003 | Patient own list only, archive restricted to B clinical/admin roles, minimize returned fields; V3-AT-FIX-002 |
| R-03 | Patient viewer continues after authorization/audit failure and draws synthetic anatomy | V3-FR-ACC-003, V3-SR-VIEW-001 | Fail closed; label synthetic viewer and sample findings; V3-AT-FIX-003 |
| R-04 | PACS import writes local files but claims STOW and destinationVerification=true; failures substitute synthetic objects | V3-FR-ACC-005/006/009, V3-FR-PROV-005 | Local archive classified as simulator; real source errors must fail; STOW and destination checks remain separate implementation work; V3-AT-FIX-004 |
| R-05 | PACS master KEK derives from public deterministic seed when unconfigured | V3-SR-CRY-002, V3-SR-OPS-001 | Configured 256-bit key required; explicit test injection only; V3-AT-FIX-005 |
| R-06 | DPoP verifier is unit-tested but not called by protected routes; JA3 headers are client-influenced | V3-SR-GRT-003, V3-SR-IAM-001 | Separate PoC from enforced protection; future token binding and trusted ingress suite required; V3-AT-FIX-006 |
| R-07 | Edge healthcheck disables certificate validation; proxy has no upstream timeout; mobile static routing incomplete | V3-SR-NET-002/003, V3-NFR-REL-001 | Trusted CA+hostname healthcheck, finite proxy timeout, explicit static asset paths; V3-AT-FIX-007 |
| R-08 | Running API source hash differs from HEAD, historical evidence predates changes | V3-NFR-TST-001 | Rebuild and attest runtime files before E2E; V3-AT-FIX-008 |
| R-09 | CD-origin dataset only changes selected header tags, keeps original pixels/nested sequences | V3-SR-AUD-003, V3-NFR-COMP-001 | Unverified dataset excluded from acceptance; synthetic fixtures default; no PS3.15 conformance claim; V3-AT-FIX-009 |
| R-10 | Node tests include hard-coded localhost:3000 calls | V3-NFR-TST-001 | Isolated ephemeral HTTP harness instead of reliance on preexisting server; V3-AT-FIX-010 |
| R-11 | Network gate interprets every command failure as policy DENY | V3-FR-ACC-009, V3-SR-NET-003 | Infrastructure errors NOT VERIFIED; network topology and actual transport probes reported separately; topology-only DENY is not a packet-level denial test; V3-AT-FIX-011 |

## Target-contract clarifications

1. Current legacy endpoint additions are not implementation of `/api/v3`. No v3 tables or migrations are present.
2. Patient/provider initiation, mapping, session and Grant scopes keep the canonical baseline values.
3. Metadata package creation may precede preflight; ingest of binary payload must follow required preflight. This avoids performing transfers during manifest preparation.
4. Preflight may use an ISSUED grant candidate. Runtime access requires ACTIVE grant and READY/ACTIVE session. Refresh stale decisions/results immediately before execution.
5. Single-use Grant response retry must not mint another secret or keep raw bearer in the idempotency store. Replay returns metadata and `credentialDelivery=ALREADY_DELIVERED`; reissuance requires fresh authorization and revocation of the predecessor.
6. ConsentArtifact response must expose authorized actions, immutable scope, policy/evidence refs and version to authorized readers; authorization decisions retain consent reference.
7. Provenance is per package version, not unique solely on session. A session may have multiple packages.
8. Preflight includes endpoint identity, availability, patient mapping, consent/authorization/grant, UID/SOP/transfer syntax, capability and quota; required checks cannot be skipped as PASS.
9. Unimplemented VIEW/DOWNLOAD/STOW acceptance remains NOT VERIFIED even when simulator unit tests pass.

## Gate result

Technical findings are actionable and linked to acceptance criteria. Acceptance and implementation planning may proceed under the user's instruction to follow the recommended sequence. Formal Product/Medical/Security reviewers remain unassigned; no historical signature is copied to this baseline.

Next: [Acceptance Criteria](../acceptance/highpass-v3-acceptance-criteria.md) → [Implementation Master Plan](../implementation/highpass-v3-p0-master-plan.md).
