# Health Data Provider 및 PHR API 계약 초안

상태: `PROPOSED / NOT IMPLEMENTED`  
소유: 의료정보 의미·검증 계약 김범희, Cloud 실행코드 이재석

API envelope, pagination 및 오류 형식의 구체적 권고는 [PHR 공동합의 권고안](JOINT-AGREEMENT-RECOMMENDATIONS.md)의 PHR-JA-001을 따른다. 공동승인 전에는 제안 상태다.

## Provider 논리 계약

```text
HealthDataProvider
  getCapabilities(context)
  getPatientRecord(context, query)
  listEncounters(context, page)
  listConditions(context, page)
  listMedications(context, page)
  listObservations(context, page)
  listDiagnosticReports(context, page)
  listImagingStudies(context, page)
```

`context`는 서버 인증계층이 만든 `principalSubject`, `patientRef`, `providerId`, `correlationId`, `requestedAt`을 포함한다. 클라이언트가 보낸 patient ID로 이를 덮어쓸 수 없다. 각 호출은 bounded page를 반환하며 `items`, opaque `nextCursor`, `source`, `fhirVersion`, `retrievedAt`, `dataStatus`를 포함한다.

## Capabilities

```json
{
  "providerId": "synthetic-r4",
  "status": "AVAILABLE",
  "fhirVersion": "4.0.1",
  "synthetic": true,
  "resources": ["Patient", "Encounter", "Condition", "MedicationRequest", "Observation", "DiagnosticReport", "ImagingStudy"],
  "maxPageSize": 50,
  "externalNetworkRequired": false
}
```

MyHealthWay adapter는 공식 명세·자격·승인 전 `status: NOT_CONFIGURED`, 빈 capabilities, `externalNetworkRequired: true`를 반환하고 어떠한 endpoint도 호출하지 않는다. Highpass 로그인 credential을 국가 플랫폼 credential로 재사용하지 않는다.

## Provider 오류

| 코드 | 의미 | HTTP 후보 |
|---|---|---:|
| `PHR_AUTHENTICATION_REQUIRED` | 환자 인증 없음 | 401 |
| `PHR_PATIENT_BINDING_MISMATCH` | principal-patient 불일치 | 403 |
| `PHR_PROVIDER_NOT_CONFIGURED` | 후속 Provider 비활성 | 503 |
| `PHR_RESOURCE_UNSUPPORTED` | 리소스/프로파일 미지원 | 422 |
| `PHR_REFERENCE_BLOCKED` | 외부/허용 밖 reference | 422 |
| `PHR_PAYLOAD_LIMIT_EXCEEDED` | 크기/entry/depth 초과 | 413 |
| `PHR_MAPPING_CONFLICT` | 식별자·UID 충돌 | 409 |
| `PHR_SOURCE_UNAVAILABLE` | 합성 source/adapter 장애 | 503 |

응답 detail은 내부 URL, raw resource, 직접식별자, token, stack을 포함하지 않는다. 모든 결과는 `correlationId`와 내부 감사 세션에 연결한다.

## PHR API 제안

기존 `/api/imaging-studies?patientId=...`를 파괴적으로 변경하지 않고 아래 versioned 확장을 우선 제안한다. 승인 전 OpenAPI에 반영하지 않는다.

| Method/Path | 기능 | 서버 권한 | 감사 이벤트 후보 |
|---|---|---|---|
| `GET /api/v1/me/phr/summary` | 내 PHR 요약 | PATIENT + binding | `PHR_SUMMARY_VIEWED` |
| `GET /api/v1/me/phr/encounters` | 진료이력 | PATIENT + binding | `PHR_ENCOUNTERS_VIEWED` |
| `GET /api/v1/me/phr/conditions` | 진단 | PATIENT + binding | `PHR_CONDITIONS_VIEWED` |
| `GET /api/v1/me/phr/medications` | 처방 | PATIENT + binding | `PHR_MEDICATIONS_VIEWED` |
| `GET /api/v1/me/phr/observations` | 검사 | PATIENT + binding | `PHR_OBSERVATIONS_VIEWED` |
| `GET /api/v1/me/phr/diagnostic-reports` | 보고서 | PATIENT + binding | `PHR_REPORTS_VIEWED` |
| `GET /api/v1/me/phr/imaging-studies` | 영상검사 목록 | PATIENT + binding | `PHR_IMAGING_VIEWED` |
| `GET /api/v1/me/phr/imaging-studies/{imagingStudyRef}` | 영상 상세/매핑상태 | PATIENT + resource binding | `PHR_IMAGING_DETAIL_VIEWED` |
| `POST /api/v1/me/phr/imaging-studies/{imagingStudyRef}/share-intents` | 기존 공유요청 입력으로 안전한 변환 | PATIENT + mapping + 기존 consent flow | `PHR_SHARE_INTENT_CREATED` |

목록 query는 `cursor`, `limit`(기본 20, 최대 50), 허용된 date/status filter만 받는다. 임의 `_include`, `_revinclude`, FHIR search expression 또는 endpoint URL은 받지 않는다.

## Imaging 접근 상태

`metadataStatus`: `AVAILABLE | NOT_AVAILABLE | UNSUPPORTED`  
`mappingStatus`: `MAPPED | NOT_MAPPED | CONFLICT | SOURCE_UNAVAILABLE`  
`accessStatus`: `ELIGIBLE_FOR_AUTHORIZATION | CONSENT_REQUIRED | ACCESS_DENIED | SOURCE_UNAVAILABLE`

`MAPPED`는 접근 허용을 의미하지 않는다. Viewer URL/token은 목록 응답에 넣지 않으며 기존 `/api/dicom-access/request` 정책 통과 후 단기 token을 발급한다. 공유 의도는 Study/Series 범위를 좁힐 수만 있고 확대할 수 없다.

## 기존 계약 영향

| 항목 | 변경 전 | 제안 후 | 영향 화면/시험 |
|---|---|---|---|
| 환자 영상목록 | `/api/imaging-studies?patientId=` | 기존 유지 + `/api/v1/me/phr/imaging-studies` 추가 | PHR 화면, 기존 회귀 PHR-T11 |
| 공유 | 기존 consent/transfer request | `share-intents`가 기존 입력으로 변환 | 공유 확인, PHR-T08~T10 |
| DICOMweb | 기존 Gateway 경로 | 변경 없음 | OHIF, PHR-T04~T07 |
| DB | 기존 imaging/patient/consent | Phase 1에서는 변경 없음 | migration NOT RUN |

API 확정 전에 이재석·김범희가 [PHR-JA-001~004 권고](JOINT-AGREEMENT-RECOMMENDATIONS.md)를 검토하고 함께 승인해야 한다.
