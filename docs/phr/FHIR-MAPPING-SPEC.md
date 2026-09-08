# FHIR R4 최소 매핑 명세

상태: `PROPOSED`  
표준: HL7 FHIR R4 4.0.1 내부 교환 기준. MyHealthWay 공식 적합성 주장 없음.

## 공통 envelope

모든 정규화 결과는 `patientRef`, `sourceOrganizationRef`, `sourceProvider`, `fhirVersion`, `sourceResourceType`, `sourceResourceId`, `sourceLastUpdated`, `retrievedAt`, `dataStatus`, `synthetic`, `correlationId`를 가진다. `UNKNOWN`, `NOT_PROVIDED`, `NOT_AVAILABLE`, `UNSUPPORTED`, `NOT_MAPPED`, `ACCESS_DENIED`만 계약 상태로 사용하며 누락 임상값을 생성하지 않는다.

`sourceResource` 전체 원문을 기본 API 응답에 포함하지 않는다. 원본 identifier/code/unit의 손실 없는 추적을 위해 허용된 최소 필드를 별도로 보존한다.

## 식별자 분리

| 구분 | 예시 논리 필드 | 용도/금지 |
|---|---|---|
| 로그인 계정 | `accountSubject` | 인증용. Provider query key로 직접 노출 금지 |
| 내부 환자참조 | `patientRef` | 서버가 principal에서 결정하는 PHR scope |
| FHIR 논리 ID | `Patient.id` | Provider 내부 resource reference 해석 |
| FHIR business identifier | `Patient.identifier[system,value]` | source별 namespace와 함께 보존 |
| 기관 환자번호 | 기관별 identifier | 기관 경계 밖 자동 병합 금지 |
| DICOM PatientID | DICOM `(0010,0020)` | PACS 검증 신호 중 하나일 뿐 단독 identity proof 금지 |

이름, 생년월일, 전화번호 또는 동일 문자열만으로 식별자를 합치지 않는다. fixture mapping registry는 `accountSubject -> patientRef -> provider/source Patient.id`를 명시한다.

## 리소스 매핑

| Resource | 정규화 최소 필드 | 검증/보존 규칙 |
|---|---|---|
| Patient | source id/identifier, displayName, active | principal에서 바인딩된 Patient만; 실명 fixture 금지 |
| Encounter | id, status, class, period, serviceProvider, reason/diagnosis refs | subject가 동일 Patient인지, 기관·기간 보존 |
| Condition | id, clinicalStatus, verificationStatus, code, onset/recordedDate | code.system/code/display를 그대로 보존; 부정·상태 추정 금지 |
| MedicationRequest | id, status, intent, medication[x], authoredOn, dosageInstruction 제공값 | 용량·횟수·기간의 누락값 생성 금지 |
| Observation | id, status, category, code, effective[x], value[x], unit, referenceRange | UCUM 여부를 표시하되 단위를 임의 변환하지 않음 |
| DiagnosticReport | id, status, category, code, effective[x], issued, result refs, conclusion | 연결 Observation의 환자 일치; attachment URL 자동추적 금지 |
| ImagingStudy | id, status, subject, started, modality, numberOfSeries/Instances, identifier, series UID | DICOM UID와 내부 mapping은 별도 Gate 통과 필요 |
| Organization | id, identifier, name | 제한된 source/serviceProvider 참조만 |
| DocumentReference | id, status, type, date, custodian, content metadata | P0 읽기 전용 메타정보; attachment fetch 금지 |

## Reference 해석

- P0 허용: 동일 검증 Bundle 안의 상대참조 및 사전 등록된 fixture resource reference.
- 거부/미지원: contained 순환, 절대 외부 URL, history endpoint, 임의 Binary/attachment fetch, 허용목록 밖 resource type.
- 최대 reference depth와 Bundle entry 수는 구현 전에 계약 상수로 고정한다. 제안값은 depth 3, entry 200이며 PM/기술 검토 승인이 필요하다.
- FHIR `text.div`, extension 문자열, attachment 내용은 명령이나 URL로 실행하지 않는다.

## ImagingStudy UID 추출

R4에서는 `ImagingStudy.identifier` 중 `system == "urn:dicom:uid"`인 값을 후보로 한다. `value`는 `urn:oid:<numeric UID>` 형식이어야 하며 내부에서는 `urn:oid:`를 제거한 숫자 UID와 원문을 모두 구분해 보존한다. `ImagingStudy.id`, Series UID, SOP Instance UID를 Study UID 대신 사용하지 않는다.

## 정규화 실패

환자 subject 불일치, 중복 충돌 identifier, 잘못된 UID, 허용되지 않은 외부참조, 과대 Bundle, 지원하지 않는 critical modifier는 해당 항목을 `UNSUPPORTED`/`NOT_MAPPED`로 격리하거나 전체 요청을 거부한다. 다른 환자의 예시 데이터로 대체하지 않는다. 임상값의 모호성은 원문 필드와 상태를 유지하고 UI에 추정 결과를 표시하지 않는다.
