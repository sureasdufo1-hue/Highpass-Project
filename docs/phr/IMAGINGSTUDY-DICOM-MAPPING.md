# ImagingStudy–DICOM 매핑 계약

상태: `PROPOSED / NOT IMPLEMENTED`  
소유: 김범희(계약·A Edge/PACS 검증), 이재석(Cloud 조회상태 표현)

## 경계

FHIR ImagingStudy는 의료영상 메타데이터다. UID 존재, `endpoint` 존재 또는 `numberOfInstances > 0`은 영상 접근권한이 아니다. 원본 Pixel Data는 A PACS/Orthanc에 남고 Control Plane은 장기 원본 저장소가 되지 않는다.

## 매핑 레코드 최소 계약

```text
mappingRef                 opaque internal reference
providerId                 synthetic-r4
sourceOrganizationRef      registered organization reference
patientRef                 internal synthetic patient reference
fhirImagingStudyId         FHIR logical id
fhirStudyUidOriginal       urn:oid:<UID>
studyInstanceUid           normalized numeric DICOM UID
allowedSeriesUids          optional allowlist
gatewayRef                 registered A Edge/Gateway reference
mappingStatus              MAPPED/NOT_MAPPED/CONFLICT/SOURCE_UNAVAILABLE
fixtureVersion             immutable synthetic dataset version
verifiedAt                 verification time
```

외부 endpoint URL, PACS credential, token, DICOM PatientName은 레코드에 넣지 않는다. `gatewayRef`는 서버 등록부에서 승인 endpoint로 해석한다.

## 검증 순서

1. 인증 principal에서 `patientRef`를 결정한다.
2. Provider 결과의 Patient subject와 source organization을 fixture registry에 대조한다.
3. `ImagingStudy.identifier`의 `urn:dicom:uid` 후보가 정확히 하나인지 확인한다.
4. `urn:oid:` 원문과 숫자 UID를 분리하고 DICOM UID 문법/길이를 검증한다.
5. Study/Series/SOP UID 역할을 혼용하지 않았는지 확인한다.
6. `(providerId, sourceOrganizationRef, patientRef, fhirImagingStudyId)`와 Study UID 중복·충돌을 확인한다.
7. 등록된 `gatewayRef`를 통해 A PACS에 Study가 존재하는지 QIDO로 확인한다. FHIR endpoint는 호출하지 않는다.
8. PACS의 합성 patient binding과 source hospital이 registry와 일치하는지 확인한다.
9. Series/Instance 및 SOP Class/Transfer Syntax가 P0 지원범위인지 확인한다.
10. 결과를 상태로 반환한다. 이후 Viewer 접근은 별도 동의·ABAC·token Gate를 다시 통과한다.

## 실패 처리

| 조건 | 상태/결과 | 접근 |
|---|---|---|
| UID 없음 | `NOT_MAPPED` | 정보만 표시 |
| UID 문법 오류/종류 혼용 | `CONFLICT` | 조회·공유 거부 및 감사 |
| 다른 patient/source에 동일 UID | `CONFLICT` | 전체 매핑 보류, 관리자 검토 |
| PACS Study 없음/장애 | `NOT_MAPPED` 또는 `SOURCE_UNAVAILABLE` | 정보만 표시, retry 가능성 구분 |
| 외부 endpoint 변경 | `PHR_REFERENCE_BLOCKED` | outbound 0건 |
| 지원하지 않는 SOP/Transfer Syntax | `UNSUPPORTED` | Viewer 비활성, 원본 변경 없음 |
| consent/scope 불일치 | 기존 reasonCode | Gateway가 fail closed |

## 원본 불변성과 감사

매핑 검증은 QIDO 메타데이터 읽기만 수행하며 STOW/C-STORE, tag 수정, UID 재생성을 하지 않는다. 검증 시작·성공·실패에 `providerId`, opaque patient reference, mappingRef, 필요한 최소 UID/hash, source hospital, reasonCode, correlation/audit session을 남긴다. token, endpoint credential, 원문 임상보고서는 기록하지 않는다.

## 합성 fixture 규칙

- 환자 A/B는 서로 다른 account subject, patientRef, FHIR Patient.id/identifier, DICOM PatientID, Study/Series/SOP UID를 사용한다.
- 최소 한 ImagingStudy씩 실제 Compose의 A Orthanc seed Study와 연결한다.
- 정상, UID 없음, 타환자 UID, source 불일치, 악성 endpoint, 지원불가 SOP의 음성 fixture를 별도 파일로 둔다.
- UID는 fixture 생성 시 결정적으로 생성하고 README에 fixture version/checksum을 기록한다.
