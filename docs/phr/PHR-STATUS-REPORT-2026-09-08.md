# Highpass FHIR PHR MVP 진행상황 보고서

## 2026-09-09 상태 갱신

- PHR-W06 live ImagingStudy–Orthanc mapping validator: 구현·시험 완료
- PHR-W07 합성 수직경로 `PHR → 동의 → 의료진 단기토큰 → QIDO/WADO → 감사 → 철회`: 구현·시험 완료
- PHR-W05 최소 환자 UI, PHR OpenAPI, 브라우저 PHR 조회·동의 생성: 구현·시험 완료
- PHR 전용 targeted suite: 6/6 PASS, Compose 6/6 healthy, 브라우저 console warning/error 0
- 전체 Node 회귀: 144/144 PASS, Phase 5 최종 Gate 5/5 PASS at `1754f259a5e06b6a6ca96a13f0e132d30c7b058d`
- 남은 PHR 로컬 작업: W08/W09의 opaque 역할전환 handoff와 단일 브라우저 Viewer 종단 증적
- 실제 MyHealthWay, IdP, 병원 PACS와 모바일 package/key release는 계속 `NOT IMPLEMENTED` 또는 `DEFERRED/BLOCKED`

아래 W02~W04 보고는 해당 시점의 역사적 기준선이며 현재 구현 상태를 제한하지 않는다.

보고 기준일: 2026-09-08  
보고 대상: 프로젝트 보고자/PM  
기준 branch: `codex/fix-edge-platform-assets`  
기준 HEAD: `64bcad9c6813f705a37c6ff0ee1c7ddcc7c0a28f`

## 1. 요약

현재 PHR 확장은 **Phase 0~1 계약 확정과 W02~W04 로컬 구현을 완료한 상태**다. 합성 FHIR R4 자료를 환자별로 분리하고, Provider와 `/api/v1/me/phr/*` 조회 API를 연결했다. ImagingStudy 응답은 opaque reference만 노출하며, 기존 DICOM 접근권한을 자동 부여하지 않는다.

공동합의 상태는 다음과 같다.

- PHR-JA-001 API envelope/pagination/error: 공동승인 완료
- PHR-JA-002 합성 fixture/의료일관성: 공동승인 완료
- PHR-JA-003 UID 노출/mapping 상태: 공동승인 완료
- PHR-JA-004 감사 이벤트/금지필드: 공동승인 완료
- PHR-JA-005 단일 공유 수직경로: PM 범위승인 대기

판정: `SYNTHETIC LOCAL PoC / NOT A CLINICAL OR PRODUCTION SYSTEM`

## 2. 완료한 작업

### Phase 0 — 기준선 조사

- 기존 v2.1 인증, 동의, RBAC/ABAC, 단기 DICOM token, QIDO/WADO, Orthanc, OHIF, 감사 기능 재사용 가능성 확인
- v3 Mobile-Core가 실행 앱이 아니라 OpenAPI/DDL/Schema 및 계획 중심임을 확인
- Privacy Filter PF-0~PF-6 상태를 변경하지 않음
- 기존 working tree 변경사항 보존
- PHR 신규 요구사항 `PHR-FR-001~018`, `PHR-NFR-001~006` 정의
- 신규 ROM 공수 44.0 인일 제안

### Phase 1 — 계약 및 책임경계

- FHIR R4 4.0.1 최소 리소스 매핑
- 계정·내부 환자·FHIR·기관·DICOM 식별자 분리 계약
- ImagingStudy–DICOM UID 매핑과 `MAPPED/NOT_MAPPED/CONFLICT` 상태
- Provider Interface 및 `/api/v1/me/phr/*` API 제안
- 이재석(Cloud/Mobile/Provider 실행), 김범희(FHIR 의미·UID·Edge/PACS·통합시험) 책임경계 명시

### W02 — 합성 fixture

- 합성 환자 A/B Bundle 작성
- Patient, Encounter, Condition, MedicationRequest, Observation, DiagnosticReport, ImagingStudy, Organization 포함
- A/B 환자·resource ID·business identifier·DICOM UID 교집합 제거
- Fixture 및 Orthanc seed SHA-256 manifest 작성
- PHR 전용 표준 DICOM UID seed 추가
- 기존 legacy UID는 호환성 영향분석 대상으로 보류

### W03 — Provider

- `SyntheticFhirProvider` 구현
- Fixture integrity 검증
- 서버 컨텍스트 기반 patient binding
- offline capability 및 bounded pagination
- patient/resource/filter/limit 바인딩 HMAC opaque cursor
- query allowlist와 최대 조회기간 제한
- `MyHealthWayProvider`를 `NOT_CONFIGURED` fail-closed로 구현

### W04 — PHR API 및 감사

- `/api/v1/me/phr/summary`
- 진료·진단·투약·검사·판독·영상검사 목록 API
- 영상검사 상세 API
- RFC 7807 계열 Problem Details 응답
- PHR canonical 감사 이벤트 연결
- opaque patient/resource/imaging reference
- UID, FHIR endpoint, token, key의 API·감사 비노출
- 감사 write 실패 시 조회 중단

## 3. 현재 구현 판정

| 영역 | 현재 판정 | 설명 |
|---|---|---|
| 합성 FHIR fixture | VERIFIED | checksum·R4 구조·closed reference·A/B isolation |
| Synthetic Provider | VERIFIED (local) | offline, binding, cursor, limit/range 검증 |
| MyHealthWay adapter | VERIFIED (disabled) | 외부 호출 없이 `NOT_CONFIGURED` |
| PHR HTTP API | VERIFIED (local) | Development Mock + JSON Store 기준 |
| PHR 감사 | VERIFIED (local) / PARTIAL schema | 기존 audit store 사용, correlation은 auditSession에 바인딩 |
| ImagingStudy 매핑 | VERIFIED (local synthetic) | live QIDO validator와 W07 수직경로 PASS |
| 기존 DICOMweb/OHIF | VERIFIED (local synthetic) | W07 서비스 수직경로 PASS, 전용 PHR 역할전환 UI 후속 |
| 실제 환자정보 | NOT USED | 합성자료만 사용 |
| 실제 MyHealthWay | NOT IMPLEMENTED | 공식 명세·자격·환경 없음 |
| 모바일 package/key release | PLANNED/DEFERRED | PHR-JA-005 PM 승인 및 후속 수직경로 |

## 4. 시험 결과

| 시험 | 결과 | 근거 |
|---|---|---|
| W02 fixture 계약 | PASS | 5/5 |
| W03 Provider 계약 | PASS | W03 포함 targeted 11/11 |
| W04 service/API 계약 | PASS | targeted 17/17 |
| 전체 Node 회귀 | PASS | 112/112 |
| Secret scan | PASS | findings 0 |
| `git diff --check` | PASS | 오류 없음 |
| PHR-T01~T15 최종 통합 | NOT VERIFIED | Provider/API/Viewer/Edge 전체 E2E 미완료 |
| 실제 Orthanc QIDO | NOT VERIFIED | 정적 seed만 검증 |
| PostgreSQL 감사/RLS | NOT VERIFIED | 로컬 JSON Store 시험 |
| 실제 IdP/MFA | NOT VERIFIED | Development Mock 시험 |

실행 명령:

```text
node --test
node scripts/security-secret-scan.js
git diff --check
```

## 5. 변경 파일 및 범위

주요 생성 파일:

- `src/health-data-provider.js`
- `src/phr-service.js`
- `test/health-data-provider.test.js`
- `test/phr-service.test.js`
- `test/phr-api.test.js`
- `test/phr-fixture-contract.test.js`
- `test/fixtures/phr/r4/v1/*`

주요 수정 파일:

- `src/server.js`
- `src/http-utils.js`
- `scripts/load-sample-dicom.js`
- `docs/phr/*`
- `docs/project-management/PHR-WBS-CHANGE-IMPACT.md`

변경하지 않은 영역:

- DB migration 및 운영 schema
- 기존 consent/DICOMweb 계약
- 인증서·암호키·실제 credential
- 실제 의료자료
- 기존 Privacy Filter 완료상태

저장소는 시작 시점부터 사용자 수정사항이 있는 dirty working tree였으며, 해당 변경은 이번 성과로 승계하지 않았다.

## 6. 일정 및 다음 작업

기존 제안 일정은 10월 21일 완료 목표를 유지한다. 현재 W02~W04가 완료되어 다음 우선순위는 다음과 같다.

1. `PHR-W05` 최소 환자 화면과 상태 표시
2. `PHR-W06` ImagingStudy–Orthanc live mapping/QIDO 검증
3. 기존 동의·단기 token·OHIF Viewer launch 연결
4. PHR-T01~T15 통합시험 및 증적 생성

의료영상 수직경로를 먼저 확보하기 위해 **W06을 W05보다 우선 수행**하는 것을 권고한다. 단, PHR-JA-005 PM 승인이 없으면 모바일 package/PACS_IMPORT를 P0로 확장하지 않는다.

## 7. 보고자 승인/결정 요청

1. PHR-W02~W04 완료 및 로컬 PASS 판정 확인
2. PHR-JA-005의 P0 공유경로를 QR Ticket 기반 원격 `VIEW_ONLY`로 확정할지 결정
3. 실제 Orthanc QIDO 검증 환경과 실행일 승인
4. PHR-W05/W06의 우선순위와 담당자 가용시간 확인
5. PostgreSQL 감사의 독립 `correlation_id` 저장을 후속 migration으로 승인할지 결정
6. 실제 MyHealthWay·실제 환자정보·운영 PACS가 이번 MVP 범위 밖임을 확인

## 8. 남아 있는 위험

- 실제 Orthanc, IdP, PostgreSQL 환경에서 아직 통합 검증하지 않음
- 기존 legacy DICOM UID 형식 문제
- 현재 API 계약이 기존 OpenAPI에 아직 반영되지 않음
- 모바일 앱·key release·B PACS 수신 종단기능 미완료
- 보고자 승인 전 PHR-JA-005 범위는 변경하지 않음

## 9. 결론

현재 단계의 성과는 PHR 전체 완료가 아니다. 기존 Highpass 인증·동의·DICOM 보안 경계를 보존하면서, 합성 FHIR 개인의료정보 조회와 향후 영상 공유를 연결할 수 있는 실행 가능한 Provider/API/감사 기반을 확보한 것이다. 다음 판정은 실제 Orthanc 매핑과 PHR→DICOMweb→공유 통합시험 이후에만 갱신한다.

## 10. 2026-09-10 W08 갱신

PHR-W08을 구현했다. 활성 동의에서 환자 본인만 일회용 opaque Viewer handoff를 발급할 수 있고, 수신 의료진은 인증 principal의 병원·의사 식별자와 서버 티켓 범위로만 교환된다. nonce 원문은 저장하지 않으며, 브라우저는 `/t` 진입 직후 `/hipass/#DOCTOR`로 주소를 정리한다. 서비스·HTTP 회귀는 148/148 PASS이다.

Docker Desktop의 stale IPC socket(`sailor-ingest.sock`, Secrets Engine)을 복구 가능한 백업으로 이동하고 WSL을 재시작한 뒤 Engine 29.7.2가 정상 기동했다. Compose readiness/HTTPS health, 전체 MVP 게이트, 브라우저 Viewer 권한 추적을 모두 PASS로 확인했다. 상세 근거는 `docs/phr/PHR-W08-EXECUTION-REPORT.md`에 기록한다.
