# MediQ 병원 임상업무 편의 기능 P1 명세

**Project:** MediQ  
**Document ID:** MEDIQ-HCW-P1-001  
**Version:** 1.0.0  
**Date:** 2026-09-27  
**Classification:** `CAPSTONE-P1`  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Track:** `MEDIQ-HCW-*`

## 1. 결정 요약

MediQ Hospital Portal에 다음 다섯 가지 의료진 편의 기능을 P1 확장으로 도입한다.

1. 권한 범위 내 관련 과거 영상 비교
2. 진료 인계 패킷
3. 팀 배정과 업무 인계
4. 개인정보 최소 병원 알림함
5. 설명형 감사·출처 타임라인

이 기능들은 P0의 Consent, Authorization, Transfer Grant, Tenant Isolation, Mandatory Preflight, Destination Verification, Integrity, Provenance와 Audit를 대체하지 않는다. P1이 미구현이거나 실패해도 P0 Golden Path의 성공 여부는 독립적으로 판정한다.

## 2. 제품 목표와 비범위

### 2.1 목표

- 의료진이 현재 교환 건의 목적, 권한, 만료와 다음 업무를 한눈에 이해한다.
- 승인된 과거 영상을 같은 Viewer Session에서 비교하되 접근범위를 확대하지 않는다.
- 팀 단위 인계와 책임 상태를 계정 공유 없이 추적한다.
- 중요한 변화만 최소정보로 알리고 보호 자원 접근 시 서버에서 다시 인가한다.
- 기술 Audit Event를 원장 변경 없이 사람이 이해할 수 있는 타임라인으로 투영한다.

### 2.2 비범위

- 진단 추천, 병변 탐지, 임상적 동일성 또는 우선순위 자동 판정
- 환자번호만으로 수행하는 전 병원·전 Tenant 범위의 환자/영상 검색
- Full RIS, EMR, Order Entry, Reporting 또는 장기 임상문서 저장소
- 영상 권한을 판독문·의뢰서·검사결과 권한으로 자동 확장
- 이메일·Push 본문에 환자명, 진단명, Study UID 또는 검사 상세를 포함하는 알림
- Browser가 Hospital PACS를 직접 호출하거나 PACS Credential을 수신하는 구조
- 실제 환자·운영 PACS를 사용한 Capstone 시연

## 3. 범위와 선행조건

| 항목 | 분류 | 선행조건 |
|---|---|---|
| 관련 과거 영상 검색·비교 | CAPSTONE-P1 | P0 Viewer와 Study 단위 재인가 PASS |
| 진료 인계 패킷 | CAPSTONE-P1 | P0 Exchange/Consent/Grant Projection |
| 팀 배정·인계 | CAPSTONE-P1 | P1 Workforce Role/Permission 계약 |
| 병원 알림함 | CAPSTONE-P1 | 서버 권위 상태·최소정보 Projection |
| 설명형 감사·출처 타임라인 | CAPSTONE-P1 | P0 Audit/Provenance 원장 PASS |
| 판독문·의뢰서 Payload 연계 | POST-MVP | 별도 Scope, 권한, 무결성, Provenance, 법률 검토 |
| 외부 이메일·Push 전달 | POST-MVP | 채널별 개인정보·수신동의·재시도 정책 |

P1 기능 구현은 P0 E2E와 P0 Security Validation 이후 시작한다. 현재 `OPENAPI.yaml`, DB Migration, Web 구현과 실제 Test Evidence는 없으며 이 문서만으로 구현 완료를 주장하지 않는다.

## 4. Actor와 P1 역할 확장

P0의 `HOSPITAL_USER`는 인증된 병원 Workforce Actor의 상위 Principal 유형으로 유지한다. P1은 다음 `hospitalRole`을 명시적으로 부여하며 역할이 없거나 알 수 없으면 Fail Closed한다.

| Role | 허용 후보 | 금지·제한 |
|---|---|---|
| `CLINICIAN` | 승인된 영상 비교, 인계 패킷 생성·수락 | PACS 설정·Tenant 정책 변경 금지 |
| `IMAGING_STAFF` | 영상 메타데이터 확인, 비교 준비, 구조화 인계 | 임상문서 권한 자동 획득 금지 |
| `PACS_OPERATOR` | 승인된 PACS Import 작업·검증, 기술적 인계 | 임상 목적 외 Viewer 열람 금지 |
| `AUDITOR` | 최소화된 Audit/Provenance 읽기 | Viewer·Download·Import 실행 금지 |
| `HOSPITAL_ADMIN` | 병원 내 역할·업무분배 정책 관리 후보 | 관리자 역할만으로 환자·영상 접근 금지 |

하나의 사용자가 여러 역할을 가질 수 있으나 권한은 Role, Tenant, Hospital, Patient, Resource, Action, Purpose, Recipient와 Expiry를 모두 만족할 때만 허용한다. 화면에서 역할을 선택하거나 URL을 바꾸는 행위는 권한 변경이 아니다.

## 5. 공통 보안 불변조건

1. `DENY BY DEFAULT`, `FAIL CLOSED`를 유지한다.
2. Consent, Authorization과 Transfer Grant는 별개의 상태와 증거로 표시한다.
3. `VIEW`, `DOWNLOAD`, `PACS_IMPORT`는 자동 승격하지 않는다.
4. 과거 영상 후보는 같은 MediQ Patient Reference라는 이유만으로 열 수 없다. 각 Study에 대해 현재 Actor와 Action을 다시 인가한다.
5. 비교 Viewer Session은 승인된 Study 집합, Actor, Tenant, Hospital, Purpose와 Expiry에 binding한다.
6. 인계 패킷은 DICOM Pixel 또는 임상문서 복사본을 저장하지 않고 승인된 Resource Reference와 Projection만 가진다.
7. 판독문·의뢰서는 별도 Resource Scope가 없으면 숨기며 영상 Grant로 대신하지 않는다.
8. 배정, 알림, Deep Link와 Timeline은 권한 증거가 아니다. 대상 열기 직전에 서버 재인가를 수행한다.
9. 알림과 일반 로그에는 환자명, 진단, 전체 UID, PACS Endpoint, Token, Credential, Key와 Payload를 기록하지 않는다.
10. Audit/Provenance 원장은 수정하지 않고 설명형 Projection만 생성한다.
11. `RESULT_UNKNOWN`은 성공으로 표시하지 않으며 Reconciliation 전 전체 재시도를 허용하지 않는다.
12. 실제 환자정보·운영 Credential·운영 DICOM은 Capstone 데이터로 사용하지 않는다.

## 6. 기능 1 — 관련 과거 영상 비교

### 6.1 사용자 흐름

```text
승인된 현재 Study 상세
→ 관련 과거 영상 찾기
→ 동일 Patient Reference + 허용된 Source 범위에서 후보 조회
→ 검사일·Modality·Body Part 기반 중립 필터
→ 후보 Study별 Consent/Authorization/VIEW Scope 재검증
→ 사용자가 비교 대상 선택
→ Study 집합에 binding된 Short-lived Comparison Viewer Session
→ Side-by-side 열람
→ 만료·철회·Scope 변경 시 해당 Viewport 중단
```

### 6.2 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-HCW-PR-001` | 후보는 현재 Tenant, Hospital, MediQ Patient Reference와 승인된 Source 범위에 한정해야 한다. |
| `REQ-HCW-PR-002` | 검사일, Modality, Body Part와 중립적 Study Description만 검색·정렬 기준으로 사용해야 한다. |
| `REQ-HCW-PR-003` | 각 후보 Study는 선택과 Viewer Open 시 `study:view` 권한을 개별 재검증해야 한다. |
| `REQ-HCW-PR-004` | 임상적으로 동일, 악화, 호전 또는 우선순위라는 자동 판정을 표시해서는 안 된다. |
| `REQ-HCW-PR-005` | 비교 Session은 허용된 Study 집합과 Actor/Recipient/Purpose/Expiry에 binding해야 한다. |
| `REQ-HCW-PR-006` | 한 Study의 철회·만료·거부가 발생하면 해당 Viewport를 즉시 닫고 전체 상태를 재평가해야 한다. |
| `REQ-HCW-PR-007` | Pixel은 기존 Authorized WADO-RS Gateway를 통해 온디맨드로 전달하고 장기 Cloud Copy를 생성하지 않아야 한다. |
| `REQ-HCW-PR-008` | 후보 없음, 부분 권한, PACS 장애와 만료를 서로 다른 안전한 상태로 표시해야 한다. |

## 7. 기능 2 — 진료 인계 패킷

### 7.1 패킷 구성

| 필드 | P1 처리 |
|---|---|
| 전달 목적 | 구조화된 Purpose Code와 사용자용 문구 |
| 선택된 Study | 승인된 Study Reference와 최소 메타데이터 |
| 요청·전달 병원 | Tenant/Hospital Registry Reference |
| 환자 동의 상태 | 상태·범위·만료의 읽기 Projection |
| 허용 목적·Action | Resource별 Scope 목록 |
| 만료시간 | 서버 시간 기준 표시 |
| 판독문·의뢰서 | 별도 Resource Grant가 있을 때만 표시; Capstone P1 Payload 연계는 비활성 |
| 다음 처리 상태 | 구조화된 Workflow State와 담당 Role/User Reference |

### 7.2 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-HCW-HP-001` | 패킷은 하나의 Tenant, Patient Reference와 Exchange Session에 binding해야 한다. |
| `REQ-HCW-HP-002` | 패킷은 Pixel·DICOM Payload를 복제하지 않고 Resource Reference와 Projection만 저장해야 한다. |
| `REQ-HCW-HP-003` | 포함 Resource마다 유형, Scope, 권한상태, 만료와 Provenance Reference를 구분해야 한다. |
| `REQ-HCW-HP-004` | 영상 권한으로 판독문·의뢰서·검사결과를 노출해서는 안 된다. |
| `REQ-HCW-HP-005` | 상태가 철회·만료·변경되면 Packet Projection을 무효화하고 열기 전에 재검증해야 한다. |
| `REQ-HCW-HP-006` | P1은 구조화된 목적·상태·사유를 우선하고 자유서술 입력은 기본 비활성화해야 한다. |
| `REQ-HCW-HP-007` | 패킷의 `READY`는 임상 진료 완료나 PACS Import 완료를 의미해서는 안 된다. |
| `REQ-HCW-HP-008` | 인계 생성·열람·수락·종료는 Actor, Resource와 Correlation Context를 Audit해야 한다. |
| `REQ-HCW-HP-009` | 패킷 Export·외부 공유는 별도 승인 기능 없이는 제공하지 않아야 한다. |

### 7.3 상태 모델

```text
DRAFT
  → READY
  → ASSIGNED
  → ACKNOWLEDGED
  → CLOSED

Any non-terminal
  → CANCELLED | EXPIRED
```

`CLOSED`는 MediQ 인계 업무가 종료되었다는 뜻이며 진료 완료, 판독 확정 또는 환자 치료 완료를 의미하지 않는다.

## 8. 기능 3 — 팀 배정과 인계

### 8.1 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-HCW-AS-001` | 업무는 같은 Tenant/Hospital의 활성 Workforce User 또는 승인된 Department/Role Queue에만 배정해야 한다. |
| `REQ-HCW-AS-002` | 배정자는 해당 Resource의 `assign` Capability를 가져야 하며 수신자의 영상 접근권한을 새로 만들지 않아야 한다. |
| `REQ-HCW-AS-003` | 수신자가 업무를 열 때 기존 Consent, Authorization과 Resource Scope를 다시 검증해야 한다. |
| `REQ-HCW-AS-004` | 담당자, 담당부서, 처리기한, 상태와 구조화된 보류·거부 사유를 지원해야 한다. |
| `REQ-HCW-AS-005` | 미처리·지연 표시는 서버 시간과 정책으로 계산하며 임상적 긴급도로 표현해서는 안 된다. |
| `REQ-HCW-AS-006` | 재배정·수락·보류·종료는 낙관적 잠금과 상태 버전을 사용해야 한다. |
| `REQ-HCW-AS-007` | 삭제·비활성 사용자에게 새 배정을 금지하고 기존 업무는 안전한 Queue로 회수해야 한다. |
| `REQ-HCW-AS-008` | 계정 공유, 대리 로그인 또는 역할 없는 전역 Queue 열람을 허용해서는 안 된다. |

### 8.2 상태 모델

```text
UNASSIGNED → ASSIGNED → ACCEPTED → CLOSED
                  ├─ ON_HOLD
                  └─ HANDED_OVER → ASSIGNED
Any non-terminal → CANCELLED | EXPIRED
```

## 9. 기능 4 — 개인정보 최소 병원 알림함

### 9.1 지원 이벤트

- 환자 동의 완료 또는 철회
- Grant 만료 임박 또는 철회
- PACS Import와 Destination Verification 완료
- 목적지 확인 실패 또는 `RESULT_UNKNOWN`
- 환자 매핑 오류
- 신규 배정, 재배정, 처리기한 경과

### 9.2 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-HCW-NT-001` | P1은 인증 후 확인하는 병원 Portal 내부 알림함을 우선 구현해야 한다. |
| `REQ-HCW-NT-002` | 제목과 Preview에는 환자명, 진단, 전체 UID, 검사 상세와 PACS 정보를 포함하지 않아야 한다. |
| `REQ-HCW-NT-003` | 알림은 Event Type, 일반화된 상태, 생성시각, 만료, 안전한 Route Reference만 포함해야 한다. |
| `REQ-HCW-NT-004` | 알림을 열 때 사용자, Tenant, Hospital, Role과 Resource 권한을 다시 검증해야 한다. |
| `REQ-HCW-NT-005` | 철회·만료된 Resource의 알림은 내용을 노출하지 않고 접근 불가 상태로 전환해야 한다. |
| `REQ-HCW-NT-006` | 중복 Event는 Event ID와 Version으로 제거하고 전달 순서가 바뀌어도 최신 서버 상태를 조회해야 한다. |
| `REQ-HCW-NT-007` | 사용자는 정보성 알림을 조절할 수 있으나 보안·권한 철회·결과 불명 경고는 숨길 수 없어야 한다. |
| `REQ-HCW-NT-008` | 외부 이메일·Push는 POST-MVP 채널 정책 승인 전 비활성화해야 한다. |

## 10. 기능 5 — 설명형 감사·출처 타임라인

### 10.1 기본 표현

```text
요청 생성
→ 환자 동의
→ 접근 권한 판정
→ Viewer 열람
→ Preflight
→ PACS 반입
→ 목적지 확인
→ Integrity / Provenance 확인
→ 완료 또는 확인 필요
```

### 10.2 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-HCW-AT-001` | Timeline은 P0 Audit/Provenance/Integrity 원장의 읽기 Projection이어야 한다. |
| `REQ-HCW-AT-002` | Actor, Tenant, Action, Outcome, Timestamp와 Correlation/Session Context를 표시해야 한다. |
| `REQ-HCW-AT-003` | Consent, Authorization, Grant, Viewer, Transfer, Verification과 Integrity를 한 상태로 합치지 않아야 한다. |
| `REQ-HCW-AT-004` | `RESULT_UNKNOWN`, Denied, Failed, Expired와 Revoked를 성공과 시각적으로 구분해야 한다. |
| `REQ-HCW-AT-005` | 일반 의료진에는 이해 가능한 단계명과 최소 상세를, Auditor에는 권한 범위의 기술 상세를 제공해야 한다. |
| `REQ-HCW-AT-006` | Stack Trace, Token, Credential, DICOM Payload와 정책 우회에 유용한 내부 세부정보를 표시해서는 안 된다. |
| `REQ-HCW-AT-007` | 정렬·필터·페이지 이동으로 Event를 누락하거나 순서를 위조해서는 안 되며 서버 sequence를 보존해야 한다. |
| `REQ-HCW-AT-008` | Timeline Export는 별도 Role/Policy 승인 전 제공하지 않아야 한다. |

IHE ATNA의 사용자·노드 인증, 통신보호와 감사 추적 원칙은 참고하되, MediQ의 Consent·Grant·Tenant 불변조건이 우선한다.

## 11. 화면 확장

기존 79개 SaaS Screen ID를 재번호화하지 않는다. 다음 ID는 P1 Hospital Clinical Workflow Extension이며 기존 79개 기준선 외부의 추가 화면이다.

| Screen ID | 화면 | Entry / Exit | 핵심 Guard | API 상태 |
|---|---|---|---|---|
| `HCW-SCR-001` | 관련 과거 영상 찾기 | `SAAS-SCR-024/042` → 002 | exchange/patient/source + Study별 view 재인가 | GAP |
| `HCW-SCR-002` | Side-by-side 비교 Viewer | 001 → Viewer/닫기 | Multi-study Session exact binding | GAP |
| `HCW-SCR-003` | 진료 인계 패킷 | `SAAS-SCR-012/015` → 004 | Resource별 Scope·Expiry | GAP |
| `HCW-SCR-004` | 팀 배정·인계 | 003/업무함 → 수락·보류·재배정 | P1 Role/Capability + stateVersion | GAP |
| `HCW-SCR-005` | 병원 알림함 | Portal Shell → 대상 상세 | 최소정보 + Open 시 재인가 | GAP |
| `SAAS-SCR-080` 확장 | 설명형 Audit/Provenance Timeline | Exchange/완료/오류 → 상세 | Role-filtered Projection | P0 PARTIAL + P1 GAP |

모든 신규 화면은 Loading, Empty, Partial, Denied, Expired, Revoked, Upstream Failure와 `RESULT_UNKNOWN` 상태를 명시적으로 처리한다. 색상만으로 상태를 구분하지 않고 키보드 탐색, 200% 확대와 Screen Reader 이름을 제공한다.

## 12. 논리 객체와 저장 경계

| Logical Object | 주요 필드 | 저장 원칙 |
|---|---|---|
| `AuthorizedPriorStudyProjection` | studyRef, modality, bodyPart, studyDate, sourceRef, authorizationState, expiresAt | 요청 시 생성, Pixel 저장 금지 |
| `ComparisonViewerSession` | sessionId, actorRef, tenantRef, hospitalRef, studyRefs, purpose, expiresAt | Short-lived, exact Study set binding |
| `ClinicalHandoffPacket` | packetId, exchangeRef, patientRef, purposeCode, state, stateVersion, expiresAt | Payload가 아닌 Reference 저장 |
| `HandoffResourceReference` | resourceType, resourceRef, requiredScope, authorizationState, provenanceRef | Resource별 권한 분리 |
| `WorkAssignment` | assignmentId, packetRef, assigneeType/ref, dueAt, state, reasonCode, version | 같은 Hospital 범위 |
| `HospitalNotification` | notificationId, eventType, safeSummaryCode, resourceRef, version, expiresAt | 최소정보, 외부 채널 없음 |
| `ExplainableTimelineProjection` | eventRef, displayStage, outcome, occurredAt, correlationRef | 원장 읽기 Projection, 수정 금지 |

P1에서 새로운 Permanent Imaging Store, DICOM Binary Table 또는 Clinical Document Repository를 만들지 않는다. 자유서술 Note는 기본 비활성화하고 도입 시 길이 제한, 목적, 보존기간, Redaction와 Audit를 별도 ADR로 승인한다.

## 13. 업무 행위 API 후보

다음은 설계 후보이며 현재 승인된 `OPENAPI.yaml` Contract가 아니다.

- `ListAuthorizedPriorStudies`
- `CreateComparisonViewerSession`
- `CreateClinicalHandoffPacket`
- `GetClinicalHandoffPacket`
- `AssignClinicalHandoff`
- `AcceptOrHoldAssignment`
- `ListHospitalNotifications`
- `AcknowledgeHospitalNotification`
- `GetExplainableExchangeTimeline`

구현 Ticket은 CRUD Endpoint가 아니라 위 업무 행위를 기준으로 OpenAPI, 오류모델, Idempotency, Object Authorization과 Pagination을 함께 확정해야 한다. 기존 Endpoint를 조합해 Browser에서 권한을 추론하거나 PACS를 직접 호출해서는 안 된다.

## 14. Audit Event 후보

```text
PRIOR_STUDIES_QUERIED
COMPARISON_VIEWER_REQUESTED
COMPARISON_VIEWER_OPENED
COMPARISON_VIEWER_DENIED
HANDOFF_PACKET_CREATED
HANDOFF_PACKET_VIEWED
HANDOFF_PACKET_ACKNOWLEDGED
HANDOFF_PACKET_CLOSED
WORK_ASSIGNED
WORK_ACCEPTED
WORK_PUT_ON_HOLD
WORK_REASSIGNED
HOSPITAL_NOTIFICATION_LISTED
HOSPITAL_NOTIFICATION_ACKNOWLEDGED
EXPLAINABLE_TIMELINE_VIEWED
```

Event는 actor, tenant, action, resource, outcome, timestamp와 correlation/session context를 포함하고 PHI/Payload/Secret을 포함하지 않는다.

## 15. 보안 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-HCW-001` | 모든 Query와 Command는 서버 측 Tenant/Hospital/Object Authorization을 적용해야 한다. |
| `SEC-HCW-002` | 같은 Patient Reference는 과거 Study 접근권한이 아니며 Study별 Action Scope를 확인해야 한다. |
| `SEC-HCW-003` | Multi-study Viewer Session은 허용 Study의 합집합을 넘는 UID 요청을 거부해야 한다. |
| `SEC-HCW-004` | 인계 패킷 Resource는 유형별 Scope와 만료를 독립적으로 검증해야 한다. |
| `SEC-HCW-005` | 배정 행위는 접근권한을 생성·상속·승격하지 않아야 한다. |
| `SEC-HCW-006` | 알림·Deep Link·Route ID는 권한 증거로 사용하지 않아야 한다. |
| `SEC-HCW-007` | 병원 알림 Preview와 로그는 개인정보 최소화 정책을 따라야 한다. |
| `SEC-HCW-008` | Workforce Role Claim은 신뢰된 Identity 경계에서 발급하고 Tenant/Hospital Registry와 binding해야 한다. |
| `SEC-HCW-009` | Unknown/Disabled/User-Hospital mismatch Role은 Fail Closed해야 한다. |
| `SEC-HCW-010` | 상태 변경은 `stateVersion` 또는 ETag와 Idempotency를 적용해 Lost Update를 막아야 한다. |
| `SEC-HCW-011` | Timeline Projection은 원장 Event를 삭제·수정·재정렬해 성공처럼 표시해서는 안 된다. |
| `SEC-HCW-012` | Audit 상세는 Role에 따라 최소화하고 민감 정책·Stack·Secret을 숨겨야 한다. |
| `SEC-HCW-013` | 판독문·의뢰서는 별도 Grant와 Integrity/Provenance가 없으면 숨겨야 한다. |
| `SEC-HCW-014` | Cache는 Actor/Tenant/Hospital/Resource/Version에 binding하고 철회·만료 시 무효화해야 한다. |
| `SEC-HCW-015` | P1 장애가 P0 Authorization을 Bypass하거나 P0 Exchange 상태를 변경하게 해서는 안 된다. |

## 16. Acceptance 요약

| Feature | Test Range | 핵심 성공·거부 경로 |
|---|---|---|
| 관련 과거 영상 | `TC-HCW-PR-001~007` | 승인 Study 비교 PASS, 무권한/교차 Tenant/철회 Study DENY |
| 진료 인계 패킷 | `TC-HCW-HP-001~008` | Resource별 Scope, 만료·철회, 임상문서 분리 |
| 팀 배정·인계 | `TC-HCW-AS-001~008` | 같은 Hospital 배정, 권한 비승격, 충돌·비활성 사용자 DENY |
| 병원 알림함 | `TC-HCW-NT-001~007` | 최소정보, 재인가, 중복·역순 Event 처리 |
| 감사·출처 타임라인 | `TC-HCW-AT-001~007` | 원장 순서, Role 최소화, RESULT_UNKNOWN 비성공 처리 |

모든 Test는 현재 `PLANNED / NOT RUN`이다. Synthetic/Test/De-identified 데이터와 Test Identity만 사용한다.

## 17. 구현 Wave

```text
P0 Golden Path + Security Validation PASS
→ HCW-0 P1 Workforce Role/Capability + Projection Core
→ HCW-1 Explainable Timeline + Privacy-safe Inbox
→ HCW-2 Team Assignment + Clinical Handoff Packet
→ HCW-3 Authorized Prior Finder + Multi-study Comparison Viewer
→ Contract/Security/Accessibility/E2E Evidence
```

| Ticket | 내용 | 상태 |
|---|---|---|
| `MEDIQ-HCW-CORE-001` | P1 Workforce Role/Capability와 공통 Projection 계약 | PROPOSED |
| `MEDIQ-HCW-AT-001` | 설명형 Audit/Provenance Timeline | PROPOSED |
| `MEDIQ-HCW-NT-001` | 개인정보 최소 Hospital Inbox | PROPOSED |
| `MEDIQ-HCW-AS-001` | 팀 배정·인계 State Machine | PROPOSED |
| `MEDIQ-HCW-HP-001` | 진료 인계 패킷 | PROPOSED |
| `MEDIQ-HCW-PR-001` | 권한 범위 과거 영상 검색 | PROPOSED |
| `MEDIQ-HCW-PR-002` | Multi-study Side-by-side Viewer Session | PROPOSED |
| `MEDIQ-HCW-TEST-001` | Contract/Security/Accessibility/E2E Test | PROPOSED |

각 Ticket은 `docs/implementation/<TICKET>/` 구현 보고서와 실제 Test Evidence를 함께 작성한다. OpenAPI·Schema·Migration·코드를 변경할 때는 Requirements, Security, Domain/Data/ERD, Threat와 Acceptance를 같은 작업에서 동기화한다.

## 18. 완료조건

이 기능군은 다음 조건을 모두 만족할 때만 구현 완료로 판정한다.

- 승인된 API와 Role/Permission Contract가 존재한다.
- Domain/Data/ERD와 Migration이 일치한다.
- 성공·거부·철회·만료·교차 Tenant·충돌 경로가 자동 또는 반복 가능한 방식으로 검증된다.
- Multi-study Viewer가 허용 Study 집합 외 UID를 가져오지 못한다.
- 배정과 알림이 접근권한을 만들지 않음이 검증된다.
- Timeline이 원장과 일치하고 `RESULT_UNKNOWN`을 완료로 표시하지 않는다.
- 구현 보고서와 Test Evidence가 존재한다.

현재 상태는 `DOCUMENTED — NOT IMPLEMENTED / NOT TESTED`다.

## 19. 참고 기준

- `CAPSTONE-MVP-BOUNDARY.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `SAAS-SCREEN-DESIGN-SPEC.md`
- `DICOM-INTEROPERABILITY-PROFILE.md`
- `ACCEPTANCE-TESTS.md`
- IHE IT Infrastructure Technical Framework — Audit Trail and Node Authentication
- DICOMweb QIDO-RS/WADO-RS/STOW-RS

