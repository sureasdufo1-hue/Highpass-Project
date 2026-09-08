# PHR-W04 환자 PHR API·감사 실행 보고서

상태: `CODE COMPLETE / LOCAL API VERIFIED / OPENAPI NOT YET UPDATED`  
실행일: 2026-09-08  
승인 기준: PHR-JA-001~004 공동승인  
관련 요구사항: PHR-FR-001~003, PHR-FR-006~011, PHR-FR-014~015, PHR-FR-018

## 작업 목적

PHR-W03 Provider를 `/api/v1/me/phr/*`에 연결하고 인증 principal 기반 환자격리, 명시적 응답모델, opaque imaging reference, RFC 7807 계열 오류와 PHR canonical 감사를 구현한다.

## 생성·수정 파일

생성:

- `src/phr-service.js`
- `test/phr-service.test.js`
- `test/phr-api.test.js`

수정:

- `src/server.js`: PHR read API route와 오류 변환
- `src/http-utils.js`: `application/problem+json` 응답 helper
- PHR 승인·계획·시험 문서

DB migration, 기존 API 경로, DICOMweb, 인증서·키는 변경하지 않았다.

## 구현 API

| Method/Path | 상태 |
|---|---|
| `GET /api/v1/me/phr/summary` | 구현 |
| `GET /api/v1/me/phr/encounters` | 구현 |
| `GET /api/v1/me/phr/conditions` | 구현 |
| `GET /api/v1/me/phr/medications` | 구현 |
| `GET /api/v1/me/phr/observations` | 구현 |
| `GET /api/v1/me/phr/diagnostic-reports` | 구현 |
| `GET /api/v1/me/phr/imaging-studies` | 구현 |
| `GET /api/v1/me/phr/imaging-studies/{imagingStudyRef}` | 구현 |
| `POST .../share-intents` | NOT IMPLEMENTED / PHR-W08 |

## 접근통제와 데이터 최소화

- URL/query/body에 patientId를 받지 않고 인증 principal의 patientId만 사용한다.
- Provider가 account subject와 patientRef를 다시 대조한다.
- 응답은 명시적 allowlist 조회모델이며 FHIR 원문 전체를 전달하지 않는다.
- Patient/FHIR resource ID는 HMAC 기반 opaque reference로 바꾼다.
- Imaging 응답은 `imagingStudyRef`, metadata/mapping/access 상태와 표시용 최소정보만 포함한다.
- Study/Series/SOP UID, `urn:dicom:uid`, FHIR endpoint는 PHR 응답에 포함하지 않는다.
- `MAPPED` 상태는 `CONSENT_REQUIRED`이며 영상 접근허용으로 처리하지 않는다.

## 감사

구현한 canonical event:

- `PHR_ACCESS_REQUESTED`
- `PHR_ACCESS_ALLOWED`
- `PHR_ACCESS_DENIED`
- `PHR_PROVIDER_FAILED`
- `PHR_IMAGING_MAPPING_CHECKED`

Viewer/share 관련 3개 이벤트는 해당 기능 단계에서 사용한다. 현재 저장소가 별도 `correlationId` column을 갖지 않으므로 승인된 요청 correlation 값을 `auditSessionId`로 동일 바인딩했다. DB schema 확장 전까지 두 값의 독립 저장은 `PARTIAL`이다.

감사 write가 실패하면 PHR 데이터를 반환하지 않는다. 인증된 비환자 접근도 실제 actor type/id로 거부 감사하며 patientId는 기록하지 않는다. UID는 PHR 감사에 기록하지 않는다.

## 테스트 결과

| 테스트 | 결과 | 근거 |
|---|---|---|
| PHR service/API/W03/W02 targeted suite | PASS | 17/17 |
| `/me` 환자 A summary | PASS | HTTP 200, 합성 A 표시 |
| 타환자 binding | PASS | HTTP 403 + 거부 감사 |
| 인증된 DOCTOR의 PHR 접근 | PASS | HTTP 403 + DOCTOR actor 감사 |
| 미허용 patientId query | PASS | HTTP 422 Problem Details |
| Imaging UID/FHIR ID 비노출 | PASS | 응답·PHR 감사 금지패턴 0건 |
| Mapping 상태 | PASS | MAPPED + CONSENT_REQUIRED |
| 감사 실패 fail-closed | PASS | 응답 생성 중단, 저장 0건 |
| 전체 Node 회귀 | PASS | 112/112 |
| OpenAPI 계약 | NOT UPDATED | 별도 Contract Gate 필요 |
| PostgreSQL PHR 감사 | NOT VERIFIED | 로컬 JSON API 시험만 수행 |
| 실제 IdP | NOT VERIFIED | DEVELOPMENT_MOCK 로컬 시험 |

## 기존 API 영향

기존 `/api/imaging-studies`, consent, transfer, DICOMweb 경로는 변경하지 않았다. 신규 route는 `/api/v1/me/phr/` namespace에 한정된다. PHR 오류만 `application/problem+json`을 사용하며 기존 오류 응답 형식은 이번 변경에서 건드리지 않았다.

## 남아 있는 위험과 다음 작업

1. 신규 API가 기존 Mobile-Core OpenAPI에 아직 반영되지 않았다.
2. PostgreSQL에 독립 `correlation_id`, `imaging_study_ref`, `mapping_ref`가 없어 감사계약은 부분 구현이다.
3. Synthetic Provider 운영모드 비활성 Gate와 PHR 전용 secret 배포계약이 필요하다.
4. 실제 Orthanc QIDO로 PHR seed Study 존재를 아직 검증하지 않았다.
5. Viewer launch/share는 구현하지 않았다.

다음 우선순위는 API OpenAPI/계약 Gate 보강 후 PHR-W05 최소 환자 화면 또는 PHR-W06 Imaging mapping live validator다. 의료영상 수직경로 우선 원칙상 PHR-W06을 먼저 수행하는 것을 권고한다.
