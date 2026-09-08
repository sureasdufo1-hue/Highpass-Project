# Highpass FHIR PHR MVP Phase 0~1 구현계획

상태: `PROPOSED / APPROVAL REQUIRED`  
작성 기준선: branch `codex/fix-edge-platform-assets`, HEAD `64bcad9c6813f705a37c6ff0ee1c7ddcc7c0a28f` (2026-09-08 조사 시점)

## 1. Phase Result

```text
Previous:
기존 Highpass MVP 및 PHR 확장 조사 전 상태

Target:
PHR MVP SCOPE IDENTIFIED
FHIR / PROVIDER / DICOM CONTRACT PROPOSED
OWNER BOUNDARIES DEFINED
WBS CHANGE IMPACT ASSESSED
NEXT IMPLEMENTATION WORK SELECTED

Achieved:
저장소 기준선과 기존 v2.1/v3/PF 구현상태 조사
PHR-FR-001~018 및 PHR-NFR-001~006 제안
FHIR R4 최소매핑, Provider/API, ImagingStudy-DICOM 계약 제안
담당자 경계 및 44.0 인일 ROM 일정 영향 제안
다음 단일 구현작업 PHR-W02 선정

Qualifier:
SYNTHETIC DATA / LOCAL PoC ONLY
MYHEALTHWAY LIVE INTEGRATION NOT CLAIMED
NO CLINICAL OR PRODUCTION DEPLOYMENT CLAIM
```

## 2. Repository / Working Tree

- 조사 branch/HEAD: 위 기준선. 원격 tracking branch는 `origin/codex/fix-edge-platform-assets`.
- 조사 시작 시 기존 변경: `.env.example`, `src/domain.js`, `src/postgres-store.js`, `src/retention.js`, `src/seed.js`, `src/server.js` 수정 및 `test/transfer-ticket.test.js` 미추적.
- 이번 변경: `docs/phr/` 제안 문서와 `docs/project-management/PHR-WBS-CHANGE-IMPACT.md`만 생성.
- 변경하지 않음: `src/`, `db/`, OpenAPI, Docker Compose, 모바일 실행코드, 인증서·키, `.env*`, fixture, 기존 문서 및 기존 변경.

### 요청 자료 조사 결과

| 요청 자료 | 경로/판정 |
|---|---|
| AGENTS.md | `AGENTS.md` VERIFIED |
| README | `README.md` VERIFIED |
| Git/working tree | Git 명령으로 VERIFIED |
| “MVP 읽기쉬운버전” | 정확한 파일명 `NOT FOUND`; `docs/highpass-v2-requirements-definition.md`, `docs/MVP-SCOPE.md`를 후보로 조사 |
| v3.0 및 88개 추적성 | v3 문서 VERIFIED; “88개” 원본/완전 매트릭스는 `NOT FOUND` |
| 구성도·구성요소 등록부 | Draw.io/SVG/PNG와 `docs/ARCHITECTURE.md` 존재; 별도 구성요소 등록부 `NOT FOUND` |
| 10/21 WBS·간트 | Mobile-Core WBS 존재; 10/21 달력형 원본 문서 `NOT FOUND` |
| v2.1/v3 계약 | VERIFIED |
| OpenAPI/DB/Compose/CI/증적 | VERIFIED |
| `docs/privacy/` | VERIFIED; PF 상태는 변경하지 않음 |

## 3. Current Implementation Matrix

| 영역 | 상태 | 근거 | 해석 |
|---|---|---|---|
| 환자 인증/binding | VERIFIED (local code) | `src/auth.js`의 PATIENT principal/assertion | Mock 운영차단은 코드, 실제 IdP/MFA는 별도 |
| 동의·철회·RBAC/ABAC | VERIFIED/PARTIAL | `src/server.js`, `src/services.js`, 기존 tests | 기존 경로 재사용; 외부 IdP 미검증 |
| 단기 token | VERIFIED (local) | 5분 기본, hash/claim/introspection 코드·시험 | 운영 KMS 미검증 |
| DICOMweb Gateway | VERIFIED/PARTIAL | QIDO/WADO routes, Orthanc client, mTLS Compose | 실제 병원 PACS 아님 |
| Orthanc/OHIF | VERIFIED (PoC assets) | Compose, config, 기존 evidence | 합성 로컬 Reference Viewer |
| 감사·탐지 | VERIFIED/PARTIAL | append/hash chain/rules 및 기존 tests | WORM/SIEM 미구현 |
| Mobile-Core 실행 | REPORTED/PLANNED | v3 OpenAPI, migration/schema 문서 | 모바일 앱 없음; 기존 추적성은 NOT IMPLEMENTED |
| Privacy PF-0/PF-1 | PARTIAL/BLOCKED | `docs/privacy/CURRENT-WORK-CLASSIFICATION.md` | 실제 model/DB 환경 blocker; 상태 불변 |
| FHIR/PHR Provider | PLANNED | 저장소 검색 결과 없음 | 신규 구현 필요 |
| FHIR fixture/validator | PLANNED | 저장소 검색 결과 없음 | 신규 PHR-W02 |
| MyHealthWay | BLOCKED/DEFERRED | 공식 계약·자격 없음 | 외부 호출 금지 |

이 표는 코드·문서 조사 결과다. 이전 PASS를 현재 dirty tree 실행 PASS로 승계하지 않았다.

## 4. PHR Architecture & Contracts

```text
Patient Web/Mobile
  -> existing Highpass authentication and server-side patient binding
  -> proposed PHR API
  -> HealthDataProvider
       -> Synthetic R4 Provider (P0, offline)
       -> MyHealthWay Provider (disabled, NOT_CONFIGURED)
  -> validation/normalization (FHIR metadata only)
  -> ImagingStudy mappingRef
  -> existing consent + RBAC/ABAC + short token
  -> existing controlled DICOMweb Gateway/OHIF
  -> A Edge/Orthanc (original DICOM remains here)
```

세부 계약은 같은 디렉터리의 FHIR, Provider/API, ImagingStudy 문서에 있다. 이재석은 Cloud/Mobile 구현, 김범희는 FHIR 의미계약과 Edge/PACS 구현을 소유한다. 실행 위치는 이 경계를 바꾸지 않는다.

미결정 ADR은 PHR 요구사항 문서의 ADR-PHR-001~005이며, 승인 전 기존 API/OpenAPI/DB를 변경하지 않는다.

API, fixture, UID 노출, 감사 이벤트, 단일 공유경로의 추천 결정은 [PHR 공동합의 권고안](JOINT-AGREEMENT-RECOMMENDATIONS.md)에 PHR-JA-001~005로 구체화했다. 현재는 공동·PM 승인 대기 상태다.

## 5. MVP Scope & Schedule

10월 21일 필수는 합성 환자 A/B 격리, R4 최소 조회, 환자별 서버 접근통제, ImagingStudy와 실제 합성 Orthanc Study 연결, 기존 Gateway Viewer, 기존 consent/share 최소 수직경로, 감사와 정상·음성·장애 E2E다.

Import, 공공 API, 전체 FHIR 서버, 실제 MyHealthWay/PHI/PACS/IdP/KMS, 고급 FHIR와 전체 비식별은 후속이다. 신규 ROM은 이재석 22.5, 김범희 21.5, 합계 44.0 인일(±30%)이며 상세 Critical Path와 Gate는 WBS 영향 문서에 있다.

## 6. Next Development Work

`PHR-W02 — 자체 합성 FHIR R4 A/B fixture와 immutable manifest 작성`의 코드·계약 테스트는 완료했으며 owner review와 실제 Orthanc 검증이 남았다. 상세 결과는 [PHR-W02 실행 보고서](PHR-W02-EXECUTION-REPORT.md)에 있다.

- 완료: 환자 A/B 식별자·리소스·UID 분리, 최소 7 resource type, 외부 reference 0, checksum/seed/license/source 고정, A 정적 Orthanc seed 연결, B fail-closed `NOT_MAPPED`.
- 남음: 김범희 의료정보 검토, 실제 Docker Orthanc QIDO, B병원 PACS/Edge seed 결정.
- `PHR-W03 — HealthDataProvider interface + Synthetic Provider + MyHealthWay NOT_CONFIGURED adapter`는 단위 구현과 검증을 완료했다. 결과는 [PHR-W03 실행 보고서](PHR-W03-EXECUTION-REPORT.md)에 있다.
- `PHR-W04 — /api/v1/me/phr 환자 binding API와 감사 연결`은 로컬 API 구현과 검증을 완료했다. 결과는 [PHR-W04 실행 보고서](PHR-W04-EXECUTION-REPORT.md)에 있다.
- 다음 우선순위 권고: OpenAPI/계약 Gate 보강 후 `PHR-W06 — ImagingStudy–Orthanc live mapping validator`.
- PHR-W05 화면은 W06과 병렬 가능하지만 단일 우선순위는 의료영상 수직경로를 선택한다.

Provider 구현보다 fixture를 먼저 고정해야 두 담당자가 같은 의료정보·UID 계약에 대해 병렬 개발할 수 있다.

## 7. Tests / Evidence

이번 단계는 실행코드를 변경하지 않았다. PHR-T01~T15는 모두 `NOT RUN`이며 이유는 Provider/API/fixture가 아직 구현되지 않았기 때문이다. 현재 dirty working tree에서 `node --test`를 실행해 95/95 PASS를 확인했고 `node scripts/security-secret-scan.js`는 findings 0으로 PASS했다. 문서 정적검사에서 PHR-FR-001~018 존재, 로컬 링크 해석, `git diff --check`를 PASS했다. 이 결과는 현재 미커밋 코드와 미추적 `test/transfer-ticket.test.js`를 포함하므로 HEAD 단독 증적 또는 PHR 기능 PASS로 해석하지 않는다. 기존 evidence는 조사 근거일 뿐 이번 SHA의 PHR 증적이 아니다.

## 8. Risks / Decisions

- 연동: FHIR logical ID/business identifier/DICOM UID를 혼동하면 타환자 연결로 이어진다.
- 보안: FHIR endpoint/reference 자동추적은 SSRF와 권한우회 위험이므로 P0에서 금지한다.
- 일정: PHR 44 인일과 미구현 Mobile-Core 전 범위를 동시에 P0로 유지하면 Critical Path가 과밀하다.
- 증적: dirty working tree에서 과거 PASS를 승계할 수 없다.
- 합의 필요: API envelope/error/pagination, fixture 의료일관성, UID 노출·mapping 상태, audit event, 단일 Mobile-Core 공유경로.
- PM 승인: PHR 요구사항 baseline, v3 P0 최소범위, 담당자 가용시간, PACS_IMPORT 포함 여부, 자체 fixture, 비영속 정규화.
