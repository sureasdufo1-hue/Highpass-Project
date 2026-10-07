# MediQ 판독문·의뢰서 묶음 기능 명세

**Feature:** 8 — Radiology Report & Referral Bundle  
**Classification:** `POST-MVP`  
**Version:** v1.0  
**Status:** Approved Future Design — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-RR-001`

## 1. 결정 요약

판독문과 진료의뢰서는 의료영상과 관련될 수 있으나 DICOM Payload에 임의 삽입하지 않는다. 각 문서는 발행기관·작성자 역할·작성/정정 시각·원본 형식·Hash·버전·Study 연결 근거를 가진 별도 `ClinicalDocumentArtifact`로 관리한다. Bundle은 Manifest로 자원을 연결할 뿐 각 자원의 권한과 무결성을 합치지 않는다.

## 2. 목표와 비범위

- 목표: 환자와 승인된 병원이 영상·판독문·의뢰서의 관계와 출처를 함께 확인.
- 비범위: P1 구현, 실제 EMR 연동, 건강정보 고속도로 자격 주장, 문서 내용 AI 요약/번역/진단, 비정형 파일 무제한 업로드, 전자서명 법적 효력 단정.

## 3. 문서·Bundle 모델

| 자원 | 필수 속성 |
|---|---|
| `ClinicalDocumentArtifact` | type, source organization, author role, authoredAt, version, status, mediaType, hash, provenance |
| `DocumentStudyLink` | documentRef, studyRef, relationType, source assertion, verification status |
| `ClinicalBundleManifest` | manifestRef, patientRef, item refs, scopes, createdAt, expiresAt, manifest hash |

허용 초기 문서 유형은 `RADIOLOGY_REPORT`, `REFERRAL_LETTER`뿐이다. `PRELIMINARY`, `FINAL`, `CORRECTED`, `RETRACTED` 상태를 구분하며 정정본이 이전 문서를 덮어쓰지 않는다.

## 4. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-RR-001` | 영상 관련 문서 목록 | 종류, 발행기관, 날짜, 상태 |
| `MOB-PXE-RR-002` | 원본 문서 Viewer | 원문, 출처, Version, 무결성 상태 |
| `MOB-PXE-RR-003` | Bundle 검토 | 포함 영상·문서, 목적지, 허용 행위 |
| `MOB-PXE-RR-004` | 승인·전달 | 자원별 Scope, 만료, Consent |
| `MOB-PXE-RR-005` | 정정·철회 안내 | 최신본 연결, 기존 접근 이력 |

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-RR-001` | 각 문서는 영상과 독립된 식별자, 버전, 상태, 출처, Hash를 가져야 한다. |
| `REQ-PXE-RR-002` | Study 연결은 발행 Source의 검증 가능한 식별 관계를 사용하고 추측으로 연결하지 않아야 한다. |
| `REQ-PXE-RR-003` | 정정·철회는 이전 Version을 보존하고 최신 상태와 관계를 표시해야 한다. |
| `REQ-PXE-RR-004` | Bundle 검토 화면은 포함 항목과 자원별 허용 행위를 명시해야 한다. |
| `REQ-PXE-RR-005` | 영상 권한이 문서 권한을 자동 부여하거나 그 반대로 승격하지 않아야 한다. |
| `REQ-PXE-RR-006` | 지원하지 않는 형식 또는 무결성 실패 문서는 열람·전달을 차단해야 한다. |
| `REQ-PXE-RR-007` | 문서 원문을 앱이 자동 요약·재작성·진단 해석하지 않아야 한다. |
| `REQ-PXE-RR-008` | 실제 외부 연동이 없는 Demo에는 `합성 데이터·연동 예정`을 지속 표시해야 한다. |

## 6. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-RR-001` | 문서 접근은 Tenant, Patient, Document, Action Scope의 별도 Consent/Authorization/Grant를 검증해야 한다. |
| `SEC-PXE-RR-002` | 문서는 Content Type Allowlist, 크기 제한, Malware Scan, Active Content 제거를 거쳐야 한다. |
| `SEC-PXE-RR-003` | Bundle Manifest와 각 Artifact Hash를 모두 검증해야 한다. |
| `SEC-PXE-RR-004` | 원본 임상 문서를 로그·Notification·URL Query에 포함하지 않아야 한다. |
| `SEC-PXE-RR-005` | Download/Share는 명시 Scope와 만료, 재인증, Audit를 요구해야 한다. |

## 7. 상호운용·API GAP

FHIR `DiagnosticReport`/`DocumentReference`, CDA 또는 병원별 원본 문서 중 어떤 Profile을 채택할지는 별도 ADR과 실제 연동성 검증이 필요하다. 현재는 합성 JSON Metadata와 비활성 안전 PDF Fixture만 허용하는 Prototype을 고려할 수 있다.

필요 API는 `ListStudyDocuments`, `GetClinicalDocument`, `CreateClinicalBundle`, `AuthorizeClinicalBundle`, `DownloadClinicalBundle`이며 현재 `OPENAPI.yaml`에 없다. Domain/Data/ERD 및 보존정책 변경이 선행되어야 한다.

## 8. Provenance·Audit·접근성

Provenance는 원 발행기관 → 수집 Adapter → Artifact Hash/Version → Bundle → 목적지 접근을 연결한다. 조회·다운로드·전달·정정 확인·무결성 실패를 감사한다. PDF만 제공할 때도 접근 가능한 텍스트 원문 또는 승인된 대체 표현이 필요하며, Scanned Image-only 문서는 접근성 미충족 상태를 표시한다.

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| 다른 Study에 문서 오연결 | 검증된 Link, Conflict 상태 |
| 악성 PDF/Active Content | Allowlist, Scan, Sandboxed Viewer |
| 정정 전 문서를 최신으로 오인 | Version Graph, 최신 상태 배지 |
| 영상 Grant로 문서 자동 접근 | 자원·행위별 Scope 분리 |
| Demo를 실제 연동으로 오인 | 합성 데이터·연동 예정 상시 표시 |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-RR-001` | 합성 영상·Final 판독문 연결 | 출처·Version·Hash와 함께 표시 |
| `TC-PXE-RR-002` | Study 연결 충돌 | 자동 연결 금지, 확인 필요 |
| `TC-PXE-RR-003` | 문서 Hash 변조 | Viewer/Bundle 차단 |
| `TC-PXE-RR-004` | Corrected 문서 수신 | 이전본 보존, 최신본 명확 표시 |
| `TC-PXE-RR-005` | 영상만 허용된 Grant | 문서 접근 거부 |
| `TC-PXE-RR-006` | Active Content 문서 | 격리 또는 거부 |
| `TC-PXE-RR-007` | 실제 연동 없는 Demo | 합성·예정 표시 유지 |

모든 Test는 `NOT RUN`이다.

## 11. 구현 계획과 완료 경계

Scope Decision과 임상 문서 Profile ADR 후 `MEDIQ-PXE-RR-001` Domain/API, `RR-002` Ingestion/Integrity, `RR-003` Viewer/Bundle UX, `RR-004` Security/Interoperability Test로 진행한다. 이 기능은 POST-MVP이며 현재 Capstone P1 구현 Backlog에 포함하지 않는다.
