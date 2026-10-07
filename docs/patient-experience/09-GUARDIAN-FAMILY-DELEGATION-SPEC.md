# MediQ 보호자·가족 위임 기능 명세

**Feature:** 9 — Guardian & Family Delegation  
**Classification:** `POST-MVP`  
**Version:** v1.0  
**Status:** Approved Future Design — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-GD-001`

## 1. 결정 요약

위임은 `환자 본인이 자발적으로 부여하는 대리 접근`과 `법률상 보호자 권한`을 분리한다. 전자는 환자와 대리인의 독립 신원, 대상 환자, 허용 자원·행위, 목적, 만료, 재인증, 수락을 가진다. 후자는 관할 법률·기관 검증 절차가 승인되기 전까지 활성화하지 않는다.

## 2. 역할과 금지 관계

| 역할 | 설명 |
|---|---|
| Delegator | 접근권한을 위임하는 환자 본인 |
| Delegate | 별도 계정·기기로 위임을 수락한 대리인 |
| Verified Guardian | 외부 권한 검증을 거친 법정대리인; 미래 상태 |
| Reviewer | 분쟁·고위험 요청을 검토하는 승인된 운영 역할 |

연락처에 저장됨, 성이 같음, 동일 주소, 동일 기기, 구두 주장, QR 소지, 비밀번호 공유는 관계·권한 증거가 아니다.

## 3. 위임 생명주기

```text
DRAFT → INVITED → IDENTITY_VERIFIED → ACCEPTED → ACTIVE
  └→ CANCELLED      └→ REJECTED        ├→ SUSPENDED
                                        ├→ REVOKED
                                        └→ EXPIRED
```

`ACTIVE` 위임도 각 영상 접근 시 Consent/Authorization/Grant를 대체하지 않으며 위임 Scope와 현재 자원 권한을 함께 평가한다. 재위임은 기본 금지한다.

## 4. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-GD-001` | 위임 목록 | 대리인, Scope, 만료, 상태 |
| `MOB-PXE-GD-002` | 대리인 초대 | 최소 연락 수단, 목적, 유효기간 |
| `MOB-PXE-GD-003` | Scope 검토 | 영상 범위, VIEW/DOWNLOAD, 금지 행위 |
| `MOB-PXE-GD-004` | 대리인 수락 | 독립 인증, 의무·개인정보 안내 |
| `MOB-PXE-GD-005` | 고위험 행동 확인 | Step-up, 환자 재승인 또는 거부 |
| `MOB-PXE-GD-006` | 철회·활동 | 즉시 철회, 이후 접근 차단, 과거 이력 |

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-GD-001` | 위임 생성은 환자 Step-up Authentication과 명시적 Scope·목적·만료를 요구해야 한다. |
| `REQ-PXE-GD-002` | 대리인은 독립 계정으로 인증하고 초대를 명시적으로 수락해야 한다. |
| `REQ-PXE-GD-003` | 위임 Scope는 Patient, Resource 범위, Action, 목적, 시작·만료를 제한해야 한다. |
| `REQ-PXE-GD-004` | `VIEW`, `DOWNLOAD`, `MOBILE_EXPORT`, `PACS_IMPORT`를 분리하고 기본은 최소 `VIEW`여야 한다. |
| `REQ-PXE-GD-005` | 재위임과 Credential 공유를 금지해야 한다. |
| `REQ-PXE-GD-006` | 환자는 활성 위임을 즉시 Suspend/Revocation할 수 있어야 하며 이후 새 접근을 차단해야 한다. |
| `REQ-PXE-GD-007` | 고위험 Download/PACS Import는 환자 재승인 또는 별도 정책 없이는 위임할 수 없어야 한다. |
| `REQ-PXE-GD-008` | 과거 대리 접근 이력은 위임 철회 후에도 감사 목적으로 보존해야 한다. |
| `REQ-PXE-GD-009` | 법정대리 권한은 승인된 외부 증거와 검토 Workflow 없이 활성화하지 않아야 한다. |

## 6. 보안·Safeguarding 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-GD-001` | Invitation Token은 짧은 TTL, 1회성, Audience/Delegate Binding을 가져야 한다. |
| `SEC-PXE-GD-002` | 환자와 대리인 모두 독립 MFA 또는 승인된 동등 보증을 사용해야 한다. |
| `SEC-PXE-GD-003` | 위임 평가는 Tenant, Patient, Device, Delegate, Resource, Action, 만료를 서버에서 검증해야 한다. |
| `SEC-PXE-GD-004` | 비정상 다수 환자 위임, 반복 실패, 새 기기 고위험 행동을 탐지·보류해야 한다. |
| `SEC-PXE-GD-005` | 대리인 화면은 환자의 다른 의료정보를 탐색할 수 없고 Scope 내 자원만 보여야 한다. |
| `SEC-PXE-GD-006` | 강요·학대가 의심되는 경우 즉시 비밀신고를 보장한다고 단정하지 말고 승인된 지원·중단 절차를 제공해야 한다. |

## 7. 논리 Domain·API GAP

`Delegation`은 delegatorRef, delegateRef, patientRef, scope, purpose, startsAt, expiresAt, status, policyVersion을 가진다. `DelegationAuthorityEvidence`는 종류·검증기관·검증시각·상태만 기록하고 원본 민감 서류 보관은 별도 최소화 정책이 필요하다. `DelegatedAccessDecision`은 위임과 자원 Authorization 결과를 연결한다.

필요 API는 `CreateDelegationInvitation`, `AcceptDelegation`, `ListDelegations`, `Suspend/RevokeDelegation`, `EvaluateDelegatedAccess`다. 현재 Domain, Data, ERD, OpenAPI에 없으므로 전면 개정 전 구현하지 않는다.

## 8. Audit·접근성·법적 Gate

생성·초대·신원검증·수락·접근·고위험 거부·철회·만료를 Actor별로 감사한다. 환자와 대리인 화면은 “누구의 기록을 보고 있는지”를 지속 표시한다. 미성년자, 의사결정능력 저하, 사망자 기록, 국외 사용자, 긴급 Break-glass는 별도 법적·제품 결정 전 범위 밖이다.

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| 초대 링크 탈취 | 1회성 TTL, 수신자 Identity Binding |
| 최소 VIEW에서 PACS Import 상승 | Action Scope 분리, Step-up/환자 재승인 |
| 철회 후 Cache 접근 | Lease/Session 취소, 다음 온라인 검증 차단 |
| 가족관계 사칭 | 관계 비권위화, 독립 신원·증거 검증 |
| 재위임·계정 공유 | 재위임 금지, 기기/행동 탐지 |
| 취약 환자 강요 | 명확한 철회, 고위험 보류, 운영 검토 Gate |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-GD-001` | 유효 VIEW 위임 | Scope 내 영상만 조회 |
| `TC-PXE-GD-002` | 탈취/만료 Invitation | 수락 거부, 환자 정보 미노출 |
| `TC-PXE-GD-003` | DOWNLOAD/PACS_IMPORT 상승 | 별도 권한 없으면 거부 |
| `TC-PXE-GD-004` | 철회 후 접근 | 새 Session/Lease 거부, 감사 유지 |
| `TC-PXE-GD-005` | 타 환자 Resource 주입 | 존재 여부 노출 없이 거부 |
| `TC-PXE-GD-006` | 재위임 시도 | 생성 거부·감사 |
| `TC-PXE-GD-007` | 법정대리 증거 미검증 | 활성화 금지 |

모든 Test는 `NOT RUN`이다.

## 11. 구현 계획과 완료 경계

법률·신원보증 ADR과 별도 Scope Decision 후 `MEDIQ-PXE-GD-001` Domain/Auth, `GD-002` Identity/Invitation, `GD-003` Mobile UX, `GD-004` Safeguarding 운영, `GD-005` Security/E2E Test로 진행한다. 이 기능은 POST-MVP이며 현재 구현·시험·법적 검토되지 않았다.
