# PHR 공동합의 권고안

상태: `PHR-JA-001~004 JOINTLY APPROVED / PHR-JA-005 PENDING`  
권고 기준일: 2026-09-08  
합의 당사자: 이재석(Cloud/Mobile), 김범희(FHIR 의미·Edge/PACS·통합시험)  
승인 권한: 두 담당자 공동 기술승인, 범위·일정 변경은 PM 추가 승인

## 1. 목적과 적용 방식

이 문서는 Phase 0~1에서 남은 공동합의 항목에 대한 권고 기준이다. 서명 또는 승인기록 전에는 기존 v2.1/v3 계약을 자동 변경하지 않는다. 승인 후에는 PHR-W02 이후 구현의 Contract Gate로 사용한다.

권고 우선순위는 환자 격리와 접근통제, 기존 DICOMweb 경로 보존, 2026-10-21 내 재현 가능한 수직경로, 구현 복잡도 순이다.

## 2. 권고 결정 요약

| 결정 ID | 항목 | 권고안 | 승인 수준 |
|---|---|---|---|
| PHR-JA-001 | API envelope·pagination·오류 | `/api/v1/me/phr/*`, 공통 envelope, opaque cursor, RFC 7807 계열 오류 | **공동승인 완료** |
| PHR-JA-002 | 합성 fixture·의료일관성 | 자체 제작 최소 R4 fixture v1, A/B 2명, immutable manifest, 이중 검토 | **공동승인 완료** |
| PHR-JA-003 | UID 노출·mapping 상태 | PHR에는 opaque ref만, UID는 승인된 Viewer/Gateway 세션에서만 최소 사용 | **공동승인 완료** |
| PHR-JA-004 | 감사 이벤트 | 8개 PHR canonical event와 공통 최소필드, PHI/token/key 금지 | **공동승인 완료** |
| PHR-JA-005 | 단일 공유 수직경로 | 일회성 QR Ticket 기반 원격 DICOMweb VIEW를 P0; 모바일 DICOM package/PACS_IMPORT는 후속 | 공동+PM 범위승인 |

## 3. PHR-JA-001 — API envelope, pagination, 오류

### 권고

API 경로는 `/api/v1/me/phr/*`로 고정한다. `me`가 서버가 인증 principal에서 환자 범위를 결정한다는 점을 계약에 드러내므로 path/body/query의 `patientId`를 받지 않는다. 기존 `/api/imaging-studies?patientId=`는 PHR 구현 중 변경하지 않고 회귀 대상으로 유지한다.

성공 응답은 다음 envelope를 사용한다.

```json
{
  "data": [],
  "meta": {
    "sourceProvider": "synthetic-r4",
    "fhirVersion": "4.0.1",
    "synthetic": true,
    "retrievedAt": "2026-09-08T00:00:00Z",
    "dataStatus": "AVAILABLE",
    "correlationId": "opaque-correlation-ref",
    "page": {
      "limit": 20,
      "nextCursor": null
    }
  }
}
```

- 단건도 `data`에 object를 사용하고 동일 `meta`를 유지한다.
- 목록 기본 `limit=20`, 최대 `50`; cursor는 서버 서명 또는 서버 상태에 바인딩된 opaque 값이며 환자/provider/filter/정렬조건을 포함해 검증한다.
- 기본 정렬은 임상시점 내림차순, 동률은 opaque resource reference 오름차순으로 결정적이어야 한다.
- 허용 query는 `cursor`, `limit`, `from`, `to`, 계약 enum `status`뿐이다. 임의 FHIR search, `_include`, `_revinclude`, endpoint URL은 금지한다.
- 날짜는 ISO 8601이며 `from <= to`; 최대 조회기간은 합성 MVP에서 5년으로 제한한다.

오류는 기존 OpenAPI의 `application/problem+json` 구조를 확장한다. `type`, `title`, `status`, `code`, `requestId`, `traceId`, `auditSessionId`, `retryable`을 유지하고 안전한 `detail`만 선택적으로 제공한다. PHR 오류코드는 Provider 계약의 `PHR_*` enum을 사용한다. 인증·바인딩·정책 오류는 `retryable=false`, 일시 source 장애만 `true`다.

### 근거와 수용기준

새 경로는 기존 API를 파괴하지 않고 patientId 신뢰 위험을 제거한다. 하나의 envelope는 Web/Mobile의 분기와 계약시험을 줄인다. PHR-T01~03, T13 및 cursor 변조·타환자 cursor 재사용·limit 경계시험을 통과해야 한다.

## 4. PHR-JA-002 — 합성 fixture와 의료일관성

### 권고

P0는 Synthea 대규모 Bundle을 바로 도입하지 않고 프로젝트 자체의 작고 검토 가능한 한국어 합성 R4 fixture `phr-r4-v1`을 사용한다. Synthea는 P1 대량·다양성 시험 후보로 둔다.

최소 구성은 다음과 같다.

| 환자 | 리소스 | 영상 연결 |
|---|---|---|
| Synthetic A | Patient, Encounter, Condition, MedicationRequest, Observation, DiagnosticReport, ImagingStudy | A Orthanc의 합성 CT Study 1개 |
| Synthetic B | Patient, Encounter, Observation, DiagnosticReport, ImagingStudy | A Orthanc의 별도 합성 X-ray 또는 MR Study 1개 |

- 실제 사람을 연상시키지 않는 표시명과 결정적 UUID/OID를 사용한다.
- `accountSubject`, `patientRef`, FHIR id/identifier, 기관 환자번호, DICOM PatientID, 모든 Study/Series/SOP UID는 A/B 간 교집합이 없어야 한다.
- Observation 값·단위·reference range, Condition 상태, MedicationRequest 용법은 서로 모순되지 않는 단순 시나리오만 사용한다. 임상적 사실을 추정해 풍부하게 만들지 않는다.
- `manifest.json`에 fixture version, seed, 생성·검토자 역할, FHIR version, 파일 SHA-256, 연결 Orthanc seed checksum, 합성 고지, 라이선스(`project-generated synthetic`)를 기록한다.
- 김범희가 의미·UID·기관 연결을 검토하고 이재석이 schema/reference/Provider contract 검증을 수행한다. 두 검토가 모두 PASS여야 fixture version을 고정한다.
- fixture 수정은 새 version과 checksum으로만 허용하고 기존 version을 덮어쓰지 않는다.

### 근거와 수용기준

작은 자체 fixture는 6주 일정에서 오류 위치와 환자 혼합 여부를 명확히 검증할 수 있다. Contract Gate의 closed reference, R4 구조, A/B 집합 분리, PACS 존재, secret/실제 개인정보 scan이 모두 PASS해야 한다.

## 5. PHR-JA-003 — UID 노출과 mapping 상태

### 권고

PHR 목록·상세·공유 화면 API에는 실제 Study/Series/SOP UID나 FHIR endpoint를 노출하지 않고 `imagingStudyRef`와 `mappingStatus`만 반환한다. 원본 FHIR UID는 서버의 검증 계층에서 보존한다.

권고 상태는 중앙 enum으로 다음과 같이 고정한다.

```text
metadataStatus = AVAILABLE | NOT_AVAILABLE | UNSUPPORTED
mappingStatus  = MAPPED | NOT_MAPPED | CONFLICT | SOURCE_UNAVAILABLE
accessStatus   = CONSENT_REQUIRED | ELIGIBLE_FOR_AUTHORIZATION |
                 AUTHORIZED | ACCESS_DENIED | SOURCE_UNAVAILABLE
```

- `MAPPED`는 `AUTHORIZED`가 아니다.
- Viewer 시작 시 기존 정책 API가 동의·병원·사용자·목적·Study/Series·행위를 재검증한다.
- 정책 성공 후에만 짧은 Viewer launch/session 또는 DICOM access token에 UID scope를 넣는다.
- OHIF/Gateway가 프로토콜상 UID를 필요로 하면 승인 세션 동안 메모리와 DICOMweb 요청에만 최소 사용한다. URL/history/일반 로그/local storage/QR에 남기지 않는다.
- 공유 API는 `imagingStudyRef`를 서버에서 UID scope로 해석하며 클라이언트가 UID를 제출해 범위를 확대할 수 없다.
- `CONFLICT`는 자동 복구하지 않고 조회·공유를 모두 보류하며 감사한다.

### 근거와 수용기준

Opaque reference는 Web/Mobile이 PACS 식별체계에 결합되는 것을 막고 UID 변조 공격면을 줄인다. 기존 OHIF 동작을 위해 UID 자체를 금지하지 않고 승인된 짧은 세션 안으로 제한한다. PHR-T04~08과 브라우저 history/local storage/log 금지패턴 검사를 통과해야 한다.

## 6. PHR-JA-004 — 감사 이벤트와 필드

### 권고

세부 화면마다 이벤트를 무제한 추가하지 않고 다음 8개 canonical event를 사용한다.

| 이벤트 | 기록 시점 |
|---|---|
| `PHR_ACCESS_REQUESTED` | PHR 요청 인증 후 처리 시작 |
| `PHR_ACCESS_ALLOWED` | 환자 binding과 조회범위 승인 |
| `PHR_ACCESS_DENIED` | 인증·binding·scope·정책 거부 |
| `PHR_PROVIDER_FAILED` | Provider 미설정·장애·검증실패 |
| `PHR_IMAGING_MAPPING_CHECKED` | mapping 성공·미매핑·충돌 판정 |
| `PHR_VIEWER_LAUNCH_REQUESTED` | 기존 DICOM 접근정책으로 전달 |
| `PHR_SHARE_INTENT_CREATED` | 환자가 공유 범위·기관·목적을 확인 |
| `PHR_SHARE_INTENT_DENIED` | mapping·동의·기관·scope 불일치 |

기존 `CONSENT_*`, `TOKEN_*`, `QIDO_*`, `WADO_*`, `TICKET_*`, `AUDIT_*` 이벤트는 중복 생성하지 않고 동일 `auditSessionId`/`correlationId`로 연결한다.

공통 최소필드는 `auditId`, `auditSessionId`, `correlationId`, `actorId`(opaque), `actorType`, `hospitalId`, `patientRef`(opaque/pseudonymous), `action`, `result`, `reasonCode`, 필요한 경우 `imagingStudyRef`/`mappingRef`, `providerId`, `timestamp`, `sourceIp`다. 실제 이름, FHIR 원문, 검사값·판독문, bearer token, QR 원문, DEK/KEK, credential, 외부 endpoint는 기록하지 않는다. UID가 운영상 꼭 필요하면 별도 승인된 keyed hash 또는 기존 감사 최소필드 정책을 사용한다.

### 근거와 수용기준

경계 이벤트와 기존 의료영상 이벤트를 correlation하면 감사 완전성과 데이터 최소화를 동시에 유지한다. 허용/거부/Provider 장애 각각 필수필드 100%, 금지필드 0건, 감사 기록 실패 시 중요 ALLOW 0건이어야 한다.

## 7. PHR-JA-005 — 10월 21일 단일 공유 수직경로

### 권고

P0 공유경로는 **일회성 opaque QR Ticket을 이용한 B 의료진 인증 후 원격 DICOMweb `VIEW_ONLY`** 하나로 고정한다.

```text
환자 PHR에서 imagingStudyRef 선택
→ 수신 B병원·목적·기간·VIEW_ONLY 동의
→ 서버가 범위 바인딩된 일회성 QR Ticket 발급
→ B 의료진 별도 인증 및 소속기관 검증
→ Ticket 원자적 소비·동의/철회/만료 재검증
→ 5분 단기 DICOMweb token 발급
→ B OHIF가 A Edge/Gateway를 통해 승인 객체만 lazy 조회
→ 전 과정 동일 auditSession으로 연결
```

QR에는 opaque ticket reference와 최소 routing/version만 두며 환자정보, UID, token, endpoint, 암호키를 넣지 않는다. QR 소지만으로 조회할 수 없고 B 의료진 인증, 기관 일치, 활성 동의가 모두 필요하다. 기본 권한은 `VIEW_ONLY`, 동의 최대기간은 MVP 시연 기준 24시간 이하, Ticket TTL은 5분, DICOM token TTL은 기존 기본 5분을 권고한다.

모바일 DICOM 암호화 package 저장·Relay upload·key release·B 복호화와 `PACS_IMPORT`는 10월 21일 PHR P0 완료조건에서 제외하고 v3 Mobile-Core 후속 Gate로 유지한다. 기존 계약·Schema·테스트를 삭제하지 않는다. 다운로드와 PACS 저장은 별도 승인 없이는 항상 거부한다.

### 근거와 영향

현재 저장소에서 검증된 자산은 consent, one-time Ticket, token, QIDO/WADO, Orthanc/OHIF이며 모바일 앱·package/key-release 종단 구현은 없다. 원격 VIEW 수직경로는 가장 많은 검증 자산을 재사용하고 원본 DICOM을 A PACS에 유지한다. 반면 모바일 package까지 동시에 P0로 두면 암호·키·기기신뢰·수신 무결성의 미구현 Critical Path가 추가된다.

이 권고는 v3 Mobile-Core의 모바일 package P0를 일정상 후속으로 옮기는 범위변경이므로 PM 승인이 필요하다. 범위변경 등록부에는 기존 ID, 사유, 보안 영향(공격면 감소), 일정 영향, 후속 목표일, 잔여위험을 남긴다.

### 수용기준

PHR-T01~09, T11~15 중 해당 원격조회 시나리오가 PASS해야 한다. PHR-T10 package 변조시험은 `NOT RUN / DEFERRED BY APPROVED SCOPE CHANGE`로만 기록할 수 있으며 PASS로 처리하지 않는다. Ticket 재사용·만료·철회, 타기관·타의료진·타Study, VIEW_ONLY 다운로드, 직접 PACS 접근은 모두 거부되어야 한다.

## 8. 승인 기록

| 역할 | 이름 | 결정 | 일시 | 조건/의견 |
|---|---|---|---|---|
| Cloud/Mobile 책임자 | 이재석 | APPROVED | 2026-09-08 | PHR-JA-001~004 공동승인 |
| FHIR/Edge/PACS·PM 책임자 | 김범희 | APPROVED | 2026-09-08 | PHR-JA-001~004 공동승인 |
| PM 범위 승인 |  | PENDING |  | PHR-JA-005 필수 |

승인 선택지는 `APPROVED`, `APPROVED_WITH_CONDITIONS`, `REJECTED` 중 하나다. 조건부 승인은 조건, 담당자, 기한, 검증방법을 반드시 기록한다.

## 9. 변경통제

- 공동 기술승인 후 API enum/path, fixture identity/UID, mapping 상태, 감사 이벤트를 바꾸려면 변경요청과 계약시험 수정이 먼저다.
- 상대방 소유 코드는 승인된 계약 없이 직접 수정하지 않는다.
- 보안 불변조건을 약화하는 변경은 공동합의만으로 승인할 수 없고 PM·보안 검토를 추가한다.
- 승인되지 않은 항목은 구현 추정으로 메우지 않고 `PENDING` 상태를 유지한다.
