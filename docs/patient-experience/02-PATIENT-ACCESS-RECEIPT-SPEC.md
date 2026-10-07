# MediQ 환자용 접근이력·동의 영수증 기능 명세

**Feature:** 2 — Patient Access History & Consent Receipt  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-AR-001`

## 1. 결정 요약

환자에게 원본 Audit Log가 아닌 최소화된 `Patient Activity Projection`을 제공한다. Consent 승인 시에는 승인 주체, 목적지, 자원 범위, 허용 행위, 발급·만료 시각, 정책 버전을 담은 불변 영수증을 생성한다. 이 영수증은 환자 설명·분쟁 추적용 Snapshot이며 법적 공증 문서라고 표시하지 않는다.

## 2. 목표와 비범위

- 목표: 접근 투명성, 승인 내용 재확인, 의심 활동 신고, 철회 화면 연결.
- 비범위: 원본 감사 원장 수정, 직원 내부 ID·IP·PACS 정보 공개, 과거 이벤트 삭제, 자동 법률 판단, 타인의 활동 조회.

## 3. 사용자 흐름

```text
내 활동 → 기간/행위 필터 → 활동 상세
                         ├→ 동의 영수증 보기
                         ├→ 현재 권한/만료 확인
                         └→ 의심 활동 신고 또는 활성 동의 철회 화면
```

영수증의 철회 CTA는 현재 Consent 상태를 서버에서 다시 조회한다. 이미 만료·철회된 경우 상태를 설명하고 중복 철회를 보내지 않는다.

## 4. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-AR-001` | 내 활동 목록 | 날짜, 행위, 기관 표시명, 결과 |
| `MOB-PXE-AR-002` | 활동 상세 | 목적, 대상 범위, 접근 주체 역할, Correlation ID |
| `MOB-PXE-AR-003` | 동의 영수증 | 불변 승인 Snapshot, 상태·만료·철회 연결 |
| `MOB-PXE-AR-004` | 의심 활동 신고 | 선택 사유, 최소 설명, 접수 번호 |

Loading, Empty, Partial, Offline, Denied, Error 상태를 제공한다. Offline에서는 캐시된 영수증임을 표시하고 철회·신고 전송은 연결 회복 후 서버 재검증한다.

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-AR-001` | 환자는 자신의 MediQ Patient Reference에 연결된 활동만 조회해야 한다. |
| `REQ-PXE-AR-002` | 활동은 `VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT`, Consent 승인·철회, 거부·실패를 구분해야 한다. |
| `REQ-PXE-AR-003` | 각 활동은 사용자용 기관 표시명, 행위, 목적, 시각, 결과, 자원 범위와 Correlation ID를 제공해야 한다. |
| `REQ-PXE-AR-004` | Consent 승인 완료 시 정책 버전과 승인 Scope를 포함한 불변 영수증을 생성해야 한다. |
| `REQ-PXE-AR-005` | 현재 상태 변경은 과거 영수증을 덮어쓰지 않고 상태 전이를 별도 연결해야 한다. |
| `REQ-PXE-AR-006` | 목록은 기간·행위·결과 필터와 페이지네이션을 지원해야 한다. |
| `REQ-PXE-AR-007` | 영수증 Export는 재인증 후 명시적 사용자 동의로 수행하고 공유 위험을 경고해야 한다. |
| `REQ-PXE-AR-008` | 의심 활동 신고는 원본 감사 이벤트를 변경하지 않고 별도 Case Reference를 생성해야 한다. |

## 6. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-AR-001` | Projection 조회는 인증, Tenant, Patient Mapping을 서버에서 검증해야 한다. |
| `SEC-PXE-AR-002` | 내부 Actor ID, IP, Credential, PACS Endpoint, 전체 UID를 환자 응답에 포함하지 않아야 한다. |
| `SEC-PXE-AR-003` | Receipt Payload는 Canonical Hash와 서버 서명 또는 동등한 무결성 증거를 가져야 한다. |
| `SEC-PXE-AR-004` | Receipt ID 직접 변경으로 다른 환자 영수증 존재 여부를 알 수 없어야 한다. |
| `SEC-PXE-AR-005` | Export 파일은 앱 전용 임시영역에서 생성하고 완료·취소 후 정리해야 한다. |

## 7. 논리 데이터·API GAP

- `PatientActivityProjection`: event category, display actor/organization, purpose, outcome, occurredAt, resource summary, correlation reference.
- `ConsentReceiptSnapshot`: receiptId, consentRef, patientRef, destination display, purpose, resource scope, actions, issuedAt, expiresAt, policyVersion, integrity proof.
- `PatientConcernCase`: caseRef, activityRef, category, status, createdAt. 자유입력은 선택 사항이며 민감정보 경고를 표시한다.

필요 API는 `ListMyActivities`, `GetMyActivity`, `GetConsentReceipt`, `ExportConsentReceipt`, `ReportActivityConcern`이다. 현재 승인 `OPENAPI.yaml`에는 없으므로 GAP이며 Contract 개정 전 구현하지 않는다.

## 8. 보존·감사·접근성

Projection 보존은 원본 Audit 보존정책을 초과하지 않으며, 앱 Cache는 최소 기간과 암호화 저장을 적용한다. 환자 조회·Export·신고·철회 요청을 감사하되 단순 목록 열람은 과도한 감사를 피하도록 정책으로 정한다. 상태와 결과는 색상 외 텍스트를 제공하고 날짜는 지역화하되 원본 UTC 시각을 보존한다.

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| IDOR로 타인 이력 조회 | Patient/Tenant Binding, 일반화된 404/deny |
| 영수증 내용 변조 | 불변 Snapshot, Hash/서명 검증 |
| Export 파일 유출 | 재인증, 경고, 임시파일 삭제, 공유 최소화 |
| 철회로 과거 기록 삭제 오인 | 과거 사실 보존, 이후 상태 별도 표시 |
| 내부정보 과다 노출 | 환자용 Projection Allowlist |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-AR-001` | 본인 활동 조회 | 허용된 최소 필드와 정확한 결과 표시 |
| `TC-PXE-AR-002` | 타인 Receipt ID 요청 | 존재 여부 노출 없이 거부 |
| `TC-PXE-AR-003` | 승인 후 철회 | 기존 영수증 유지, 현재 상태 `REVOKED` 연결 |
| `TC-PXE-AR-004` | Receipt Payload 변조 | 무결성 실패로 신뢰 표시 차단 |
| `TC-PXE-AR-005` | 오프라인 Export 시도 | Export 차단 또는 명시적 캐시 상태 안내 |
| `TC-PXE-AR-006` | 의심 활동 신고 | 원본 이벤트 불변, Case Reference 발급 |

모든 Test는 `NOT RUN`이다.

## 11. 구현 계획과 완료 경계

`MEDIQ-PXE-AR-001` Projection/API, `MEDIQ-PXE-AR-002` 영수증 무결성, `MEDIQ-PXE-AR-003` Android UI, `MEDIQ-PXE-AR-004` 보안·Contract·접근성 시험으로 분리한다. 법률 검토 없이는 영수증을 법적 증명서·전자서명 문서라고 표시하지 않는다. 구현 및 시험 증거는 아직 없다.
