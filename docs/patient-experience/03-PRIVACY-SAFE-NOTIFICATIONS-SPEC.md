# MediQ 개인정보 최소 알림 기능 명세

**Feature:** 3 — Privacy-safe Notifications  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-NT-001`

## 1. 결정 요약

MediQ는 In-app Inbox를 권위 있는 알림 목록으로 사용하고 Push는 사용자가 앱을 열도록 돕는 최소 Hint로 사용한다. Push 미수신·지연·중복은 Consent, Transfer 또는 Vault 상태를 바꾸지 않는다. 상세 내용은 앱 재진입 후 서버 권한을 다시 검증한 뒤 표시한다.

## 2. 목표와 비범위

- 목표: 승인·실패·만료의 적시 인지, 최소 노출, 중복 없는 알림, 사용자 설정.
- 비범위: SMS/이메일 운영 도입, Push를 통한 Consent 승인, 진단 결과 통지, 알림 전달을 업무 성공 증거로 사용.

## 3. 알림 유형과 기본 정책

| 유형 | 예시 문구 | 기본 | 끌 수 있음 |
|---|---|---|---|
| `SECURITY_REQUIRED` | “계정 보안 확인이 필요합니다.” | 즉시 | 아니오 |
| `CONSENT_ACTION` | “확인이 필요한 요청이 있습니다.” | 즉시 | Push만 끌 수 있음 |
| `TRANSFER_STATUS` | “요청 상태가 변경되었습니다.” | 일반 | 예 |
| `EXPIRY_WARNING` | “보관 항목의 기한을 확인하세요.” | 일반 | 예 |
| `STORAGE_ADVISORY` | “앱 저장공간을 확인하세요.” | 낮음 | 예 |

조용한 시간에는 보안 필수 외 Push를 보류하되 In-app Inbox에는 즉시 기록한다.

## 4. 사용자 흐름과 화면

```text
Domain Event → Notification Policy → In-app Inbox 기록
                                └→ 최소 Push Hint
Push 선택 → 앱 잠금 해제/재인증 → 서버에서 알림·대상 권한 재검증 → 상세 화면
```

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-NT-001` | 알림 Inbox | 읽음/안읽음, 유형, 일반 제목, 시각 |
| `MOB-PXE-NT-002` | 알림 상세 | 서버 확인 상태, 안전한 CTA |
| `MOB-PXE-NT-003` | 알림 설정 | 유형, Push, 조용한 시간, 잠금화면 안내 |
| `MOB-PXE-NT-004` | 기기 알림 상태 | OS 권한, Token 상태, 해결 안내 |

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-NT-001` | 서버는 Domain Event와 사용자 설정을 기반으로 In-app 알림을 생성해야 한다. |
| `REQ-PXE-NT-002` | 알림은 `eventId + recipientRef + type`으로 중복 제거해야 한다. |
| `REQ-PXE-NT-003` | Push 선택 후 앱은 Notification 대상 상태와 권한을 서버에서 재조회해야 한다. |
| `REQ-PXE-NT-004` | 읽음 상태는 업무 상태와 분리하고 여러 기기 간 동기화해야 한다. |
| `REQ-PXE-NT-005` | 사용자는 선택형 유형과 조용한 시간을 관리할 수 있어야 한다. |
| `REQ-PXE-NT-006` | 보안 필수 알림을 끄려는 경우 In-app 표시를 유지하고 정책 이유를 안내해야 한다. |
| `REQ-PXE-NT-007` | Push 공급자 실패 시 재시도는 제한·백오프하며 업무 처리를 롤백하지 않아야 한다. |
| `REQ-PXE-NT-008` | 로그아웃·기기 철회 시 해당 Installation Token을 즉시 비활성화해야 한다. |

## 6. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-NT-001` | Push Payload에는 불투명한 notification reference와 일반 문구만 포함해야 한다. |
| `SEC-PXE-NT-002` | 환자명, 병원명, 검사 설명, 진단, DICOM UID, Grant/Consent Token을 포함하지 않아야 한다. |
| `SEC-PXE-NT-003` | Deep Link는 허용 Route만 사용하고 임의 URL·외부 Scheme을 거부해야 한다. |
| `SEC-PXE-NT-004` | Installation Token은 Tenant/Patient/Device Binding, 암호화 저장, Rotation·Revocation을 적용해야 한다. |
| `SEC-PXE-NT-005` | Android Notification Visibility는 기본 `PRIVATE` 또는 더 제한적으로 설정하고 잠금화면 Preview를 최소화해야 한다. |
| `SEC-PXE-NT-006` | 오래된 알림의 CTA는 현재 Consent/Grant/만료를 재검증해야 한다. |

## 7. 논리 데이터·API GAP

`NotificationRecord`는 notificationRef, recipientRef, type, eventRef, createdAt, readAt, expiry, targetRouteKey, status만 가진다. `DeviceInstallation`은 deviceRef, platform, encrypted provider token, status, rotatedAt을 가진다. 자유로운 Deep Link URL은 저장하지 않는다.

필요 API는 `ListMyNotifications`, `MarkNotificationRead`, `UpdateNotificationPreferences`, `Register/Rotate/RevokeDeviceInstallation`이다. 공급자·Contract는 미결정이며 `OPENAPI.yaml` 개정이 필요하다.

## 8. Audit·접근성·운영

기기 등록·철회, 설정 변경, 보안 알림 생성, Deep Link 거부를 감사한다. 알림 본문이나 Provider Token은 로그에 남기지 않는다. Screen Reader용 명확한 제목·시각·읽음 상태를 제공하고, 알림 소리·진동만으로 의미를 전달하지 않는다. 운영 지표는 전달 성공률이 아니라 In-app 생성, 중복 억제, Token 오류, 안전한 상세 진입을 구분한다.

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| 잠금화면 PHI 노출 | 일반 문구, PRIVATE visibility |
| Token 탈취·재사용 | 기기 Binding, Rotation, Logout Revocation |
| Deep Link 조작 | Route Allowlist, 서버 재인가 |
| 중복 Push로 중복 작업 | event 기반 Dedup, idempotent CTA |
| 공급자 장애로 상태 오인 | In-app 원본, Push 비권위화 |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-NT-001` | 잠금화면 승인 알림 | 민감정보 없는 일반 문구 |
| `TC-PXE-NT-002` | 변조 Deep Link | Route 거부, 대상 정보 미노출 |
| `TC-PXE-NT-003` | 철회된 기기 Token 사용 | Push 중단, 등록 거부 감사 |
| `TC-PXE-NT-004` | 같은 Event 반복 수신 | Inbox/Push 한 건으로 Dedup |
| `TC-PXE-NT-005` | 오래된 승인 알림 선택 | 현재 상태 재조회, 자동 승인 없음 |
| `TC-PXE-NT-006` | 공급자 장애 | 업무 상태 유지, In-app 알림 보존 |

모든 Test는 `NOT RUN`이다.

## 11. 구현 계획과 완료 경계

`MEDIQ-PXE-NT-001` Event/Inbox API, `NT-002` Installation Token 보안, `NT-003` Android 알림, `NT-004` Security/Privacy Test 순으로 진행한다. Provider 선정, 앱 코드, Push Credential, 시험 증거는 현재 없으며 운영 알림이 구현된 것으로 표시하지 않는다.
