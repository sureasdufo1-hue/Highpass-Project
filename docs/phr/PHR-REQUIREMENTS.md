# Highpass PHR MVP 요구사항

상태: `PROPOSED / APPROVAL REQUIRED`  
범위: 2026-10-21 목표의 합성 FHIR PHR 최소 수직경로

## 상태와 우선순위

- `P0`: 10월 21일 수용시험에 필수
- `P1`: P0 안정화 후 조건부
- `DEFERRED`: 공식 명세·승인·외부환경이 필요한 후속 범위
- 기존 P0는 이 문서로 삭제하거나 완료 처리하지 않는다.

## 신규 기능 요구사항

| ID | 요구사항 | 우선순위 | 수용기준 | 기존 추적성 |
|---|---|---:|---|---|
| PHR-FR-001 | 인증된 `PATIENT` principal을 내부 patient reference에 서버가 바인딩해야 한다. 요청의 patient 식별자만 신뢰하지 않는다. | P0 | 타 환자 조회가 403과 감사로 종료 | FR-010~020, VR-AUTH-003 |
| PHR-FR-002 | 환자는 자신의 합성 진료·진단·처방·검사·영상검사만 조회한다. | P0 | 환자 A/B fixture 혼합 0건 | FR-006~009 확장 |
| PHR-FR-003 | 응답은 출처, FHIR 버전, 자료시점, 조회시점, 자료상태 및 합성자료 표시를 포함한다. | P0 | 모든 PHR 응답 계약검사 통과 | FR-006~009 확장 |
| PHR-FR-004 | Provider는 capabilities와 환자별 Patient/Encounter/Condition/MedicationRequest/Observation/DiagnosticReport/ImagingStudy 조회를 제공한다. | P0 | 고정 seed에서 결정적 결과 | 신규 |
| PHR-FR-005 | Synthetic Provider는 외부 인터넷 없이 동작하며 MyHealthWay Provider는 미설정 시 외부호출 없이 `NOT_CONFIGURED`를 반환한다. | P0 | network spy 호출 0건 | 신규, VR-ERROR-002 |
| PHR-FR-006 | FHIR R4 4.0.1 원본 resource ID, identifier, code, unit, status, source를 보존하고 제공되지 않은 임상값을 추정하지 않는다. | P0 | fixture와 정규화 결과의 보존 비교 | FR-006~009 확장 |
| PHR-FR-007 | 지원하지 않는 resource/profile/field/reference는 명시적 상태로 반환하거나 안전하게 거부한다. | P0 | 무시·추정·외부참조 추적 0건 | VR-ERROR-001~002 |
| PHR-FR-008 | 계정 ID, 내부 patient reference, FHIR Patient.id/identifier, 기관 환자번호, DICOM PatientID를 서로 다른 식별자로 관리한다. | P0 | 이름·생년월일 기반 자동병합 0건 | FR-042~046, VR-POLICY-001 |
| PHR-FR-009 | ImagingStudy의 DICOM Study UID를 승인된 내부 기관/PACS 매핑으로 해석하고 UID 형식·종류·존재·환자·기관 일치를 검증한다. | P0 | 정상 매핑 1+, 불일치 전부 차단 | FR-006~009, VR-DICOM-001 |
| PHR-FR-010 | FHIR Endpoint 또는 외부 reference URL을 브라우저에 노출하거나 자동 호출하지 않는다. | P0 | SSRF성 URL fixture에서 outbound 0건 | VR-DICOM-004~005, VR-ERROR-002 |
| PHR-FR-011 | ImagingStudy 메타데이터 존재와 DICOM 접근권한을 분리한다. 미매핑이면 정보만 표시하고 Viewer/공유를 비활성 상태로 둔다. | P0 | UID만으로 ALLOW 0건 | FR-014~036 |
| PHR-FR-012 | 영상 보기는 기존 동의·RBAC/ABAC·단기 token·Gateway를 재사용하여 승인 Study/Series/Instance/Frame만 조회한다. | P0 | PHR-T06 음성범위 포함 PASS | FR-014~036, VR-TOKEN-003 |
| PHR-FR-013 | PHR 공유는 기존 동의·수신기관·목적·기간·행위 범위를 사용하고 VIEW/DOWNLOAD/PACS_IMPORT를 분리한다. | P0 | VIEW 권한으로 저장 0건 | FR-001~031, VR-POLICY-002 |
| PHR-FR-014 | 조회·매핑·Viewer 연결·공유·거부·철회·오류에 correlation/auditSession을 연결해 감사한다. | P0 | 필수 이벤트와 reasonCode 존재 | FR-037~041, VR-AUDIT-001~002 |
| PHR-FR-015 | 로그·오류·QR에 원문 의료정보, bearer token, 평문키, 무승인 직접식별자를 기록하지 않는다. | P0 | 금지패턴 검사 0건 | VR-ERROR-002, PF-R10 |
| PHR-FR-016 | 임상 PHR 경로는 Privacy Filter 장애와 독립적이며 비진료 반출은 `CLINICAL` 목적을 이용해 PF를 우회할 수 없다. | P0 | PHR-T12 PASS | FR-042~046, PF-R03/PF-R05 |
| PHR-FR-017 | 합성 환자 2명 이상과 각각 다른 FHIR 및 실제 합성 DICOM 연결 Study를 제공한다. | P0 | A/B isolation 및 PACS 존재검사 | 신규 |
| PHR-FR-018 | API는 bounded pagination/size/reference depth를 적용하고 실패 시 fail closed 한다. | P0 | 경계값·과대 payload 거부 | VNFR-SEC-001, VR-ERROR-002 |

## 비기능 요구사항

| ID | 요구사항 | 수용기준 |
|---|---|---|
| PHR-NFR-001 | FHIR 내부 교환 기준은 R4 4.0.1이며 공식 국내 프로파일 적합성을 주장하지 않는다. | 버전 metadata 및 고지 |
| PHR-NFR-002 | Synthetic Provider는 고정 fixture version/seed와 checksum을 가져야 한다. | 동일 revision 재실행 결과 동일 |
| PHR-NFR-003 | 지원 리소스·결과수·payload·reference depth는 설정된 상한을 가진다. | 무제한 조회 0건 |
| PHR-NFR-004 | 모든 P0는 정상·음성 test ID, 코드 SHA, 환경, 명령, 실제결과, 증적 경로를 가진다. | 추적성 누락 0건 |
| PHR-NFR-005 | 원본 DICOM Pixel Data는 A Orthanc/PACS에 유지하고 Control Plane에 지속 저장하지 않는다. | 저장소·network 검토 |
| PHR-NFR-006 | 기존 v2.1 임상조회 및 승인된 Mobile-Core/Privacy 최소경로의 회귀를 막는다. | PHR-T11/T12 및 기존 suite |

## 조건부·후속 범위

FHIR/PDF/DICOM import, 공공 API, 전체 FHIR 서버, 고급 검색, 실제 MyHealthWay, 실제 PHI, 실제 PACS/IdP/KMS/HSM, 전체 DICOM 비식별·OCR·defacing은 이 기준선의 완료조건이 아니다.

## 미결정 및 승인

아래 항목의 구체적 추천 결정은 [PHR 공동합의 권고안](JOINT-AGREEMENT-RECOMMENDATIONS.md)에 기록했다. PHR-JA-001~004는 공동승인 완료, PHR-JA-005는 PM 포함 승인 대기 상태다.

- `ADR-PHR-001`: PHR 계약을 v2.1 기준선의 증분 P0로 승인할지
- `ADR-PHR-002`: `/api/me/phr/*` 경로와 응답 envelope/versioning
- `ADR-PHR-003`: 정규화 조회모델의 영속 저장 여부. P0 권고는 fixture read-through이며 새 DB migration 없음
- `ADR-PHR-004`: Mobile-Core P0 중 이번 일정에 유지할 단일 수직경로
- `ADR-PHR-005`: 합성 fixture의 라이선스/출처. P0 권고는 자체 제작 최소 fixture
