# MediQ SaaS UI Screen Traceability Matrix

**Project:** MediQ  
**Document ID:** MEDIQ-SAAS-UI-TRACE-001  
**Version:** 0.2.0  
**Classification:** MIXED — CAPSTONE-P0 / CAPSTONE-P1 / POST-MVP  
**Status:** Design Traceability — Not Implementation Evidence  
**Implementation:** NOT IMPLEMENTED  
**Test Status:** NOT RUN  
**Last Updated:** 2026-09-27

---

# 1. 목적

`SAAS-SCREEN-DESIGN-SPEC.md`의 기존 79개 Screen과 별도 Hospital Clinical Workflow P1 Extension을 Requirement, Security Gate, API/State, Audit, Acceptance Test 및 공개 Reference에 연결한다. 범위 표기는 설계 추적성을 위한 것이며 실제 구현·시험 PASS를 의미하지 않는다.

# 2. 상태 표기

| 상태 | 의미 |
|---|---|
| EXISTING | `OPENAPI.yaml` 또는 승인 문서에 계약 존재 |
| PARTIAL | 일부 행위·필드만 계약 존재 |
| API GAP | 구현 전 승인 계약 필요 |
| EXTERNAL | OIDC 또는 Browser API |
| LOCAL | Client local behavior; Backend 권한 대체 아님 |
| POST-MVP | 현재 P0/P1 구현 범위 밖 |

# 3. Screen Traceability

| Screen | Phase / Actor | Requirement | Security Gate | API / State | Audit | Acceptance | Reference | Gap |
|---|---|---|---|---|---|---|---|---|
| SAAS-SCR-001 | P0 / Public | P0 Web Auth | SEC-IAM-004~006 | OIDC EXTERNAL | LOGIN_SUCCESS/FAILURE | AC-UI-AUTH-001~003 | REF-SAA-01 | Auth storage decision |
| SAAS-SCR-002 | P0 / Public→Actor | P0 Web Auth | state/nonce/replay, SEC-RPL-001 | OIDC callback EXTERNAL | AUTH_CALLBACK_SUCCESS/FAILURE | AC-UI-AUTH-001~003 | REF-QR-01 | BFF vs SPA token |
| SAAS-SCR-003 | P0 / HOSPITAL_USER | REQ-ORG-002, UI Context | SEC-TEN-001, SEC-API-002 | Context PARTIAL/GAP | CONTEXT_SELECTED/SWITCHED | AC-UI-CTX-001~002 | REF-SAA-01/02 | Context profile API |
| SAAS-SCR-004 | P0 / Actor | Session expiry | SEC-IAM-006, SEC-TOK-002 | Session profile PARTIAL | SESSION_EXPIRED | AC-UI-AUTH-003 | REF-QR-01 | Session endpoint |
| SAAS-SCR-005 | P0 / Actor | REQ-AUT-002~003 | SEC-AUTHZ-002~003 | ErrorResponse EXISTING | ACCESS_DENIED | AT-SEC-001~003 | REF-CON-02 | Safe reason taxonomy |
| SAAS-SCR-006 | P0 / Actor | REQ-DICOM-004 | Fail closed, sensitive error control | Health API GAP | SERVICE_UNAVAILABLE | AC-UI-FAIL-001~002 | REF-ADM-04 | User-safe health API |
| SAAS-SCR-010 | P0 / HOSPITAL_USER | REQ-EXC-001~006 | SEC-TEN-001, object auth | Summary API GAP | DASHBOARD_VIEWED | AC-UI-DASH-001~002 | REF-SAA-05 | Dashboard summary |
| SAAS-SCR-011 | P0 Proposed / HOSPITAL_USER | REQ-EXC-001~006 | SEC-API-002, tenant filter | Exchange list API GAP | EXCHANGE_LISTED | AC-UI-DASH-001 | REF-SAA-05 | Pagination/search contract |
| SAAS-SCR-012 | P0 / HOSPITAL_USER | REQ-EXC-002~006 | SEC-AUTHZ-005, object auth | getExchangeSession EXISTING | EXCHANGE_VIEWED | AT-FUNC-002, AT-SEC-003 | REF-SAA-04 | Consent/Grant read partial |
| SAAS-SCR-013 | P0 / HOSPITAL_USER | REQ-PAT-001~005 | SEC-IAM-007~009 | Patient binding read GAP | PATIENT_CONTEXT_CHECKED | AT-SEC-011~012 | REF-CON-02 | Safe PatientRef entry |
| SAAS-SCR-014 | P0 / HOSPITAL_USER | REQ-EXC-001~002 | SEC-API-003~004, tenant binding | createExchangeSession EXISTING | EXCHANGE_CREATED | AT-FUNC-001 | REF-CON-02 | Duplicate detection detail |
| SAAS-SCR-015 | P0 / HOSPITAL_USER | REQ-EXC-005~006, REQ-AUD-* | State integrity, audit minimization | Exchange+Audit PARTIAL | EXCHANGE_VIEWED | AT-FUNC-002/016 | REF-SAA-04/05 | Unified timeline projection |
| SAAS-SCR-016 | P0 / HOSPITAL_USER | REQ-EXC-005~006 | Terminal state enforcement | getExchangeSession EXISTING | EXCHANGE_EXPIRED/CLOSED | AT-SEC-013 | REF-QR-01 | Explicit close action TBD |
| SAAS-SCR-020 | P0 / HOSPITAL_USER | REQ-ORG-001~003 | Source binding, SEC-DICOM-001 | getExchangeSession EXISTING | SOURCE_CONTEXT_VIEWED | AT-DICOM-001 | REF-SAA-01 | None for display |
| SAAS-SCR-021 | P0 / HOSPITAL_USER | REQ-DICOM-004 | Endpoint allowlist, secret exclusion | Connector status API GAP | PACS_CONNECTION_CHECKED | AT-DICOM-004 | REF-ADM-01/02 | Safe connector health |
| SAAS-SCR-022 | P0 / HOSPITAL_USER | REQ-DICOM-001 | SEC-DICOM-001, mapping/auth | listExchangeStudies EXISTING | STUDY_LISTED | AT-DICOM-001 | REF-IMG-01/06 | None for action |
| SAAS-SCR-023 | P0 / HOSPITAL_USER | REQ-DICOM-001 | Exchange-bound query, no global search | listExchangeStudies EXISTING | STUDY_LISTED | AC-UI-STU-001~003 | REF-IMG-01 | Pagination limits |
| SAAS-SCR-024 | P0 / HOSPITAL_USER | REQ-IMG-002, REQ-VIEW/DWN/PACS | Exact Study scope | Study detail PARTIAL | STUDY_VIEWED | AC-UI-STU-002~003 | REF-IMG-01/02 | Dedicated detail contract |
| SAAS-SCR-025 | P0 / HOSPITAL_USER | REQ-IMG-002, REQ-VIEW-006 | Viewer session binding | Metadata routes API GAP | STUDY_METADATA_VIEWED | TC-VIEW-006 | REF-IMG-01/02 | Authorized series metadata |
| SAAS-SCR-026 | P0 / HOSPITAL_USER | REQ-DICOM-004 | Fail closed, endpoint secrecy | DICOMweb error EXISTING | DICOMWEB_FAILURE | AT-DICOM-004 | REF-ADM-04 | Retryability field |
| SAAS-SCR-030 | P0 / HOSPITAL_USER | REQ-CON-001~005 | SEC-CONSENT-001/003/004 | requestConsent EXISTING | CONSENT_REQUESTED | AC-UI-CON-001~003 | REF-CON-02/01 | None for request |
| SAAS-SCR-031 | P0 / Authorized Actor | REQ-CON-001~004 | Stale/withdrawn/expired enforcement | Consent detail API GAP | CONSENT_VIEWED | AT-SEC-004~005 | REF-CON-02/04 | Consent GET/status |
| SAAS-SCR-032 | P0 / Synthetic PATIENT | REQ-CON-002/005 | Patient binding, BOLA deny | Consent detail API GAP | CONSENT_REVIEWED | AC-UI-CON-004~006 | REF-CON-01/04 | Secure patient read |
| SAAS-SCR-033 | P0 / Synthetic PATIENT | REQ-CON-001~003 | Version/expiry/recent auth | approveConsent EXISTING | CONSENT_APPROVED | AT-FUNC-006 | REF-CON-02/04 | Reject contract absent |
| SAAS-SCR-034 | P0 / Synthetic PATIENT | REQ-CON-004 | Exact consent owner, impact warning | withdrawConsent EXISTING | CONSENT_WITHDRAWN | AT-FUNC-007 | REF-CON-04 | Completed-copy policy text |
| SAAS-SCR-035 | P0 / Synthetic PATIENT | REQ-CON-003~004 | Fail closed on mismatch/expiry | ErrorResponse EXISTING | CONSENT_DENIED | AT-SEC-004~005 | REF-QR-01 | New request linkage |
| SAAS-SCR-036 | P0 / HOSPITAL_USER | REQ-GRT-001~006 | Consent+Authorization+exact recipient | issueTransferGrant EXISTING | GRANT_CREATED | AT-FUNC-008 | REF-CON-02/03 | Authorization evidence read |
| SAAS-SCR-037 | P0 / Authorized Actor | REQ-GRT-001~005 | Scope/recipient/tenant/expiry | Grant read PARTIAL/GAP | GRANT_VIEWED | AT-SEC-006~010 | REF-QR-01 | Grant detail endpoint |
| SAAS-SCR-038 | P0 / Exact verified recipient USER | REQ-GRT-008 | SEC-GRANT-009 exact Actor/Tenant/Hospital/Session binding; no offline/in-flight recall claim | `revokeTransferGrant` P0 contract | GRANT_REVOKED | `TC-GRT-004-REV-API-001~012`; AT-FUNC-009 | REF-CON-02 | Replay and operation-time impact projection |
| SAAS-SCR-039 | P0 / Actor | REQ-AUT-001~003 | SEC-AUTHZ-001~003 | Decision/Error EXISTING | AUTHORIZATION_DENIED | AT-SEC-017 | REF-CON-02 | Safe denial categories |
| SAAS-SCR-040 | P0 / HOSPITAL_USER/PATIENT | REQ-VIEW-001~005 | Consent+Auth+study:view | authorizeViewerAccess EXISTING | VIEW_REQUESTED | TC-VIEW-004~005 | REF-IMG-02 | None for authorize |
| SAAS-SCR-041 | P0 / Viewer Actor | REQ-VIEW-004~007 | Session/actor/tenant/study binding | authorizeViewerAccess EXISTING | VIEWER_SESSION_CREATED | TC-VIEW-004/005/007 | REF-IMG-06 | Idempotency behavior |
| SAAS-SCR-042 | P0 / Viewer Actor | REQ-VIEW-001~009 | SEC-VIEW-001~005, no-store | Viewer routes EXISTING/PARTIAL | VIEWER_OPENED/CLOSED | TC-VIEW-006~009 | REF-IMG-03/04 | Metadata discovery |
| SAAS-SCR-043 | P0 / Viewer Actor | REQ-VIEW-006/008 | Session+Study+UID binding | Metadata routes API GAP | VIEWER_NAVIGATED | TC-VIEW-006/008 | REF-IMG-01/02 | Series/instance projection |
| SAAS-SCR-044 | P0 / Viewer Actor | REQ-VIEW-003/009 | Memory-only pixel, no export | LOCAL renderer | VIEWER_TOOL_USED optional | AC-UI-VIEW-001~004 | REF-IMG-03/04 | Tool telemetry policy |
| SAAS-SCR-045 | P0 / Viewer Actor | REQ-VIEW-007 | Expiry, frame stop, cache purge | get/closeViewerSession EXISTING | VIEWER_EXPIRED | TC-VIEW-007 | REF-QR-01 | Warning thresholds |
| SAAS-SCR-046 | P0 / Viewer Actor | REQ-DICOM-004, REQ-VIEW-009 | Normalized WADO error, no fallback archive | Viewer error EXISTING | VIEWER_UPSTREAM_FAILED | TC-VIEW-009 | REF-ADM-04 | Frame retry policy response |
| SAAS-SCR-047 | P0 / Viewer Actor | REQ-CON-004, REQ-GRT-008, REQ-VIEW-007 | Recheck status on next protected request; no immediate in-flight cancellation claim | Future operation-time revalidation/fencing | VIEWER_DENIED/CLOSED only after a separate operation gate | TC-SEC-VIEW-002 (planned) | REF-CON-04 | Push vs poll and in-flight fencing decision |
| SAAS-SCR-050 | P0 / HOSPITAL_USER | REQ-DWN-001~002 | Exact study:download scope | downloadDicomStudy EXISTING | DOWNLOAD_STARTED | AT-FUNC-011 | REF-CON-02 | None for request |
| SAAS-SCR-051 | P0 / HOSPITAL_USER | REQ-DWN-001 | No-store, active grant/session | Streaming response EXISTING | DOWNLOAD_PROGRESS optional | AC-UI-DWN-001 | REF-SAA-05 | Resumability/result unknown |
| SAAS-SCR-052 | P0 / HOSPITAL_USER | REQ-DWN-001 | Server/stream completion evidence | Response completion EXISTING | DOWNLOAD_COMPLETED | AC-UI-DWN-002 | REF-SAA-05 | Browser save confirmation limit |
| SAAS-SCR-053 | P0 / HOSPITAL_USER | REQ-DWN-002 | Expired/invalid/wrong tenant deny | ErrorResponse EXISTING | DOWNLOAD_FAILED | AT-SEC-006/007/009 | REF-QR-01 | Safe retry indication |
| SAAS-SCR-060 | P0 / HOSPITAL_USER | REQ-ORG-001, REQ-PACS-002 | Immutable destination binding | getExchangeSession EXISTING | DESTINATION_CONTEXT_VIEWED | AT-SEC-011 | REF-SAA-01 | None |
| SAAS-SCR-061 | P0 / HOSPITAL_USER | REQ-PAT-003~004, REQ-PACS-003 | SEC-IAM-007~009 | validateDestinationPatientMapping EXISTING | PATIENT_MAPPING_VALIDATED | AT-SEC-012 | REF-SAA-04 | Safe read projection |
| SAAS-SCR-062 | P0 / HOSPITAL_USER | REQ-PACS-001~005 | Mandatory preflight all checks | pacs-import action PARTIAL | PACS_PREFLIGHT_ALLOWED/DENIED | AC-UI-PACS-001~003 | REF-SAA-04 | Dedicated preflight read/status |
| SAAS-SCR-063 | P0 / HOSPITAL_USER | REQ-PACS-001~003 | Fresh READY snapshot, exact destination | Client confirm + action PARTIAL | PACS_IMPORT_CONFIRMED | AT-FUNC-012 | REF-CON-02 | Recent-auth policy |
| SAAS-SCR-064 | P0 / HOSPITAL_USER | REQ-PACS-001~004 | Idempotency, exact Grant/destination | importStudyToDestinationPacs EXISTING | PACS_IMPORT_STARTED | AT-FUNC-012 | REF-SAA-05 | Async operation resource |
| SAAS-SCR-065 | P0 / HOSPITAL_USER | REQ-PACS-004~005 | No duplicate STOW, server state only | Durable status API GAP | PACS_IMPORT_PROGRESS | AC-UI-PROG-001~002 | REF-SAA-04/05 | Operation/status/polling |
| SAAS-SCR-066 | P0 / HOSPITAL_USER/Ops | REQ-PACS-004~005 | Verify-before-retry, dedup | Reconcile API GAP | PACS_IMPORT_PARTIAL/UNKNOWN | AT-DICOM-003 | REF-SAA-04 | Result unknown contract |
| SAAS-SCR-067 | P0 / HOSPITAL_USER | REQ-PACS-005, REQ-INT-001 | Expected/observed verification gate | PACS result PARTIAL | DESTINATION_VERIFIED | AT-FUNC-013 | REF-AUD-03 | Verification detail endpoint |
| SAAS-SCR-068 | P0 / HOSPITAL_USER | REQ-INT-001~002 | FAILED/PENDING blocks completion | Integrity result PARTIAL | INTEGRITY_VERIFIED/FAILED | AT-SEC-020 | REF-AUD-03 | Evidence read detail |
| SAAS-SCR-069 | P0 / HOSPITAL_USER | REQ-PACS-004~005, REQ-PROV/AUD | All completion gates | PACS result+evidence PARTIAL | PACS_IMPORT_COMPLETED | AT-FUNC-013, AT-E2E-003 | REF-SAA-04 | Atomic completion projection |
| SAAS-SCR-070 | P0 / HOSPITAL_USER | REQ-DICOM-004, REQ-PACS-004 | Fail closed, no success inference | ErrorResponse EXISTING/PARTIAL | PACS_IMPORT_FAILED | AC-UI-FAIL-001~002 | REF-SAA-04 | STOW-called evidence field |
| SAAS-QR-001 | P1 / HOSPITAL_USER | REQ-QR-001~002 | Authenticated hospital context | Camera LOCAL | QR_SCANNER_OPENED | QR-AT-046 | REF-QR-03 | Device/browser support |
| SAAS-QR-002 | P1 / HOSPITAL_USER | REQ-QR-002 | Frame non-retention, permission minimization | Browser Camera EXTERNAL | QR_CAMERA_ALLOWED/DENIED | QR-AT-014 | REF-QR-03 | Accessible fallback |
| SAAS-QR-003 | P1 / HOSPITAL_USER | REQ-QR-003 | Origin/path/length/alphabet/expiry | Parser LOCAL | QR_VALIDATED/DENIED | QR-AT-014/019 | REF-QR-01/04 | Parser implementation |
| SAAS-QR-004 | P1 / HOSPITAL_USER | REQ-QR-004 | Server actor/hospital, atomic first claim | POST claims P1 CONTRACT | QR_CLAIM_SUCCEEDED/DENIED | QR-AT-003/017/024 | REF-QR-01 | P1 implementation |
| SAAS-QR-005 | P1 / HOSPITAL_USER | REQ-QR-005~007 | No PHI before approval, expiry | GET request P1 CONTRACT | QR_APPROVAL_WAITING | QR-AT-046 | REF-QR-01/CON-01 | Polling/SSE decision |
| SAAS-QR-006 | P1 / Both | REQ-QR-005~008 | Terminal state, no reuse | GET status P1 CONTRACT | QR_EXPIRED/CANCELED/REJECTED | QR-AT-010/011/043 | REF-QR-01 | New request UX |
| SAAS-QR-007 | P1 / HOSPITAL_USER | REQ-QR-004 | Atomic claim, loser privacy | Claim conflict P1 CONTRACT | QR_CLAIM_DENIED | QR-AT-015/024 | REF-QR-01/03 | None in design |
| SAAS-QR-008 | P1 / HOSPITAL_USER | REQ-QR-007~009 | Exact study:view Grant | GET status + view EXISTING/P1 | QR_GRANT_ISSUED | QR-AT-007/008 | REF-QR-02 | P1 integration |
| SAAS-QR-009 | P1 / HOSPITAL_USER | REQ-QR-007~009 | Exact PACS_IMPORT, preflight remains | GET status + PACS action | QR_GRANT_ISSUED | QR-AT-009/022 | REF-QR-02/SAA-04 | P1 integration |
| SAAS-QR-010 | P1 / Both | REQ-QR-008~009 | Fail closed, bounded retry | GET status P1 CONTRACT | QR_GRANT_FAILED | QR-AT-040/041/050 | REF-QR-01 | Retry policy field |
| SAAS-SCR-080 | P0 / Authorized Actor | REQ-AUD-001~003 | Least-privilege audit read | getExchangeAuditEvents EXISTING | AUDIT_VIEWED | AT-FUNC-016 | REF-AUD-01/02 | Search scope P0 limited |
| SAAS-SCR-081 | P0 / Authorized Actor | REQ-PROV-001 | Resource visibility, metadata minimization | getExchangeProvenance EXISTING | PROVENANCE_VIEWED | AT-PROV-001 | REF-AUD-03 | Graph projection |
| SAAS-SCR-082 | P0 / Authorized Actor | REQ-INT-001~002 | Evidence access, raw object deny | Integrity detail PARTIAL | INTEGRITY_EVIDENCE_VIEWED | AT-SEC-020 | REF-AUD-03 | Dedicated endpoint |
| SAAS-SCR-083 | P0 / Audit Reader | REQ-AUD-001~003 | Safe denial reason, tenant scope | Audit filter PARTIAL | ACCESS_AUDIT_VIEWED | AT-SEC-018 | REF-AUD-01/02 | Role/filter contract |
| SAAS-SCR-084 | P0 / Authorized Actor | REQ-AUD-001 | Correlation access, no stack | Audit/error PARTIAL | ERROR_EVIDENCE_VIEWED | AC-UI-AUD-001~003 | REF-AUD-02 | Correlation search API |
| SAAS-SCR-085 | POST-MVP / Security Role | Future security operations | Dedicated RBAC, tenant isolation | API GAP | SECURITY_EVENT_VIEWED | TRACEABILITY GAP | REF-AUD-02/ADM-04 | Role/API/tests absent |
| SAAS-ADM-001 | POST-MVP / Platform Admin | Future Tenant Admin | Platform RBAC, cross-tenant audit | API GAP | ADMIN_TENANT_VIEWED/CHANGED | TRACEABILITY GAP | REF-SAA-02/03 | Domain/API/role/tests |
| SAAS-ADM-002 | POST-MVP / Tenant Admin | Future Hospital Onboarding | Tenant-scoped admin | API GAP | HOSPITAL_REGISTERED | TRACEABILITY GAP | REF-SAA-02/ADM-01 | Domain/API/role/tests |
| SAAS-ADM-003 | POST-MVP / Hospital Admin | Future IAM/RBAC | Least privilege, separation of duties | API GAP | ADMIN_ROLE_CHANGED | TRACEABILITY GAP | REF-SAA-03/CON-02 | Role model absent |
| SAAS-ADM-004 | PRODUCTIONIZATION / Ops | Future Connector Mgmt | Secret manager, privileged approval | API GAP | CONNECTOR_REGISTERED | TRACEABILITY GAP | REF-ADM-01/02 | Connector API/tests |
| SAAS-ADM-005 | PRODUCTIONIZATION / Ops | Future Endpoint Mgmt | SSRF allowlist, mTLS, no client exposure | API GAP | ENDPOINT_VALIDATED | TRACEABILITY GAP | REF-IMG-06/ADM-01 | Endpoint domain/API/tests |
| SAAS-ADM-006 | PRODUCTIONIZATION / PKI Ops | Future Trust Mgmt | Private key non-display, rotation audit | API GAP | CERT_ROTATION_REQUESTED/APPLIED | TRACEABILITY GAP | REF-ADM-03/01 | PKI lifecycle API/tests |
| SAAS-ADM-007 | PRODUCTIONIZATION / Network Ops | Future Private Connectivity | Layered health, no false secure claim | API GAP | CONNECTIVITY_CHECKED | TRACEABILITY GAP | REF-ADM-02/01 | Network integration/tests |
| SAAS-ADM-008 | POST-MVP / Policy Admin | Future Policy Mgmt | Versioning, four-eyes candidate | API GAP | POLICY_CHANGE_REQUESTED/APPLIED | TRACEABILITY GAP | REF-CON-03/02 | Policy model/API/tests |
| SAAS-ADM-009 | POST-MVP / Ops/Security | REQ-DATA lifecycle future UI | Tenant/session/study binding, purge evidence | API GAP | TEMP_OBJECT_PURGED | TRACEABILITY GAP | REF-AUD-03/02 | Lifecycle read/API/tests |
| SAAS-ADM-010 | POST-MVP / Ops | Future Job Operations | Idempotent retry, PHI-free logs | API GAP | JOB_RECONCILED/RETRIED | TRACEABILITY GAP | REF-SAA-05/ADM-04 | Job operation/API/tests |

# 4. Coverage Summary

| 분류 | Screen 수 | API 상태 | 추적성 상태 |
|---|---:|---|---|
| CAPSTONE-P0 | 58 | EXISTING/PARTIAL/GAP 혼합 | Requirement/Security/Test 연결 |
| CAPSTONE-P1 | 10 | QR P1 CONTRACT, 미구현 | QR Requirement/Test 연결 |
| POST-MVP/PRODUCTIONIZATION | 11 | API GAP | `TRACEABILITY GAP` 명시 |
| 합계 | 79 | 구현 증거 없음 | DOCUMENTED |

Hospital Clinical Workflow P1 Extension 5개는 기존 Reference Decision Count와 별도로 §7에서 추적한다. 현재 설계 범위는 기존 79개 + P1 Extension 5개 고유 화면이다.

# 5. 주요 Gap

1. Context profile/switch API
2. Dashboard summary와 Exchange pagination API
3. Consent/Grant 상세 read와 reject contract
4. Authorized Viewer Study/Series/Instance metadata discovery
5. Durable PACS Import operation/status와 `RESULT_UNKNOWN` reconciliation
6. Destination Verification·Integrity detail projection
7. Audit correlation search와 role/export policy
8. Tenant/Hospital/Connector/Certificate/Network/Policy/Job Admin Domain·API·Test

이 Gap을 해결하기 전 UI가 데이터를 추정하거나 임의 endpoint를 만들면 안 된다.

# 6. Screen별 Reference Decision

Decision은 Reference 전체의 품질 평가가 아니라 해당 MediQ 화면에 적용하는 방식이다.

| Screen | Decision | 적용 판단 |
|---|---|---|
| SAAS-SCR-001 | ADOPT | 검증된 조직 Context 진입 Pattern |
| SAAS-SCR-002 | ADAPT | Device-flow 상태만 callback UX에 변형 |
| SAAS-SCR-003 | ADOPT | 현재 Context 지속 표시와 switch 영향 |
| SAAS-SCR-004 | ADAPT | Expiry·새 시작 Pattern을 session에 변형 |
| SAAS-SCR-005 | ADAPT | 승인 거부 queue의 safe reason만 적용 |
| SAAS-SCR-006 | ADOPT | Incident 영향·상태·next action |
| SAAS-SCR-010 | ADAPT | Job monitor를 Exchange summary로 변형 |
| SAAS-SCR-011 | ADAPT | Run list filter를 tenant-scoped list로 변형 |
| SAAS-SCR-012 | ADAPT | Workflow detail을 의료영상 상태 카드로 변형 |
| SAAS-SCR-013 | ADAPT | Request 대상 확인만 적용; 환자검색 제외 |
| SAAS-SCR-014 | ADAPT | Review/confirm Pattern만 적용 |
| SAAS-SCR-015 | ADAPT | Step graph를 multi-lane timeline으로 변형 |
| SAAS-SCR-016 | ADAPT | Terminal/expiry Pattern 적용 |
| SAAS-SCR-020 | ADOPT | Immutable current context 표현 |
| SAAS-SCR-021 | ADOPT | Connector heartbeat·last checked·next action |
| SAAS-SCR-022 | ADAPT | Study query UI를 Gateway-bound로 변형 |
| SAAS-SCR-023 | ADAPT | OHIF list에서 일반 환자검색 제거 |
| SAAS-SCR-024 | ADAPT | Study summary와 action separation |
| SAAS-SCR-025 | ADAPT | Series navigation을 Viewer Session 뒤로 제한 |
| SAAS-SCR-026 | ADAPT | Service failure Pattern을 PACS safe error로 변형 |
| SAAS-SCR-030 | ADAPT | Approval request summary를 Consent request에 적용 |
| SAAS-SCR-031 | ADAPT | Pending/active/history를 Consent state로 변형 |
| SAAS-SCR-032 | ADAPT | 환자 주도 temporary sharing review Pattern |
| SAAS-SCR-033 | ADAPT | 명시적 submit과 version 확인 |
| SAAS-SCR-034 | ADAPT | 현재 선택·변경 Pattern을 철회에 적용 |
| SAAS-SCR-035 | ADAPT | Expiry/conflict terminal UX 적용 |
| SAAS-SCR-036 | ADAPT | Reviewer/permission 분리를 Grant issue에 적용 |
| SAAS-SCR-037 | ADAPT | Device/approval lifecycle을 Grant state에 적용 |
| SAAS-SCR-038 | ADAPT | Deny/revoke 영향 확인 Pattern |
| SAAS-SCR-039 | ADAPT | 정책 세부 없는 safe denial Pattern |
| SAAS-SCR-040 | ADAPT | Task-specific viewer mode 진입 Pattern |
| SAAS-SCR-041 | ADAPT | Viewer 준비·expiry 상태를 Gateway에 맞춤 |
| SAAS-SCR-042 | ADAPT | OHIF toolbar는 채택, Session/Gateway guard 추가 |
| SAAS-SCR-043 | ADAPT | Series panel을 authorized metadata에 제한 |
| SAAS-SCR-044 | ADOPT | W/L·Zoom·Pan·Reset 기본 조작 |
| SAAS-SCR-045 | ADAPT | Countdown/expiry 후 pixel 제거 추가 |
| SAAS-SCR-046 | ADAPT | Frame error와 service incident Pattern 결합 |
| SAAS-SCR-047 | ADAPT | Revoke notice only; do not imply instant server-side stop or offline-copy recall |
| SAAS-SCR-050 | ADAPT | 위험 action scope review 적용 |
| SAAS-SCR-051 | ADAPT | 실제 run progress만 적용 |
| SAAS-SCR-052 | ADAPT | 완료 증거와 correlation 표시 |
| SAAS-SCR-053 | ADAPT | Expiry·retryability Pattern 적용 |
| SAAS-SCR-060 | ADAPT | Context 표시를 immutable destination에 적용 |
| SAAS-SCR-061 | ADAPT | Workflow check를 mapping evidence에 적용 |
| SAAS-SCR-062 | ADAPT | Step detail을 12-check Preflight로 변형 |
| SAAS-SCR-063 | ADAPT | 위험 작업 confirmation 적용 |
| SAAS-SCR-064 | ADAPT | Submit-once·operation ID Pattern 적용 |
| SAAS-SCR-065 | ADAPT | Pipeline stepper를 DICOM 순서로 변형 |
| SAAS-SCR-066 | NO SUITABLE PUBLIC REFERENCE | `RESULT_UNKNOWN`·verify-before-retry 자체 설계 |
| SAAS-SCR-067 | NO SUITABLE PUBLIC REFERENCE | Destination Verification completion gate 자체 설계 |
| SAAS-SCR-068 | ADAPT | Lineage evidence Pattern을 Integrity에 적용 |
| SAAS-SCR-069 | ADAPT | Workflow completion을 4개 gate로 강화 |
| SAAS-SCR-070 | ADAPT | Failure step·incident UX를 safe category로 변형 |
| SAAS-QR-001 | ADAPT | Linked-device scanner 진입 Pattern |
| SAAS-QR-002 | ADAPT | Camera permission과 local authentication Pattern |
| SAAS-QR-003 | ADAPT | Device code 검증·expiry Pattern |
| SAAS-QR-004 | ADAPT | Claim과 최종 승인 분리 |
| SAAS-QR-005 | ADAPT | Polling pending·countdown Pattern |
| SAAS-QR-006 | ADAPT | Terminal device-flow 상태 적용 |
| SAAS-QR-007 | ADAPT | Conflict·rescan Pattern과 privacy 강화 |
| SAAS-QR-008 | ADAPT | Number match 후 exact VIEW action만 허용 |
| SAAS-QR-009 | ADAPT | Cross-device approval 후 Preflight 연결 |
| SAAS-QR-010 | ADAPT | Expired/denied/failed 구분 적용 |
| SAAS-SCR-080 | ADOPT | Actor/action/outcome/time audit table |
| SAAS-SCR-081 | ADAPT | Lineage graph를 3-node provenance로 축소 |
| SAAS-SCR-082 | ADAPT | Evidence detail을 PHI-free projection으로 변형 |
| SAAS-SCR-083 | ADOPT | Allow/deny event filter와 safe detail |
| SAAS-SCR-084 | ADAPT | Event detail을 correlation 중심으로 제한 |
| SAAS-SCR-085 | ADAPT | Security console 구조만 POST-MVP에 적용 |
| SAAS-ADM-001 | ADAPT | B2B organization admin을 MediQ Tenant에 변형 |
| SAAS-ADM-002 | ADAPT | Organization onboarding을 Hospital trust에 변형 |
| SAAS-ADM-003 | STUDY ONLY | Delegated admin 개념만 참고; Role Model 미승인 |
| SAAS-ADM-004 | ADOPT | Connector identity·health·version Pattern |
| SAAS-ADM-005 | ADAPT | DICOMweb capability를 allowlisted endpoint에 적용 |
| SAAS-ADM-006 | ADOPT | Certificate rotation lifecycle과 expiry |
| SAAS-ADM-007 | ADOPT | Network/connector health와 권장 조치 |
| SAAS-ADM-008 | STUDY ONLY | Reviewer·expiry 개념만 참고; Policy Model 미승인 |
| SAAS-ADM-009 | ADAPT | Lineage/lifecycle evidence를 purge에 적용 |
| SAAS-ADM-010 | ADAPT | Run monitor를 idempotent operator workflow로 변형 |

## 6.1 Decision Count

| Decision | Screen 수 |
|---|---:|
| ADOPT | 11 |
| ADAPT | 64 |
| STUDY ONLY | 2 |
| NO SUITABLE PUBLIC REFERENCE | 2 |
| 합계 | 79 |

# 7. Hospital Clinical Workflow P1 Extension — 2026-09-27

기존 79개 Reference Decision Count는 변경하지 않는다. 다음 5개 고유 Screen ID는 별도 P1 Extension이며 `SAAS-SCR-080`은 기존 화면의 역할별 Projection 확장이다.

| Screen | Phase / Actor | Requirement | Security | API / State | Acceptance | Gap |
|---|---|---|---|---|---|---|
| `HCW-SCR-001` | P1 / CLINICIAN, IMAGING_STAFF | `REQ-HCW-PR-001~004,008` | `SEC-HCW-001~002,014` | Prior Query GAP | `TC-HCW-PR-002~004/006~007` | QIDO Projection, pagination |
| `HCW-SCR-002` | P1 / authorized Viewer Actor | `REQ-HCW-PR-003~007` | `SEC-HCW-002~003,014` | Comparison Session GAP | `TC-HCW-PR-001/004~005` | Multi-study session contract |
| `HCW-SCR-003` | P1 / CLINICIAN, IMAGING_STAFF | `REQ-HCW-HP-001~009` | `SEC-HCW-004,010,013~015` | Handoff API GAP | `TC-HCW-HP-001~008` | Resource scope/persistence |
| `HCW-SCR-004` | P1 / assign-capable workforce | `REQ-HCW-AS-001~008` | `SEC-HCW-005,008~010,014~015` | Assignment API GAP | `TC-HCW-AS-001~008` | formal RBAC/state machine |
| `HCW-SCR-005` | P1 / Hospital Workforce | `REQ-HCW-NT-001~008` | `SEC-HCW-006~007,010,014~015` | Inbox API GAP | `TC-HCW-NT-001~007` | safe projection/event policy |
| `SAAS-SCR-080` 확장 | P1 / CLINICIAN, AUDITOR | `REQ-HCW-AT-001~008` | `SEC-HCW-011~012,015` | Timeline GAP/P0 PARTIAL | `TC-HCW-AT-001~007` | role-filtered explainable projection |

Extension 상태는 모두 `NOT IMPLEMENTED / NOT RUN`이며 상세 추적성은 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`를 따른다.
