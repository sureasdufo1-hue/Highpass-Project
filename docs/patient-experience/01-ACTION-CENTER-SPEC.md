# MediQ 통합 행동센터 기능 명세

**Feature:** 1 — Action Center  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-AC-001`

## 1. 결정 요약

행동센터는 환자가 처리할 일과 주의할 상태를 서버의 권위 상태에서 조회해 우선순위 카드로 보여주는 Mobile Home Projection이다. 카드는 기존 승인·전송·Vault·보안 화면으로 이동시키며 자체적으로 Consent, Authorization 또는 Grant를 발급하지 않는다.

## 2. 목표와 비범위

### 목표

- 중요한 다음 행동을 3단계 이내에 찾게 한다.
- 승인 대기, 진행, 만료, 저장공간, 보안 상태를 한 곳에서 구분한다.
- 실패·불명확 상태에 안전한 다음 행동과 Correlation ID를 제공한다.

### 비범위

- 의료적 우선순위 또는 진단 위험도 판단
- 클라이언트가 계산한 권한·전송 성공 판정
- 자동 Consent 승인, 자동 PACS Import, 자동 영상 삭제
- P0 Hospital Portal Dashboard 대체

## 3. Actor와 정보 우선순위

Primary Actor는 인증된 Synthetic Patient다. Card 순서는 서버 심각도와 만료시간으로 정한다.

1. 보안 차단·재인증 필요
2. 환자 결정이 필요한 승인 요청
3. `RESULT_UNKNOWN` 또는 실패 복구
4. 24시간 이내 만료
5. 진행 중 전송·다운로드
6. 저장공간 주의
7. 정보성 완료

같은 Resource/Action/Session 조합은 하나로 병합하고 최신 `stateVersion`만 표시한다.

## 4. 사용자 흐름

```text
앱 잠금 해제
→ Action Center Projection 조회
→ 카드 선택
→ 대상 상세 진입
→ 서버에서 인증·Tenant·Consent·Authorization·Grant·만료 재검증
→ 업무 행위 수행 또는 안전한 거부
→ Action Center 재조회
```

오프라인이면 마지막 동기화 시각과 `오프라인 정보` 배지를 표시하고 승인·전송·Lease 갱신 CTA는 비활성화한다. `RESULT_UNKNOWN`은 완료로 바꾸지 않고 상태 확인 CTA만 제공한다.

## 5. 화면과 상태

| ID | 화면/Component | 핵심 내용 |
|---|---|---|
| `MOB-PXE-AC-001` | 행동센터 홈 | 중요 카드, 최근 동기화, 전체 상태 |
| `MOB-PXE-AC-002` | 카드 상세 Sheet | 이유, 만료, 허용 CTA, 취소 |
| `MOB-PXE-AC-003` | 동기화/오프라인 상태 | Stale 표시, 재시도, 네트워크 안내 |
| `MOB-PXE-AC-004` | 결과 확인 | 서버 확정 결과 또는 `RESULT_UNKNOWN` |

모든 화면은 Loading, Empty, Partial, Offline, Denied, Error 상태를 가진다. Empty는 “처리할 항목이 없습니다”로 표시하되 전체 시스템 정상으로 단정하지 않는다.

## 6. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-AC-001` | 시스템은 인증된 환자에게 접근 가능한 항목만 반환해야 한다. |
| `REQ-PXE-AC-002` | 각 항목은 유형, 상태, 심각도, 만료, 대상 화면, `stateVersion`을 포함해야 한다. |
| `REQ-PXE-AC-003` | 클라이언트는 Resource/Action/Session 기준으로 중복을 제거하고 구버전을 폐기해야 한다. |
| `REQ-PXE-AC-004` | CTA 실행 직전 서버 권한과 현재 상태를 다시 검증해야 한다. |
| `REQ-PXE-AC-005` | `RESULT_UNKNOWN`과 실패, 거부, 만료, 철회를 서로 다른 상태로 표시해야 한다. |
| `REQ-PXE-AC-006` | 오프라인 Projection은 마지막 동기화 시각을 표시하고 쓰기 CTA를 차단해야 한다. |
| `REQ-PXE-AC-007` | 완료 카드는 서버 확정 후에만 표시하고 기본 24시간 후 정보 목록으로 이동해야 한다. |
| `REQ-PXE-AC-008` | 사용자는 유형별 카드 표시를 조절할 수 있으나 보안 필수 경고는 끌 수 없어야 한다. |

## 7. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-AC-001` | Projection은 Tenant와 MediQ Patient Reference에 서버 측으로 Binding해야 한다. |
| `SEC-PXE-AC-002` | 카드에는 환자명, 전체 UID, 진단, 상세 검사 설명을 기본 노출하지 않아야 한다. |
| `SEC-PXE-AC-003` | 대상 Route와 ID는 권한 증거로 사용하지 않아야 한다. |
| `SEC-PXE-AC-004` | Stale/변조된 `stateVersion`으로 쓰기를 요청하면 충돌로 거부하고 최신 상태를 반환해야 한다. |
| `SEC-PXE-AC-005` | 교차 Tenant 항목 존재 여부를 추측할 수 없는 일반화된 거부 응답을 사용해야 한다. |

## 8. 논리 데이터·API GAP

논리 객체 `ActionItemProjection`은 `itemId`, `type`, `resourceRef`, `sessionRef`, `state`, `severity`, `expiresAt`, `stateVersion`, `allowedNextActions`, `updatedAt`만 포함한다. 의료영상 Payload나 PACS Credential을 저장하지 않는다.

필요한 업무 행위 API는 `ListMyActionItems`, `AcknowledgeInformationItem`, `RefreshActionItem`이다. 현재 `OPENAPI.yaml`의 승인 Contract가 아니므로 구현 전 API·권한·오류 모델 개정이 필요하다. Projection Cache TTL은 구현 ADR에서 정하되, 쓰기 전 서버 재검증을 생략할 수 없다.

## 9. Audit와 접근성

- 목록 단순 열람은 최소 접근 로그 정책을 적용하고, 승인·거부·재시도·상태 확인은 Audit Event를 남긴다.
- Audit에는 Actor, Tenant, Action, Resource, Outcome, timestamp, correlation/session context를 포함한다.
- 심각도는 색상뿐 아니라 아이콘·라벨·순서로 표현한다.
- TalkBack 탐색 순서는 제목 → 이유 → 만료 → CTA다.
- 200% 글씨 확대에서 CTA가 잘리거나 수평 스크롤을 요구하지 않아야 한다.

## 10. 위협과 통제

| 위협 | 통제 |
|---|---|
| 교차 Tenant 카드 노출 | 서버 Projection 필터, 일반화된 거부 |
| 오래된 카드로 승인 | `stateVersion` 낙관적 잠금, 재검증 |
| 완료 상태 오인 | 서버 확정 상태만 성공, `RESULT_UNKNOWN` 분리 |
| 잠금화면/앱 전환 노출 | 카드 최소화, 앱 Background 차폐 |
| 카드 Route 변조 | Route 비권한화, 서버 Scope 검증 |

## 11. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-AC-001` | 유효한 승인 대기 항목 조회 | 올바른 CTA와 만료 표시 |
| `TC-PXE-AC-002` | 구버전 카드에서 승인 시도 | 충돌 거부 후 최신 상태 표시 |
| `TC-PXE-AC-003` | 교차 Tenant Resource 주입 | 존재 여부 노출 없이 거부·감사 |
| `TC-PXE-AC-004` | 오프라인 상태 | Stale 배지, 쓰기 CTA 비활성화 |
| `TC-PXE-AC-005` | 전송 결과 불명확 | 성공 미표시, 상태 확인 CTA |
| `TC-PXE-AC-006` | 중복 항목 수신 | 최신 버전 한 장만 표시 |

모든 Test는 현재 `NOT RUN`이다.

## 12. 구현 계획과 완료 경계

`MEDIQ-PXE-CORE-001` 상태 Projection 공통 Contract 후 `MEDIQ-PXE-AC-001` API/Domain, `MEDIQ-PXE-AC-002` Android UI, `MEDIQ-PXE-AC-003` Contract·Security·Accessibility Test 순으로 수행한다. 기존 `MOB-05`, `MOB-06`, `MOB-08`, `MOB-12`, `MOB-15`를 상세 화면으로 재사용한다.

본 문서는 설계 승인만 의미한다. API, DB, Android 화면과 시험 증거는 아직 없다.
