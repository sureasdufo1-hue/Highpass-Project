# MediQ 저장공간·만료 관리 기능 명세

**Feature:** 6 — Storage & Expiry Management  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-SE-001`

## 1. 결정 요약

환자는 Vault가 사용하는 암호화 영상 용량, 기기 가용 공간, 항목별 크기와 Lease 만료를 확인하고 정리할 수 있다. 앱은 정리를 추천할 수 있지만 명시적 확인 없이 사용자 보관 Capsule을 삭제하지 않는다. 만료 정책이 Crypto-shred를 요구하는 경우 키 사용 중단과 삭제 증거를 남기며 원본 병원 PACS에는 영향을 주지 않는다.

## 2. 상태 구분

| 상태 | 의미 | 환자에게 보이는 설명 |
|---|---|---|
| `ACTIVE` | 유효 Lease와 로컬 Capsule | 오프라인 열람 가능 |
| `EXPIRING` | 만료 임박 | 연결 후 갱신 또는 만료 확인 |
| `EXPIRED_LOCKED` | Lease 만료 | 로컬 파일이 있어도 열람 불가 |
| `REVOKED` | 서버가 향후 접근 차단 | 재승인 필요, 원격 완전삭제 보장 아님 |
| `DELETION_PENDING` | 앱 사용 중 등으로 삭제 대기 | 앱 종료 후 정리 |
| `CRYPTO_SHREDDED` | 키 삭제·무효화 증거 생성 | 기기에서 열 수 없음 |
| `CORRUPTED` | 무결성 실패/부분 파일 | 열람 차단, 재다운로드 제안 |

## 3. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-SE-001` | 저장공간 Dashboard | Vault 사용량, 가용 공간, 만료 예정 |
| `MOB-PXE-SE-002` | 항목별 관리 | 크기, 마지막 열람, Lease, 상태 |
| `MOB-PXE-SE-003` | 정리 검토 | 선택 항목, 확보 예상량, 영향 설명 |
| `MOB-PXE-SE-004` | 삭제·만료 결과 | 삭제/잠금/실패/재시도, 증거 Reference |

## 4. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-SE-001` | 시스템은 Vault 암호화 파일·Metadata·Cache 사용량과 기기 가용 공간을 구분해야 한다. |
| `REQ-PXE-SE-002` | 항목별 크기, Lease 만료, 상태, 재다운로드 가능성을 표시해야 한다. |
| `REQ-PXE-SE-003` | 정리 추천은 크기·만료·최근 사용을 근거로 하되 자동 선택 결과를 사용자가 검토할 수 있어야 한다. |
| `REQ-PXE-SE-004` | 수동 삭제 전 대상·확보 예상량·오프라인 접근 상실·원본 PACS 영향 없음과 재다운로드 조건을 확인해야 한다. |
| `REQ-PXE-SE-005` | Lease 갱신은 온라인 인증·Consent/Authorization 정책·기기 상태를 재검증해야 한다. |
| `REQ-PXE-SE-006` | Capsule 사용 중 삭제는 안전한 Pending 상태로 전환하고 파일 Handle 종료 후 수행해야 한다. |
| `REQ-PXE-SE-007` | 다운로드 전 예상 용량과 안전 여유 공간을 검사하고 부족하면 시작하지 않아야 한다. |
| `REQ-PXE-SE-008` | 부분 다운로드와 무결성 실패 파일은 열람을 차단하고 안전하게 정리해야 한다. |

## 5. 보안 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-SE-001` | Capsule·Index·Thumbnail·Cache는 Mobile Vault 암호화 경계 안에 저장해야 한다. |
| `SEC-PXE-SE-002` | 파일 삭제와 DEK/Wrap Slot 삭제 순서·실패 복구를 Transactional Journal로 추적해야 한다. |
| `SEC-PXE-SE-003` | Lease 판단은 서명된 서버 시간 Anchor와 단조 시계를 사용해 기기 시계 되돌리기를 방어해야 한다. |
| `SEC-PXE-SE-004` | StrongBox 부재 기기는 승인된 Software-backed Keystore 정책과 위험 상태를 적용해야 한다. |
| `SEC-PXE-SE-005` | Remote Revocation은 향후 Lease/다운로드를 막되 이미 오프라인 확보된 데이터의 즉시 회수를 보장한다고 표시하지 않아야 한다. |
| `SEC-PXE-SE-006` | 삭제·Crypto-shred 로그에 DEK, 파일 내용, 환자 식별정보를 포함하지 않아야 한다. |

## 6. 논리 데이터·API GAP

`VaultStorageProjection`과 `VaultItemLifecycle`은 로컬 전용 Index를 기본으로 한다. 서버는 Lease 상태·재다운로드 가능 여부·Revocation만 제공하며 실제 파일 경로와 DEK를 알지 않는다. 필요 업무 행위는 `RenewCapsuleLease`, `CheckRedownloadEligibility`, `AcknowledgeLocalDeletion`이며 현재 Mobile API Contract와 정합성 검토가 필요하다.

삭제 Evidence는 deviceRef, capsuleRef, operation, outcome, occurredAt, failureCode만 포함하고 의료 Metadata는 포함하지 않는다.

## 7. UX·접근성

- GB/MB와 백분율을 함께 제공하고 “약” 표시로 계산 오차를 설명한다.
- 만료를 상대 시간뿐 아니라 절대 날짜·시간으로 표시한다.
- 삭제와 잠금, 서버 철회, 원본 삭제가 아님을 명확히 구분한다.
- 파괴적 CTA는 별도 확인 화면과 명확한 대상 수를 제공한다.
- 저장공간 그래프와 동일 정보를 텍스트 표로 제공한다.

## 8. 위협과 통제

| 위협 | 통제 |
|---|---|
| 기기 시계 변경으로 Lease 우회 | 서명 시간 Anchor, 단조 시계 |
| 부분 삭제 후 키/파일 잔존 | Transaction Journal, 부팅 시 복구 정리 |
| 자동 정리로 데이터 손실 | 명시적 확인, 정책 예외 제한 |
| Remote wipe 과장 | 보장 범위 문구 고정, Lease 차단 |
| 부족 공간으로 평문 임시파일 | 암호화 Stream, 사전 용량 검사 |

## 9. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-SE-001` | 용량 부족 다운로드 | 시작 전 차단, 정리 제안 |
| `TC-PXE-SE-002` | 사용 중 삭제 | Pending 후 안전 삭제 |
| `TC-PXE-SE-003` | 기기 시간 되돌림 | Lease 연장되지 않고 잠금 |
| `TC-PXE-SE-004` | Revoked 오프라인 기기 | 즉시 회수 보장 없음 안내, 다음 갱신 차단 |
| `TC-PXE-SE-005` | 부분 파일/Hash 불일치 | 열람 차단, 정리·재다운로드 |
| `TC-PXE-SE-006` | 수동 삭제 | DEK/파일 정리 결과와 비민감 증거 |
| `TC-PXE-SE-007` | 원본 PACS 영향 확인 | 로컬 삭제만 수행, 원본 유지 |

모든 Test는 `NOT RUN`이다.

## 10. 구현 계획과 완료 경계

`MEDIQ-PXE-SE-001` Storage Index/Projection, `SE-002` Lease/시간 방어, `SE-003` 삭제 Journal/Crypto-shred, `SE-004` Android UI, `SE-005` Device Security Test로 진행한다. 파일 삭제의 물리적 복구 불가능성을 과장하지 않으며 구현·시험 증거는 아직 없다.
