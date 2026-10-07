# Highpass v3 Capstone MVP Boundary & Productionization Policy

문서 상태: **NORMATIVE**
적용 대상: Highpass v3 — Patient-Controlled Medical Imaging Mobility SaaS
기준일: 2026-09-12
상위 기준: [HIGHPASS-V3-BASELINE.md](HIGHPASS-V3-BASELINE.md)

> CAPSTONE MVP FIRST

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. Purpose

현재 Highpass의 최우선 목표는 Synthetic/Test 의료영상과 가상 환자·병원 환경에서 환자 동의 기반 의료영상 이동 SaaS의 핵심 Architecture와 Security Control이 실제로 동작하는지 검증하는 것이다. 실제 의료기관 배포, 실제 환자 의료정보 처리, 상용서비스의 법적 적합성 완료는 현재 성공조건이 아니다.

```text
Synthetic Patient
  → Hospital A Test PACS / Orthanc
  → DICOMweb
  → Highpass SaaS
       Patient Mapping
       Exchange Session
       Consent / Authorization / Transfer Grant
       Imaging Package / Route / Provenance / Audit
  → Web Viewer / DICOM Download / Hospital B Test PACS
```

P1은 다음 차별화 경로를 검증한다.

```text
Highpass → Secure Medical Capsule → Mobile Secure Vault
         → Patient-side Secure Edge
```

## 2. Normative data policy

### MUST NOT use

- 실제 환자 개인정보, 주민등록번호, 환자번호, 진료기록
- 실제 병원 운영 의료영상, 처방정보, 판독결과
- 실제 의료기관 credential, production PACS 또는 무단 병원망 연결
- 출처·비식별 상태를 확인할 수 없어 실제 개인정보 포함 가능성이 있는 자료

### MAY use

- 프로젝트가 직접 생성·검토한 Synthetic Patient/Hospital 데이터
- `TEST-*`, `HP-TEST-*` 계열 test identifier
- 합성 또는 적법하게 공개된 테스트용 DICOM dataset
- synthetic CT/MRI/X-ray, de-identified test data
- Test Orthanc, local PACS simulation, Mock Hospital A/B/C
- 개발 전용 credential과 test certificate

공개 dataset도 라이선스·출처·비식별 상태를 확인하고 provenance를 기록한 뒤 사용한다. 불확실하면 사용하지 않는다.

## 3. Capstone environment and identity boundary

Hospital A/B/C는 실제 기관이 아니라 Test Hospital이다.

```text
Hospital A local patient: TEST-A-001
Highpass PatientRef:      HP-TEST-0001
Hospital B local patient: TEST-B-982
```

Capstone P0는 PatientRef와 PatientMapping의 기술적 상태·오매칭 차단을 구현한다. 다음은 `PRODUCTIONIZATION`이다.

- 주민등록번호 기반 확인, 실명/PASS/휴대전화 본인확인
- 공공 identity, 국가 patient identifier, 실제 MPI 연계
- 실제 기관 환자번호 자동 matching 및 법적 본인확인 절차

실환자 identity가 없다는 이유로 Technical MVP를 BLOCKED 처리하지 않는다. 대신 `PRODUCTION READINESS: NOT READY`로 별도 보고한다.

## 4. Consent boundary

Capstone Consent는 환자의 동의를 전제로 접근과 전송을 제한하는 Technical Workflow PoC다. Consent Artifact, AuthorizationDecision, TransferGrant의 분리는 P0에서 구현한다.

다음을 주장하지 않는다.

- 의료법상 완전한 전자동의 시스템 구현 완료
- 실제 환자 동의의 최종 법적 효력 확보
- 모든 의료기관에서 사용 가능한 법정 동의 체계

법정 문구·본인확인·전자서명 증거수준·위임·철회 SLA는 `PRODUCTIONIZATION / LEGAL REVIEW REQUIRED`다.

## 5. Compliance boundary

법·개인정보·임상 요구를 무시하지 않는다. 이들은 Architecture Constraint, Extension Point, Productionization Requirement, Legal Review Item으로 관리한다. 단, 법률검토·인증 미완료 자체를 Synthetic Technical MVP의 구현 blocker로 사용하지 않는다.

다음은 Capstone P0 완료조건이 아니다.

| Track | Productionization item |
|---|---|
| Legal | PIPA·의료법 최종 적법성, 민감정보/전송 근거, 전자동의 효력, 제3자 제공·위탁·국외이전 |
| Clinical | 실제 workflow·clinical safety·의료진 운영 승인·PACS vendor/병원망 연동 |
| Identity | 실환자 본인확인·실제 PatientMapping·MPI·실명인증 |
| Privacy | 실제 처리방침·법정 동의문·보유기간·파기·정보주체 권리절차 |
| Operations | Production SLA/DR/계약/DPA/수탁자/실제 KMS-HSM/24x7 monitoring |

```text
CAPSTONE MVP
  → Technical Validation
  → Security PoC Validation
  → CAPSTONE COMPLETE
  ─────────────────────────
  → PRODUCTIONIZATION
       Legal / Privacy / Clinical
       Real Identity / Hospital Integration
       Production IAM / KMS / Retention / Operations
```

## 6. Requirement classification

모든 신규·변경 요구사항은 정확히 하나의 주분류를 가져야 한다.

| Classification | Meaning |
|---|---|
| `CAPSTONE-P0` | Synthetic/Test 환경의 핵심 E2E와 Security PoC에 필수 |
| `CAPSTONE-P1` | P0 이후 차별화 기능; Mobile Secure Vault 중심 |
| `POST-MVP` | Capstone 완료 후 기술 고도화 |
| `PRODUCTIONIZATION` | 실환자·실병원·법률·임상·운영 전환에 필수 |
| `OUT-OF-SCOPE` | 현재 제품 방향에서 제외 |

Classification은 구현 상태와 다르다. 예를 들어 `CAPSTONE-P0 / NOT IMPLEMENTED`는 현재 로컬에서 구현해야 할 일이며, `PRODUCTIONIZATION / BLOCKED-EXTERNAL`은 Capstone blocker가 아니다.

### Current classification rules

| Requirement range/item | Classification |
|---|---|
| V3-BR-001~005 | CAPSTONE-P0 |
| V3-BR-006 | CAPSTONE-P1 |
| V3-FR-ID/EX/CON/AUTH/GRT/PKG/CLOUD/ROUTE/PRE/ACC/PROV/AUD/TEN/CONN | CAPSTONE-P0 |
| V3-FR-MOB-* | CAPSTONE-P1 |
| V3-FR-ROUTE-004 | CAPSTONE-P1 |
| V3-FR-ACC-010 | POST-MVP |
| V3-NFR-* | CAPSTONE-P0, 단 운영 DR·multi-region은 POST-MVP/PRODUCTIONIZATION |
| V3-SR-MOB-* | CAPSTONE-P1 |
| 실제 IdP/MFA/KMS/HSM/PACS vendor/병원망 검증 | PRODUCTIONIZATION |
| Offline lease, multi-device, enterprise connector, advanced IHE/DR | POST-MVP |
| Blockchain, DID, ZKP, AI routing, custom crypto, full Cloud PACS/EMR | OUT-OF-SCOPE |

## 7. Scope expansion rule

새 제안은 다음을 평가한다.

1. Capstone 핵심 E2E에 필요한가?
2. Synthetic/Test Data로 검증 가능한가?
3. 환자 동의 기반 의료영상 이동에 필요한가?
4. 보안성을 실제 자동·반자동 시험으로 증명할 수 있는가?
5. P0 일정과 기존 E2E 안정성을 해치지 않는가?

대부분 `NO`이면 `POST-MVP`, `PRODUCTIONIZATION`, `OUT-OF-SCOPE` 중 하나로 이동한다. 범위 확대는 ADR, 영향분석, 요구사항·추적성 갱신 전에는 구현하지 않는다.

## 8. Capstone P0 success criteria

| ID | Technical scenario | Expected |
|---|---|---|
| MVP-01 | Hospital A Test Orthanc → DICOMweb → Highpass | PASS |
| MVP-02 | `TEST-A-001 → HP-TEST-0001 → TEST-B-982` | VERIFIED mapping |
| MVP-03 | ExchangeSession 생성·상태전이·만료 | PASS |
| MVP-04 | no Consent DENY, active Consent 후 policy evaluation | PASS |
| MVP-05 | valid scoped Grant ALLOW, invalid/expired/replayed Grant DENY | PASS |
| MVP-06 | authorized CT/MRI Web Viewer | PASS |
| MVP-07 | `study:download` Grant만 DICOM download | PASS |
| MVP-08 | Highpass → STOW-RS → Hospital B Test Orthanc | PASS |
| MVP-09 | Hospital A tenant → unauthorized Hospital B resource | DENY |
| MVP-10 | source→transfer→destination integrity/provenance | PASS |

Success Criteria의 PASS는 구현 후 실행한 시험에만 부여한다. 현재 문서에 기대결과가 있다고 자동 PASS하지 않는다.

## 9. P1 Mobile success criteria

- Secure Medical Capsule, Mobile Secure Vault
- test hardware-backed key 또는 지원 device security boundary
- device binding, biometric/PIN re-authentication
- QR Transfer Request, mobile viewer
- crypto-shredding and deletion receipt

```text
Capsule + original registered device + valid user auth → PASS
Copied capsule + different device → DENY
```

## 10. Readiness separation

향후 보고는 두 축을 섞지 않는다.

```text
CAPSTONE TECHNICAL READINESS
Product Baseline: PASS / PARTIAL / BLOCKED
Requirements & Traceability: PASS / PARTIAL / BLOCKED
Architecture Alignment: PASS / PARTIAL / BLOCKED
P0 Implementation: PASS / PARTIAL / BLOCKED
P0 E2E: PASS / PARTIAL / BLOCKED
Security PoC: PASS / PARTIAL / BLOCKED
CAPSTONE MVP READY: YES / NO
```

```text
PRODUCTION READINESS
Real Patient Data: NOT APPROVED
Legal Review: FUTURE
Privacy Compliance Validation: FUTURE
Clinical Deployment: NOT READY
Production Hospital Integration: FUTURE
Production Readiness: NOT ASSESSED / NOT READY
```

법률검토 미완료로 `PRODUCTION READINESS`는 NOT READY일 수 있지만, 로컬 E2E가 구현·검증되면 `CAPSTONE MVP READY`는 YES가 될 수 있다.

## 11. Document precedence and delivery sequence

충돌 시 다음 우선순위를 적용한다.

1. [HIGHPASS-V3-BASELINE.md](HIGHPASS-V3-BASELINE.md)
2. 본 `CAPSTONE-MVP-BOUNDARY.md`
3. [Highpass v3 Requirements](../requirements/highpass-v3-requirements-definition.md)
4. [Highpass v3 Security Requirements](../security/highpass-v3-security-requirements.md)
5. Architecture/ADR
6. OpenAPI/Data Model
7. Acceptance Tests
8. Existing Code
9. Legacy Documents

구현 전 진행순서:

```text
Baseline
→ Capstone Boundary
→ Requirements v3
→ Security Requirements
→ Traceability Matrix
→ Architecture / ERD / API Alignment
→ Acceptance Criteria
→ P0 Implementation Master Plan
→ Codex Implementation
```

## 12. Codex execution rules

1. 실제 환자 데이터나 의료기관 credential을 요구하지 않는다.
2. 법적 production readiness 미완료만으로 Technical MVP를 BLOCKED 처리하지 않는다.
3. 법률 적합성·병원 승인·인증을 임의로 선언하지 않는다.
4. 법률·실환자·실병원 과제는 `PRODUCTIONIZATION`으로 기록한다.
5. P0 E2E와 P0 Security Validation을 P1/POST-MVP보다 우선한다.
6. 새 기능 때문에 기존 E2E를 불안정하게 하지 않는다.
7. Synthetic/Test/검증된 De-identified Data만 사용한다.
8. 모든 Capstone 기능은 acceptance test로 검증 가능해야 한다.
9. 미실행 시험은 `NOT VERIFIED`, 환경 문제는 `ENVIRONMENT BLOCKED`다.
10. Commit/Push/Merge/PR은 사용자의 명시적 지시가 있을 때만 수행한다.

## 13. Final project priority

```text
PRIORITY 1  CAPSTONE-P0 E2E MVP
PRIORITY 2  P0 Security Validation
PRIORITY 3  Mobile Secure Vault CAPSTONE-P1
PRIORITY 4  Architecture Hardening / POST-MVP
PRIORITY 5  PRODUCTIONIZATION
            Legal / Privacy / Clinical / Real Hospital
```

## 14. Mandatory phase report format

```text
CAPSTONE MVP STATUS: PASS / PARTIAL / BLOCKED
P0 E2E STATUS: PASS / PARTIAL / BLOCKED
SECURITY POC STATUS: PASS / PARTIAL / BLOCKED
MOBILE P1 STATUS: PASS / PARTIAL / NOT STARTED
REAL PATIENT DATA: NOT USED
PRODUCTION LEGAL REVIEW: FUTURE
CLINICAL DEPLOYMENT: NOT IN CURRENT SCOPE
PRODUCTION READINESS: NOT CLAIMED
```

## Final policy

> Highpass v3의 현재 최우선 목표는 실제 의료서비스 상용화가 아니라 Synthetic/Test Data를 이용한 Capstone Technical MVP의 완성이다.

> 개인정보보호법·의료법·실환자 본인확인·실제 병원 Production 연동은 Productionization의 필수 과제로 유지하되, Capstone Technical MVP의 구현을 차단하는 Gate로 사용하지 않는다.

> 현재 성공은 `Hospital A Test PACS → Patient Consent Workflow → Highpass SaaS → Viewer / Hospital B Test PACS` E2E와 핵심 보안 통제가 실제 시험으로 증명되는지로 판정한다.
