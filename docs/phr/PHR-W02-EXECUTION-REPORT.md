# PHR-W02 합성 FHIR fixture 실행 보고서

상태: `CODE COMPLETE / OWNER REVIEW PENDING / LIVE PACS NOT VERIFIED`  
실행일: 2026-09-08  
범위: PHR-FR-002, PHR-FR-006, PHR-FR-008~009, PHR-FR-017, PHR-NFR-002

## 작업 목적

Provider/API 구현 전에 두 개발자가 공유할 합성 FHIR R4 A/B fixture, 환자 식별자 binding, ImagingStudy–DICOM mapping 및 immutable checksum 계약을 고정한다.

## 확인된 기존 제약

기존 `scripts/load-sample-dicom.js`의 DICOM UID에는 `001`/`002`처럼 선행 0이 있는 구성요소가 있었다. 새 PHR fixture가 이를 정상 UID로 승계하지 않도록 PHR 전용 A 합성 DICOM에 표준 문법의 UID를 추가했다. 기존 legacy UID와 기존 테스트는 이번 작업에서 변경하지 않았다.

또한 현재 A Orthanc upload seed에는 P-1002/HOSP-B 영상이 없다. 따라서 환자 A는 `MAPPED`, 환자 B는 의도적으로 `NOT_MAPPED`로 고정했다. B를 A PACS에 억지 연결하지 않았다.

## 생성·수정 파일

생성:

- `test/fixtures/phr/r4/v1/patient-a-bundle.json`
- `test/fixtures/phr/r4/v1/patient-b-bundle.json`
- `test/fixtures/phr/r4/v1/identity-map.synthetic.json`
- `test/fixtures/phr/r4/v1/imaging-map.synthetic.json`
- `test/fixtures/phr/r4/v1/manifest.json`
- `test/phr-fixture-contract.test.js`

수정:

- `scripts/load-sample-dicom.js`: P-1001용 PHR 합성 CT Instance 1개 추가

기존 사용자 변경이 있는 `src/seed.js`, DB, OpenAPI, 인증서·키, Cloud/Mobile 코드는 변경하지 않았다.

## 구현 계약

- FHIR R4 최소 리소스 7종과 Organization을 환자별 Bundle로 제공한다.
- 모든 reference는 Bundle 내부 상대참조로 닫혀 있고 외부 endpoint가 없다.
- account subject, 내부 patientRef, FHIR id/identifier, DICOM PatientID와 UID를 분리한다.
- A/B의 resource key와 DICOM UID 집합은 교차하지 않는다.
- A ImagingStudy는 `GW-HOSP-A`와 PHR 전용 Orthanc seed Study에 연결한다.
- B ImagingStudy는 metadata-only `NOT_MAPPED`이며 gateway/PACS evidence가 없다.
- manifest가 fixture와 Orthanc seed source의 SHA-256을 고정한다.
- 모든 자료는 합성이며 임상사용 금지를 표시한다.

## 테스트 결과

| 테스트 | 결과 | 근거 |
|---|---|---|
| manifest/checksum 및 Orthanc seed source 고정 | PASS | PHR fixture contract test |
| R4 최소 리소스와 closed reference | PASS | 환자 A/B Bundle 계약검사 |
| A/B 식별자·resource·UID 격리 | PASS | 집합 교차 0건, UID 문법검사 |
| ImagingStudy–identity–기관–seed 계약 | PASS | A MAPPED/B NOT_MAPPED 분기검사 |
| code/value/unit 보존과 교차환자 문자열 차단 | PASS | Observation 원문 구조 비교 |
| 실제 Docker Orthanc upload/QIDO | NOT VERIFIED | Compose 실행 전 |
| 의료적 의미 검토 | NOT VERIFIED | 김범희 owner review 대기 |
| Provider를 통한 조회 | NOT RUN | PHR-W03 미구현 |

실행 명령:

```text
node --test test/phr-fixture-contract.test.js
```

결과: 5 tests, 5 PASS, 0 FAIL.

## 보안 검토

- 실제 환자정보와 실제 기관정보를 사용하지 않았다.
- 외부 URL reference 및 endpoint를 포함하지 않았다.
- token, credential, key를 fixture에 넣지 않았다.
- 환자 B를 존재하지 않는 A PACS 객체에 매핑하지 않고 fail-closed 상태로 표현했다.
- manifest 변경은 checksum 불일치로 탐지된다.

## 남아 있는 위험과 다음 작업

1. 기존 legacy DICOM UID의 선행 0 문제는 별도 영향분석과 migration/호환성 결정이 필요하다.
2. A PHR DICOM은 정적 seed source에만 존재가 확인됐고 실제 Orthanc QIDO는 아직 미검증이다.
3. fixture의 의료적 일관성은 지정 owner 승인이 남았다.
4. 환자 B 실제 영상 연결은 HOSP-B PACS/Edge fixture 또는 승인된 소스 변경이 필요하다.

다음 구현 우선순위는 `PHR-W03 — HealthDataProvider interface와 offline Synthetic Provider, MyHealthWay NOT_CONFIGURED adapter`다. PHR-JA-001/002 공동승인 또는 조건부 승인을 받은 뒤 시작한다.
