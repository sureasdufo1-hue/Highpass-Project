# Highpass v3 Scope and Implementation Gates

상태: **DESIGN BASELINE / REVIEW REQUIRED**
기준일: 2026-09-12

Normative 범위 경계와 우선순위는 [CAPSTONE-MVP-BOUNDARY.md](CAPSTONE-MVP-BOUNDARY.md)를 따른다.

이 문서는 제품 목표 우선순위다. 기존 Capstone `VIEW_ONLY` 시연의 완료 증적을 취소하지 않으며, v3 P0 구현 완료를 새로 주장하지 않는다.

## P0 — Core Cloud Exchange

- PatientRef, 기관별 PatientMapping, reconciliation 상태와 감사
- Patient/Provider initiated ExchangeSession과 canonical state machine
- Versioned ConsentArtifact, AuthorizationDecision, short-lived TransferGrant
- 복수 Study snapshot을 포함하는 route-neutral ImagingPackage
- Source Hospital PACS/Orthanc QIDO/WADO retrieval
- encrypted temporary Cloud exchange copy와 정책 기반 retention
- VIEW, DOWNLOAD, PACS_IMPORT access mode의 독립 scope
- B Hospital STOW-RS import와 idempotent/partial receipt
- route capability Preflight
- 전 도메인 tenant isolation과 negative tests
- bit-preserving/transcoded 구분 Provenance와 종단 integrity evidence
- 최소 PHI 감사, hash chain, 이상행위 탐지
- 정상·음성·장애·보안 acceptance suite

P0 Definition of Done:

1. GATE-01~18이 승인된 ADR/계약/시험에 연결된다.
2. 현행 v2.1 regression이 PASS다.
3. 합성 DICOM으로 A source→Cloud exchange→B VIEW/DOWNLOAD/STOW 경로가 결정적으로 종료한다.
4. mapping/consent/grant/tenant/preflight/integrity 실패가 payload 이동 전 또는 안전한 격리로 DENY된다.
5. raw DEK, token, PHI가 URL·일반 로그·증적에 나타나지 않는다.
6. 실행하지 못한 외부 연동은 `NOT VERIFIED` 또는 `ENVIRONMENT BLOCKED`다.

## P1 — Patient Edge and Connector PoC

- Mobile Secure Vault와 Secure Medical Capsule
- Android hardware-backed key 우선 구현, iOS 계약 보존
- device binding, biometric/PIN re-authentication
- QR Transfer Request Bootstrap
- Hospital Connector PoC와 capability discovery
- 규칙 기반 route engine
- key destruction + object lifecycle 기반 crypto-shredding

## P2 — Operational Expansion

- offline lease와 conflict-safe expiry
- lost-device revocation 및 연결 복귀 시 cleanup receipt
- recoverable vault, multi-device 정책
- advanced/managed Hospital Connector
- 고급 route, queue, retry, monitoring
- 확대된 IHE compatibility 시험

## Future

- 장기 Cloud medical vault
- Radiology Report, Referral, Clinical Handoff Package
- FHIR/국가 교류망 확대
- 실제 HSM/Enterprise KMS 제품 연동
- multi-region SaaS, advanced DR

## Out of Scope

- Blockchain, DID, ZKP
- AI routing
- custom cryptography
- full PQC migration
- full Cloud PACS, full EMR, full FHIR platform
- 실제 환자정보, 무단 병원망/PACS 연결, 임상판단

## Implementation Gates

| Gate | Decision artifact | Exit criterion | Current |
|---|---|---|---|
| GATE-01 Product | ADR-001 | one-sentence definition and exclusions | PASS design |
| GATE-02 Patient Identity | ADR-002 | PatientRef invariant and identifiers | PASS design |
| GATE-03 Patient Mapping | ADR-002 | states, conflict workflow, import deny | PARTIAL |
| GATE-04 Exchange Session | ADR-003 | aggregate, state machine, timeout | PASS design |
| GATE-05 Initiation | ADR-004 | patient/provider roles and audit | PASS design |
| GATE-06 Consent Artifact | ADR-005 | evidence/version/status contract | PASS design |
| GATE-07 Authorization | ADR-006 | RBAC+ABAC fail-closed contract | PASS design |
| GATE-08 Transfer Grant | ADR-010 | typed scopes, TTL, recipient | PASS design |
| GATE-09 Imaging Package | ADR-007 | multi-Study snapshot and manifest | PASS design |
| GATE-10 Source-of-Record | ADR-008/009 | copy classes and responsibility | PASS design |
| GATE-11 Route | ADR-009/011 | route enum and decision inputs | PARTIAL |
| GATE-12 Access Modes | ADR-011 | independent authorization scopes | PASS design |
| GATE-13 Preflight | ADR-012 | probes, PASS/FAIL/WARNING policy | PARTIAL |
| GATE-14 Provenance | ADR-013 | evidence model and transcode rules | PARTIAL |
| GATE-15 Tenant | ADR-014 | ownership fields and deny tests | PARTIAL |
| GATE-16 DICOM | ADR-015/016 | PS3.18/3.15/IHE mapping | PASS design |
| GATE-17 Threat | Baseline §K | boundary threats and controls | PASS design |
| GATE-18 Acceptance | Baseline §L | test IDs and expected outcomes | PASS design |

다음 단계는 바로 구현계획이 아니다. `Capstone Boundary → Requirements v3 → Security Requirements → Traceability Matrix`를 먼저 승인하고, 이후 `Architecture/ERD/API 정렬 → Acceptance Criteria → P0 Implementation Master Plan` 순서로 진행한다. 모든 문서 Gate 전에는 코드 구현과 migration을 실행하지 않는다.
