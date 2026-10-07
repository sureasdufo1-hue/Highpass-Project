# MediQ 병원 방문 모드 기능 명세

**Feature:** 4 — Hospital Visit Mode  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-VM-001`

## 1. 결정 요약

병원 방문 모드는 여러 기존 업무를 한 안내 흐름으로 오케스트레이션한다. 병원이 생성한 짧은 수명의 QR Handoff Request를 환자가 Claim하고 목적지·영상 범위·행위를 확인해 Consent한 뒤, 서버가 Authorization과 Scoped Transfer Grant를 평가한다. `PACS_IMPORT`는 별도 Mandatory Preflight와 Destination Verification을 통과해야 완료된다.

## 2. 목표와 비범위

- 목표: 방문 전 준비, QR 인계, 목적지 확인, 명시적 승인, 전송 진행·복구를 하나의 흐름으로 제공.
- 비범위: QR만으로 로그인/동의/Grant 발급, 즐겨찾기 병원 자동 승인, 오프라인 PACS Import, 운영 병원 위치·예약 시스템, 무검증 DICOM 전송.

## 3. 사용자 흐름

```text
방문 모드 시작
→ 준비 Checklist(영상 선택·Vault/Cloud Source 확인)
→ 병원 화면의 QR Scan
→ QR Signature/만료/1회성/Session 검증
→ 목적지 병원·행위·범위 명시 확인
→ 환자 재인증 및 Consent
→ Authorization + Scoped Grant
→ [VIEW 또는 PACS_IMPORT]
→ PACS_IMPORT이면 Mandatory Preflight
→ 전송 → Destination Verification → 결과
```

QR Claim 후에도 Consent 전에 사용자가 취소할 수 있다. 전송 결과가 불명확하면 중복 전송하지 않고 상태 조회·병원 확인 흐름으로 보낸다.

## 4. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-VM-001` | 방문 준비 | 선택 영상, 보관 상태, 네트워크·배터리 안내 |
| `MOB-PXE-VM-002` | QR Scan | 카메라, 수동코드 대체, 개인정보 주의 |
| `MOB-PXE-VM-003` | 목적지·요청 확인 | 병원 표시명, 요청 행위, Scope, 만료 |
| `MOB-PXE-VM-004` | 승인·진행 Timeline | Claim/Consent/Grant/Preflight/Transfer/Verify |
| `MOB-PXE-VM-005` | 결과·복구 | 성공, 거부, 실패, `RESULT_UNKNOWN`, Correlation ID |

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-VM-001` | 방문 모드는 QR 전과 후의 준비·승인·전송 상태를 단계별로 표시해야 한다. |
| `REQ-PXE-VM-002` | QR Claim 후 서버가 반환한 목적지 표시명·행위·범위·만료를 환자가 명시적으로 확인해야 한다. |
| `REQ-PXE-VM-003` | Consent 승인 직전 환자 재인증을 요구해야 한다. |
| `REQ-PXE-VM-004` | `VIEW`, `DOWNLOAD`, `PACS_IMPORT`를 분리 표시하고 자동 승격하지 않아야 한다. |
| `REQ-PXE-VM-005` | `PACS_IMPORT` 전 Mandatory Preflight 결과가 PASS가 아니면 STOW-RS를 호출하지 않아야 한다. |
| `REQ-PXE-VM-006` | Destination Verification과 Integrity가 PASS일 때만 완료를 표시해야 한다. |
| `REQ-PXE-VM-007` | `RESULT_UNKNOWN`에서는 idempotency key로 상태 확인하고 무조건 재전송하지 않아야 한다. |
| `REQ-PXE-VM-008` | 즐겨찾기 병원은 검색·표시 편의만 제공하고 Authorization 판단에 사용하지 않아야 한다. |

## 6. 보안 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-VM-001` | QR에는 PHI, DICOM UID 전체, Credential, Consent/Grant Token을 포함하지 않아야 한다. |
| `SEC-PXE-VM-002` | QR Request는 서명, 짧은 TTL, nonce, audience, 1회 Claim과 Session Binding을 가져야 한다. |
| `SEC-PXE-VM-003` | Claim은 Consent·Authorization·Grant와 별개 상태로 저장·감사해야 한다. |
| `SEC-PXE-VM-004` | 목적지 Tenant, 병원, Endpoint, Patient Mapping은 서버 Registry와 대조해야 한다. |
| `SEC-PXE-VM-005` | 화면 Capture 제한과 Background 차폐를 기존 Mobile Security Policy대로 적용해야 한다. |
| `SEC-PXE-VM-006` | QR 재사용·만료·잘못된 Audience는 Fail Closed로 거부해야 한다. |

## 7. 상태와 API

```text
PREPARING → QR_SCANNED → CLAIM_VERIFIED → PATIENT_CONFIRMED
→ CONSENTED → AUTHORIZED → GRANTED → PREFLIGHT_PASSED
→ TRANSFERRING → VERIFYING → COMPLETED
```

어느 단계든 `CANCELLED`, `EXPIRED`, `DENIED`, `FAILED`, `RESULT_UNKNOWN`으로 이동할 수 있으나 `COMPLETED`를 건너뛰어 설정할 수 없다. QR API는 기존 QR 설계 문서를 우선하며, 방문 모드용 `GetVisitPreparation`, `GetVisitTimeline`, `CancelVisitFlow`는 현재 API GAP다.

## 8. Audit·접근성

QR 발급·Claim·검증, 목적지 확인, Consent, Authorization, Grant, Preflight, STOW, Verification, 취소·실패를 동일 Correlation Context로 연결한다. 카메라 사용이 어려운 사용자를 위해 짧은 수동코드와 병원 직원 보조 절차를 제공하되 동일 검증을 적용한다. Timeline은 색상 외 아이콘·텍스트로 상태를 표현한다.

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| QR 사진 재사용 | 1회 Claim, 짧은 TTL, nonce |
| 공격자 목적지 바꿔치기 | 서명 Audience, Registry Binding, 환자 재확인 |
| 저장 병원 자동 신뢰 | 선호값 비권위화, 매번 Destination 검증 |
| 잘못된 Mapping으로 STOW | Mandatory Preflight Fail Closed |
| Timeout 뒤 중복 STOW | idempotency key, 상태 조회, Result Unknown |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-VM-001` | 유효 QR·Consent·Grant | 승인 단계와 진행 표시 |
| `TC-PXE-VM-002` | 만료/재사용 QR | Claim 거부, Consent 미생성 |
| `TC-PXE-VM-003` | Wrong Destination | Preflight 실패, STOW 호출 없음 |
| `TC-PXE-VM-004` | Invalid Mapping | Fail Closed, 목적지 정보 최소 노출 |
| `TC-PXE-VM-005` | No Consent/Expired Grant | VIEW/STOW 모두 거부 |
| `TC-PXE-VM-006` | STOW Timeout | `RESULT_UNKNOWN`, 중복 전송 없음 |
| `TC-PXE-VM-007` | Verification 실패 | `COMPLETED` 미표시 |

모든 Test는 `NOT RUN`이다.

## 11. 구현 계획과 완료 경계

`MEDIQ-PXE-VM-001` 오케스트레이션 API, `VM-002` Android Flow, `VM-003` Hospital Web 연결, `VM-004` QR/Preflight/E2E Security Test로 나눈다. QR·PACS 기본 Ticket과 기능 1·3의 상태/알림이 선행된다. 실제 병원·운영 PACS 연동은 범위 밖이며 현재 구현되지 않았다.
