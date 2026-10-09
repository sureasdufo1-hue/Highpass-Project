# Highpass v3 End-to-End Traceability Matrix

2026-10-08 [patient approval command contract](../api/highpass-v3-patient-consent-command-contract.md):
CON-001/002/006 and IAM-003/004/AUTH-001 boundaries now have pure command unit cases
in `test/v3-patient-consent-command.test.js`. They cover exact patient/scope/context,
signed synthetic assurance age, version/digest/link choice and input forgery, not
durable approval, replay consumption, D6 races or complete V3-AT-CON/LD gates.
김범희 adopted [policy choices](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md);
new technical evidence remains DRAFT/UNASSIGNED.

023 [ceremony ADR](../architecture/highpass-v3-patient-ceremony-persistence-adr.md)
adds storage constraints for CON-001/002/006 and AUTH-004/TEN-003:
`scripts/v3-patient-ceremony-schema-check.js` tests immutable challenge/audit FK,
canonical displayed digest, finite linking/reauth window, rollback and nonowner
default-deny. These are scoped schema tests, NOT durable patient approval,
exactly-once consumption, complete V3-AT-CON/LD or D6 concurrency evidence.

024 [actual patient RLS](../governance/highpass-v3-patient-approval-rls-2026-10-08.md)
extends CON-001/002/006, IAM-003 and TEN-003 with62 isolated schema/SQL checks.
Correct patient can read a doctor-created preparation with minimum columns and
actual SHARE locks; foreign patient/source/role/scope and UPDATE are denied.
Guarded JS projection/reauth/current expiry, public read audit, patient approval
and complete V3-AT-CON/LD/D6 remain NOT VERIFIED, not inferred from SQL visibility.

## Lifecycle refinement coverage — 2026-10-08

The [dependency contract](../api/highpass-v3-lifecycle-dependency-contract.md) links
ID/EX/CON/AUTH/GRT requirements and IAM/TEN/AUTH/GRT security controls to candidate
LD-01..10 cases: binding/invitation/link approval/review/version/withdrawal/concurrency/
faults/action scope/receipt. These extend existing ID/EX/CON/AUTH/GRT/PRE acceptance
cases without replacing them. All LD execution remains NOT VERIFIED. Documentation
alignment and proposal checks are not proof of runtime access or patient approval.

문서 버전: `v3.0-DRAFT-BASELINE`
기준일: 2026-09-12
상태: **TRACEABILITY BASELINE / REVIEW REQUIRED**

2026-10-07 추가 증적: 기존 FR-021~041 내장 Viewer의 실제 Chrome 디코딩/토큰 비노출 및
Viewer→DB/PACS dual-namespace SYN 차단 검증을 추가했다. v3 후보 시험 전체 PASS로 확장하지 않는다.
V3-AT-FIX-006 후속 구현은 legacy 단기 DICOM 토큰에 cnf.jkt를 바인딩하고 보호 DICOMweb
route에서 proof/ath/ingress를 검증한다. strict 합성 profile 검증과 사람 검토는 최신 실행 기록을
따른다. PostgreSQL 공유 replay와 실제 재시작/저장소 장애 시험은 최신 후속 증적을 따른다.
JSON/단일 프로세스 replay 및 공유 컴포넌트 시험을 전체 API HA 보장으로 확대하지 않는다.
v3 TransferGrant 전체 구현과 독립 사람 검토는 계속 미완료이다.
기준 증적·계약 후보: [추가 게이트 실행 기록](../governance/highpass-v3-p0-execution-2026-10-07.md#추가-게이트-브라우저--패킷--dpopingress--독립-검토-준비).

입력 기준: [Capstone MVP Boundary](../baseline/CAPSTONE-MVP-BOUNDARY.md), [Highpass v3 Requirements](../requirements/highpass-v3-requirements-definition.md), [Highpass v3 Security Requirements](../security/highpass-v3-security-requirements.md), [Legal Traceability](../standards/LEGAL-TRACEABILITY.md)

추적 경로:

```text
Business Goal → Functional Requirement → Legal/Standard Basis → Threat
→ Security Requirement → Domain Object → Component/API/Data → Acceptance Test → Evidence
```

`Candidate test`는 구현 전 시험 식별자이며 PASS를 의미하지 않는다. `Existing evidence`만 현재 Repository에 존재하는 코드·시험을 가리킨다. 표 안의 `BR-xxx`와 `SR-xxx`는 각각 `V3-BR-xxx`, `V3-SR-xxx`의 축약 표기다. 아래 Coverage Index에는 모든 ID를 정식 명칭으로 기록한다.

## 1. P0 functional traceability

이 절의 P0는 `CAPSTONE-P0`를 의미한다. 실제 환자·법률·병원 Production 검증은 연결된 기술요구사항의 실행 blocker가 아니라 별도 `PRODUCTIONIZATION` trace다.

| Functional requirement | Goal | Legal / standard candidate | Threat | Security requirement | Object / component | Candidate test | Current evidence/status |
|---|---|---|---|---|---|---|---|
| V3-FR-ID-001, V3-FR-ID-002 | BR-001 | PIPA minimum/safeguards review | local ID disclosure/collision | SR-IAM-004, SR-DATA-001 | PatientRef/Mapping, Identity API/data | V3-AT-ID-001 opaque/cross-hospital IDs | PARTIAL — AEAD/HMAC, own ref/mapping transactions and durable retries tested; cross-institution linking/write HTTP pending |
| V3-FR-ID-003, V3-FR-ID-004 | BR-001/004 | Medical transfer accuracy review | false/ambiguous match | SR-PAT-001 | PatientMapping/Reconciliation | V3-AT-ID-002 ambiguous match DENY | PARTIAL — local five-state/reviewer/version/collision PG checks; no demographic auto-merge; HTTP and broader candidate workflow pending |
| V3-FR-ID-005 | BR-004 | access-record/accountability review | mapping repudiation | SR-AUD-001/003 | Mapping AuditEvent | V3-AT-ID-003 mapping audit completeness | PARTIAL — same-tx old/new/version/actor/evidence outbox + DB constraints tested; HTTP/full audit pipeline pending; see P0-04 mapping-state execution record |
| V3-FR-ID-006 | BR-001 | Medical Act transfer review | wrong-patient PACS import | SR-PAT-001/002 | Preflight/B Connector | V3-AT-ID-004 unverified import DENY | NOT VERIFIED |
| V3-FR-EX-001, V3-FR-EX-004 | BR-001/004 | Medical Act request/consent review | orphan/untraceable transfer | SR-AUTH-001, SR-AUD-001 | ExchangeSession API/data | V3-AT-EX-001 required fields/correlation | transfer request PARTIAL |
| V3-FR-EX-002 | BR-001 | request/consent actor review | wrong consent flow | SR-IAM-001/003, SR-AUTH-002 | Session initiation | V3-AT-EX-002 patient/provider flow matrix | NOT VERIFIED |
| V3-FR-EX-003 | BR-004 | accountability | invalid state/race | SR-AUTH-004, SR-AUD-001 | Session state machine | V3-AT-EX-003 transition/property suite | NOT VERIFIED |
| V3-FR-EX-005 | BR-002 | DICOM object model | scope confusion | SR-DICOM-002 | SessionScope/Package | V3-AT-EX-004 multi-Study immutable scope | NOT VERIFIED |
| V3-FR-EX-006 | BR-004 | safeguards/integrity | duplicate execution | SR-API-001 | idempotency store | V3-AT-EX-005 concurrent create/retry | contract PARTIAL |
| V3-FR-EX-007 | BR-001 | consent withdrawal review | stale access | SR-AUTH-004, SR-GRT-003 | Session/Grant/KeyAuth | V3-AT-EX-006 expiry/revoke fan-out | current revoke PARTIAL |
| V3-FR-CON-001, V3-FR-CON-002 | BR-001 | Medical Act/PIPA consent review | unverifiable consent | SR-AUTH-001/002 | ConsentArtifact API/data | V3-AT-CON-001 artifact required fields | current consent PARTIAL |
| V3-FR-CON-003, V3-FR-CON-004 | BR-001/004 | consent evidence review | silent scope expansion | SR-AUTH-004, SR-AUD-001 | Consent version/state | V3-AT-CON-002 immutable version transitions | NOT VERIFIED |
| V3-FR-CON-005 | BR-001 | withdrawal/retention review | use after withdrawal | SR-AUTH-004, SR-GRT-003 | Consent/Policy/Grant | V3-AT-CON-003 withdrawal DENY | hipass-service tests PARTIAL |
| V3-FR-CON-006 | BR-001 | data-subject/access control review | consent evidence disclosure | SR-TEN-001, SR-AUTH-002 | Consent read API | V3-AT-CON-004 role/tenant read matrix | PARTIAL |

2026-10-08 CON-006 follow-up: [registered patient isolation](../governance/highpass-v3-registered-patient-isolation-execution-2026-10-08.md)
proves own positive reads plus same-hospital/foreign-tenant negative reads and copied
INSERT/substituted tuples in actual limited-role PostgreSQL. Private synthetic reauth
is not real IdP assurance. Public audited evidence read, authorized minimum admin read
and production isolation remain NOT VERIFIED; CON-006 stays PARTIAL.
| V3-FR-AUTH-001 | BR-001 | PIPA/Medical Act role review | consent-as-token confusion | SR-AUTH-001 | Consent/Decision/Grant | V3-AT-AUTH-001 object separation | PARTIAL |
| V3-FR-AUTH-002, V3-FR-AUTH-003 | BR-001 | safeguards, DICOM security review | policy bypass | SR-AUTH-002/003 | Policy Engine | V3-AT-AUTH-002 one-failure matrix | hipass-service PASS-local |
| V3-FR-AUTH-004, V3-FR-AUTH-005 | BR-004 | accountability | client-only auth/repudiation | SR-AUTH-003, SR-AUD-001 | API/PolicyDecision | V3-AT-AUTH-003 direct API and decision record | PARTIAL |
| V3-FR-GRT-001, V3-FR-GRT-002 | BR-002 | safeguards/PS3.15 review | over-privileged access | SR-GRT-001 | TransferGrant/Token API | V3-AT-GRT-001 action scope matrix | current token PARTIAL |
| V3-FR-GRT-003 | BR-001/004 | secure token practice | confused deputy | SR-GRT-001/003 | Grant validator | V3-AT-GRT-002 iss/aud/jti/recipient/resource | token tests PASS-local |
| V3-FR-GRT-004 | BR-005 | data minimization | payload/key in token | SR-GRT-002, SR-CRY-002 | Grant schema/logs | V3-AT-GRT-003 forbidden fields scan | secret scan/current contract |
| V3-FR-GRT-005 | BR-001 | safeguards | replay/tamper/stale token | SR-GRT-003 | introspection/revocation | V3-AT-GRT-004 replay/tamper/expiry | token/ticket tests PASS-local |
| V3-FR-PKG-001, V3-FR-PKG-002 | BR-002 | DICOM object hierarchy | route coupling/scope loss | SR-DICOM-002, SR-DATA-001 | ImagingPackage/Manifest | V3-AT-PKG-001 route-neutral multi-Study | domain PARTIAL |
| V3-FR-PKG-003 | BR-004 | integrity/accountability | incomplete manifest | SR-DATA-003 | Manifest schema | V3-AT-PKG-002 manifest/object equality | package tests PARTIAL |
| V3-FR-PKG-004 | BR-001 | PS3.15/safeguards review | plaintext disclosure | SR-CRY-001/002 | Package Crypto | V3-AT-PKG-003 AEAD roundtrip/no plaintext | mobile crypto PASS-domain |
| V3-FR-PKG-005, V3-FR-PKG-006 | BR-004 | integrity | tamper/missing/duplicate | SR-DATA-003, SR-API-001 | Builder/Receiver/Chunks | V3-AT-PKG-004 tamper/reorder/resume | receiver PARTIAL; resume missing |
| V3-FR-PKG-007 | BR-003 | minimization/source-of-record | central PACS drift | SR-DATA-001 | Control DB | V3-AT-PKG-005 no Pixel Data persistence | schema inspection current |
| V3-FR-CLOUD-001, V3-FR-CLOUD-002 | BR-003 | PIPA purpose/minimization review | permanent/plaintext cloud copy | SR-DATA-001/002, SR-CRY-002 | Object Store/Relay | V3-AT-CLOUD-001 ciphertext-only temp copy | NOT VERIFIED |
| V3-FR-CLOUD-003, V3-FR-CLOUD-004 | BR-003/004 | retention/destruction review | stale recoverable copy | SR-DATA-004/005 | Lifecycle/Key/DeleteReceipt | V3-AT-CLOUD-002 expiry/delete/decrypt DENY | domain PARTIAL |
| V3-FR-ROUTE-001, V3-FR-ROUTE-002 | BR-002 | interoperability | wrong/unsafe route | SR-AUTH-002, SR-PAT-002 | RouteDecision | V3-AT-ROUTE-001 capability/grant decision table | NOT VERIFIED |
| V3-FR-ROUTE-003 | BR-005 | automated decision transparency review | opaque unsafe route | SR-AUD-001 | Route policy | V3-AT-ROUTE-002 deterministic/no-AI | document only |
| V3-FR-PRE-001 | BR-002 | safeguards | spoofed/unavailable destination | SR-IAM-002, SR-NET-002/003 | Preflight Connector | V3-AT-PRE-001 TLS/DNS/refused/timeout | NOT VERIFIED |
| V3-FR-PRE-002 | BR-001 | medical safety | wrong patient import | SR-PAT-001/002 | Mapping Preflight | V3-AT-PRE-002 ambiguous mapping no transfer | NOT VERIFIED |
| V3-FR-PRE-003 | BR-002 | DICOM PS3.18/object model | unsupported SOP/syntax | SR-PAT-002, SR-DICOM-003 | Capability registry | V3-AT-PRE-003 UID/SOP/TS matrix | PHR mapping PARTIAL |
| V3-FR-PRE-004 | BR-001 | access control | stale authorization/quota bypass | SR-AUTH-004, SR-GRT-003 | Policy/Grant/Quota | V3-AT-PRE-004 stale grant/quota | PARTIAL |
| V3-FR-PRE-005, V3-FR-PRE-006 | BR-004 | accountability | payload moves after FAIL | SR-AUD-001, SR-NET-003 | PreflightResult/Route | V3-AT-PRE-005 PASS/FAIL/WARNING + no-transfer spy | NOT VERIFIED |
| V3-FR-ACC-001 | BR-002 | DICOM PS3.18 QIDO-RS | scope enumeration | SR-DICOM-002 | Gateway QIDO | V3-AT-ACC-001 Study/Series/Instance scope | current tests PASS-local |
| V3-FR-ACC-002 | BR-002 | DICOM PS3.18 WADO-RS | over-fetch/IDOR | SR-DICOM-002 | Gateway WADO | V3-AT-ACC-002 Instance/Frame/lazy scope | PARTIAL |
| V3-FR-ACC-003 | BR-002 | browser/security review | token/cache leakage | SR-VIEW-001, SR-API-003 | Viewer/Edge | V3-AT-ACC-003 URL/storage/cache expiry | OHIF/UI tests PARTIAL |
| V3-FR-ACC-004 | BR-002 | minimum privilege | view-to-download escalation | SR-AUTH-002, SR-GRT-001 | Download API/UI | V3-AT-ACC-004 VIEW_ONLY download DENY | transfer-ticket PASS-local |
| V3-FR-ACC-005, V3-FR-ACC-006 | BR-002 | DICOM PS3.18 STOW | unauthorized/wrong import | SR-PAT-001/002, SR-DICOM-003 | B Connector/STOW | V3-AT-ACC-005 import gate/STOW positive-negative | NOT VERIFIED |
| V3-FR-ACC-007 | BR-004 | DICOM transaction integrity | duplicate/silent partial | SR-DICOM-003, SR-AUD-001 | PacsImport/Receipt | V3-AT-ACC-006 duplicate/partial/idempotency | contract only |
| V3-FR-ACC-008 | BR-001 | PS3.15 secure transport | PACS bypass | SR-DICOM-001, SR-NET-001/002 | Network/Connector | V3-AT-ACC-007 direct/unauth/untrusted/expired DENY | local mTLS tests |
| V3-FR-ACC-009 | BR-004 | accountability | policy error hidden as network | SR-NET-003, SR-API-003 | Error taxonomy | V3-AT-ACC-008 safe distinct errors | PARTIAL |
| V3-FR-PROV-001, V3-FR-PROV-002 | BR-004 | DICOM audit/integrity review | lost origin/custody | SR-AUD-001, SR-DATA-003 | Provenance aggregate | V3-AT-PROV-001 required evidence chain | NOT VERIFIED |
| V3-FR-PROV-003 | BR-004 | object integrity | bit change | SR-DATA-003 | Source/Destination receipt | V3-AT-PROV-002 bit-preserving hash equality | NOT VERIFIED |
| V3-FR-PROV-004, V3-FR-PROV-005 | BR-004/005 | DICOM semantics | false integrity after transcode | SR-DICOM-004 | Transformation record/validator | V3-AT-PROV-003 transcode semantic/false-PASS | NOT VERIFIED |
| V3-FR-AUD-001, V3-FR-AUD-002 | BR-004 | access log/safeguards review | repudiation | SR-AUD-001/002 | AuditEvent/outbox | V3-AT-AUD-001 event/field coverage | current audit PARTIAL |
| V3-FR-AUD-003, V3-FR-AUD-004 | BR-004 | minimization/integrity | PHI leakage/log tamper | SR-AUD-003, SR-API-003 | Audit store/API | V3-AT-AUD-002 leak/mutation/hash | hash-chain PASS-local |
| V3-FR-AUD-005 | BR-004 | monitoring | undetected abuse | SR-DET-001 | Detection rules | V3-AT-AUD-003 abuse pattern fixtures | current rules PARTIAL |
| V3-FR-TEN-001, V3-FR-TEN-002 | BR-001 | PIPA access control review | cross-tenant IDOR | SR-TEN-001/002 | all aggregates/APIs | V3-AT-TEN-001 cross-tenant CRUD | PARTIAL |
| V3-FR-TEN-003, V3-FR-TEN-004 | BR-001 | safeguards | list/join leakage | SR-TEN-003 | repositories/RLS | V3-AT-TEN-002 list/join app+DB DENY | NOT VERIFIED full domain |
| V3-FR-CONN-001 | BR-002 | DICOM/IHE compatibility | proprietary/brittle integration | SR-DICOM-003, SR-API-001 | Connector interface | V3-AT-CONN-001 capability/contract | design PARTIAL |
| V3-FR-CONN-002, V3-FR-CONN-003 | BR-001/004 | PS3.15 secure transport | inbound exposure/fail-open | SR-IAM-002, SR-NET-001/002/003 | Connector/network | V3-AT-CONN-002 outbound mTLS/fault suite | local proxy PARTIAL |

## 2. P1 mobile traceability

| Functional requirement | Goal | Threat | Security requirement | Candidate test | Current |
|---|---|---|---|---|---|
| V3-FR-MOB-001, V3-FR-MOB-002 | BR-002/003 | plaintext/general file exposure | SR-MOB-001/002, SR-DATA-003 | V3-AT-MOB-001 capsule/vault isolation | domain PARTIAL |
| V3-FR-MOB-003 | BR-001 | copied capsule/key theft | SR-MOB-001/002 | V3-AT-MOB-002 original vs foreign device | external device BLOCKED |
| V3-FR-MOB-004 | BR-001 | QR PHI/replay | SR-GRT-003, SR-API-003 | V3-AT-MOB-003 QR forbidden fields/replay | ticket domain PASS-local |
| V3-FR-MOB-005, V3-FR-MOB-006 | BR-003/004 | lost device/stale backup | SR-MOB-003/004/005, SR-DATA-004 | V3-AT-MOB-004 lost/revoke/backup/delete | domain PARTIAL |
| V3-FR-ROUTE-004 | V3-BR-006 | unsafe mobile route | V3-SR-MOB-002, V3-SR-GRT-001 | V3-AT-MOB-005 mobile route scope | NOT IMPLEMENTED |

## 3. Security requirement coverage index

| Domain | Exact security requirement IDs | Acceptance family |
|---|---|---|
| Identity | V3-SR-IAM-001, V3-SR-IAM-002, V3-SR-IAM-003, V3-SR-IAM-004 | V3-AT-AUTH-*, V3-AT-CONN-* |
| Tenant | V3-SR-TEN-001, V3-SR-TEN-002, V3-SR-TEN-003 | V3-AT-TEN-* |
| Consent/Auth | V3-SR-AUTH-001, V3-SR-AUTH-002, V3-SR-AUTH-003, V3-SR-AUTH-004 | V3-AT-CON-*, V3-AT-AUTH-* |
| Grant | V3-SR-GRT-001, V3-SR-GRT-002, V3-SR-GRT-003 | V3-AT-GRT-* |
| Patient safety | V3-SR-PAT-001, V3-SR-PAT-002 | V3-AT-ID-004, V3-AT-PRE-002/003 |
| DICOM | V3-SR-DICOM-001, V3-SR-DICOM-002, V3-SR-DICOM-003, V3-SR-DICOM-004 | V3-AT-ACC-*, V3-AT-PROV-003 |
| Cryptography | V3-SR-CRY-001, V3-SR-CRY-002, V3-SR-CRY-003, V3-SR-CRY-004, V3-SR-CRY-005, V3-SR-CRY-006 | V3-AT-PKG-003/004, V3-AT-CLOUD-002, V3-AT-OPS-001 |
| Data lifecycle | V3-SR-DATA-001, V3-SR-DATA-002, V3-SR-DATA-003, V3-SR-DATA-004, V3-SR-DATA-005 | V3-AT-PKG-*, V3-AT-CLOUD-* |
| Network | V3-SR-NET-001, V3-SR-NET-002, V3-SR-NET-003 | V3-AT-PRE-001, V3-AT-ACC-007/008, V3-AT-CONN-002 |
| API/Viewer | V3-SR-API-001, V3-SR-API-002, V3-SR-API-003, V3-SR-VIEW-001 | V3-AT-AUTH-003, V3-AT-ACC-003/008, V3-AT-OPS-001 |
| Audit/Detection | V3-SR-AUD-001, V3-SR-AUD-002, V3-SR-AUD-003, V3-SR-DET-001 | V3-AT-AUD-* |
| Operations | V3-SR-OPS-001, V3-SR-OPS-002, V3-SR-OPS-003 | V3-AT-OPS-001/002 |
| Mobile | V3-SR-MOB-001, V3-SR-MOB-002, V3-SR-MOB-003, V3-SR-MOB-004, V3-SR-MOB-005 | V3-AT-MOB-* |
| Offline mobile | V3-SR-MOB-006 | V3-AT-POST-001 |

## 4. Non-functional and security-only traceability

| Requirement | Threat / goal | Candidate test | Current |
|---|---|---|---|
| V3-NFR-REL-001, V3-NFR-REL-002 | hang/retry storm/fail-open | V3-AT-NFR-001 finite timeout and bounded retry | PARTIAL |
| V3-NFR-REL-003 | silent partial import | V3-AT-NFR-002 partial result accuracy | NOT VERIFIED |
| V3-NFR-INT-001, V3-NFR-INT-002 | false standard claim | V3-AT-NFR-003 conformance document/release scan | docs present |
| V3-NFR-PERF-001 | excess DICOM transfer | V3-AT-NFR-004 Viewer network trace | PARTIAL |
| V3-NFR-OBS-001 | broken chain of custody | V3-AT-NFR-005 correlation across planes | PARTIAL |
| V3-NFR-UX-001 | unsafe/ambiguous user action | V3-AT-NFR-006 accessibility/action-scope UI | PARTIAL |
| V3-NFR-TST-001 | unverifiable completion | V3-AT-NFR-007 traceability completeness gate | PARTIAL |
| V3-NFR-COMP-001 | false compliance claim | V3-AT-NFR-008 prohibited-claim scan | docs present |
| V3-SR-OPS-001/002 | secret/supply-chain compromise | V3-AT-OPS-001 secret/startup/SBOM/image gate | PARTIAL |
| V3-SR-OPS-003 | insecure/unrecoverable DR | V3-AT-OPS-002 restore auth/tenant/key isolation | BLOCKED-EXTERNAL |

## 5. Post-MVP and Productionization traceability

| Classification | Requirement / item | Extension point | Candidate gate | Current |
|---|---|---|---|---|
| POST-MVP | V3-FR-ACC-010 legacy C-STORE | Hospital Connector adapter | V3-AT-POST-001 legacy AE/import isolation | NOT IMPLEMENTED |
| POST-MVP | V3-SR-MOB-006 offline lease | Mobile Vault policy/key lifecycle | V3-AT-POST-002 offline expiry/clock/reconnect | NOT IMPLEMENTED |
| PRODUCTIONIZATION | actual patient identity/MPI | PatientRef/Mapping interface | PROD-GATE-ID | BLOCKED-EXTERNAL, not Capstone blocker |
| PRODUCTIONIZATION | actual IdP/MFA | Identity Provider interface | PROD-GATE-IAM | BLOCKED-EXTERNAL, not Capstone blocker |
| PRODUCTIONIZATION | actual KMS/HSM | KMS adapter/key policy | PROD-GATE-KMS | BLOCKED-EXTERNAL, not Capstone blocker |
| PRODUCTIONIZATION | hospital PACS/vendor/network | Connector/DICOMweb interfaces | PROD-GATE-PACS | BLOCKED-EXTERNAL, not Capstone blocker |
| PRODUCTIONIZATION | legal/privacy/clinical/contract/operations | legal traceability and governance | PROD-GATE-GOV | DEFERRED/BLOCKED, not Capstone blocker |

## 6. Coverage summary

| Coverage dimension | Result | Remaining |
|---|---|---|
| P0 functional requirement IDs represented | COMPLETE — grouped rows cover all IDs | reviewer confirmation |
| P1 Mobile requirements represented | COMPLETE | platform test detail after OS choice |
| Security requirement groups represented | COMPLETE | individual test specs not yet authored |
| Legal/standard candidates linked | COMPLETE at topic level | legal interpretation approval required |
| Candidate acceptance IDs assigned | COMPLETE | executable test cases not yet implemented |
| Current Repository evidence distinguished | COMPLETE | refresh after next test run |
| Architecture/ERD/API exact field alignment | DOCUMENT COMPLETE — REVIEW PENDING | implementation and runtime verification not started |
| Capstone vs Production classification | COMPLETE | reviewer confirmation |

현재 판정: **PARTIAL — TRACEABILITY AND ARCHITECTURE/ERD/API DOCUMENT ALIGNMENT COMPLETE, INTEGRATED REVIEW PENDING**

## 7. Exit gate

Latest 2026-10-07 [internal Session create evidence](../governance/highpass-v3-p0-05-session-create-2026-10-07.md):
EX-001/002/005/006 foundation now has actual nonowner patient/provider, concurrent
and lost-ACK PG evidence. EX-003/007 state/cancel, recipient consent and v3 HTTP/E2E
remain NOT VERIFIED. No whole acceptance gate is closed by 108 component checks.

2026-10-07 [P0-05 schema/RLS gate](../governance/highpass-v3-p0-05-session-schema-2026-10-07.md):
32 isolated PG checks PASS; V3-FR-EX/TEN/AUD foundation only. Authenticated creation,
recipient approval and end-to-end clinical access are NOT VERIFIED, not inferred
from source-owned owner fixture assembly or passive participant rows.

2026-10-07 [Session contract gate](../governance/highpass-v3-p0-05-session-contract-2026-10-07.md):
V3-FR-EX-002/004/005 입력·binding/scope 검증만 local tested; DB/HTTP/동의/기관 간
종단 acceptance는 미완료. 전체 Node 325 PASS는 전체 v3 구현 완료 증거가 아니다.

2026-10-07 구현 증적 추가: [P0-04 Mapping write HTTP](../governance/highpass-v3-p0-04-write-http-2026-10-07.md).
로컬 reconcile/review HTTP·PG 90 checks PASS; 런타임 활성화와
기관 간 환자 참조 승인/membership, 전체 v3 완료는 NOT VERIFIED/미완료다.

`Requirements v3 + Traceability Matrix COMPLETE` 판정 조건:

1. 모든 요구사항 ID가 정확히 한 source definition을 가진다.
2. 모든 P0 functional requirement가 threat/security control/test에 연결된다.
3. 모든 P0 security requirement가 최소 한 개 candidate test 또는 명시적 review gate에 연결된다.
4. current evidence는 실제 파일/명령과 일치하고 미실행 항목은 NOT VERIFIED다.
5. Product·Medical Information·Security/Privacy reviewer가 scope와 wording을 승인한다.
6. Architecture/ERD/API 문서 정렬 결과가 모든 P0 객체·필드·상태·endpoint 경계를 보존하는지 통합 검토한다.

2026-10-07 [통합 기술 검토](../governance/highpass-v3-integrated-review-2026-10-07.md), [Acceptance Criteria](../acceptance/highpass-v3-acceptance-criteria.md), [P0 Master Plan](../implementation/highpass-v3-p0-master-plan.md)을 작성했다. 사용자 순차 진행 지시에 따라 P0-01 현행 보안 공백 수정을 시작하며 정식 사람 검토·v3 기능 구현 PASS는 별도로 기록한다.

## Guarded patient projection follow-up — 2026-10-08

CON-001..006 / IAM-003/004 / AUTH-004 / TEN-003 / legacy FR-001..005/014..020:
[scoped internal helper evidence](../governance/highpass-v3-patient-guarded-projection-2026-10-08.md)
proves signed synthetic patient reauth, minimal nonowner live eligibility reads,
SQL canonical digest, private same-transaction brand, actual cancellation/expiry
DENY and lock wait. Not public audit/HTTPS, approval consumption, Decision/Grant
or full D6 acceptance. Existing earlier gate records retain historical scope.

## Patient challenge issuance follow-up — 2026-10-08

CON-001..006 / IAM-003/004 / AUTH-004 / TEN-003 / FR-001..005/014..020/037..041:
[internal issuance evidence](../governance/highpass-v3-patient-challenge-issuance-2026-10-08.md)
proves guarded signed-synthetic patient issuance, canonical snapshot/finite TTL,
hash-only nonce, exact audit/receipt, same-key serialization/recovery, actual
commit ACK loss, parent expiry/prepare expiry/cancel/target/timeout DENY. Storage
and challenge are NOT consent approval or full CON acceptance. Next immutable
content/event/one-time decision persistence was NOT IMPLEMENTED at issuance time; runtime/public
audit/HTTPS/UI/full D6/Decision/Grant and whole MVP/v3 still incomplete.

## Initial durable patient decision follow-up — 2026-10-08

CON-001..006 / AUTH-001/004 / IAM-003/004 / TEN-003 / FR-001..005/014..020/037..041:
[initial decision evidence](../governance/highpass-v3-patient-decision-execution-2026-10-08.md)
and [deadline/actual lock waits](../governance/highpass-v3-patient-decision-deadline-execution-2026-10-08.md)
prove guarded initial APPROVE/REJECT, independent linking choice, immutable
contentVersion1/events1..2, atomic audit/consumption/receipt, idempotency/lost ACK
and a limited direct RLS/immutability matrix. Challenge/private reauth expiry and
actual COMMIT/deferred rejection are scoped synthetic evidence, not real IdP MFA.
CON remains PARTIAL: withdrawal/expiry/replacement versions, full registered
patient/tenant isolation matrix, full D6, public transport/UI/admin reads and
AuthorizationDecision/Grant/clinical authority are not complete. Live DB not applied.

## Proposed consent lifecycle alignment — 2026-10-08

CON-003~006 → [lifecycle ADR](../architecture/highpass-v3-consent-lifecycle-adr.md) /
[contract](../api/highpass-v3-consent-lifecycle-contract.md) → V3-AT-CON-002~004 and
IAM/TEN/AUTH/GRT controls. Patient withdrawal and actual maintenance expiry are
separate actors/capabilities; recorded events versus effective expiration and cascade
REQUESTED versus delivery are separate. L1~L5 were adopted by 김범희 on 2026-10-08
([policy record](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md)).
Policy adoption is not technical PASS; private withdrawal now has the scoped evidence below,
while the private consent-expiry service remains NOT IMPLEMENTED.

027 follow-up: [schema/private projection evidence](../governance/highpass-v3-consent-lifecycle-ddl-execution-2026-10-08.md)
maps CON-003/005 to isolated terminal assembly + own live withdrawal projection.
PG208/208 is scoped PASS, not an authenticated atomic withdrawal service or downstream
revocation. CON-003/005/006 and V3-AT-CON-002~004 remain PARTIAL/NOT VERIFIED for missing paths.

028 [internal withdrawal service evidence](../governance/highpass-v3-consent-withdraw-service-execution-2026-10-08.md)
adds actual signed synthetic withdrawal-only service, HMAC exact original receipt recovery,
immutable retry/deny audit, atomic rollback/ACK/deadline/locale tests (PG226 scoped).
It does not prove complete registered isolation/withdraw-expiry races, expiry worker,
public read or downstream authority revocation. Full CON/LD/D6 remains incomplete.

[Registered withdrawal isolation](../governance/highpass-v3-withdrawal-isolation-execution-2026-10-08.md)
adds scoped PG238/238: three signed registered patients, six ordered foreign pairs,
own-positive receipt recovery, own-only terminal/outcome reads and copied-write SQLSTATE42501.
This is not the complete D6/lifecycle authority or public-read matrix. Evidence DRAFT/UNASSIGNED.

Same report's scoped PG246 proves L1 parent-cancel/target-stop independence and L2
source/principal/ref two-way witnessed races, using actual withdrawal/cancel services
and owned SQL suspension fixtures. Complete expiry/Grant/public-read matrix remains pending.

[Withdrawal/SQL expiry contention](../governance/highpass-v3-withdraw-expiry-contention-execution-2026-10-08.md)
adds scoped PG252/252 and Node483/483: exact common-lock witnesses, expiry-first denial,
withdraw-before-deadline success versus late COMMIT rollback, immutable original receipt,
source-only terminal observation without patient audit/result/cascade access or writes.
Generic-plan failures are preserved and the permission/control-flow fix retains least
privilege. Private authenticated consent-expiry worker, public audited read and downstream
Grant revocation remain incomplete. DRAFT/UNASSIGNED, not a full CON/D6 or MVP completion.

[Consent expiry principal/command](../governance/highpass-v3-consent-expiry-principal-execution-2026-10-08.md)
maps CON-003/005/006 and IAM/AUTH/TEN to explicit CONSENT_EXPIRY/sole consent:expire,
private exact-binding command and signed generic DB context (PG256, Node493 scoped).
Source/principal mismatch and human/cross-purpose maintenance scope denial verified.
Dedicated expiry factory/worker, public minimum audited read and clinical authority remain pending.

[Dedicated consent expiry factory](../governance/highpass-v3-consent-expiry-factory-execution-2026-10-08.md)
adds CON/IAM/AUTH/TEN scoped private DB admission evidence (PG261/261, Node502/502).
Actual sole-role guard, source/principal mismatch, rollback/deadline and private callback
lifetime are verified without patient_refs privilege. Expiry event service/worker,
downstream Grant denial and minimum audited read are still incomplete. DRAFT/UNASSIGNED.

[Authenticated consent expiry service](../governance/highpass-v3-consent-expiry-service-execution-2026-10-08.md)
maps CON-003/005/006, AUTH-004, TEN-001/003 and AUD-001 to actual scoped finite batch
event assembly plus durable original batch recovery (PG272/Node506). Actual service
withdrawal/expiry lock races and missing-assembly rollback are verified, unlike earlier
SQL-only evidence. Ledger full isolation/multi-object bounds/retry audit/close/drain,
public read and downstream Grant/access revocation remain incomplete. DRAFT/UNASSIGNED.
