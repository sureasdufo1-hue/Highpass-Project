# MediQ 병원 임상업무 편의 기능 추적성

**Document ID:** MEDIQ-HCW-TRACE-001  
**Version:** 1.0.0  
**Date:** 2026-09-27  
**Status:** Design Traceability — Not Implementation Evidence

## 1. 목적

`HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`의 기능, 화면, 보안통제, 논리 객체, API GAP, Acceptance와 구현 Ticket을 연결한다. 모든 구현·시험 상태는 현재 `NOT IMPLEMENTED / NOT RUN`이다.

## 2. Feature Traceability

| 기능 | Requirement | Screen | Logical Object | Security | Test | Ticket |
|---|---|---|---|---|---|---|
| 관련 과거 영상 | `REQ-HCW-PR-001~008` | `HCW-SCR-001~002`, `SAAS-SCR-042~044` | `AuthorizedPriorStudyProjection`, `ComparisonViewerSession` | `SEC-HCW-001~003,014~015` | `TC-HCW-PR-001~007` | `MEDIQ-HCW-PR-001~002` |
| 진료 인계 패킷 | `REQ-HCW-HP-001~009` | `HCW-SCR-003` | `ClinicalHandoffPacket`, `HandoffResourceReference` | `SEC-HCW-004,010,013~015` | `TC-HCW-HP-001~008` | `MEDIQ-HCW-HP-001` |
| 팀 배정·인계 | `REQ-HCW-AS-001~008` | `HCW-SCR-004` | `WorkAssignment` | `SEC-HCW-005,008~010,014~015` | `TC-HCW-AS-001~008` | `MEDIQ-HCW-AS-001` |
| 병원 알림함 | `REQ-HCW-NT-001~008` | `HCW-SCR-005` | `HospitalNotification` | `SEC-HCW-006~007,010,014~015` | `TC-HCW-NT-001~007` | `MEDIQ-HCW-NT-001` |
| 감사·출처 타임라인 | `REQ-HCW-AT-001~008` | `SAAS-SCR-080` 확장 | `ExplainableTimelineProjection` | `SEC-HCW-011~012,015` | `TC-HCW-AT-001~007` | `MEDIQ-HCW-AT-001` |

## 3. API Gap

| 업무 행위 | 현재 상태 | 구현 Gate |
|---|---|---|
| `ListAuthorizedPriorStudies` | GAP | Study별 Object Authorization, Pagination, QIDO Scope |
| `CreateComparisonViewerSession` | GAP | Multi-study exact binding, revoke/expiry |
| `Create/GetClinicalHandoffPacket` | GAP | Resource별 Scope, Projection version |
| `Assign/AcceptOrHoldClinicalHandoff` | GAP | P1 Role/Capability, ETag/Idempotency |
| `List/AcknowledgeHospitalNotifications` | GAP | 최소정보, Resource open reauthorization |
| `GetExplainableExchangeTimeline` | GAP/P0 PARTIAL | 원장 순서, Role-filtered detail |

API 구현 전 `OPENAPI.yaml`을 승인된 업무 행위 중심으로 개정하고 Contract Test를 추가해야 한다.

## 4. Planned Acceptance

### 4.1 관련 과거 영상

| ID | Scenario | Expected |
|---|---|---|
| `TC-HCW-PR-001` | 같은 환자의 두 승인 Study 선택 | Short-lived 비교 Session 생성, Side-by-side PASS |
| `TC-HCW-PR-002` | 한 후보에 `study:view` 없음 | 해당 후보 비노출 또는 안전한 DENY |
| `TC-HCW-PR-003` | 교차 Tenant/다른 Patient Study ID 주입 | 존재 여부 노출 없이 DENY + Audit |
| `TC-HCW-PR-004` | 비교 중 한 Study Grant 철회 | 해당 Viewport 종료, 재검증 |
| `TC-HCW-PR-005` | 허용 집합 외 UID 요청 | WADO Gateway DENY |
| `TC-HCW-PR-006` | PACS 장애/후보 없음/부분권한 | 서로 다른 안전 상태 표시 |
| `TC-HCW-PR-007` | 비교 화면 문구 검사 | 임상적 동일성·악화·호전 자동판정 없음 |

### 4.2 진료 인계 패킷

| ID | Scenario | Expected |
|---|---|---|
| `TC-HCW-HP-001` | 승인 Resource로 패킷 생성 | 정확한 Purpose/Scope/Expiry Projection |
| `TC-HCW-HP-002` | 영상 Grant만으로 판독문 참조 주입 | 임상문서 비노출·DENY |
| `TC-HCW-HP-003` | 패킷 열기 전 Consent 철회 | Projection 무효화, Resource 열기 DENY |
| `TC-HCW-HP-004` | DICOM Pixel/Payload 저장 검사 | 패킷 저장소에 Payload 없음 |
| `TC-HCW-HP-005` | `READY` 표시 | 진료/PACS 완료 문구 없음 |
| `TC-HCW-HP-006` | 외부 Export/공유 시도 | Route 부재 또는 명시적 DENY |
| `TC-HCW-HP-007` | 만료 패킷 열기 | EXPIRED, 보호 Resource 비노출 |
| `TC-HCW-HP-008` | 생성·열람·수락·종료 | Actor/Resource/Outcome/Correlation Audit |

### 4.3 팀 배정과 인계

| ID | Scenario | Expected |
|---|---|---|
| `TC-HCW-AS-001` | 같은 병원 활성 사용자에게 배정 | ASSIGNED + Audit |
| `TC-HCW-AS-002` | 다른 Tenant/Hospital 사용자에게 배정 | DENY, 대상 존재정보 최소화 |
| `TC-HCW-AS-003` | 배정받았으나 영상 권한 없음 | 업무 메타데이터 최소화, Viewer DENY |
| `TC-HCW-AS-004` | 동시 재배정 | 한 요청만 성공, 다른 요청 Version Conflict |
| `TC-HCW-AS-005` | 비활성 사용자 신규 배정 | DENY |
| `TC-HCW-AS-006` | 역할 없는 사용자 Queue 조회 | DENY |
| `TC-HCW-AS-007` | 기한 경과 | 업무 지연 표시, 임상 긴급도 추론 없음 |
| `TC-HCW-AS-008` | 구조화 사유와 상태 전환 | 허용 Transition만 PASS + Audit |

### 4.4 병원 알림함

| ID | Scenario | Expected |
|---|---|---|
| `TC-HCW-NT-001` | 동의·Grant·Import Event | 최소정보 Inbox Card 생성 |
| `TC-HCW-NT-002` | 잠금화면/URL/로그 검사 | 환자명·진단·UID·PACS 정보 없음 |
| `TC-HCW-NT-003` | 알림 후 권한 철회 | Deep Link Open 시 DENY |
| `TC-HCW-NT-004` | 중복·역순 Event | Event ID/Version 정규화, 최신 상태 표시 |
| `TC-HCW-NT-005` | `RESULT_UNKNOWN` 알림 | 완료 미표시, 상태 확인 Route만 제공 |
| `TC-HCW-NT-006` | 보안 필수 경고 끄기 | 설정 DENY |
| `TC-HCW-NT-007` | 외부 이메일·Push 시도 | P1에서 비활성 |

### 4.5 감사·출처 타임라인

| ID | Scenario | Expected |
|---|---|---|
| `TC-HCW-AT-001` | P0 Golden Path Event 조회 | 서버 Sequence와 단계가 일치 |
| `TC-HCW-AT-002` | Consent/Grant/Transfer 상태가 다름 | 단일 종합 성공 Badge로 병합하지 않음 |
| `TC-HCW-AT-003` | `RESULT_UNKNOWN` | 확인 필요로 표시, 완료 아님 |
| `TC-HCW-AT-004` | CLINICIAN과 AUDITOR 비교 | Role별 상세 최소화 적용 |
| `TC-HCW-AT-005` | Stack/Token/Payload 포함 Event | Projection에서 Redact/Reject |
| `TC-HCW-AT-006` | Pagination/Filter | Event 누락·재정렬 없이 원장 순서 보존 |
| `TC-HCW-AT-007` | Export 시도 | 별도 Policy 없으면 DENY |

## 5. 현재 상태

```text
DESIGN BASELINE: APPROVED
OPENAPI: NOT UPDATED — GAP RECORDED
DATABASE / MIGRATION: NOT IMPLEMENTED
WEB UI: NOT IMPLEMENTED
AUTOMATED TESTS: NOT RUN
P0 COMPLETION CRITERIA: UNCHANGED
```

